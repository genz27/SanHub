import type { SafeVideoChannel, VideoChannelType } from '@/types';
import { getAdapter } from './connection';
import { ensureDatabase } from './ready';
import { CacheKeys, CacheTTL, withCache } from '../cache';

export async function getSafeVideoChannels(enabledOnly = false): Promise<SafeVideoChannel[]> {
  return withCache(
    `${CacheKeys.VIDEO_CHANNELS}${enabledOnly ? 'enabled' : 'all'}`,
    CacheTTL.VIDEO_MODELS,
    async () => {
      await ensureDatabase();
      const db = getAdapter();
      const sql = enabledOnly
        ? 'SELECT id, name, type, enabled FROM video_channels WHERE enabled = 1 ORDER BY created_at ASC'
        : 'SELECT id, name, type, enabled FROM video_channels ORDER BY created_at ASC';
      const [rows] = await db.execute(sql);
      return (rows as any[]).map((row) => ({
        id: row.id,
        name: row.name,
        type: row.type as VideoChannelType,
        enabled: Boolean(row.enabled),
      }));
    }
  );
}
