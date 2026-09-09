import type {
  ImageChannel,
  ImageModel,
  ChannelType,
} from '@/types';
import { getAdapter } from './connection';
import { ensureDatabase } from './ready';
import { generateId } from '../utils';
import {
  CacheKeys,
  CacheTTL,
  invalidateImageCatalogCache,
  withCache,
} from '../cache';
import {
  parseImageFeatures,
  parseImageResolutions,
  parseImageStringArray,
} from './image-catalog-parse';

// ========================================
// 图像渠道操作
// ========================================

// 获取所有图像渠道
const IMAGE_CHANNEL_COLUMNS =
  'id, name, type, base_url, api_key, enabled, created_at, updated_at';
const IMAGE_CHANNEL_AUTH_COLUMNS = 'id, type, base_url, api_key, enabled';

function mapImageChannelRow(row: any): ImageChannel {
  return {
    id: row.id,
    name: row.name || '',
    type: row.type as ChannelType,
    baseUrl: row.base_url || '',
    apiKey: row.api_key || '',
    enabled: Boolean(row.enabled),
    createdAt: Number(row.created_at),
    updatedAt: Number(row.updated_at),
  };
}

export async function getImageChannels(enabledOnly = false): Promise<ImageChannel[]> {
  return withCache(
    `${CacheKeys.IMAGE_CHANNELS}full:${enabledOnly ? 'enabled' : 'all'}`,
    CacheTTL.IMAGE_MODELS,
    async () => {
      await ensureDatabase();
      const db = getAdapter();
      const sql = enabledOnly
        ? `SELECT ${IMAGE_CHANNEL_AUTH_COLUMNS} FROM image_channels WHERE enabled = 1 ORDER BY created_at ASC`
        : `SELECT ${IMAGE_CHANNEL_COLUMNS} FROM image_channels ORDER BY created_at ASC`;
      const [rows] = await db.execute(sql);
      return (rows as any[]).map(mapImageChannelRow);
    }
  );
}

// 获取单个图像渠道
export async function getImageChannel(id: string): Promise<ImageChannel | null> {
  return withCache(`${CacheKeys.IMAGE_CHANNELS}id:${id}`, CacheTTL.IMAGE_MODELS, async () => {
    await ensureDatabase();
    const db = getAdapter();

    const [rows] = await db.execute(
      `SELECT ${IMAGE_CHANNEL_AUTH_COLUMNS} FROM image_channels WHERE id = ?`,
      [id]
    );
    const channels = rows as any[];
    if (channels.length === 0) return null;
    return mapImageChannelRow(channels[0]);
  });
}

// 创建图像渠道
export async function createImageChannel(
  channel: Omit<ImageChannel, 'id' | 'createdAt' | 'updatedAt'>
): Promise<ImageChannel> {
  await ensureDatabase();
  const db = getAdapter();

  const id = generateId();
  const now = Date.now();

  await db.execute(
    `INSERT INTO image_channels (id, name, type, base_url, api_key, enabled, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, channel.name, channel.type, channel.baseUrl, channel.apiKey, channel.enabled ? 1 : 0, now, now]
  );

  invalidateImageCatalogCache();
  return { ...channel, id, createdAt: now, updatedAt: now };
}

// 更新图像渠道
export async function updateImageChannel(
  id: string,
  updates: Partial<Omit<ImageChannel, 'id' | 'createdAt' | 'updatedAt'>>
): Promise<ImageChannel | null> {
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
  await db.execute(`UPDATE image_channels SET ${fields.join(', ')} WHERE id = ?`, values);

  invalidateImageCatalogCache();
  const [rows] = await db.execute(
    `SELECT ${IMAGE_CHANNEL_COLUMNS} FROM image_channels WHERE id = ?`,
    [id]
  );
  const channels = rows as any[];
  return channels.length > 0 ? mapImageChannelRow(channels[0]) : null;
}

// 删除图像渠道
export async function deleteImageChannel(id: string): Promise<boolean> {
  await ensureDatabase();
  const db = getAdapter();

  // 先删除该渠道下的所有模型
  await db.execute('DELETE FROM image_models WHERE channel_id = ?', [id]);

  const [result] = await db.execute('DELETE FROM image_channels WHERE id = ?', [id]);
  invalidateImageCatalogCache();
  return (result as any).affectedRows > 0;
}

const IMAGE_MODEL_COLUMNS = `
  id, channel_id, name, description, api_model, base_url, api_key,
  features, aspect_ratios, resolutions, image_sizes,
  default_aspect_ratio, default_image_size,
  requires_reference_image, allow_empty_prompt, highlight,
  enabled, cost_per_generation, sort_order, created_at, updated_at
`;

function mapImageModelRow(row: any): ImageModel {
  return {
    id: row.id,
    channelId: row.channel_id,
    name: row.name,
    description: row.description || '',
    apiModel: row.api_model,
    baseUrl: row.base_url || undefined,
    apiKey: row.api_key || undefined,
    features: parseImageFeatures(row.features),
    aspectRatios: parseImageStringArray(row.aspect_ratios),
    resolutions: parseImageResolutions(row.resolutions),
    imageSizes: row.image_sizes ? parseImageStringArray(row.image_sizes) : undefined,
    defaultAspectRatio: row.default_aspect_ratio || '1:1',
    defaultImageSize: row.default_image_size || undefined,
    requiresReferenceImage: Boolean(row.requires_reference_image),
    allowEmptyPrompt: Boolean(row.allow_empty_prompt),
    highlight: Boolean(row.highlight),
    enabled: Boolean(row.enabled),
    costPerGeneration: row.cost_per_generation || 10,
    sortOrder: row.sort_order || 0,
    createdAt: Number(row.created_at),
    updatedAt: Number(row.updated_at),
  };
}

// 获取所有图像模型
export async function getImageModels(enabledOnly = false): Promise<ImageModel[]> {
  return withCache(
    `${CacheKeys.IMAGE_MODELS}list:${enabledOnly ? 'enabled' : 'all'}`,
    CacheTTL.IMAGE_MODELS,
    async () => {
      await ensureDatabase();
      const db = getAdapter();
      const sql = enabledOnly
        ? `SELECT ${IMAGE_MODEL_COLUMNS} FROM image_models WHERE enabled = 1 ORDER BY sort_order ASC, created_at ASC`
        : `SELECT ${IMAGE_MODEL_COLUMNS} FROM image_models ORDER BY sort_order ASC, created_at ASC`;
      const [rows] = await db.execute(sql);
      return (rows as any[]).map(mapImageModelRow);
    }
  );
}

// 获取渠道下的模型
export async function getImageModelsByChannel(channelId: string, enabledOnly = false): Promise<ImageModel[]> {
  return withCache(
    `${CacheKeys.IMAGE_MODELS}channel:${channelId}:${enabledOnly ? 'enabled' : 'all'}`,
    CacheTTL.IMAGE_MODELS,
    async () => {
      await ensureDatabase();
      const db = getAdapter();
      const sql = enabledOnly
        ? `SELECT ${IMAGE_MODEL_COLUMNS} FROM image_models WHERE channel_id = ? AND enabled = 1 ORDER BY sort_order ASC, created_at ASC`
        : `SELECT ${IMAGE_MODEL_COLUMNS} FROM image_models WHERE channel_id = ? ORDER BY sort_order ASC, created_at ASC`;
      const [rows] = await db.execute(sql, [channelId]);
      return (rows as any[]).map(mapImageModelRow);
    }
  );
}

// 获取单个图像模型
export async function getImageModel(id: string): Promise<ImageModel | null> {
  return withCache(`${CacheKeys.IMAGE_MODELS}model:${id}`, CacheTTL.IMAGE_MODELS, async () => {
    await ensureDatabase();
    const db = getAdapter();

    const [rows] = await db.execute(
      `SELECT ${IMAGE_MODEL_COLUMNS} FROM image_models WHERE id = ?`,
      [id]
    );
    const models = rows as any[];
    if (models.length === 0) return null;
    return mapImageModelRow(models[0]);
  });
}

// 创建图像模型
export async function createImageModel(
  model: Omit<ImageModel, 'id' | 'createdAt' | 'updatedAt'>
): Promise<ImageModel> {
  await ensureDatabase();
  const db = getAdapter();

  const id = generateId();
  const now = Date.now();

  await db.execute(
    `INSERT INTO image_models (
      id, channel_id, name, description, api_model, base_url, api_key,
      features, aspect_ratios, resolutions, image_sizes,
      default_aspect_ratio, default_image_size,
      requires_reference_image, allow_empty_prompt, highlight,
      enabled, cost_per_generation, sort_order, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
      JSON.stringify(model.resolutions),
      model.imageSizes ? JSON.stringify(model.imageSizes) : null,
      model.defaultAspectRatio,
      model.defaultImageSize || null,
      model.requiresReferenceImage ? 1 : 0,
      model.allowEmptyPrompt ? 1 : 0,
      model.highlight ? 1 : 0,
      model.enabled ? 1 : 0,
      model.costPerGeneration,
      model.sortOrder,
      now,
      now,
    ]
  );

  invalidateImageCatalogCache();
  return { ...model, id, createdAt: now, updatedAt: now };
}

// 更新图像模型
export async function updateImageModel(
  id: string,
  updates: Partial<Omit<ImageModel, 'id' | 'createdAt' | 'updatedAt'>>
): Promise<ImageModel | null> {
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
  if (updates.resolutions !== undefined) { fields.push('resolutions = ?'); values.push(JSON.stringify(updates.resolutions)); }
  if (updates.imageSizes !== undefined) { fields.push('image_sizes = ?'); values.push(updates.imageSizes ? JSON.stringify(updates.imageSizes) : null); }
  if (updates.defaultAspectRatio !== undefined) { fields.push('default_aspect_ratio = ?'); values.push(updates.defaultAspectRatio); }
  if (updates.defaultImageSize !== undefined) { fields.push('default_image_size = ?'); values.push(updates.defaultImageSize); }
  if (updates.requiresReferenceImage !== undefined) { fields.push('requires_reference_image = ?'); values.push(updates.requiresReferenceImage ? 1 : 0); }
  if (updates.allowEmptyPrompt !== undefined) { fields.push('allow_empty_prompt = ?'); values.push(updates.allowEmptyPrompt ? 1 : 0); }
  if (updates.highlight !== undefined) { fields.push('highlight = ?'); values.push(updates.highlight ? 1 : 0); }
  if (updates.enabled !== undefined) { fields.push('enabled = ?'); values.push(updates.enabled ? 1 : 0); }
  if (updates.costPerGeneration !== undefined) { fields.push('cost_per_generation = ?'); values.push(updates.costPerGeneration); }
  if (updates.sortOrder !== undefined) { fields.push('sort_order = ?'); values.push(updates.sortOrder); }

  values.push(id);
  await db.execute(`UPDATE image_models SET ${fields.join(', ')} WHERE id = ?`, values);

  invalidateImageCatalogCache();
  return getImageModel(id);
}

// 删除图像模型
export async function deleteImageModel(id: string): Promise<boolean> {
  await ensureDatabase();
  const db = getAdapter();

  const [result] = await db.execute('DELETE FROM image_models WHERE id = ?', [id]);
  invalidateImageCatalogCache();
  return (result as any).affectedRows > 0;
}

// 检查是否有任何图像渠道/模型配置
export async function hasImageChannelsConfigured(): Promise<boolean> {
  await ensureDatabase();
  const db = getAdapter();

  const [rows] = await db.execute('SELECT COUNT(1) as count FROM image_channels');
  const count = Number((rows as any[])[0]?.count || 0);
  return count > 0;
}
