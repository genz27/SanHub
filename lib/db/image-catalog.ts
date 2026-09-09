import type {
  ChannelType,
  SafeImageModel,
} from '@/types';
import { getAdapter } from './connection';
import {
  parseImageFeatures,
  parseImageResolutions,
  parseImageStringArray,
} from './image-catalog-parse';
import { ensureDatabase } from './ready';
import { CacheKeys, CacheTTL, withCache } from '../cache';

export {
  parseImageFeatures,
  parseImageResolutions,
  parseImageStringArray,
} from './image-catalog-parse';

export async function getSafeImageModels(enabledOnly = false): Promise<SafeImageModel[]> {
  return withCache(
    `${CacheKeys.IMAGE_MODELS}${enabledOnly ? 'enabled:public' : 'all:public'}`,
    CacheTTL.IMAGE_MODELS,
    async () => {
      await ensureDatabase();
      const db = getAdapter();
      const where = enabledOnly
        ? 'WHERE m.enabled = 1 AND c.enabled = 1'
        : '';
      const [rows] = await db.execute(
        `SELECT
           m.id, m.name, m.description, m.api_model,
           m.features, m.aspect_ratios, m.resolutions, m.image_sizes,
           m.default_aspect_ratio, m.default_image_size,
           m.requires_reference_image, m.allow_empty_prompt, m.highlight,
           c.type AS channel_type
           ${enabledOnly ? '' : ', m.channel_id, m.enabled'}
         FROM image_models m
         INNER JOIN image_channels c ON c.id = m.channel_id
         ${where}
         ORDER BY m.sort_order ASC, m.created_at ASC`
      );

      return (rows as any[]).map((row) => ({
        id: row.id,
        channelId: row.channel_id || '',
        channelType: row.channel_type as ChannelType,
        apiModel: row.api_model,
        name: row.name,
        description: row.description || '',
        features: parseImageFeatures(row.features),
        aspectRatios: parseImageStringArray(row.aspect_ratios),
        resolutions: parseImageResolutions(row.resolutions),
        imageSizes: row.image_sizes ? parseImageStringArray(row.image_sizes) : undefined,
        defaultAspectRatio: row.default_aspect_ratio || '1:1',
        defaultImageSize: row.default_image_size || undefined,
        requiresReferenceImage: Boolean(row.requires_reference_image),
        allowEmptyPrompt: Boolean(row.allow_empty_prompt),
        highlight: Boolean(row.highlight),
        enabled: enabledOnly ? true : Boolean(row.enabled),
      }));
    }
  );
}

