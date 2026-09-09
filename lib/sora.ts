/* eslint-disable no-console */
import type { SoraGenerateRequest, GenerateResult } from '@/types';
import type { VideoGenerationRequest } from './sora-api';
import { logDebug, logInfo, logError } from './sora-logger';

function getTypeAndCost(
  model: string,
  pricing: { soraVideo10s: number; soraVideo15s: number; soraVideo25s: number }
): { type: 'sora-video'; cost: number } {
  if (model.includes('25s') || model.includes('25')) {
    return { type: 'sora-video', cost: pricing.soraVideo25s };
  }
  if (model.includes('15s') || model.includes('15')) {
    return { type: 'sora-video', cost: pricing.soraVideo15s };
  }
  return { type: 'sora-video', cost: pricing.soraVideo10s };
}

function parseLegacySoraModel(model: string): {
  apiModel: 'sora-2';
  orientation: 'landscape' | 'portrait';
  seconds: string;
  size?: string;
} {
  const normalizedModel = String(model || '').toLowerCase();
  const apiModel: 'sora-2' = 'sora-2';
  let orientation: 'landscape' | 'portrait' = 'landscape';
  let seconds = '8';

  if (normalizedModel.includes('portrait')) {
    orientation = 'portrait';
  }

  if (normalizedModel.includes('25s') || normalizedModel.includes('25')) {
    seconds = '20';
  } else if (normalizedModel.includes('15s') || normalizedModel.includes('15')) {
    seconds = '15';
  } else if (normalizedModel.includes('12s') || normalizedModel.includes('12')) {
    seconds = '12';
  } else if (normalizedModel.includes('10s') || normalizedModel.includes('10')) {
    seconds = '10';
  } else if (normalizedModel.includes('4s')) {
    seconds = '4';
  }

  const size = orientation === 'portrait' ? '720x1280' : '1280x720';
  return { apiModel, orientation, seconds, size };
}

async function generateViaSoraApi(
  request: SoraGenerateRequest,
  onProgress?: (progress: number) => void,
  channelId?: string
): Promise<GenerateResult> {
  const pricingPromise = import('./db/system-config-pricing').then((mod) => mod.getPricingConfig());
  const soraApiPromise = import('./sora-api');
  const { apiModel, orientation, seconds, size } = parseLegacySoraModel(request.model);

  const videoRequest: VideoGenerationRequest = {
    prompt: request.prompt,
    model: apiModel,
    orientation,
    seconds,
    size,
  };

  if (request.files && request.files.length > 0) {
    const imageFile = request.files.find((file) => file.mimeType.startsWith('image/'));
    if (imageFile) {
      videoRequest.input_image = imageFile.data;
    }
  }

  if (request.style_id) {
    videoRequest.style_id = request.style_id;
  }
  if (request.remix_target_id) {
    videoRequest.remix_target_id = request.remix_target_id;
  }

  const { generateVideo } = await soraApiPromise;
  const result = await generateVideo(
    videoRequest,
    onProgress ? (progress) => onProgress(progress) : undefined,
    channelId ? { channelId } : undefined
  );

  if (!result.data || result.data.length === 0 || !result.data[0].url) {
    throw new Error('视频生成失败：未返回有效的视频 URL');
  }

  const first = result.data[0];
  const pricing = await pricingPromise;
  const { type, cost } = getTypeAndCost(request.model, pricing);

  return {
    type,
    url: first.url,
    cost,
    videoId: result.id,
    videoChannelId: result.channelId,
    permalink: typeof first.permalink === 'string' ? first.permalink : undefined,
    revised_prompt: typeof first.revised_prompt === 'string' ? first.revised_prompt : undefined,
  };
}

async function generateByVideoModel(
  request: SoraGenerateRequest,
  onProgress?: (progress: number) => void
): Promise<GenerateResult | null> {
  if (!request.modelId) return null;

  const { getVideoModelWithChannel } = await import('./db/video-catalog-runtime');
  const modelConfig = await getVideoModelWithChannel(request.modelId);
  if (!modelConfig) {
    throw new Error('视频模型不存在或未配置');
  }

  const { model, channel } = modelConfig;

  if (!model.enabled) {
    throw new Error('视频模型已禁用');
  }
  if (!channel.enabled) {
    throw new Error('视频渠道已禁用');
  }

  const channelType = channel.type;
  if (channelType === 'flow2api' || channelType === 'grok2api' || channelType === 'openai-compatible') {
    const { generateViaExternalChat } = await import('./sora-external');
    return generateViaExternalChat(channel, model, request, onProgress);
  }

  if (channelType === 'sora' || channelType === 'apexerapi') {
    const ratio = request.aspectRatio || model.defaultAspectRatio || 'landscape';
    const duration = request.duration || model.defaultDuration || '8s';

    const fallbackRequest: SoraGenerateRequest = {
      ...request,
      model: `sora2-${ratio}-${duration}`,
    };
    return generateViaSoraApi(fallbackRequest, onProgress, channel.id);
  }

  throw new Error(`不支持的视频渠道类型: ${channelType}`);
}

export async function generateWithSora(
  request: SoraGenerateRequest,
  onProgress?: (progress: number) => void
): Promise<GenerateResult> {
  logDebug('[Sora] Request config:', {
    model: request.model,
    modelId: request.modelId,
    prompt: request.prompt?.substring(0, 50),
    hasFiles: request.files && request.files.length > 0,
    filesCount: request.files?.length || 0,
  });

  try {
    const routed = await generateByVideoModel(request, onProgress);
    if (routed) {
      logInfo('[Sora] Generation completed by dynamic channel:', {
        modelId: request.modelId,
        url: routed.url,
      });
      return routed;
    }

    const legacy = await generateViaSoraApi(request, onProgress);
    logInfo('[Sora] Generation completed by legacy sora route:', {
      url: legacy.url,
    });
    return legacy;
  } catch (error) {
    logError('[Sora] Generation failed:', error);
    throw error;
  }
}
