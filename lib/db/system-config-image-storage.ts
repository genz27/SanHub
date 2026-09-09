import type { ImageBucketConfig, ImageStorageConfig } from '@/types';
import { getSystemConfigSlice } from './system-config-slice';

export const LEGACY_IMAGE_BUCKET_ID = 'legacy-picui-default';

export function sanitizeImageBucket(
  value: unknown,
  index: number
): ImageBucketConfig | null {
  if (!value || typeof value !== 'object') return null;

  const bucket = value as Record<string, unknown>;
  const provider =
    bucket.provider === 's3-compatible' ? 's3-compatible' : 'picui';
  const id =
    typeof bucket.id === 'string' && bucket.id.trim()
      ? bucket.id.trim()
      : `bucket-${index + 1}`;

  return {
    id,
    name:
      typeof bucket.name === 'string' && bucket.name.trim()
        ? bucket.name.trim()
        : `Bucket ${index + 1}`,
    provider,
    baseUrl: typeof bucket.baseUrl === 'string' ? bucket.baseUrl.trim() : '',
    apiKey: typeof bucket.apiKey === 'string' ? bucket.apiKey.trim() : '',
    secretKey:
      typeof bucket.secretKey === 'string' ? bucket.secretKey.trim() : undefined,
    bucketName:
      typeof bucket.bucketName === 'string' ? bucket.bucketName.trim() : undefined,
    region: typeof bucket.region === 'string' ? bucket.region.trim() : undefined,
    publicBaseUrl:
      typeof bucket.publicBaseUrl === 'string'
        ? bucket.publicBaseUrl.trim()
        : undefined,
    pathPrefix:
      typeof bucket.pathPrefix === 'string' ? bucket.pathPrefix.trim() : undefined,
    forcePathStyle: bucket.forcePathStyle !== false,
    enabled: bucket.enabled !== false,
  };
}

function parseImageStorageBuckets(raw: unknown): ImageBucketConfig[] {
  if (!raw) return [];

  let parsed: unknown = raw;
  if (typeof raw === 'string') {
    try {
      parsed = JSON.parse(raw);
    } catch {
      return [];
    }
  }

  if (!Array.isArray(parsed)) return [];

  return parsed
    .map((value, index) => sanitizeImageBucket(value, index))
    .filter((bucket): bucket is ImageBucketConfig => Boolean(bucket));
}

function buildLegacyPicuiBucket(
  baseUrl: string,
  apiKey: string
): ImageBucketConfig | null {
  if (!baseUrl && !apiKey) return null;

  return {
    id: LEGACY_IMAGE_BUCKET_ID,
    name: 'Legacy PicUI',
    provider: 'picui',
    baseUrl: baseUrl.trim(),
    apiKey: apiKey.trim(),
    enabled: true,
    forcePathStyle: true,
  };
}

export function resolveImageStorageConfig(row?: Record<string, unknown>): ImageStorageConfig {
  const buckets = parseImageStorageBuckets(row?.image_storage_buckets);
  const defaultBucketId =
    typeof row?.image_storage_default_bucket_id === 'string'
      ? row.image_storage_default_bucket_id.trim()
      : '';

  if (buckets.length > 0) {
    return {
      defaultBucketId:
        defaultBucketId ||
        buckets.find((bucket) => bucket.enabled)?.id ||
        buckets[0]?.id,
      buckets,
    };
  }

  const legacyBucket = buildLegacyPicuiBucket(
    typeof row?.picui_base_url === 'string' ? row.picui_base_url : '',
    typeof row?.picui_api_key === 'string' ? row.picui_api_key : ''
  );

  return {
    defaultBucketId: legacyBucket?.id,
    buckets: legacyBucket ? [legacyBucket] : [],
  };
}

export async function getImageStorageConfig(): Promise<ImageStorageConfig> {
  return getSystemConfigSlice(
    'image-storage',
    'image_storage_buckets, image_storage_default_bucket_id, picui_api_key, picui_base_url',
    (row) => resolveImageStorageConfig(row || undefined)
  );
}
