import type {
  ImageChannel,
  ImageModel,
  SafeImageChannel,
  SafeImageModel,
  ChannelType,
  ImageModelFeatures,
} from '@/types';
import { getAdapter } from './connection';
import { initializeDatabase, initializeImageChannelsTables } from './schema';
import { generateId } from '../utils';

// ========================================
// 图像渠道操作
// ========================================

// 获取所有图像渠道
export async function getImageChannels(enabledOnly = false): Promise<ImageChannel[]> {
  await initializeDatabase();
  await initializeImageChannelsTables();
  const db = getAdapter();

  const sql = enabledOnly
    ? 'SELECT * FROM image_channels WHERE enabled = 1 ORDER BY created_at ASC'
    : 'SELECT * FROM image_channels ORDER BY created_at ASC';

  const [rows] = await db.execute(sql);

  return (rows as any[]).map((row) => ({
    id: row.id,
    name: row.name,
    type: row.type as ChannelType,
    baseUrl: row.base_url || '',
    apiKey: row.api_key || '',
    enabled: Boolean(row.enabled),
    createdAt: Number(row.created_at),
    updatedAt: Number(row.updated_at),
  }));
}

// 获取单个图像渠道
export async function getImageChannel(id: string): Promise<ImageChannel | null> {
  await initializeDatabase();
  await initializeImageChannelsTables();
  const db = getAdapter();

  const [rows] = await db.execute('SELECT * FROM image_channels WHERE id = ?', [id]);
  const channels = rows as any[];
  if (channels.length === 0) return null;

  const row = channels[0];
  return {
    id: row.id,
    name: row.name,
    type: row.type as ChannelType,
    baseUrl: row.base_url || '',
    apiKey: row.api_key || '',
    enabled: Boolean(row.enabled),
    createdAt: Number(row.created_at),
    updatedAt: Number(row.updated_at),
  };
}

// 创建图像渠道
export async function createImageChannel(
  channel: Omit<ImageChannel, 'id' | 'createdAt' | 'updatedAt'>
): Promise<ImageChannel> {
  await initializeDatabase();
  await initializeImageChannelsTables();
  const db = getAdapter();

  const id = generateId();
  const now = Date.now();

  await db.execute(
    `INSERT INTO image_channels (id, name, type, base_url, api_key, enabled, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, channel.name, channel.type, channel.baseUrl, channel.apiKey, channel.enabled ? 1 : 0, now, now]
  );

  return { ...channel, id, createdAt: now, updatedAt: now };
}

// 更新图像渠道
export async function updateImageChannel(
  id: string,
  updates: Partial<Omit<ImageChannel, 'id' | 'createdAt' | 'updatedAt'>>
): Promise<ImageChannel | null> {
  await initializeDatabase();
  await initializeImageChannelsTables();
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

  return getImageChannel(id);
}

// 删除图像渠道
export async function deleteImageChannel(id: string): Promise<boolean> {
  await initializeDatabase();
  await initializeImageChannelsTables();
  const db = getAdapter();

  // 先删除该渠道下的所有模型
  await db.execute('DELETE FROM image_models WHERE channel_id = ?', [id]);

  const [result] = await db.execute('DELETE FROM image_channels WHERE id = ?', [id]);
  return (result as any).affectedRows > 0;
}

// 获取安全的渠道列表（不含敏感信息）
export async function getSafeImageChannels(enabledOnly = false): Promise<SafeImageChannel[]> {
  const channels = await getImageChannels(enabledOnly);
  return channels.map((c) => ({
    id: c.id,
    name: c.name,
    type: c.type,
    enabled: c.enabled,
  }));
}

// ========================================
// 图像模型操作
// ========================================

function parseFeatures(raw: unknown): ImageModelFeatures {
  const defaults: ImageModelFeatures = {
    textToImage: true,
    imageToImage: false,
    upscale: false,
    matting: false,
    multipleImages: false,
    imageSize: false,
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
    return { ...defaults, ...(raw as ImageModelFeatures) };
  }
  return defaults;
}

function parseStringArray(raw: unknown): string[] {
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

function parseResolutions(raw: unknown): Record<string, string | Record<string, string>> {
  if (!raw) return {};
  if (typeof raw === 'string') {
    try {
      return JSON.parse(raw);
    } catch {
      return {};
    }
  }
  if (typeof raw === 'object') return raw as Record<string, string | Record<string, string>>;
  return {};
}

// 获取所有图像模型
export async function getImageModels(enabledOnly = false): Promise<ImageModel[]> {
  await initializeDatabase();
  await initializeImageChannelsTables();
  const db = getAdapter();

  const sql = enabledOnly
    ? 'SELECT * FROM image_models WHERE enabled = 1 ORDER BY sort_order ASC, created_at ASC'
    : 'SELECT * FROM image_models ORDER BY sort_order ASC, created_at ASC';

  const [rows] = await db.execute(sql);

  return (rows as any[]).map((row) => ({
    id: row.id,
    channelId: row.channel_id,
    name: row.name,
    description: row.description || '',
    apiModel: row.api_model,
    baseUrl: row.base_url || undefined,
    apiKey: row.api_key || undefined,
    features: parseFeatures(row.features),
    aspectRatios: parseStringArray(row.aspect_ratios),
    resolutions: parseResolutions(row.resolutions),
    imageSizes: row.image_sizes ? parseStringArray(row.image_sizes) : undefined,
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
  }));
}

// 获取渠道下的模型
export async function getImageModelsByChannel(channelId: string, enabledOnly = false): Promise<ImageModel[]> {
  await initializeDatabase();
  await initializeImageChannelsTables();
  const db = getAdapter();

  const sql = enabledOnly
    ? 'SELECT * FROM image_models WHERE channel_id = ? AND enabled = 1 ORDER BY sort_order ASC, created_at ASC'
    : 'SELECT * FROM image_models WHERE channel_id = ? ORDER BY sort_order ASC, created_at ASC';

  const [rows] = await db.execute(sql, [channelId]);

  return (rows as any[]).map((row) => ({
    id: row.id,
    channelId: row.channel_id,
    name: row.name,
    description: row.description || '',
    apiModel: row.api_model,
    baseUrl: row.base_url || undefined,
    apiKey: row.api_key || undefined,
    features: parseFeatures(row.features),
    aspectRatios: parseStringArray(row.aspect_ratios),
    resolutions: parseResolutions(row.resolutions),
    imageSizes: row.image_sizes ? parseStringArray(row.image_sizes) : undefined,
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
  }));
}

// 获取单个图像模型
export async function getImageModel(id: string): Promise<ImageModel | null> {
  await initializeDatabase();
  await initializeImageChannelsTables();
  const db = getAdapter();

  const [rows] = await db.execute('SELECT * FROM image_models WHERE id = ?', [id]);
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
    features: parseFeatures(row.features),
    aspectRatios: parseStringArray(row.aspect_ratios),
    resolutions: parseResolutions(row.resolutions),
    imageSizes: row.image_sizes ? parseStringArray(row.image_sizes) : undefined,
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

// 创建图像模型
export async function createImageModel(
  model: Omit<ImageModel, 'id' | 'createdAt' | 'updatedAt'>
): Promise<ImageModel> {
  await initializeDatabase();
  await initializeImageChannelsTables();
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

  return { ...model, id, createdAt: now, updatedAt: now };
}

// 更新图像模型
export async function updateImageModel(
  id: string,
  updates: Partial<Omit<ImageModel, 'id' | 'createdAt' | 'updatedAt'>>
): Promise<ImageModel | null> {
  await initializeDatabase();
  await initializeImageChannelsTables();
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

  return getImageModel(id);
}

// 删除图像模型
export async function deleteImageModel(id: string): Promise<boolean> {
  await initializeDatabase();
  await initializeImageChannelsTables();
  const db = getAdapter();

  const [result] = await db.execute('DELETE FROM image_models WHERE id = ?', [id]);
  return (result as any).affectedRows > 0;
}

// 获取安全的模型列表（不含敏感信息，带渠道类型）
export async function getSafeImageModels(enabledOnly = false): Promise<SafeImageModel[]> {
  const models = await getImageModels(enabledOnly);
  const channels = await getImageChannels();
  const channelMap = new Map(channels.map((c) => [c.id, c]));

  return models
    .filter((m) => {
      const channel = channelMap.get(m.channelId);
      return channel && (!enabledOnly || channel.enabled);
    })
    .map((m) => {
      const channel = channelMap.get(m.channelId)!;
      return {
        id: m.id,
        channelId: m.channelId,
        channelType: channel.type,
        apiModel: m.apiModel,
        name: m.name,
        description: m.description,
        features: m.features,
        aspectRatios: m.aspectRatios,
        resolutions: m.resolutions,
        imageSizes: m.imageSizes,
        defaultAspectRatio: m.defaultAspectRatio,
        defaultImageSize: m.defaultImageSize,
        requiresReferenceImage: m.requiresReferenceImage,
        allowEmptyPrompt: m.allowEmptyPrompt,
        highlight: m.highlight,
        enabled: m.enabled,
        costPerGeneration: m.costPerGeneration,
      };
    });
}

// 获取模型的完整配置（包含渠道信息，用于生成时）
export async function getImageModelWithChannel(modelId: string): Promise<{
  model: ImageModel;
  channel: ImageChannel;
  effectiveBaseUrl: string;
  effectiveApiKey: string;
} | null> {
  const model = await getImageModel(modelId);
  if (!model) return null;

  const channel = await getImageChannel(model.channelId);
  if (!channel) return null;

  return {
    model,
    channel,
    effectiveBaseUrl: model.baseUrl || channel.baseUrl,
    effectiveApiKey: model.apiKey || channel.apiKey,
  };
}

// 检查是否有任何图像渠道/模型配置
export async function hasImageChannelsConfigured(): Promise<boolean> {
  await initializeDatabase();
  await initializeImageChannelsTables();
  const db = getAdapter();

  const [rows] = await db.execute('SELECT COUNT(1) as count FROM image_channels');
  const count = Number((rows as any[])[0]?.count || 0);
  return count > 0;
}
