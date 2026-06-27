import type {
  VideoChannel,
  VideoModel,
  SafeVideoChannel,
  SafeVideoModel,
  VideoModelFeatures,
  VideoDuration,
  VideoConfigObject,
  VideoChannelType,
} from '@/types';
import { getAdapter } from './connection';
import { initializeDatabase, initializeVideoChannelsTables } from './schema';
import { generateId } from '../utils';
import { buildSafeVideoModels } from '../video-model-normalizer';

// ========================================
// 视频渠道操作
// ========================================

// 获取所有视频渠道
export async function getVideoChannels(enabledOnly = false): Promise<VideoChannel[]> {
  await initializeDatabase();
  await initializeVideoChannelsTables();
  const db = getAdapter();

  const sql = enabledOnly
    ? 'SELECT * FROM video_channels WHERE enabled = 1 ORDER BY created_at ASC'
    : 'SELECT * FROM video_channels ORDER BY created_at ASC';

  const [rows] = await db.execute(sql);

  return (rows as any[]).map((row) => ({
    id: row.id,
    name: row.name,
    type: row.type as VideoChannelType,
    baseUrl: row.base_url || '',
    apiKey: row.api_key || '',
    enabled: Boolean(row.enabled),
    createdAt: Number(row.created_at),
    updatedAt: Number(row.updated_at),
  }));
}

// 获取单个视频渠道
export async function getVideoChannel(id: string): Promise<VideoChannel | null> {
  await initializeDatabase();
  await initializeVideoChannelsTables();
  const db = getAdapter();

  const [rows] = await db.execute('SELECT * FROM video_channels WHERE id = ?', [id]);
  const channels = rows as any[];
  if (channels.length === 0) return null;

  const row = channels[0];
  return {
    id: row.id,
    name: row.name,
    type: row.type as VideoChannelType,
    baseUrl: row.base_url || '',
    apiKey: row.api_key || '',
    enabled: Boolean(row.enabled),
    createdAt: Number(row.created_at),
    updatedAt: Number(row.updated_at),
  };
}

// 创建视频渠道
export async function createVideoChannel(
  channel: Omit<VideoChannel, 'id' | 'createdAt' | 'updatedAt'>
): Promise<VideoChannel> {
  await initializeDatabase();
  await initializeVideoChannelsTables();
  const db = getAdapter();

  const id = generateId();
  const now = Date.now();

  await db.execute(
    `INSERT INTO video_channels (id, name, type, base_url, api_key, enabled, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, channel.name, channel.type, channel.baseUrl, channel.apiKey, channel.enabled ? 1 : 0, now, now]
  );

  return { ...channel, id, createdAt: now, updatedAt: now };
}

// 更新视频渠道
export async function updateVideoChannel(
  id: string,
  updates: Partial<Omit<VideoChannel, 'id' | 'createdAt' | 'updatedAt'>>
): Promise<VideoChannel | null> {
  await initializeDatabase();
  await initializeVideoChannelsTables();
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

  return getVideoChannel(id);
}

// 删除视频渠道
export async function deleteVideoChannel(id: string): Promise<boolean> {
  await initializeDatabase();
  await initializeVideoChannelsTables();
  const db = getAdapter();

  await db.execute('DELETE FROM video_models WHERE channel_id = ?', [id]);
  const [result] = await db.execute('DELETE FROM video_channels WHERE id = ?', [id]);
  return (result as any).affectedRows > 0;
}

// 获取安全的视频渠道列表
export async function getSafeVideoChannels(enabledOnly = false): Promise<SafeVideoChannel[]> {
  const channels = await getVideoChannels(enabledOnly);
  return channels.map((c) => ({
    id: c.id,
    name: c.name,
    type: c.type,
    enabled: c.enabled,
  }));
}

// ========================================
// 视频模型操作
// ========================================

function parseVideoFeatures(raw: unknown): VideoModelFeatures {
  const defaults: VideoModelFeatures = {
    textToVideo: true,
    imageToVideo: false,
    videoToVideo: false,
    supportStyles: false,
  };
  if (!raw) return defaults;
  if (typeof raw === 'string') {
    try {
      return { ...defaults, ...JSON.parse(raw) };
    } catch {
      return defaults;
    }
  }
  if (typeof raw === 'object') {
    return { ...defaults, ...(raw as VideoModelFeatures) };
  }
  return defaults;
}

function parseAspectRatios(raw: unknown): Array<{ value: string; label: string }> {
  if (!raw) return [];
  if (typeof raw === 'string') {
    try {
      return JSON.parse(raw);
    } catch {
      return [];
    }
  }
  if (Array.isArray(raw)) return raw;
  return [];
}

function parseDurations(raw: unknown): VideoDuration[] {
  if (!raw) return [];
  if (typeof raw === 'string') {
    try {
      return JSON.parse(raw);
    } catch {
      return [];
    }
  }
  if (Array.isArray(raw)) return raw;
  return [];
}

function parseVideoConfigObject(raw: unknown): VideoConfigObject | undefined {
  if (!raw) return undefined;
  let parsed: unknown = raw;

  if (typeof raw === 'string') {
    try {
      parsed = JSON.parse(raw);
    } catch {
      return undefined;
    }
  }

  if (!parsed || typeof parsed !== 'object') return undefined;
  const candidate = parsed as Record<string, unknown>;
  const output: VideoConfigObject = {};

  if (typeof candidate.aspect_ratio === 'string' && candidate.aspect_ratio.trim()) {
    output.aspect_ratio = candidate.aspect_ratio.trim() as VideoConfigObject['aspect_ratio'];
  }
  if (typeof candidate.video_length === 'number' && Number.isFinite(candidate.video_length)) {
    output.video_length = Math.floor(candidate.video_length);
  }
  if (typeof candidate.resolution === 'string' && candidate.resolution.trim()) {
    output.resolution = candidate.resolution.trim().toUpperCase() as VideoConfigObject['resolution'];
  }
  if (typeof candidate.preset === 'string' && candidate.preset.trim()) {
    output.preset = candidate.preset.trim().toLowerCase() as VideoConfigObject['preset'];
  }

  return Object.keys(output).length > 0 ? output : undefined;
}

// 获取所有视频模型
export async function getVideoModels(enabledOnly = false): Promise<VideoModel[]> {
  await initializeDatabase();
  await initializeVideoChannelsTables();
  const db = getAdapter();

  const sql = enabledOnly
    ? 'SELECT * FROM video_models WHERE enabled = 1 ORDER BY sort_order ASC, created_at ASC'
    : 'SELECT * FROM video_models ORDER BY sort_order ASC, created_at ASC';

  const [rows] = await db.execute(sql);

  return (rows as any[]).map((row) => ({
    id: row.id,
    channelId: row.channel_id,
    name: row.name,
    description: row.description || '',
    apiModel: row.api_model,
    baseUrl: row.base_url || undefined,
    apiKey: row.api_key || undefined,
    features: parseVideoFeatures(row.features),
    aspectRatios: parseAspectRatios(row.aspect_ratios),
    durations: parseDurations(row.durations),
    defaultAspectRatio: row.default_aspect_ratio || 'landscape',
    defaultDuration: row.default_duration || '8s',
    videoConfigObject: parseVideoConfigObject(row.video_config_object),
    highlight: Boolean(row.highlight),
    enabled: Boolean(row.enabled),
    sortOrder: row.sort_order || 0,
    createdAt: Number(row.created_at),
    updatedAt: Number(row.updated_at),
  }));
}

// 获取单个视频模型
export async function getVideoModel(id: string): Promise<VideoModel | null> {
  await initializeDatabase();
  await initializeVideoChannelsTables();
  const db = getAdapter();

  const [rows] = await db.execute('SELECT * FROM video_models WHERE id = ?', [id]);
  const models = rows as any[];
  if (models.length === 0) return null;

  const row = models[0];
  return {
    id: row.id,
    channelId: row.channel_id,
    name: row.name,
    description: row.description || '',
    apiModel: row.api_model,
    baseUrl: row.base_url || undefined,
    apiKey: row.api_key || undefined,
    features: parseVideoFeatures(row.features),
    aspectRatios: parseAspectRatios(row.aspect_ratios),
    durations: parseDurations(row.durations),
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

// 创建视频模型
export async function createVideoModel(
  model: Omit<VideoModel, 'id' | 'createdAt' | 'updatedAt'>
): Promise<VideoModel> {
  await initializeDatabase();
  await initializeVideoChannelsTables();
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

  return { ...model, id, createdAt: now, updatedAt: now };
}

// 更新视频模型
export async function updateVideoModel(
  id: string,
  updates: Partial<Omit<VideoModel, 'id' | 'createdAt' | 'updatedAt'>>
): Promise<VideoModel | null> {
  await initializeDatabase();
  await initializeVideoChannelsTables();
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

  return getVideoModel(id);
}

// 删除视频模型
export async function deleteVideoModel(id: string): Promise<boolean> {
  await initializeDatabase();
  await initializeVideoChannelsTables();
  const db = getAdapter();

  const [result] = await db.execute('DELETE FROM video_models WHERE id = ?', [id]);
  return (result as any).affectedRows > 0;
}

// 获取安全的视频模型列表
export async function getSafeVideoModels(enabledOnly = false): Promise<SafeVideoModel[]> {
  const models = await getVideoModels(enabledOnly);
  const channels = await getVideoChannels();
  return buildSafeVideoModels(models, channels, enabledOnly);
}

// 获取视频模型的完整配置
// 注：此函数必须放在最后导出，因为它引用了 SafeVideoModel 相关类型
export async function getVideoModelWithChannel(modelId: string): Promise<{
  model: VideoModel;
  channel: VideoChannel;
  effectiveBaseUrl: string;
  effectiveApiKey: string;
} | null> {
  const model = await getVideoModel(modelId);
  if (!model) return null;

  const channel = await getVideoChannel(model.channelId);
  if (!channel) return null;

  return {
    model,
    channel,
    effectiveBaseUrl: model.baseUrl || channel.baseUrl,
    effectiveApiKey: model.apiKey || channel.apiKey,
  };
}
