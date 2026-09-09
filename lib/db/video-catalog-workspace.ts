import type { SafeVideoModel, VideoChannel, VideoChannelType } from '@/types';
import { getAdapter } from './connection';
import {
  parseVideoAspectRatios,
  parseVideoDurations,
  parseVideoFeatures,
} from './video-catalog-parse';
import { ensureDatabase } from './ready';
import { buildSafeVideoModels } from '../video-model-normalizer';
import { CacheKeys, CacheTTL, withCache } from '../cache';

export async function getSafeVideoModelsWorkspace(): Promise<SafeVideoModel[]> {
  return withCache(
    `${CacheKeys.VIDEO_MODELS}enabled:workspace`,
    CacheTTL.VIDEO_MODELS,
    async () => {
      await ensureDatabase();
      const db = getAdapter();
      const [rows] = await db.execute(
        `SELECT
           m.id, m.channel_id, m.name, m.api_model, m.features,
           m.aspect_ratios, m.durations,
           c.type AS channel_type
         FROM video_models m
         INNER JOIN video_channels c ON c.id = m.channel_id
         WHERE m.enabled = 1 AND c.enabled = 1
         ORDER BY m.sort_order ASC, m.created_at ASC`
      );

      const channelById = new Map<string, VideoChannel>();
      const models = (rows as any[]).map((row) => {
        if (!channelById.has(row.channel_id)) {
          channelById.set(row.channel_id, {
            id: row.channel_id,
            name: '',
            type: row.channel_type as VideoChannelType,
            baseUrl: '',
            apiKey: '',
            enabled: true,
            createdAt: 0,
            updatedAt: 0,
          });
        }
        return {
          id: row.id,
          channelId: row.channel_id,
          name: row.name,
          description: '',
          apiModel: row.api_model,
          features: parseVideoFeatures(row.features),
          aspectRatios: parseVideoAspectRatios(row.aspect_ratios),
          durations: parseVideoDurations(row.durations),
          defaultAspectRatio: 'landscape',
          defaultDuration: '8s',
          videoConfigObject: undefined,
          highlight: false,
          enabled: true,
          sortOrder: 0,
          createdAt: 0,
          updatedAt: 0,
        };
      });

      return buildSafeVideoModels(models, Array.from(channelById.values()), true).map((model) => ({
        ...model,
        description: '',
        highlight: false,
        apiModel: undefined,
      }));
    }
  );
}
