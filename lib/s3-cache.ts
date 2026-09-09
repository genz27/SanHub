import type { ImageBucketConfig } from '@/types';
import { getImageStorageConfig } from './db/system-config-image-storage';

type S3Sdk = typeof import('@aws-sdk/client-s3');
type S3ClientInstance = InstanceType<S3Sdk['S3Client']>;

export type S3CachedObject = {
  buffer: Buffer;
  contentType: string;
  contentLength: number;
  etag?: string;
  lastModified?: Date;
};

let s3SdkPromise: Promise<S3Sdk> | null = null;
const s3Clients = new Map<string, S3ClientInstance>();

export function loadS3Sdk(): Promise<S3Sdk> {
  if (!s3SdkPromise) {
    s3SdkPromise = import('@aws-sdk/client-s3');
  }
  return s3SdkPromise;
}

function normalizeSegment(value: string): string {
  return value
    .trim()
    .replace(/\\/g, '/')
    .replace(/^\/+|\/+$/g, '');
}

function normalizeS3ObjectKey(value: string): string {
  return value
    .trim()
    .replace(/\\/g, '/')
    .replace(/^\/+/, '')
    .split('/')
    .filter((segment) => segment && segment !== '.' && segment !== '..')
    .join('/');
}

function isS3CacheKeyAllowed(bucket: ImageBucketConfig, objectKey: string): boolean {
  const normalizedKey = normalizeS3ObjectKey(objectKey);
  if (!normalizedKey) return false;

  const prefix = normalizeSegment(bucket.pathPrefix || '');
  if (!prefix) return true;
  return normalizedKey !== prefix && normalizedKey.startsWith(`${prefix}/`);
}

async function resolveS3CacheBucket(bucketId?: string): Promise<ImageBucketConfig | null> {
  const imageStorage = await getImageStorageConfig();
  const buckets = (imageStorage.buckets || []).filter(
    (bucket) => bucket.enabled && bucket.provider === 's3-compatible'
  );

  if (bucketId) {
    return buckets.find((bucket) => bucket.id === bucketId) || null;
  }

  if (imageStorage.defaultBucketId) {
    const defaultBucket = buckets.find((bucket) => bucket.id === imageStorage.defaultBucketId);
    if (defaultBucket) return defaultBucket;
  }

  return buckets[0] || null;
}

export async function getS3Client(bucket: ImageBucketConfig): Promise<S3ClientInstance> {
  const cacheKey = [
    bucket.id,
    bucket.baseUrl,
    bucket.region,
    bucket.apiKey,
    bucket.secretKey,
    bucket.forcePathStyle,
  ].join('|');

  const cached = s3Clients.get(cacheKey);
  if (cached) return cached;

  const { S3Client } = await loadS3Sdk();
  const client = new S3Client({
    region: bucket.region || 'us-east-1',
    endpoint: bucket.baseUrl,
    forcePathStyle: bucket.forcePathStyle !== false,
    credentials: {
      accessKeyId: bucket.apiKey,
      secretAccessKey: bucket.secretKey || '',
    },
  });

  s3Clients.set(cacheKey, client);
  return client;
}

async function streamToBuffer(body: unknown): Promise<Buffer> {
  if (!body) return Buffer.alloc(0);

  const byteArrayStream = body as { transformToByteArray?: () => Promise<Uint8Array> };
  if (typeof byteArrayStream.transformToByteArray === 'function') {
    return Buffer.from(await byteArrayStream.transformToByteArray());
  }

  const chunks: Buffer[] = [];
  for await (const chunk of body as AsyncIterable<Uint8Array | Buffer | string>) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

export async function getS3CachedObject(
  objectKey: string,
  bucketId?: string
): Promise<S3CachedObject> {
  const normalizedKey = normalizeS3ObjectKey(objectKey);
  if (!normalizedKey) {
    throw new Error('S3 key is required');
  }

  const bucket = await resolveS3CacheBucket(bucketId);
  if (!bucket) {
    throw new Error('S3 bucket is not configured');
  }
  if (!isS3CacheKeyAllowed(bucket, normalizedKey)) {
    throw new Error('S3 key is outside the configured cache prefix');
  }

  const [{ GetObjectCommand }, client] = await Promise.all([
    loadS3Sdk(),
    getS3Client(bucket),
  ]);
  const result = await client.send(
    new GetObjectCommand({
      Bucket: bucket.bucketName,
      Key: normalizedKey,
    })
  );
  const buffer = await streamToBuffer(result.Body);

  return {
    buffer,
    contentType: result.ContentType || 'application/octet-stream',
    contentLength: Number(result.ContentLength || buffer.length),
    etag: result.ETag,
    lastModified: result.LastModified,
  };
}
