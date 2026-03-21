/* eslint-disable no-console */
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import type { ImageBucketConfig } from '@/types';
import { getSystemConfig } from './db';
import { fetch as undiciFetch, File, FormData } from 'undici';
import { fetchWithRetry } from './http-retry';

type UploadPayload = {
  buffer: Buffer;
  extension: string;
  filename: string;
  mimeType: string;
  objectKey: string;
};

const EXTENSION_BY_MIME: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/png': 'png',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'image/bmp': 'bmp',
};

const s3Clients = new Map<string, S3Client>();

export interface PicUIUploadResponse {
  status: boolean;
  message: string;
  data?: {
    links?: {
      url?: string;
    };
  };
}

function normalizeSegment(value: string): string {
  return value
    .trim()
    .replace(/\\/g, '/')
    .replace(/^\/+|\/+$/g, '');
}

function buildObjectKey(bucket: ImageBucketConfig, filename: string): string {
  const normalizedFilename = normalizeSegment(filename).split('/').pop() || filename;
  const prefix = normalizeSegment(bucket.pathPrefix || '');
  return prefix ? `${prefix}/${normalizedFilename}` : normalizedFilename;
}

function encodeObjectKey(key: string): string {
  return key
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/');
}

function parseUploadPayload(base64Data: string, filename?: string, bucket?: ImageBucketConfig): UploadPayload {
  let mimeType = 'image/jpeg';
  let pureBase64 = base64Data;

  if (base64Data.startsWith('data:')) {
    const matches = base64Data.match(/^data:([^;]+);base64,(.+)$/);
    if (matches) {
      mimeType = matches[1];
      pureBase64 = matches[2];
    }
  }

  const extension = EXTENSION_BY_MIME[mimeType] || 'jpg';
  const safeFilename = filename?.trim() || `image_${Date.now()}.${extension}`;
  const objectKey = buildObjectKey(bucket || { pathPrefix: '' } as ImageBucketConfig, safeFilename);

  return {
    buffer: Buffer.from(pureBase64, 'base64'),
    extension,
    filename: safeFilename,
    mimeType,
    objectKey,
  };
}

function resolveDefaultBucket(): Promise<ImageBucketConfig | null> {
  return getSystemConfig().then((config) => {
    const buckets = config.imageStorage?.buckets || [];
    const enabledBuckets = buckets.filter((bucket) => bucket.enabled);
    if (enabledBuckets.length === 0) {
      return null;
    }

    if (config.imageStorage?.defaultBucketId) {
      const matched = enabledBuckets.find(
        (bucket) => bucket.id === config.imageStorage.defaultBucketId
      );
      if (matched) return matched;
    }

    return enabledBuckets[0] || null;
  });
}

async function uploadToPicuiBucket(
  bucket: ImageBucketConfig,
  payload: UploadPayload
): Promise<string | null> {
  if (!bucket.baseUrl || !bucket.apiKey) return null;

  const buildFormData = () => {
    const formData = new FormData();
    formData.append('file', new File([payload.buffer], payload.filename, { type: payload.mimeType }));
    formData.append('permission', '1');
    return formData;
  };

  const apiUrl = `${bucket.baseUrl.replace(/\/$/, '')}/upload`;
  const response = await fetchWithRetry(undiciFetch, apiUrl, () => ({
    method: 'POST',
    headers: {
      Authorization: `Bearer ${bucket.apiKey}`,
      Accept: 'application/json',
    },
    body: buildFormData(),
  }));

  const data = (await response.json()) as PicUIUploadResponse;
  if (!response.ok || !data.status) {
    console.error('[ImageBucket] PicUI upload failed:', data.message);
    return null;
  }

  return data.data?.links?.url || null;
}

function getS3Client(bucket: ImageBucketConfig): S3Client {
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

function buildS3PublicUrl(bucket: ImageBucketConfig, objectKey: string): string {
  const encodedKey = encodeObjectKey(objectKey);
  const publicBaseUrl = bucket.publicBaseUrl?.trim();

  if (publicBaseUrl) {
    return `${publicBaseUrl.replace(/\/$/, '')}/${encodedKey}`;
  }

  const baseUrl = bucket.baseUrl.replace(/\/$/, '');
  return `${baseUrl}/${bucket.bucketName}/${encodedKey}`;
}

async function uploadToS3Bucket(
  bucket: ImageBucketConfig,
  payload: UploadPayload
): Promise<string | null> {
  if (!bucket.baseUrl || !bucket.apiKey || !bucket.secretKey || !bucket.bucketName) {
    return null;
  }

  const client = getS3Client(bucket);
  await client.send(
    new PutObjectCommand({
      Bucket: bucket.bucketName,
      Key: payload.objectKey,
      Body: payload.buffer,
      ContentType: payload.mimeType,
      CacheControl: 'public, max-age=31536000, immutable',
    })
  );

  return buildS3PublicUrl(bucket, payload.objectKey);
}

export async function uploadToImageBucket(
  base64Data: string,
  filename?: string
): Promise<string | null> {
  const bucket = await resolveDefaultBucket();
  if (!bucket) {
    console.log('[ImageBucket] No enabled bucket configured, skip upload');
    return null;
  }

  const payload = parseUploadPayload(base64Data, filename, bucket);

  try {
    if (bucket.provider === 's3-compatible') {
      return await uploadToS3Bucket(bucket, payload);
    }
    return await uploadToPicuiBucket(bucket, payload);
  } catch (error) {
    console.error('[ImageBucket] Upload failed:', error);
    return null;
  }
}

export async function uploadToPicUI(
  base64Data: string,
  filename?: string
): Promise<string | null> {
  return uploadToImageBucket(base64Data, filename);
}

export async function uploadImageOrKeepBase64(
  base64Data: string,
  filename?: string
): Promise<string> {
  const url = await uploadToImageBucket(base64Data, filename);
  return url || base64Data;
}
