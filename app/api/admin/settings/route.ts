import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getSystemConfig, updateSystemConfig } from '@/lib/db';
import { syncUnusedInviteCodeBonuses } from '@/lib/db-codes';
import type { ImageBucketConfig, ImageStorageConfig } from '@/types';

function normalizePositiveInt(value: unknown, fallback: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(1, Math.floor(parsed));
}

function normalizeNonNegativeInt(value: unknown, fallback: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(0, Math.floor(parsed));
}

function normalizeBucket(
  value: unknown,
  index: number
): ImageBucketConfig | null {
  if (!value || typeof value !== 'object') return null;

  const bucket = value as Record<string, unknown>;
  const nextBucket: ImageBucketConfig = {
    id:
      typeof bucket.id === 'string' && bucket.id.trim()
        ? bucket.id.trim()
        : `bucket-${index + 1}`,
    name:
      typeof bucket.name === 'string' && bucket.name.trim()
        ? bucket.name.trim()
        : `Bucket ${index + 1}`,
    provider:
      bucket.provider === 's3-compatible' ? 's3-compatible' : 'picui',
    baseUrl: typeof bucket.baseUrl === 'string' ? bucket.baseUrl.trim() : '',
    apiKey: typeof bucket.apiKey === 'string' ? bucket.apiKey.trim() : '',
    secretKey:
      typeof bucket.secretKey === 'string' ? bucket.secretKey.trim() : undefined,
    bucketName:
      typeof bucket.bucketName === 'string' ? bucket.bucketName.trim() : undefined,
    region:
      typeof bucket.region === 'string' ? bucket.region.trim() : undefined,
    publicBaseUrl:
      typeof bucket.publicBaseUrl === 'string'
        ? bucket.publicBaseUrl.trim()
        : undefined,
    pathPrefix:
      typeof bucket.pathPrefix === 'string' ? bucket.pathPrefix.trim() : undefined,
    forcePathStyle: bucket.forcePathStyle !== false,
    enabled: bucket.enabled !== false,
  };

  const isBlankBucket =
    !nextBucket.baseUrl &&
    !nextBucket.apiKey &&
    !nextBucket.secretKey &&
    !nextBucket.bucketName &&
    !nextBucket.publicBaseUrl &&
    !nextBucket.pathPrefix;

  return isBlankBucket ? null : nextBucket;
}

function normalizeImageStorage(
  value: unknown,
  current: ImageStorageConfig
): ImageStorageConfig {
  if (!value || typeof value !== 'object') {
    return current;
  }

  const raw = value as Record<string, unknown>;
  const buckets = Array.isArray(raw.buckets)
    ? raw.buckets
        .map((bucket, index) => normalizeBucket(bucket, index))
        .filter((bucket): bucket is ImageBucketConfig => Boolean(bucket))
    : current.buckets;

  for (const bucket of buckets) {
    if (!bucket.enabled) continue;

    if (bucket.provider === 'picui') {
      if (!bucket.baseUrl || !bucket.apiKey) {
        throw new Error(`桶 ${bucket.name} 缺少 PicUI 地址或 API Key`);
      }
      continue;
    }

    if (!bucket.baseUrl || !bucket.apiKey || !bucket.secretKey || !bucket.bucketName) {
      throw new Error(`桶 ${bucket.name} 缺少 S3 兼容存储的必要配置`);
    }
  }

  const enabledBucketIds = new Set(
    buckets.filter((bucket) => bucket.enabled).map((bucket) => bucket.id)
  );
  let defaultBucketId =
    typeof raw.defaultBucketId === 'string' ? raw.defaultBucketId.trim() : '';

  if (defaultBucketId && !enabledBucketIds.has(defaultBucketId)) {
    throw new Error('默认桶必须指向启用中的桶');
  }

  if (!defaultBucketId) {
    defaultBucketId = buckets.find((bucket) => bucket.enabled)?.id || '';
  }

  return {
    defaultBucketId,
    buckets,
  };
}

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    
    if (!session?.user || session.user.role !== 'admin') {
      return NextResponse.json({ error: '无权限' }, { status: 403 });
    }

    const config = await getSystemConfig();
    return NextResponse.json({ success: true, data: config });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '获取配置失败' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    
    if (!session?.user || session.user.role !== 'admin') {
      return NextResponse.json({ error: '无权限' }, { status: 403 });
    }

    const updates = await request.json();

    // 如果后台地址发生变化，则清空旧的 admin token，强制下一次重新登录
    const current = await getSystemConfig();
    const nextUpdates: any = { ...updates };
    if (
      typeof updates.soraBackendUrl === 'string' &&
      updates.soraBackendUrl.trim() &&
      updates.soraBackendUrl.trim() !== (current.soraBackendUrl || '').trim()
    ) {
      nextUpdates.soraBackendToken = '';
    }

    if (updates.rateLimit && typeof updates.rateLimit === 'object') {
      const rateLimit = updates.rateLimit as Record<string, unknown>;
      nextUpdates.rateLimit = {
        imageMaxRequests: normalizePositiveInt(rateLimit.imageMaxRequests, current.rateLimit.imageMaxRequests),
        imageWindowSeconds: normalizePositiveInt(rateLimit.imageWindowSeconds, current.rateLimit.imageWindowSeconds),
        videoMaxRequests: normalizePositiveInt(rateLimit.videoMaxRequests, current.rateLimit.videoMaxRequests),
        videoWindowSeconds: normalizePositiveInt(rateLimit.videoWindowSeconds, current.rateLimit.videoWindowSeconds),
      };
    }

    if (updates.featureFlags && typeof updates.featureFlags === 'object') {
      const featureFlags = updates.featureFlags as Record<string, unknown>;
      nextUpdates.featureFlags = {
        squareEnabled:
          typeof featureFlags.squareEnabled === 'boolean'
            ? featureFlags.squareEnabled
            : current.featureFlags.squareEnabled,
        gachaEnabled:
          typeof featureFlags.gachaEnabled === 'boolean'
            ? featureFlags.gachaEnabled
            : current.featureFlags.gachaEnabled,
        characterCardEnabled:
          typeof featureFlags.characterCardEnabled === 'boolean'
            ? featureFlags.characterCardEnabled
            : current.featureFlags.characterCardEnabled,
      };
    }

    if (updates.inviteSettings && typeof updates.inviteSettings === 'object') {
      const inviteSettings = updates.inviteSettings as Record<string, unknown>;
      nextUpdates.inviteSettings = {
        enabled:
          typeof inviteSettings.enabled === 'boolean'
            ? inviteSettings.enabled
            : current.inviteSettings.enabled,
        rewardEnabled:
          typeof inviteSettings.rewardEnabled === 'boolean'
            ? inviteSettings.rewardEnabled
            : current.inviteSettings.rewardEnabled,
        inviteeBonusPoints: normalizeNonNegativeInt(
          inviteSettings.inviteeBonusPoints,
          current.inviteSettings.inviteeBonusPoints
        ),
        inviterBonusPoints: normalizeNonNegativeInt(
          inviteSettings.inviterBonusPoints,
          current.inviteSettings.inviterBonusPoints
        ),
      };
    }

    if (updates.imageStorage !== undefined) {
      nextUpdates.imageStorage = normalizeImageStorage(
        updates.imageStorage,
        current.imageStorage
      );
    }

    const config = await updateSystemConfig(nextUpdates);

    if (nextUpdates.inviteSettings) {
      const inviteSettings = config.inviteSettings;
      const inviteeBonusPoints = inviteSettings.rewardEnabled
        ? inviteSettings.inviteeBonusPoints
        : 0;
      const inviterBonusPoints = inviteSettings.rewardEnabled
        ? inviteSettings.inviterBonusPoints
        : 0;
      await syncUnusedInviteCodeBonuses(inviteeBonusPoints, inviterBonusPoints);
    }

    return NextResponse.json({ success: true, data: config });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '更新配置失败' },
      { status: 500 }
    );
  }
}
