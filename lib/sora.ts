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
    content?: unknown;
  };
  delta?: {
    content?: unknown;
    reasoning_content?: unknown;
  };
};

type ExternalChatResponse = {
  choices?: ExternalChatChoice[];
  error?: {
    message?: string;
    detail?: string;
  } | string;
  detail?: string;
};

const VIDEO_URL_PATTERN = /\.(mp4|mov|webm|mkv|m3u8)(\?|#|$)/i;
const IMAGE_URL_PATTERN = /\.(jpg|jpeg|png|webp|gif|bmp|svg)(\?|#|$)/i;

function normalizeExtractedUrl(raw: string, baseUrl?: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  const cleaned = trimmed.replace(/^['"(<\[]+|[>'")\],.]+$/g, '');
  if (!cleaned) return null;
  if (/^https?:\/\//i.test(cleaned)) return cleaned;

  if (baseUrl) {
    const canResolveRelative =
      cleaned.startsWith('/') ||
      cleaned.startsWith('./') ||
      cleaned.startsWith('../') ||
      cleaned.startsWith('cache/') ||
      cleaned.startsWith('tmp/');
    if (canResolveRelative) {
      try {
        return new URL(cleaned, baseUrl).toString();
      } catch {
        return null;
      }
    }
  }

  return null;
}

function collectCapturedUrls(input: string, pattern: RegExp, baseUrl?: string): string[] {
  const results: string[] = [];
  pattern.lastIndex = 0;

  let matched: RegExpExecArray | null;
  while ((matched = pattern.exec(input)) !== null) {
    const captured = typeof matched[1] === 'string' ? matched[1] : matched[0];
    const normalized = normalizeExtractedUrl(captured, baseUrl);
    if (normalized) {
      results.push(normalized);
    }
  }

  return results;
}

function scoreVideoCandidate(url: string, baseScore: number): number {
  const lower = url.toLowerCase();
  let score = baseScore;

  if (VIDEO_URL_PATTERN.test(lower)) score += 90;
  if (lower.includes('/v1/files/video/')) score += 80;
  if (lower.includes('/videos/')) score += 70;
  if (lower.includes('/video/')) score += 60;
  if (lower.includes('generated_video')) score += 70;
  if (lower.includes('video')) score += 20;

  if (IMAGE_URL_PATTERN.test(lower)) score -= 120;
  if (lower.includes('preview_image')) score -= 80;
  if (lower.includes('/preview/')) score -= 40;
  if (lower.includes('poster')) score -= 40;

  return score;
}

function selectBestVideoCandidate(candidates: Array<{ url: string; score: number }>): string | null {
  if (candidates.length === 0) return null;

  const deduped = new Map<string, number>();
  for (const candidate of candidates) {
    const previousScore = deduped.get(candidate.url);
    if (previousScore === undefined || candidate.score > previousScore) {
      deduped.set(candidate.url, candidate.score);
    }
  }

  const ranked = Array.from(deduped.entries())
    .map(([url, score]) => ({ url, score }))
    .sort((a, b) => b.score - a.score);

  if (ranked.length === 0) return null;
  if (ranked[0]!.score > 0) return ranked[0]!.url;

  return null;
}

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

function extractVideoUrlFromText(content: string, baseUrl?: string): string | null {
  const trimmed = content.trim();
  if (!trimmed) return null;

  const mediaJson = parseMediaJsonFromContent(trimmed);
  if (mediaJson?.type === 'video' && mediaJson.url) {
    const normalized = normalizeExtractedUrl(mediaJson.url, baseUrl);
    if (normalized) return normalized;
  }

  const candidates: Array<{ url: string; score: number }> = [];

  const videoTagSrcMatches = collectCapturedUrls(
    trimmed,
    /<video\b[^>]*\bsrc=['"]([^'"]+)['"]/gi,
    baseUrl,
  );
  for (const url of videoTagSrcMatches) {
    candidates.push({ url, score: scoreVideoCandidate(url, 140) });
  }

  const sourceTagMatches = collectCapturedUrls(
    trimmed,
    /<source\b[^>]*\bsrc=['"]([^'"]+)['"]/gi,
    baseUrl,
  );
  for (const url of sourceTagMatches) {
    candidates.push({ url, score: scoreVideoCandidate(url, 120) });
  }

  const markdownLinkMatches = collectCapturedUrls(
    trimmed,
    /!?\[[^\]]*]\(([^)]+)\)/gi,
    baseUrl,
  );
  for (const url of markdownLinkMatches) {
    candidates.push({ url, score: scoreVideoCandidate(url, 70) });
  }

  const rawUrlMatches = collectCapturedUrls(
    trimmed,
    /(https?:\/\/[^\s"'<>`]+)/gi,
    baseUrl,
  );
  for (const url of rawUrlMatches) {
    candidates.push({ url, score: scoreVideoCandidate(url, 50) });
  }

  const best = selectBestVideoCandidate(candidates);
  if (best) return best;

  const fallback = rawUrlMatches.find((url) => !IMAGE_URL_PATTERN.test(url.toLowerCase())) || null;
  return fallback;
}

function normalizeContentToText(content: unknown, depth = 0): string {
  if (depth > 6 || content === null || content === undefined) return '';
  if (typeof content === 'string') return content;

  if (Array.isArray(content)) {
    return content
      .map((item) => normalizeContentToText(item, depth + 1))
      .filter(Boolean)
      .join('\n')
      .trim();
  }

  if (typeof content === 'object') {
    const record = content as Record<string, unknown>;
    if (typeof record.text === 'string') return record.text;
    if (typeof record.content === 'string') return record.content;
    if (typeof record.url === 'string') return record.url;

    return Object.values(record)
      .map((item) => normalizeContentToText(item, depth + 1))
      .filter(Boolean)
      .join('\n')
      .trim();
  }

  return '';
}

function compactSnippet(content: string, max = 200): string {
  return content.replace(/\s+/g, ' ').trim().slice(0, max);
}

function extractUpstreamErrorMessage(payload: unknown): string | null {
  if (!payload || typeof payload !== 'object') return null;
  const record = payload as Record<string, unknown>;

  const detail = typeof record.detail === 'string' ? record.detail.trim() : '';
  if (detail) return detail;

  const error = record.error;
  if (typeof error === 'string' && error.trim()) {
    return error.trim();
  }
  if (error && typeof error === 'object') {
    const errorRecord = error as Record<string, unknown>;
    if (typeof errorRecord.message === 'string' && errorRecord.message.trim()) {
      return errorRecord.message.trim();
    }
    if (typeof errorRecord.detail === 'string' && errorRecord.detail.trim()) {
      return errorRecord.detail.trim();
    }
  }

  return null;
}

function extractContentFromExternalChatPayload(payload: unknown): string {
  if (!payload || typeof payload !== 'object') return '';
  const record = payload as Record<string, unknown>;
  const choices = Array.isArray(record.choices) ? record.choices : [];
  const segments: string[] = [];

  for (const choice of choices) {
    if (!choice || typeof choice !== 'object') continue;
    const item = choice as Record<string, unknown>;
    const message = item.message as Record<string, unknown> | undefined;
    const delta = item.delta as Record<string, unknown> | undefined;

    const candidates = [
      message?.content,
      delta?.content,
      delta?.reasoning_content,
    ];

    for (const candidate of candidates) {
      const text = normalizeContentToText(candidate);
      if (text) segments.push(text);
    }
  }

  return segments.join('\n').trim();
}

function extractVideoUrlFromUnknownPayload(payload: unknown, baseUrl?: string): string | null {
  const queue: unknown[] = [payload];
  const visited = new Set<unknown>();

  while (queue.length > 0) {
    const current = queue.shift();
    if (current === null || current === undefined) continue;

    if (typeof current === 'string') {
      const fromText = extractVideoUrlFromText(current, baseUrl);
      if (fromText) return fromText;

      const normalized = normalizeExtractedUrl(current, baseUrl);
      if (normalized && scoreVideoCandidate(normalized, 0) > 0) {
        return normalized;
      }
      continue;
    }

    if (typeof current !== 'object') continue;
    if (visited.has(current)) continue;
    visited.add(current);

    if (Array.isArray(current)) {
      for (const item of current) queue.push(item);
      continue;
    }

    for (const value of Object.values(current as Record<string, unknown>)) {
      queue.push(value);
    }
  }

  return null;
}

function parseSseDataEvents(rawText: string): string[] {
  const events: string[] = [];
  const normalized = rawText.replace(/\r\n/g, '\n');
  const lines = normalized.split('\n');
  let dataLines: string[] = [];

  for (const line of lines) {
    if (line.startsWith('data:')) {
      dataLines.push(line.slice(5).trimStart());
      continue;
    }

    if (line.trim() === '') {
      if (dataLines.length > 0) {
        events.push(dataLines.join('\n'));
        dataLines = [];
      }
      continue;
    }
  }

  if (dataLines.length > 0) {
    events.push(dataLines.join('\n'));
  }

  return events;
}

function extractVideoUrlFromSseResponseText(
  rawText: string,
  baseUrl?: string
): { url: string | null; errorMessage: string | null; text: string } {
  const events = parseSseDataEvents(rawText);
  const textSegments: string[] = [];
  let errorMessage: string | null = null;

  for (const eventData of events) {
    const data = eventData.trim();
    if (!data || data === '[DONE]') continue;

    let payload: unknown = null;
    try {
      payload = JSON.parse(data);
    } catch {
      const directUrl = extractVideoUrlFromText(data, baseUrl);
      if (directUrl) {
        return { url: directUrl, errorMessage, text: textSegments.join('\n').trim() };
      }
      textSegments.push(data);
      continue;
    }

    const upstreamError = extractUpstreamErrorMessage(payload);
    if (upstreamError && !errorMessage) {
      errorMessage = upstreamError;
    }

    const urlFromPayload = extractVideoUrlFromUnknownPayload(payload, baseUrl);
    if (urlFromPayload) {
      return { url: urlFromPayload, errorMessage, text: textSegments.join('\n').trim() };
    }

    const contentText = extractContentFromExternalChatPayload(payload);
    if (contentText) {
      textSegments.push(contentText);
      const urlFromContent = extractVideoUrlFromText(contentText, baseUrl);
      if (urlFromContent) {
        return { url: urlFromContent, errorMessage, text: textSegments.join('\n').trim() };
      }
    }
  }

  const mergedText = textSegments.join('\n').trim();
  const fallbackUrl = mergedText ? extractVideoUrlFromText(mergedText, baseUrl) : null;
  return { url: fallbackUrl, errorMessage, text: mergedText };
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

function normalizeGrokVideoLengthSeconds(duration?: string, fallback = 10): number {
  const parsed = normalizeDurationSeconds(duration);
  const base = Number.isFinite(parsed) ? parsed : fallback;
  return Math.max(5, Math.min(15, Math.floor(base)));
}

function mapFlowModel(modelName: string, aspectRatio: string, duration: string): string {
  const normalizedModel = (modelName || '').trim();
  const lowerModel = normalizedModel.toLowerCase();

  // Keep explicit Flow2API model ids untouched (for one-click imported models).
  if (lowerModel.startsWith('veo_')) {
    return normalizedModel;
  }

  const ratio = (aspectRatio || '').toLowerCase();
  const seconds = normalizeDurationSeconds(duration);

  const isI2V = lowerModel.includes('i2v') || lowerModel.includes('image');
  const isR2V = lowerModel.includes('r2v') || lowerModel.includes('reference');

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

function mapGrokModel(modelName: string): string {
  return modelName?.trim() || 'grok-imagine-1.0-video';
}

function mapChannelModel(channelType: VideoChannel['type'], model: VideoModel, request: SoraGenerateRequest): string {
  const ratio = request.aspectRatio || model.defaultAspectRatio || 'landscape';
  const duration = request.duration || model.defaultDuration || '10s';

  if (channelType === 'flow2api') {
    return mapFlowModel(model.apiModel, ratio, duration);
  }
  if (channelType === 'grok2api') {
    return mapGrokModel(model.apiModel);
  }
  return model.apiModel || request.model;
}

function resolveVideoConfigObject(
  request: SoraGenerateRequest,
  model: VideoModel
): { aspect_ratio: string; video_length: number; resolution: 'SD' | 'HD'; preset: 'fun' | 'normal' | 'spicy' } {
  const requestConfig = request.videoConfigObject || request.video_config;
  const modelConfig = model.videoConfigObject;
  const hasRequestAspectRatio = typeof request.aspectRatio === 'string' && request.aspectRatio.trim().length > 0;
  const hasRequestDuration = typeof request.duration === 'string' && request.duration.trim().length > 0;

  const aspectRatioRaw =
    requestConfig?.aspect_ratio ||
    (hasRequestAspectRatio
      ? request.aspectRatio
      : modelConfig?.aspect_ratio || model.defaultAspectRatio || 'landscape');

  const videoLengthRaw =
    typeof requestConfig?.video_length === 'number'
      ? requestConfig.video_length
      : hasRequestDuration
        ? normalizeGrokVideoLengthSeconds(request.duration || '10s')
        : typeof modelConfig?.video_length === 'number'
          ? modelConfig.video_length
          : normalizeGrokVideoLengthSeconds(model.defaultDuration || '10s');

  const resolutionRaw = (requestConfig?.resolution || modelConfig?.resolution || 'HD').toString().toUpperCase();
  const presetRaw = (requestConfig?.preset || modelConfig?.preset || 'normal').toString().toLowerCase();

  return {
    aspect_ratio: normalizeAspectRatioLabel(aspectRatioRaw || '16:9'),
    video_length: Math.max(5, Math.min(15, Math.floor(videoLengthRaw))),
    resolution: resolutionRaw === 'SD' ? 'SD' : 'HD',
    preset: presetRaw === 'fun' || presetRaw === 'spicy' ? (presetRaw as 'fun' | 'spicy') : 'normal',
  };
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
  const useStreamingResponse = channel.type === 'flow2api';

  const payload: Record<string, unknown> = {
    model: resolvedModel,
    messages: buildVideoMessages({ prompt, model: resolvedModel, files }),
    stream: useStreamingResponse,
  };

  if (channel.type === 'grok2api') {
    payload.video_config = resolveVideoConfigObject(request, model);
  }

  const apiUrl = `${effectiveBaseUrl.replace(/\/$/, '')}/v1/chat/completions`;
  onProgress?.(5);

  logInfo('[Video Adapter] External chat request:', {
    channelType: channel.type,
    channelName: channel.name,
    apiUrl,
    model: resolvedModel,
    stream: useStreamingResponse,
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

  const rawBody = await response.text();

  let parsedBody: unknown = null;
  if (rawBody.trim()) {
    try {
      parsedBody = JSON.parse(rawBody) as ExternalChatResponse;
    } catch {
      parsedBody = null;
    }
  }

  if (!response.ok) {
    const upstreamError = extractUpstreamErrorMessage(parsedBody);
    const detail = upstreamError || compactSnippet(rawBody, 400);
    throw new Error(`上游返回错误 (${response.status})${detail ? `: ${detail}` : ''}`);
  }

  let rawUrl: string | null = null;
  let upstreamMessage = '';

  if (useStreamingResponse) {
    const parsedStream = extractVideoUrlFromSseResponseText(rawBody, effectiveBaseUrl);
    rawUrl = parsedStream.url;
    upstreamMessage = parsedStream.errorMessage || parsedStream.text;
  } else {
    rawUrl = extractVideoUrlFromUnknownPayload(parsedBody, effectiveBaseUrl);
    upstreamMessage = extractContentFromExternalChatPayload(parsedBody);
  }

  if (!rawUrl) {
    const message = compactSnippet(upstreamMessage, 220);
    if (message) {
      logWarn('[Video Adapter] Upstream response without video URL:', message);
      throw new Error(`上游未返回视频链接: ${message}`);
    }
    logWarn('[Video Adapter] Unrecognized upstream payload:', compactSnippet(rawBody, 300));
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
