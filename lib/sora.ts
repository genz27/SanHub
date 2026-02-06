/* eslint-disable no-console */
import { fetch as undiciFetch } from 'undici';
import { getSystemConfig, getVideoModelWithChannel } from './db';
import type { SoraGenerateRequest, GenerateResult, VideoChannel, VideoModel } from '@/types';
import { generateVideo, type VideoGenerationRequest } from './sora-api';
import { fetchWithRetry } from './http-retry';

type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'silent';

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
  silent: 50,
};

const SORA_LOG_LEVEL: LogLevel = (() => {
  const raw = (process.env.SORA_LOG_LEVEL || '').toLowerCase();
  if (raw in LOG_LEVELS) return raw as LogLevel;
  return process.env.NODE_ENV === 'production' ? 'info' : 'debug';
})();

const shouldLog = (level: LogLevel) => LOG_LEVELS[level] >= LOG_LEVELS[SORA_LOG_LEVEL];

const logDebug = (...args: unknown[]) => {
  if (shouldLog('debug')) console.log(...args);
};
const logInfo = (...args: unknown[]) => {
  if (shouldLog('info')) console.log(...args);
};
const logWarn = (...args: unknown[]) => {
  if (shouldLog('warn')) console.warn(...args);
};
const logError = (...args: unknown[]) => {
  if (shouldLog('error')) console.error(...args);
};

type ExternalVideoPayload = {
  prompt: string;
  model: string;
  files: { mimeType: string; data: string }[];
};

type ExternalChatChoice = {
  message?: {
    content?: string;
  };
};

type ExternalChatResponse = {
  choices?: ExternalChatChoice[];
};

function buildMediaJson(type: 'video' | 'image', url: string): string {
  return JSON.stringify({ type, url });
}

function parseMediaJsonFromContent(content: string): { type: 'video' | 'image'; url: string } | null {
  try {
    const parsed = JSON.parse(content);
    if (!parsed || typeof parsed !== 'object') return null;
    if ((parsed.type === 'video' || parsed.type === 'image') && typeof parsed.url === 'string' && parsed.url.trim()) {
      return { type: parsed.type, url: parsed.url.trim() };
    }
    return null;
  } catch {
    return null;
  }
}

function extractVideoUrlFromText(content: string): string | null {
  const trimmed = content.trim();
  if (!trimmed) return null;

  const mediaJson = parseMediaJsonFromContent(trimmed);
  if (mediaJson?.type === 'video' && mediaJson.url) {
    return mediaJson.url;
  }

  const htmlVideoMatch = trimmed.match(/<video[^>]*\s(?:src|poster)=['"]([^'"]+)['"]/i);
  if (htmlVideoMatch?.[1]) {
    const candidate = htmlVideoMatch[1].trim();
    if (candidate) return candidate;
  }

  const htmlSourceMatch = trimmed.match(/<source[^>]*\ssrc=['"]([^'"]+)['"]/i);
  if (htmlSourceMatch?.[1]) {
    const candidate = htmlSourceMatch[1].trim();
    if (candidate) return candidate;
  }

  const markdownVideoMatch = trimmed.match(/!\[[^\]]*]\((https?:\/\/[^)]+)\)/i);
  if (markdownVideoMatch?.[1]) {
    const candidate = markdownVideoMatch[1].trim();
    if (candidate) return candidate;
  }

  const urlMatch = trimmed.match(/https?:\/\/[^\s"'<>`]+/i);
  if (!urlMatch?.[0]) return null;

  const candidate = urlMatch[0].trim();
  const lower = candidate.toLowerCase();
  if (/(\.mp4|\.mov|\.webm|\.mkv)(\?|#|$)/.test(lower)) return candidate;
  if (lower.includes('/video/')) return candidate;
  if (lower.includes('video')) return candidate;
  return candidate;
}

function normalizeAspectRatioLabel(aspectRatio: string): string {
  switch ((aspectRatio || '').toLowerCase()) {
    case 'landscape':
      return '16:9';
    case 'portrait':
      return '9:16';
    case 'square':
      return '1:1';
    default:
      return aspectRatio || '16:9';
  }
}

function normalizeDurationSeconds(duration?: string): number {
  if (!duration) return 10;
  const matched = duration.match(/(\d+)/);
  if (!matched) return 10;
  const parsed = Number.parseInt(matched[1], 10);
  if (Number.isNaN(parsed) || parsed <= 0) return 10;
  return parsed;
}

function mapFlowModel(modelName: string, aspectRatio: string, duration: string): string {
  const ratio = (aspectRatio || '').toLowerCase();
  const seconds = normalizeDurationSeconds(duration);

  const isI2V = modelName.toLowerCase().includes('i2v') || modelName.toLowerCase().includes('image');
  const isR2V = modelName.toLowerCase().includes('r2v') || modelName.toLowerCase().includes('reference');

  if (isR2V) {
    return ratio === 'portrait' ? 'veo_3_0_r2v_fast_portrait' : 'veo_3_0_r2v_fast_landscape';
  }

  if (isI2V) {
    if (seconds >= 15) {
      return ratio === 'portrait'
        ? 'veo_2_1_fast_d_15_i2v_portrait'
        : 'veo_2_1_fast_d_15_i2v_landscape';
    }
    return ratio === 'portrait'
      ? 'veo_3_1_i2v_s_fast_fl_portrait'
      : 'veo_3_1_i2v_s_fast_fl_landscape';
  }

  if (seconds >= 15) {
    return ratio === 'portrait'
      ? 'veo_2_1_fast_d_15_t2v_portrait'
      : 'veo_2_1_fast_d_15_t2v_landscape';
  }

  return ratio === 'portrait' ? 'veo_3_1_t2v_fast_portrait' : 'veo_3_1_t2v_fast_landscape';
}

function mapGrokModel(modelName: string, aspectRatio: string, duration: string): string {
  const ratio = (aspectRatio || '').toLowerCase();
  const seconds = normalizeDurationSeconds(duration);
  const base = 'grok-imagine-1.0-video';
  const orientation = ratio === 'portrait' ? 'portrait' : 'landscape';
  const finalSeconds = seconds >= 15 ? '15s' : '10s';

  if (modelName.toLowerCase().includes('grok-imagine-1.0-video-')) {
    return modelName;
  }
  return `${base}-${orientation}-${finalSeconds}`;
}

function mapChannelModel(channelType: VideoChannel['type'], model: VideoModel, request: SoraGenerateRequest): string {
  const ratio = request.aspectRatio || model.defaultAspectRatio || 'landscape';
  const duration = request.duration || model.defaultDuration || '10s';

  if (channelType === 'flow2api') {
    return mapFlowModel(model.apiModel, ratio, duration);
  }
  if (channelType === 'grok2api') {
    return mapGrokModel(model.apiModel, ratio, duration);
  }
  return model.apiModel || request.model;
}

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
  apiModel: 'sora-2' | 'sora-2-pro';
  orientation: 'landscape' | 'portrait';
  seconds: '10' | '15' | '25';
  size?: string;
} {
  let apiModel: 'sora-2' | 'sora-2-pro' = 'sora-2';
  let orientation: 'landscape' | 'portrait' = 'landscape';
  let seconds: '10' | '15' | '25' = '10';

  if (model.includes('pro')) {
    apiModel = 'sora-2-pro';
  }

  if (model.includes('portrait')) {
    orientation = 'portrait';
  }

  if (model.includes('25s') || model.includes('25')) {
    seconds = '25';
  } else if (model.includes('15s') || model.includes('15')) {
    seconds = '15';
  }

  const size = orientation === 'portrait' ? '720x1280' : '1280x720';
  return { apiModel, orientation, seconds, size };
}

function buildVideoMessages(request: ExternalVideoPayload): Array<{
  role: 'user';
  content: Array<{ type: 'text'; text: string } | { type: 'image_url'; image_url: { url: string } }>;
}> {
  const content: Array<{ type: 'text'; text: string } | { type: 'image_url'; image_url: { url: string } }> = [
    {
      type: 'text',
      text: request.prompt || 'Generate a video',
    },
  ];

  for (const file of request.files) {
    if (!file.mimeType.startsWith('image/')) continue;
    content.push({
      type: 'image_url',
      image_url: {
        url: `data:${file.mimeType};base64,${file.data}`,
      },
    });
  }

  return [{ role: 'user', content }];
}

async function generateViaExternalChat(
  channel: VideoChannel,
  model: VideoModel,
  request: SoraGenerateRequest,
  onProgress?: (progress: number) => void
): Promise<GenerateResult> {
  const effectiveBaseUrl = model.baseUrl || channel.baseUrl;
  const effectiveApiKey = model.apiKey || channel.apiKey;

  if (!effectiveBaseUrl || !effectiveApiKey) {
    throw new Error('视频渠道未配置 Base URL 或 API Key');
  }

  const resolvedModel = mapChannelModel(channel.type, model, request);
  const files = request.files || [];
  const prompt = request.prompt || '';

  const payload: Record<string, unknown> = {
    model: resolvedModel,
    messages: buildVideoMessages({ prompt, model: resolvedModel, files }),
    stream: false,
  };

  if (channel.type === 'grok2api') {
    payload.video_config = {
      aspect_ratio: normalizeAspectRatioLabel(request.aspectRatio || model.defaultAspectRatio || 'landscape'),
      video_length: normalizeDurationSeconds(request.duration || model.defaultDuration || '10s'),
      resolution_name: '720p',
      preset: 'normal',
    };
  }

  const apiUrl = `${effectiveBaseUrl.replace(/\/$/, '')}/v1/chat/completions`;
  onProgress?.(5);

  logInfo('[Video Adapter] External chat request:', {
    channelType: channel.type,
    channelName: channel.name,
    apiUrl,
    model: resolvedModel,
    hasImages: files.some((file) => file.mimeType.startsWith('image/')),
  });

  const response = await fetchWithRetry(undiciFetch, apiUrl, () => ({
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${effectiveApiKey}`,
    },
    body: JSON.stringify(payload),
  }));

  const data = (await response.json().catch(() => null)) as ExternalChatResponse | null;
  if (!response.ok) {
    const detail = data ? JSON.stringify(data).slice(0, 400) : '';
    throw new Error(`上游返回错误 (${response.status})${detail ? `: ${detail}` : ''}`);
  }

  const content = data?.choices?.[0]?.message?.content;
  if (!content || typeof content !== 'string') {
    throw new Error('上游返回缺少有效内容');
  }

  const rawUrl = extractVideoUrlFromText(content);
  if (!rawUrl) {
    logDebug('[Video Adapter] Unrecognized upstream content:', content.slice(0, 500));
    throw new Error('无法从上游响应中解析视频链接');
  }

  onProgress?.(100);

  const { type, cost } = getTypeAndCost(request.model, (await getSystemConfig()).pricing);
  return {
    type,
    url: rawUrl,
    cost,
    videoChannelId: channel.id,
  };
}

async function generateViaSoraApi(
  request: SoraGenerateRequest,
  onProgress?: (progress: number) => void
): Promise<GenerateResult> {
  const config = await getSystemConfig();
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

  const result = await generateVideo(
    videoRequest,
    onProgress ? (progress) => onProgress(progress) : undefined
  );

  if (!result.data || result.data.length === 0 || !result.data[0].url) {
    throw new Error('视频生成失败：未返回有效的视频 URL');
  }

  const first = result.data[0];
  const { type, cost } = getTypeAndCost(request.model, config.pricing);

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
    return generateViaExternalChat(channel, model, request, onProgress);
  }

  if (channelType === 'sora') {
    const ratio = request.aspectRatio || model.defaultAspectRatio || 'landscape';
    const duration = request.duration || model.defaultDuration || '10s';

    const fallbackRequest: SoraGenerateRequest = {
      ...request,
      model: `sora2-${ratio}-${duration}`,
    };
    return generateViaSoraApi(fallbackRequest, onProgress);
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

