import type { VideoChannel, VideoChannelType, VideoModel } from '@/types';
import { getAdapter } from './connection';
import {
  parseVideoConfigObject,
  parseVideoDurations,
  parseVideoFeatures,
} from './video-catalog-parse';
import { ensureDatabase } from './ready';
import { CacheKeys, CacheTTL, withCache } from '../cache';

export async function getVideoModelWithChannel(modelId: string): Promise<{
  model: VideoModel;
  channel: VideoChannel;
  effectiveBaseUrl: string;
  effectiveApiKey: string;
} | null> {
  return withCache(`${CacheKeys.VIDEO_MODELS}full:${modelId}`, CacheTTL.VIDEO_MODELS, async () => {
    await ensureDatabase();
    const db = getAdapter();

    const [rows] = await db.execute(
      `SELECT
         m.id, m.channel_id, m.api_model,
         m.base_url AS model_base_url, m.api_key AS model_api_key,
         m.durations, m.video_config_object,
         m.default_aspect_ratio, m.default_duration, m.enabled,
         c.id AS channel_row_id, c.type AS channel_type,
         c.base_url AS channel_base_url, c.api_key AS channel_api_key,
         c.enabled AS channel_enabled
       FROM video_models m
       INNER JOIN video_channels c ON c.id = m.channel_id
       WHERE m.id = ?`,
      [modelId]
    );
    const row = (rows as any[])[0];
    if (!row) return null;

    const model: VideoModel = {
      id: row.id,
      channelId: row.channel_id,
      name: '',
      description: '',
      apiModel: row.api_model,
      baseUrl: row.model_base_url || undefined,
      apiKey: row.model_api_key || undefined,
      features: parseVideoFeatures(null),
      aspectRatios: [],
      durations: parseVideoDurations(row.durations),
      defaultAspectRatio: row.default_aspect_ratio || 'landscape',
      defaultDuration: row.default_duration || '8s',
      videoConfigObject: parseVideoConfigObject(row.video_config_object),
      highlight: false,
      enabled: Boolean(row.enabled),
      sortOrder: 0,
      createdAt: 0,
      updatedAt: 0,
    };
    const channel: VideoChannel = {
      id: row.channel_row_id,
      name: '',
      type: row.channel_type as VideoChannelType,
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
