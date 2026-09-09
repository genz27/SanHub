import type {
  SafeVideoModel,
  VideoChannel,
  VideoChannelType,
} from '@/types';
import { getAdapter } from './connection';
import {
  parseVideoAspectRatios,
  parseVideoConfigObject,
  parseVideoDurations,
  parseVideoFeatures,
} from './video-catalog-parse';
import { ensureDatabase } from './ready';
import { buildSafeVideoModels } from '../video-model-normalizer';
import { CacheKeys, CacheTTL, withCache } from '../cache';

export {
  parseVideoAspectRatios,
  parseVideoConfigObject,
  parseVideoDurations,
  parseVideoFeatures,
} from './video-catalog-parse';

export async function getSafeVideoModels(enabledOnly = false): Promise<SafeVideoModel[]> {
  return withCache(
    `${CacheKeys.VIDEO_MODELS}${enabledOnly ? 'enabled' : 'all'}`,
    CacheTTL.VIDEO_MODELS,
    async () => {
      await ensureDatabase();
      const db = getAdapter();
      const where = enabledOnly
        ? 'WHERE m.enabled = 1 AND c.enabled = 1'
        : '';
      const [rows] = await db.execute(
        `SELECT
           m.id, m.channel_id, m.name, m.description, m.api_model, m.features,
           m.aspect_ratios, m.durations, m.highlight,
           c.type AS channel_type
           ${enabledOnly ? '' : ', m.enabled, m.default_aspect_ratio, m.default_duration, m.video_config_object, c.id AS channel_row_id, c.enabled AS channel_enabled'}
         FROM video_models m
         INNER JOIN video_channels c ON c.id = m.channel_id
         ${where}
         ORDER BY m.sort_order ASC, m.created_at ASC`
      );

      const channelById = new Map<string, VideoChannel>();
      const models = (rows as any[]).map((row) => {
        if (!channelById.has(row.channel_id)) {
          channelById.set(row.channel_id, {
            id: row.channel_row_id || row.channel_id,
            name: '',
            type: row.channel_type as VideoChannelType,
            baseUrl: '',
            apiKey: '',
            enabled: enabledOnly ? true : Boolean(row.channel_enabled),
            createdAt: 0,
            updatedAt: 0,
          });
        }
        return {
          id: row.id,
          channelId: row.channel_id,
          name: row.name,
          description: row.description || '',
          apiModel: row.api_model,
          features: parseVideoFeatures(row.features),
          aspectRatios: parseVideoAspectRatios(row.aspect_ratios),
          durations: parseVideoDurations(row.durations),
          defaultAspectRatio: row.default_aspect_ratio || 'landscape',
          defaultDuration: row.default_duration || '8s',
          videoConfigObject: enabledOnly ? undefined : parseVideoConfigObject(row.video_config_object),
          highlight: Boolean(row.highlight),
          enabled: enabledOnly ? true : Boolean(row.enabled),
          sortOrder: 0,
          createdAt: 0,
          updatedAt: 0,
        };
      });

      const built = buildSafeVideoModels(models, Array.from(channelById.values()), enabledOnly);
      if (!enabledOnly) {
        return built;
      }

      // Create-page catalog keeps description/highlight/channelId; apiModel is
      // only needed for Veo grouping above and is unused by the client picker.
      return built.map((model) => ({
        ...model,
        apiModel: undefined,
      }));
    }
  );
}

