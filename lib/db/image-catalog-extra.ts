import type { ChannelType, SafeImageChannel } from '@/types';
import { getAdapter } from './connection';
import { ensureDatabase } from './ready';
import { CacheKeys, CacheTTL, withCache } from '../cache';

export async function getSafeImageChannels(enabledOnly = false): Promise<SafeImageChannel[]> {
  return withCache(
    `${CacheKeys.IMAGE_CHANNELS}${enabledOnly ? 'enabled' : 'all'}`,
    CacheTTL.IMAGE_MODELS,
    async () => {
      await ensureDatabase();
      const db = getAdapter();
      const sql = enabledOnly
        ? 'SELECT id, name, type, enabled FROM image_channels WHERE enabled = 1 ORDER BY created_at ASC'
        : 'SELECT id, name, type, enabled FROM image_channels ORDER BY created_at ASC';
      const [rows] = await db.execute(sql);
      return (rows as any[]).map((row) => ({
        id: row.id,
        name: row.name,
        type: row.type as ChannelType,
        enabled: Boolean(row.enabled),
      }));
    }
  );
}
