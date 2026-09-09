import type { VideoChannel, VideoChannelType } from '@/types';
import { getAdapter } from './connection';
import { ensureDatabase } from './ready';
import { CacheKeys, CacheTTL, withCache } from '../cache';

export const VIDEO_CHANNEL_COLUMNS =
  'id, name, type, base_url, api_key, enabled, created_at, updated_at';
export const VIDEO_CHANNEL_AUTH_COLUMNS = 'id, type, base_url, api_key, enabled';

export function mapVideoChannelRow(row: any): VideoChannel {
  return {
    id: row.id,
    name: row.name || '',
    type: row.type as VideoChannelType,
    baseUrl: row.base_url || '',
    apiKey: row.api_key || '',
    enabled: Boolean(row.enabled),
    createdAt: Number(row.created_at) || 0,
    updatedAt: Number(row.updated_at) || 0,
  };
}

export async function getVideoChannels(enabledOnly = false): Promise<VideoChannel[]> {
  return withCache(
    `${CacheKeys.VIDEO_CHANNELS}full:${enabledOnly ? 'enabled' : 'all'}`,
    CacheTTL.VIDEO_MODELS,
    async () => {
      await ensureDatabase();
      const db = getAdapter();
      const sql = enabledOnly
        ? `SELECT ${VIDEO_CHANNEL_AUTH_COLUMNS} FROM video_channels WHERE enabled = 1 ORDER BY created_at ASC`
        : `SELECT ${VIDEO_CHANNEL_COLUMNS} FROM video_channels ORDER BY created_at ASC`;
      const [rows] = await db.execute(sql);
      return (rows as any[]).map(mapVideoChannelRow);
    }
  );
}

export async function getVideoChannel(id: string): Promise<VideoChannel | null> {
  return withCache(`${CacheKeys.VIDEO_CHANNELS}id:${id}`, CacheTTL.VIDEO_MODELS, async () => {
    await ensureDatabase();
    const db = getAdapter();

    const [rows] = await db.execute(
      `SELECT ${VIDEO_CHANNEL_AUTH_COLUMNS} FROM video_channels WHERE id = ?`,
      [id]
    );
    const channels = rows as any[];
    if (channels.length === 0) return null;
    return mapVideoChannelRow(channels[0]);
  });
}
