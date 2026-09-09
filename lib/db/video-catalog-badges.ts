import type { SafeVideoModel, VideoChannelType } from '@/types';
import { getAdapter } from './connection';
import { ensureDatabase } from './ready';
import { CacheKeys, CacheTTL, withCache } from '../cache';

export type SafeVideoModelBadge = Pick<SafeVideoModel, 'id' | 'channelType'>;

export async function getSafeVideoModelBadges(): Promise<SafeVideoModelBadge[]> {
  return withCache(
    `${CacheKeys.VIDEO_MODELS}enabled:badges`,
    CacheTTL.VIDEO_MODELS,
    async () => {
      await ensureDatabase();
      const db = getAdapter();
      const [rows] = await db.execute(
        `SELECT m.id, c.type AS channel_type
         FROM video_models m
         INNER JOIN video_channels c ON c.id = m.channel_id
         WHERE m.enabled = 1 AND c.enabled = 1
         ORDER BY m.sort_order ASC, m.created_at ASC`
      );

      return (rows as any[]).map((row) => ({
        id: row.id,
        channelType: row.channel_type as VideoChannelType,
      }));
    }
  );
}
