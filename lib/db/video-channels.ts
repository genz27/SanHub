import type {
  VideoChannel,
  VideoModel,
  VideoConfigObject,
} from '@/types';
import { getAdapter } from './connection';
import { ensureDatabase } from './ready';
import { generateId } from '../utils';
import {
  CacheKeys,
  CacheTTL,
  invalidateVideoCatalogCache,
  withCache,
} from '../cache';
import {
  parseVideoAspectRatios,
  parseVideoConfigObject,
  parseVideoDurations,
  parseVideoFeatures,
} from './video-catalog-parse';
import {
  VIDEO_CHANNEL_COLUMNS,
  mapVideoChannelRow,
} from './video-channel-reads';

export { getVideoChannel, getVideoChannels } from './video-channel-reads';

// 创建视频渠道
export async function createVideoChannel(
  channel: Omit<VideoChannel, 'id' | 'createdAt' | 'updatedAt'>
): Promise<VideoChannel> {
  await ensureDatabase();
  const db = getAdapter();

  const id = generateId();
  const now = Date.now();

  await db.execute(
    `INSERT INTO video_channels (id, name, type, base_url, api_key, enabled, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, channel.name, channel.type, channel.baseUrl, channel.apiKey, channel.enabled ? 1 : 0, now, now]
  );

  invalidateVideoCatalogCache();
  return { ...channel, id, createdAt: now, updatedAt: now };
}

// 更新视频渠道
export async function updateVideoChannel(
  id: string,
  updates: Partial<Omit<VideoChannel, 'id' | 'createdAt' | 'updatedAt'>>
): Promise<VideoChannel | null> {
  await ensureDatabase();
  const db = getAdapter();

  const fields: string[] = ['updated_at = ?'];
  const values: unknown[] = [Date.now()];

  if (updates.name !== undefined) { fields.push('name = ?'); values.push(updates.name); }
  if (updates.type !== undefined) { fields.push('type = ?'); values.push(updates.type); }
  if (updates.baseUrl !== undefined) { fields.push('base_url = ?'); values.push(updates.baseUrl); }
  if (updates.apiKey !== undefined) { fields.push('api_key = ?'); values.push(updates.apiKey); }
  if (updates.enabled !== undefined) { fields.push('enabled = ?'); values.push(updates.enabled ? 1 : 0); }

  values.push(id);
  await db.execute(`UPDATE video_channels SET ${fields.join(', ')} WHERE id = ?`, values);

  invalidateVideoCatalogCache();
  const [rows] = await db.execute(
    `SELECT ${VIDEO_CHANNEL_COLUMNS} FROM video_channels WHERE id = ?`,
    [id]
  );
  const channels = rows as any[];
  return channels.length > 0 ? mapVideoChannelRow(channels[0]) : null;
}

// 删除视频渠道
export async function deleteVideoChannel(id: string): Promise<boolean> {
  await ensureDatabase();
  const db = getAdapter();

  await db.execute('DELETE FROM video_models WHERE channel_id = ?', [id]);
  const [result] = await db.execute('DELETE FROM video_channels WHERE id = ?', [id]);
  invalidateVideoCatalogCache();
  return (result as any).affectedRows > 0;
}

const VIDEO_MODEL_COLUMNS = `
  id, channel_id, name, description, api_model, base_url, api_key,
  features, aspect_ratios, durations, video_config_object,
  default_aspect_ratio, default_duration, highlight, enabled, sort_order,
  created_at, updated_at
`;

function mapVideoModelRow(row: any): VideoModel {
  return {
    id: row.id,
    channelId: row.channel_id,
    name: row.name,
    description: row.description || '',
    apiModel: row.api_model,
    baseUrl: row.base_url || undefined,
    apiKey: row.api_key || undefined,
    features: parseVideoFeatures(row.features),
    aspectRatios: parseVideoAspectRatios(row.aspect_ratios),
    durations: parseVideoDurations(row.durations),
    defaultAspectRatio: row.default_aspect_ratio || 'landscape',
    defaultDuration: row.default_duration || '8s',
    videoConfigObject: parseVideoConfigObject(row.video_config_object),
    highlight: Boolean(row.highlight),
    enabled: Boolean(row.enabled),
    sortOrder: row.sort_order || 0,
    createdAt: Number(row.created_at),
    updatedAt: Number(row.updated_at),
  };
}

// 获取所有视频模型
export async function getVideoModels(enabledOnly = false): Promise<VideoModel[]> {
  return withCache(
    `${CacheKeys.VIDEO_MODELS}list:${enabledOnly ? 'enabled' : 'all'}`,
    CacheTTL.VIDEO_MODELS,
    async () => {
      await ensureDatabase();
      const db = getAdapter();
      const sql = enabledOnly
        ? `SELECT ${VIDEO_MODEL_COLUMNS} FROM video_models WHERE enabled = 1 ORDER BY sort_order ASC, created_at ASC`
        : `SELECT ${VIDEO_MODEL_COLUMNS} FROM video_models ORDER BY sort_order ASC, created_at ASC`;
      const [rows] = await db.execute(sql);
      return (rows as any[]).map(mapVideoModelRow);
    }
  );
}

// 获取单个视频模型
export async function getVideoModel(id: string): Promise<VideoModel | null> {
  return withCache(`${CacheKeys.VIDEO_MODELS}model:${id}`, CacheTTL.VIDEO_MODELS, async () => {
    await ensureDatabase();
    const db = getAdapter();

    const [rows] = await db.execute(
      `SELECT ${VIDEO_MODEL_COLUMNS} FROM video_models WHERE id = ?`,
      [id]
    );
    const models = rows as any[];
    if (models.length === 0) return null;
    return mapVideoModelRow(models[0]);
  });
}

// 创建视频模型
export async function createVideoModel(
  model: Omit<VideoModel, 'id' | 'createdAt' | 'updatedAt'>
): Promise<VideoModel> {
  await ensureDatabase();
  const db = getAdapter();

  const id = generateId();
  const now = Date.now();

  await db.execute(
    `INSERT INTO video_models (
      id, channel_id, name, description, api_model, base_url, api_key,
      features, aspect_ratios, durations,
      default_aspect_ratio, default_duration, video_config_object, highlight,
      enabled, sort_order, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      model.channelId,
      model.name,
      model.description,
      model.apiModel,
      model.baseUrl || '',
      model.apiKey || '',
      JSON.stringify(model.features),
      JSON.stringify(model.aspectRatios),
      JSON.stringify(model.durations),
      model.defaultAspectRatio,
      model.defaultDuration,
      model.videoConfigObject ? JSON.stringify(model.videoConfigObject) : null,
      model.highlight ? 1 : 0,
      model.enabled ? 1 : 0,
      model.sortOrder,
      now,
      now,
    ]
  );

  invalidateVideoCatalogCache();
  return { ...model, id, createdAt: now, updatedAt: now };
}

// 更新视频模型
export async function updateVideoModel(
  id: string,
  updates: Partial<Omit<VideoModel, 'id' | 'createdAt' | 'updatedAt'>>
): Promise<VideoModel | null> {
  await ensureDatabase();
  const db = getAdapter();

  const fields: string[] = ['updated_at = ?'];
  const values: unknown[] = [Date.now()];

  if (updates.channelId !== undefined) { fields.push('channel_id = ?'); values.push(updates.channelId); }
  if (updates.name !== undefined) { fields.push('name = ?'); values.push(updates.name); }
  if (updates.description !== undefined) { fields.push('description = ?'); values.push(updates.description); }
  if (updates.apiModel !== undefined) { fields.push('api_model = ?'); values.push(updates.apiModel); }
  if (updates.baseUrl !== undefined) { fields.push('base_url = ?'); values.push(updates.baseUrl); }
  if (updates.apiKey !== undefined) { fields.push('api_key = ?'); values.push(updates.apiKey); }
  if (updates.features !== undefined) { fields.push('features = ?'); values.push(JSON.stringify(updates.features)); }
  if (updates.aspectRatios !== undefined) { fields.push('aspect_ratios = ?'); values.push(JSON.stringify(updates.aspectRatios)); }
  if (updates.durations !== undefined) { fields.push('durations = ?'); values.push(JSON.stringify(updates.durations)); }
  if (updates.defaultAspectRatio !== undefined) { fields.push('default_aspect_ratio = ?'); values.push(updates.defaultAspectRatio); }
  if (updates.defaultDuration !== undefined) { fields.push('default_duration = ?'); values.push(updates.defaultDuration); }
  if (Object.prototype.hasOwnProperty.call(updates, 'videoConfigObject')) {
    const value = (updates as { videoConfigObject?: VideoConfigObject }).videoConfigObject;
    fields.push('video_config_object = ?');
    values.push(value ? JSON.stringify(value) : null);
  }
  if (updates.highlight !== undefined) { fields.push('highlight = ?'); values.push(updates.highlight ? 1 : 0); }
  if (updates.enabled !== undefined) { fields.push('enabled = ?'); values.push(updates.enabled ? 1 : 0); }
  if (updates.sortOrder !== undefined) { fields.push('sort_order = ?'); values.push(updates.sortOrder); }

  values.push(id);
  await db.execute(`UPDATE video_models SET ${fields.join(', ')} WHERE id = ?`, values);

  invalidateVideoCatalogCache();
  return getVideoModel(id);
}

// 删除视频模型
export async function deleteVideoModel(id: string): Promise<boolean> {
  await ensureDatabase();
  const db = getAdapter();

  const [result] = await db.execute('DELETE FROM video_models WHERE id = ?', [id]);
  invalidateVideoCatalogCache();
  return (result as any).affectedRows > 0;
}
