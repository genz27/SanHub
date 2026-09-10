import type { Generation } from '@/types';
import { parseStoredReferenceImages } from '@/lib/generation-reference-media';
import { getAdapter } from './connection';
import {
  generationMediaCacheKey,
  generationStatusCacheKey,
} from './generation-cache';
import { mapGenerationListRow } from './generation-row';
import { ensureDatabase } from './ready';
import { cache, CacheKeys, CacheTTL, withCache } from '../cache';

export async function getPendingGenerationsCount(): Promise<number> {
  return withCache(CacheKeys.PENDING_COUNT, CacheTTL.PENDING_COUNT, async () => {
    await ensureDatabase();
    const db = getAdapter();

    const [rows] = await db.execute(
      `SELECT COUNT(1) as count FROM generations WHERE status IN ('pending', 'processing')`
    );

    return Number((rows as any[])[0]?.count || 0);
  });
}

export type GenerationCancelTarget = {
  id: string;
  userId: string;
  status: Generation['status'];
  cost: number;
};

export async function getGenerationCancelTarget(id: string): Promise<GenerationCancelTarget | null> {
  await ensureDatabase();
  const db = getAdapter();

  const [rows] = await db.execute(
    'SELECT id, user_id, status, cost FROM generations WHERE id = ?',
    [id]
  );
  const gens = rows as any[];
  if (gens.length === 0) return null;

  const row = gens[0];
  return {
    id: row.id,
    userId: row.user_id,
    status: row.status || 'pending',
    cost: Number(row.cost) || 0,
  };
}

export type GenerationMediaRecord = {
  id: string;
  userId: string;
  type: Generation['type'];
  resultUrl: string;
  videoId?: string;
  videoChannelId?: string;
  referenceImages: string[];
};

export async function getGenerationMedia(id: string): Promise<GenerationMediaRecord | null> {
  const cacheKey = generationMediaCacheKey(id);
  const cached = cache.get<GenerationMediaRecord>(cacheKey);
  if (cached && Array.isArray(cached.referenceImages)) return cached;

  await ensureDatabase();
  const db = getAdapter();

  const [rows] = await db.execute(
    `SELECT
       id, user_id, type, result_url,
       CASE
         WHEN type NOT LIKE '%video%' THEN NULL
         ELSE JSON_UNQUOTE(JSON_EXTRACT(params, '$.videoId'))
       END AS param_video_id,
       CASE
         WHEN type NOT LIKE '%video%' THEN NULL
         ELSE JSON_UNQUOTE(JSON_EXTRACT(params, '$.videoChannelId'))
       END AS param_video_channel_id,
       JSON_EXTRACT(params, '$.referenceImages') AS param_reference_images
     FROM generations WHERE id = ?`,
    [id]
  );

  const gens = rows as any[];
  if (gens.length === 0) return null;

  const row = gens[0];
  const record: GenerationMediaRecord = {
    id: row.id,
    userId: row.user_id,
    type: row.type,
    resultUrl: row.result_url || '',
    videoId: row.param_video_id || undefined,
    videoChannelId: row.param_video_channel_id || undefined,
    referenceImages: parseStoredReferenceImages(row.param_reference_images),
  };

  // Skip data: payloads and empty URLs so memory stays bounded and 204s stay fresh.
  if (record.resultUrl && !record.resultUrl.startsWith('data:')) {
    cache.set(cacheKey, record, CacheTTL.USER_GENERATIONS);
  }

  return record;
}

export async function getGenerationStatus(id: string): Promise<Generation | null> {
  return withCache(
    generationStatusCacheKey(id),
    (generation) =>
      generation.status === 'pending' || generation.status === 'processing'
        ? CacheTTL.GENERATION_STATUS
        : CacheTTL.USER_GENERATIONS,
    async () => {
      await ensureDatabase();
      const db = getAdapter();

      const [rows] = await db.execute(
        `SELECT
           id, user_id, type, status,
           CASE WHEN status = 'completed' THEN cost END AS cost,
           CASE WHEN status = 'completed' THEN created_at END AS created_at,
           CASE WHEN status = 'completed' THEN updated_at END AS updated_at,
           CASE
             WHEN status IN ('failed', 'cancelled') THEN error_message
           END AS error_message,
           CASE
             WHEN status <> 'completed' THEN NULL
             WHEN result_url IS NULL OR result_url = '' THEN NULL
             WHEN LEFT(result_url, 8) = 'https://' OR LEFT(result_url, 7) = 'http://' THEN result_url
             ELSE ''
           END AS result_url,
           CASE
             WHEN status IN ('pending', 'processing') THEN JSON_EXTRACT(params, '$.progress')
           END AS param_progress,
           JSON_EXTRACT(params, '$.referenceImages') AS param_reference_images
         FROM generations WHERE id = ?`,
        [id]
      );

      const gens = rows as any[];
      if (gens.length === 0) return null;

      return mapGenerationListRow(gens[0]);
    }
  );
}
