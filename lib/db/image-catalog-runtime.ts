import type { ChannelType, ImageChannel, ImageModel } from '@/types';
import { getAdapter } from './connection';
import { parseImageFeatures, parseImageResolutions } from './image-catalog-parse';
import { ensureDatabase } from './ready';
import { CacheKeys, CacheTTL, withCache } from '../cache';

export async function getImageModelWithChannel(modelId: string): Promise<{
  model: ImageModel;
  channel: ImageChannel;
  effectiveBaseUrl: string;
  effectiveApiKey: string;
} | null> {
  return withCache(`${CacheKeys.IMAGE_MODELS}full:${modelId}`, CacheTTL.IMAGE_MODELS, async () => {
    await ensureDatabase();
    const db = getAdapter();

    const [rows] = await db.execute(
      `SELECT
         m.id, m.channel_id, m.name, m.api_model,
         m.base_url AS model_base_url, m.api_key AS model_api_key,
         m.resolutions, m.requires_reference_image, m.allow_empty_prompt,
         m.enabled, m.cost_per_generation,
         c.id AS channel_row_id, c.type AS channel_type,
         c.base_url AS channel_base_url, c.api_key AS channel_api_key,
         c.enabled AS channel_enabled
       FROM image_models m
       INNER JOIN image_channels c ON c.id = m.channel_id
       WHERE m.id = ?`,
      [modelId]
    );
    const row = (rows as any[])[0];
    if (!row) return null;

    const model: ImageModel = {
      id: row.id,
      channelId: row.channel_id,
      name: row.name || '',
      description: '',
      apiModel: row.api_model,
      baseUrl: row.model_base_url || undefined,
      apiKey: row.model_api_key || undefined,
      features: parseImageFeatures(null),
      aspectRatios: [],
      resolutions: parseImageResolutions(row.resolutions),
      defaultAspectRatio: '1:1',
      requiresReferenceImage: Boolean(row.requires_reference_image),
      allowEmptyPrompt: Boolean(row.allow_empty_prompt),
      highlight: false,
      enabled: Boolean(row.enabled),
      costPerGeneration: row.cost_per_generation || 10,
      sortOrder: 0,
      createdAt: 0,
      updatedAt: 0,
    };
    const channel: ImageChannel = {
      id: row.channel_row_id,
      name: '',
      type: row.channel_type as ChannelType,
      baseUrl: row.channel_base_url || '',
      apiKey: row.channel_api_key || '',
      enabled: Boolean(row.channel_enabled),
      createdAt: 0,
      updatedAt: 0,
    };

    return {
      model,
      channel,
      effectiveBaseUrl: model.baseUrl || channel.baseUrl,
      effectiveApiKey: model.apiKey || channel.apiKey,
    };
  });
}
