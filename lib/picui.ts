/* eslint-disable no-console */
import type { ImageBucketConfig } from '@/types';
import { getImageStorageConfig } from './db/system-config-image-storage';
import { fetchWithRetry } from './http-retry';
import { getS3Client, loadS3Sdk } from './s3-cache';
import { loadUndici } from './undici-http';

type UploadPayload = {
  buffer: Buffer;
  extension: string;
  filename: string;
  mimeType: string;
  objectKey: string;
};

type UploadOptions = {
  publicBaseUrl?: string;
  preferDirectS3Url?: boolean;
};

const EXTENSION_BY_MIME: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/png': 'png',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'image/bmp': 'bmp',
  'video/mp4': 'mp4',
  'video/mpeg': 'mpeg',
  'video/quicktime': 'mov',
  'video/webm': 'webm',
};

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

function getExtensionForMime(mimeType: string): string {
  return EXTENSION_BY_MIME[mimeType.toLowerCase().split(';')[0]?.trim() || ''] || 'bin';
}

function ensureFilenameExtension(filename: string, extension: string): string {
  const trimmed = normalizeSegment(filename).split('/').pop() || `media_${Date.now()}.${extension}`;
  if (/\.[a-z0-9]{2,5}$/i.test(trimmed)) return trimmed;
  return `${trimmed}.${extension}`;
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

  const extension = getExtensionForMime(mimeType);
  const safeFilename = ensureFilenameExtension(filename?.trim() || `image_${Date.now()}`, extension);
  const objectKey = buildObjectKey(bucket || { pathPrefix: '' } as ImageBucketConfig, safeFilename);

  return {
    buffer: Buffer.from(pureBase64, 'base64'),
    extension,
    filename: safeFilename,
    mimeType,
    objectKey,
  };
}

function buildUploadPayloadFromBuffer(
  buffer: Buffer,
  mimeType: string,
  filename?: string,
  bucket?: ImageBucketConfig
): UploadPayload {
  const normalizedMimeType = mimeType.split(';')[0]?.trim().toLowerCase() || 'application/octet-stream';
  const extension = getExtensionForMime(normalizedMimeType);
  const safeFilename = ensureFilenameExtension(filename?.trim() || `media_${Date.now()}`, extension);
  const objectKey = buildObjectKey(bucket || { pathPrefix: '' } as ImageBucketConfig, safeFilename);

  return {
    buffer,
    extension,
    filename: safeFilename,
    mimeType: normalizedMimeType,
    objectKey,
  };
}

export function resolveDefaultImageBucket(): Promise<ImageBucketConfig | null> {
  return getImageStorageConfig().then((imageStorage) => {
    const buckets = imageStorage.buckets || [];
    const enabledBuckets = buckets.filter((bucket) => bucket.enabled);
    if (enabledBuckets.length === 0) {
      return null;
    }

    if (imageStorage.defaultBucketId) {
      const matched = enabledBuckets.find(
        (bucket) => bucket.id === imageStorage.defaultBucketId
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

  const { fetch: undiciFetch, File, FormData } = await loadUndici();
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

function normalizePublicBaseUrl(value?: string): string {
  return (value || process.env.SANHUB_PUBLIC_BASE_URL || process.env.NEXTAUTH_URL || '')
    .trim()
    .replace(/\/$/, '');
}

function buildPublicPath(path: string, options?: UploadOptions): string {
  const publicBaseUrl = normalizePublicBaseUrl(options?.publicBaseUrl);
  return publicBaseUrl ? `${publicBaseUrl}${path}` : path;
}

function buildS3CacheUrl(bucket: ImageBucketConfig, objectKey: string, options?: UploadOptions): string {
  const params = new URLSearchParams();
  params.set('key', objectKey);
  params.set('bucket', bucket.id);
  return buildPublicPath(`/cache/s3?${params.toString()}`, options);
}

function encodeObjectKey(key: string): string {
  return key
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/');
}

function buildDirectS3PublicUrl(bucket: ImageBucketConfig, objectKey: string): string {
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
  payload: UploadPayload,
  options?: UploadOptions
): Promise<string | null> {
  if (!bucket.baseUrl || !bucket.apiKey || !bucket.secretKey || !bucket.bucketName) {
    return null;
  }

  const [{ PutObjectCommand }, client] = await Promise.all([
    loadS3Sdk(),
    getS3Client(bucket),
  ]);
  await client.send(
    new PutObjectCommand({
      Bucket: bucket.bucketName,
      Key: payload.objectKey,
      Body: payload.buffer,
      ContentType: payload.mimeType,
      CacheControl: 'public, max-age=31536000, immutable',
    })
  );

  return options?.preferDirectS3Url
    ? buildDirectS3PublicUrl(bucket, payload.objectKey)
    : buildS3CacheUrl(bucket, payload.objectKey, options);
}

async function uploadPayloadToBucket(
  bucket: ImageBucketConfig,
  payload: UploadPayload,
  options?: UploadOptions
): Promise<string | null> {
  if (bucket.provider === 's3-compatible') {
    return await uploadToS3Bucket(bucket, payload, options);
  }

  if (!payload.mimeType.startsWith('image/')) {
    return null;
  }

  return await uploadToPicuiBucket(bucket, payload);
}

export async function uploadToImageBucket(
  base64Data: string,
  filename?: string,
  options?: UploadOptions
): Promise<string | null> {
  const bucket = await resolveDefaultImageBucket();
  if (!bucket) {
    console.log('[ImageBucket] No enabled bucket configured, skip upload');
    return null;
  }

  const payload = parseUploadPayload(base64Data, filename, bucket);

  try {
    return await uploadPayloadToBucket(bucket, payload, options);
  } catch (error) {
    console.error('[ImageBucket] Upload failed:', error);
    return null;
  }
}

export async function uploadBufferToImageBucket(
  buffer: Buffer,
  mimeType: string,
  filename?: string,
  options?: UploadOptions
): Promise<string | null> {
  const bucket = await resolveDefaultImageBucket();
  if (!bucket) {
    console.log('[ImageBucket] No enabled bucket configured, skip upload');
    return null;
  }

  const payload = buildUploadPayloadFromBuffer(buffer, mimeType, filename, bucket);

  try {
    return await uploadPayloadToBucket(bucket, payload, options);
  } catch (error) {
    console.error('[ImageBucket] Upload failed:', error);
    return null;
  }
}

export async function uploadToPicUI(
  base64Data: string,
  filename?: string,
  options?: UploadOptions
): Promise<string | null> {
  return uploadToImageBucket(base64Data, filename, options);
}

export async function uploadImageOrKeepBase64(
  base64Data: string,
  filename?: string,
  options?: UploadOptions
): Promise<string> {
  const url = await uploadToImageBucket(base64Data, filename, options);
  return url || base64Data;
}

