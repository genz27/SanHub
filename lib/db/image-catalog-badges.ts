import type { ChannelType, SafeImageModel } from '@/types';
import { getAdapter } from './connection';
import { ensureDatabase } from './ready';
import { CacheKeys, CacheTTL, withCache } from '../cache';

export type SafeImageModelBadge = Pick<SafeImageModel, 'id' | 'name' | 'apiModel' | 'channelType'>;

export async function getSafeImageModelBadges(): Promise<SafeImageModelBadge[]> {
  return withCache(
    `${CacheKeys.IMAGE_MODELS}enabled:lookup`,
    CacheTTL.IMAGE_MODELS,
    async () => {
      await ensureDatabase();
      const db = getAdapter();
      const [rows] = await db.execute(
        `SELECT m.id, m.name, m.api_model, c.type AS channel_type
         FROM image_models m
         INNER JOIN image_channels c ON c.id = m.channel_id
         WHERE m.enabled = 1 AND c.enabled = 1
         ORDER BY m.sort_order ASC, m.created_at ASC`
      );

      return (rows as any[]).map((row) => ({
        id: row.id,
        name: row.name || '',
        apiModel: row.api_model || '',
        channelType: row.channel_type as ChannelType,
      }));
    }
  );
}
