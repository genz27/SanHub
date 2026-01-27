/* eslint-disable no-console */
import { getSystemConfig, getVideoChannels, getVideoChannel } from './db';
import { fetch as undiciFetch, Agent, FormData, type RequestInit as UndiciRequestInit } from 'undici';
import type { VideoChannel } from '@/types';
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

// ========================================
// Sora OpenAI-Style Non-Streaming API
// ========================================

// 解析视频 URL（处理字符串、JSON 字符串数组、数组等格式）
function parseVideoUrl(url: string | string[] | unknown): string {
  if (Array.isArray(url)) {
    return url.length > 0 ? parseVideoUrl(url[0]) : '';
  }
  if (typeof url !== 'string') {
    return String(url);
  }

  const trimmed = url.trim();
  if (!trimmed) {
    return trimmed;
  }

  const parsedArray = tryParseJsonArray(trimmed);
  if (parsedArray) {
    return normalizeUrlString(parsedArray);
  }

  const unwrapped = unwrapEncodedArray(trimmed);
  if (unwrapped) {
    return normalizeUrlString(unwrapped);
  }

  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    const inner = trimmed.slice(1, -1).trim();
    const innerParsed = tryParseJsonArray(inner);
    if (innerParsed) {
      return normalizeUrlString(innerParsed);
    }
    const innerUnwrapped = unwrapEncodedArray(inner);
    if (innerUnwrapped) {
      return normalizeUrlString(innerUnwrapped);
    }
  }

  return trimmed;
}

function tryParseJsonArray(value: string): string | null {
  if (!value.startsWith('[')) {
    return null;
  }
  try {
    const parsed = JSON.parse(value);
    if (Array.isArray(parsed) && parsed.length > 0) {
      return String(parsed[0]);
    }
  } catch {
    return null;
  }
  return null;
}

function unwrapEncodedArray(value: string): string | null {
  const trimmed = value.trim();
  const lower = trimmed.toLowerCase();

  const encodedOpen = '%5b%22';
  const encodedClose = '%22%5d';
  if (lower.startsWith(encodedOpen) && lower.endsWith(encodedClose)) {
    return trimmed.slice(encodedOpen.length, trimmed.length - encodedClose.length);
  }

  const mixedOpen = '[%22';
  const mixedClose = '%22]';
  if (lower.startsWith(mixedOpen) && lower.endsWith(mixedClose)) {
    return trimmed.slice(mixedOpen.length, trimmed.length - mixedClose.length);
  }

  return null;
}

function normalizeUrlString(value: string): string {
  const trimmed = value.trim();
  if (/^https?:%2f%2f/i.test(trimmed)) {
    try {
      return decodeURIComponent(trimmed);
    } catch {
      return trimmed;
    }
  }
  return trimmed;
}

// 视频代理 URL 替换（将 videos.openai.com 替换为配置的加速域名）
export async function applyVideoProxy(url: string): Promise<string> {
  if (!url) return url;
  
  try {
    const config = await getSystemConfig();
    if (!config.videoProxyEnabled || !config.videoProxyBaseUrl) {
      return url;
    }
    
    // 检查是否是 OpenAI 视频 URL
    const openaiVideoPattern = /^https:\/\/videos\.openai\.com\//;
    if (openaiVideoPattern.test(url)) {
      // 确保代理 baseUrl 以 / 结尾
      const proxyBase = config.videoProxyBaseUrl.replace(/\/$/, '') + '/';
      // 替换域名
      const proxiedUrl = url.replace(openaiVideoPattern, proxyBase);
      logDebug('[Video Proxy] URL replaced:', { original: url.substring(0, 80), proxied: proxiedUrl.substring(0, 80) });
      return proxiedUrl;
    }
  } catch (e) {
    logWarn('[Video Proxy] Failed to apply proxy:', e);
  }
  
  return url;
}

const DEFAULT_SORA_BASE_URL = 'http://localhost:8000';

type SoraConfig = {
  apiKey: string;
  baseUrl: string;
  channelId?: string;
};

let soraChannelCursor = 0;

function pickRoundRobinChannel(channels: VideoChannel[]): VideoChannel {
  const index = soraChannelCursor % channels.length;
  soraChannelCursor = (soraChannelCursor + 1) % channels.length;
  return channels[index];
}

// 获取 Sora 配置（优先从新渠道表读取，回退到旧 system_config）
async function getSoraConfig(options?: {
  channelId?: string;
  mode?: 'default' | 'round-robin';
}): Promise<SoraConfig> {
  if (options?.channelId) {
    const channel = await getVideoChannel(options.channelId);
    if (channel && channel.type === 'sora' && channel.apiKey) {
      return {
        apiKey: channel.apiKey,
        baseUrl: channel.baseUrl || DEFAULT_SORA_BASE_URL,
        channelId: channel.id,
      };
    }
  }

  const channels = await getVideoChannels(true);
  const soraChannels = channels.filter(c => c.type === 'sora' && c.apiKey);
  if (soraChannels.length > 0) {
    const selected =
      options?.mode === 'round-robin'
        ? pickRoundRobinChannel(soraChannels)
        : soraChannels[0];
    return {
      apiKey: selected.apiKey,
      baseUrl: selected.baseUrl || DEFAULT_SORA_BASE_URL,
      channelId: selected.id,
    };
  }

  const config = await getSystemConfig();
  return {
    apiKey: config.soraApiKey || '',
    baseUrl: config.soraBaseUrl || DEFAULT_SORA_BASE_URL,
  };
}

// 创建自定义 Agent
const soraAgent = new Agent({
  bodyTimeout: 0,
  headersTimeout: 1800000, // 30分钟
  keepAliveTimeout: 1800000, // 30分钟
  keepAliveMaxTimeout: 1800000, // 30分钟
  pipelining: 0,
  connections: 30,
  connect: {
    timeout: 1800000, // 30分钟
  },
});

// ========================================
// Video Generation API (New Format)
// ========================================

export interface VideoGenerationRequest {
  prompt: string;
  model?: string;
  seconds?: '10' | '15' | '25';
  orientation?: 'landscape' | 'portrait';
  size?: string; // e.g., '1920x1080', '1080x1920'
  style_id?: string;
  input_image?: string; // Base64 encoded image
  remix_target_id?: string;
  metadata?: string; // JSON string for extended params
  async_mode?: boolean;
}

// Video Remix request
export interface VideoRemixRequest {
  prompt: string;
  model?: string;
  seconds?: '10' | '15' | '25';
  size?: string;
  style_id?: string;
  async_mode?: boolean;
}

// Helper: check if status indicates completion
function isCompletedStatus(status: VideoTaskStatus): boolean {
  return status === 'completed' || status === 'succeeded';
}

// Helper: check if status indicates in progress
function isInProgressStatus(status: VideoTaskStatus): boolean {
  return status === 'queued' || status === 'pending' || status === 'in_progress' || status === 'processing';
}

// Video task status (new-api-main compatible)
export type VideoTaskStatus = 
  | 'queued'      // 排队中
  | 'pending'     // 等待中
  | 'in_progress' // 处理中 (new-api-main)
  | 'processing'  // 处理中 (legacy)
  | 'completed'   // 成功 (new-api-main)
  | 'succeeded'   // 成功 (legacy)
  | 'failed'      // 失败
  | 'cancelled';  // 已取消

// New API response format (new-api-main compatible)
export interface VideoTaskResponse {
  id: string;
  object: string;
  model: string;
  created_at: number;
  completed_at?: number;
  expires_at?: number;
  status: VideoTaskStatus;
  progress: number;
  size?: string;
  seconds?: string;
  quality?: string;
  url?: string;
  output?: { url?: string };
  permalink?: string;
  revised_prompt?: string;
  remixed_from_video_id?: string | null;
  metadata?: Record<string, unknown>;
  error?: {
    message: string;
    type?: string;
    code?: string;
  } | null;
}

// Legacy response format (for compatibility)
export interface VideoGenerationResponse {
  id: string;
  object: string;
  created: number;
  model: string;
  data: Array<{
    url: string;
    permalink?: string;
    revised_prompt?: string;
    [key: string]: unknown;
  }>;
}

export interface VideoGenerationResult extends VideoGenerationResponse {
  channelId?: string;
}

// 自适应轮询间隔计算
function getPollingInterval(progress: number, stallCount: number): number {
  // 基础间隔根据进度调整
  let baseInterval: number;
  if (progress < 30) {
    baseInterval = 5000; // 0-30%: 5秒
  } else if (progress < 70) {
    baseInterval = 3000; // 30-70%: 3秒
  } else {
    baseInterval = 2000; // 70-100%: 2秒
  }
  
  // 停滞时增加间隔
  if (stallCount > 0) {
    baseInterval = Math.min(baseInterval + stallCount * 2000, 10000);
  }
  
  return baseInterval;
}

// 查询视频任务状态
export async function getVideoStatus(videoId: string, channelId?: string): Promise<VideoTaskResponse> {
  const { apiKey, baseUrl } = await getSoraConfig({ channelId });
  
  if (!apiKey) {
    throw new Error('Sora API Key 未配置');
  }
  
  const normalizedBaseUrl = baseUrl.replace(/\/$/, '');
  const apiUrl = `${normalizedBaseUrl}/v1/videos/${videoId}`;
  
  logDebug('[Sora API v5] Query video status:', apiUrl);
  
  const response = await fetchWithRetry(undiciFetch, apiUrl, () => ({
    method: 'GET',
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
    dispatcher: soraAgent,
  }));
  
  const rawData = await response.json() as any;
  logDebug('[Sora API v5] Status response:', JSON.stringify(rawData).substring(0, 200));
  
  // 处理 NewAPI 包装格式
  let data = rawData;
  if (rawData?.code && rawData?.message && typeof rawData.message === 'string') {
    try {
      const parsed = JSON.parse(rawData.message);
      if (parsed?.id) {
        data = parsed;
        if (data.output?.url && !data.url) {
          data.url = data.output.url;
        }
      }
    } catch {
      // 尝试正则提取
      const idMatch = rawData.message.match(/"id"\s*:\s*"([^"]+)"/);
      const statusMatch = rawData.message.match(/"status"\s*:\s*"([^"]+)"/);
      const progressMatch = rawData.message.match(/"progress"\s*:\s*(\d+)/);
      const urlMatch = rawData.message.match(/"url"\s*:\s*"(https?:\/\/[^"]+)"/);
      if (!urlMatch) {
        // 尝试匹配截断的 URL
        const truncatedUrlMatch = rawData.message.match(/"url"\s*:\s*"(https?:\/\/[^"]+)/);
        if (truncatedUrlMatch) {
          data = {
            id: idMatch?.[1] || videoId,
            status: statusMatch?.[1] || 'processing',
            progress: progressMatch ? parseInt(progressMatch[1]) : 0,
            url: truncatedUrlMatch[1],
          };
        }
      } else if (idMatch) {
        data = {
          id: idMatch[1],
          status: statusMatch?.[1] || 'processing',
          progress: progressMatch ? parseInt(progressMatch[1]) : 0,
          url: urlMatch?.[1],
        };
      }
    }
  }
  
  if (!response.ok && !data?.id) {
    const errorMessage = data?.error?.message || rawData?.message || '查询视频状态失败';
    const rawSnippet = (() => {
      try {
        return JSON.stringify(rawData).substring(0, 200);
      } catch {
        return String(rawData).substring(0, 200);
      }
    })();
    logError('[Sora API v5] Get status failed', { status: response.status, error: errorMessage, body: rawSnippet });
    throw new Error(errorMessage);
  }
  
  // 确保 progress 有默认值
  if (typeof data.progress !== 'number') {
    data.progress = 0;
  }
  
  // 处理 output.url 格式
  if (data.output?.url && !data.url) {
    data.url = data.output.url;
  }
  
  return data as VideoTaskResponse;
}

// 获取视频内容 URL（通过 /content 端点，跟随 302 重定向）
export async function getVideoContentUrl(videoId: string, channelId?: string): Promise<string> {
  const { apiKey, baseUrl } = await getSoraConfig({ channelId });
  
  if (!apiKey) {
    throw new Error('Sora API Key 未配置');
  }
  
  const normalizedBaseUrl = baseUrl.replace(/\/$/, '');
  const apiUrl = `${normalizedBaseUrl}/v1/videos/${videoId}/content`;
  
  logDebug('[Sora API v5] Fetch video content:', apiUrl);
  
  // 使用 redirect: 'manual' 来捕获 302 重定向的 Location
  const requestInit: UndiciRequestInit = {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
    redirect: 'manual',
    dispatcher: soraAgent,
  };
  const response = await fetchWithRetry(undiciFetch, apiUrl, () => requestInit);
  
  logDebug('[Sora API v5] /content status:', response.status);
  
  // 如果是重定向（301, 302, 307, 308），返回 Location header 中的实际视频 URL
  if ([301, 302, 307, 308].includes(response.status)) {
    const location = response.headers.get('location');
    logDebug('[Sora API v5] /content redirect location:', location?.substring(0, 100));
    if (location) {
      const rawUrl = parseVideoUrl(location);
      return await applyVideoProxy(rawUrl);
    }
  }
  
  // 如果是 200，可能直接返回了视频内容或 JSON
  if (response.status === 200) {
    const contentType = response.headers.get('content-type') || '';
    // 如果是 JSON，尝试解析获取 URL
    if (contentType.includes('application/json')) {
      const data = await response.json() as any;
      logDebug('[Sora API v5] /content JSON response:', JSON.stringify(data).substring(0, 200));
      if (data?.url) {
        const rawUrl = parseVideoUrl(data.url);
        return await applyVideoProxy(rawUrl);
      }
    }
  }
  
  // 如果是错误响应
  if (response.status >= 400) {
    const data = await response.json().catch(() => ({})) as any;
    const errorMessage = data?.error?.message || `获取视频内容失败: ${response.status}`;
    logError('[Sora API v5] /content error response', {
      status: response.status,
      error: errorMessage,
      body: JSON.stringify(data).substring(0, 200),
    });
    throw new Error(errorMessage);
  }
  
  // 兜底：返回 content URL（不推荐，因为需要认证）
  logError('[Sora API v5] /content missing redirect; cannot resolve public URL');
  throw new Error('无法获取视频直链');
}

// 轮询等待视频完成
async function pollVideoCompletion(
  videoId: string,
  onProgress?: (progress: number, status: string) => void,
  channelId?: string
): Promise<VideoTaskResponse> {
  let lastProgress = -1;
  let stallCount = 0;
  const maxStallCount = 60; // 最大停滞次数（约10分钟）
  let failedCount = 0;
  const maxFailedCount = 3;
  const failedRetryDelayMs = 5000;
  const retryableFailedPatterns = ['stale in_progress timeout', 'stale in progress timeout'];

  const isRetryableFailedError = (message?: string | null): boolean => {
    if (!message) return false;
    const lower = message.toLowerCase();
    return retryableFailedPatterns.some(pattern => lower.includes(pattern));
  };
  
  while (true) {
    const status = await getVideoStatus(videoId, channelId);
    
    if (onProgress) {
      onProgress(status.progress, status.status);
    }
    
    logDebug(
      `[Sora API v5] Video status: ${status.status}, progress: ${status.progress}%, hasUrl: ${!!status.url || !!status.output?.url}`
    );
    
    // 统一处理 output.url 格式
    if (status.output?.url && !status.url) {
      status.url = status.output.url;
    }
    
    // 成功状态 (兼容 new-api-main)
    if (isCompletedStatus(status.status)) {
      // 如果没有 URL，尝试通过 /content 端点获取
      if (!status.url) {
        try {
          logDebug('[Sora API v5] Completed without URL, trying /content');
          const contentUrl = await getVideoContentUrl(videoId, channelId);
          status.url = contentUrl;
        } catch (e) {
          logWarn('[Sora API v5] /content fetch failed', e);
        }
      }
      return status;
    }

    if (status.status === 'failed') {
      failedCount += 1;
      const errorMessage = status.error?.message || '视频生成失败';
      if (!isRetryableFailedError(status.error?.message)) {
        logError('[Sora API v5] Video status failed', { videoId, error: errorMessage });
        throw new Error(errorMessage);
      }
      if (failedCount >= maxFailedCount) {
        logError('[Sora API v5] Video status failed after retries', { videoId, error: errorMessage });
        throw new Error(errorMessage);
      }
      logWarn(
        `[Sora API v5] Status failed (${failedCount}/${maxFailedCount}), retrying after ${failedRetryDelayMs}ms: ${errorMessage}`
      );
      await new Promise(resolve => setTimeout(resolve, failedRetryDelayMs));
      continue;
    } else {
      failedCount = 0;
    }
    
    // 检测停滞
    if (status.progress === lastProgress) {
      stallCount++;
      if (stallCount >= maxStallCount) {
        logError('[Sora API v5] Video stalled', {
          videoId,
          status: status.status,
          progress: status.progress,
        });
        throw new Error('视频生成超时：进度长时间无变化');
      }
    } else {
      stallCount = 0;
      lastProgress = status.progress;
    }
    
    // 自适应等待
    const interval = getPollingInterval(status.progress, stallCount);
    await new Promise(resolve => setTimeout(resolve, interval));
  }
}

export async function generateVideo(
  request: VideoGenerationRequest,
  onProgress?: (progress: number, status: string) => void,
  options?: { channelId?: string }
): Promise<VideoGenerationResult> {
  const { apiKey, baseUrl, channelId } = await getSoraConfig({
    channelId: options?.channelId,
    mode: options?.channelId ? 'default' : 'round-robin',
  });

  if (!apiKey) {
    throw new Error('Sora API Key 未配置，请在管理后台「视频渠道」中配置 Sora 渠道');
  }

  if (!baseUrl) {
    throw new Error('Sora Base URL 未配置');
  }

  const normalizedBaseUrl = baseUrl.replace(/\/$/, '');
  const apiUrl = `${normalizedBaseUrl}/v1/videos`;

  logInfo('[Sora API] Video generation request:', {
    apiUrl,
    model: request.model,
    prompt: request.prompt?.substring(0, 50),
    seconds: request.seconds,
    size: request.size,
    hasInputImage: !!request.input_image,
  });

  const buildFormData = () => {
    const formData = new FormData();

    const prompt = request.prompt || 'Generate video';

    formData.append('prompt', prompt);
    if (request.model) formData.append('model', request.model);
    if (request.seconds) formData.append('seconds', request.seconds);
    if (request.size) formData.append('size', request.size);
    if (request.orientation) formData.append('orientation', request.orientation);
    if (request.style_id) formData.append('style_id', request.style_id);
    if (request.remix_target_id) formData.append('remix_target_id', request.remix_target_id);

    if (request.input_image) {
      const imageBuffer = Buffer.from(request.input_image, 'base64');
      const imageBlob = new Blob([imageBuffer], { type: 'image/jpeg' });
      formData.append('input_reference', imageBlob, 'input.jpg');
    }

    return formData;
  };

  const response = await fetchWithRetry(undiciFetch, apiUrl, () => ({
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
    body: buildFormData(),
    dispatcher: soraAgent,
  }));

  const rawData = await response.json() as any;

  // 版本标记 v4 - 改进 NewAPI 格式解析
  logDebug('[Sora API v4] Raw response:', JSON.stringify(rawData));

  // 处理 NewAPI 包装格式：{code: "...", message: "{json string}", data: null}
  let data = rawData;
  if (rawData?.code && rawData?.message && typeof rawData.message === 'string') {
    try {
      // 尝试解析 message 字段中的 JSON
      const parsed = JSON.parse(rawData.message);
      if (parsed?.id) {
        logDebug('[Sora API v5] Detected NewAPI format, parsed message payload');
        // 处理 output.url 格式
        if (parsed.output?.url && !parsed.url) {
          parsed.url = parsed.output.url;
        }
        data = parsed;
      }
    } catch (parseError) {
      logDebug('[Sora API v5] Message JSON parse failed:', parseError);
      // 尝试用正则提取关键字段
      try {
        const idMatch = rawData.message.match(/"id"\s*:\s*"([^"]+)"/);
        const statusMatch = rawData.message.match(/"status"\s*:\s*"([^"]+)"/);
        // 匹配 URL - 支持截断的情况（URL 可能没有闭合引号）
        // 先尝试匹配完整 URL，再尝试匹配截断的
        let urlMatch = rawData.message.match(/"url"\s*:\s*"(https?:\/\/[^"]+)"/);
        if (!urlMatch) {
          // 匹配截断的 URL（到字符串末尾）
          urlMatch = rawData.message.match(/"url"\s*:\s*"(https?:\/\/[^"]+)/);
        }
        
        if (idMatch) {
          logDebug('[Sora API v5] Regex fallback parsed fields, urlFound:', !!urlMatch);
          data = {
            id: idMatch[1],
            status: statusMatch ? statusMatch[1] : undefined,
            url: urlMatch ? urlMatch[1] : undefined,
          };
        }
      } catch (regexError) {
        logDebug('[Sora API v5] Regex fallback failed:', regexError);
      }
    }
  }

  logDebug('[Sora API v5] Parsed payload:', {
    hasId: !!data?.id,
    taskStatus: data?.status,
    taskId: data?.id,
    progress: data?.progress,
    hasUrl: !!data?.url || !!data?.output?.url,
    url: (data?.url || data?.output?.url)?.substring(0, 80),
  });

  // 统一处理 output.url 格式
  if (data?.output?.url && !data?.url) {
    data.url = data.output.url;
  }
  
  // 确保 progress 有默认值
  if (data && typeof data.progress !== 'number') {
    data.progress = 0;
  }

  // 检查是否是错误响应（NewAPI 格式的真正错误）
  if (!response.ok && !data?.id) {
    const errorMessage = data?.error?.message || rawData?.message || data?.error || '视频生成失败';
    logError('[Sora API v5] Video generation failed:', errorMessage);
    throw new Error(errorMessage);
  }

  // 检查是否是新格式响应（有 id 和 status 字段，或者有 id 和 url 字段）
  if (data?.id && (data?.status || data?.url)) {
    const taskResponse = data as VideoTaskResponse;
    
    // 如果已经成功（有 url 或状态为完成）
    const isCompleted = isCompletedStatus(taskResponse.status);
    if (taskResponse.url || isCompleted) {
      if (taskResponse.url) {
        const videoUrl = await applyVideoProxy(parseVideoUrl(taskResponse.url));
        logInfo('[Sora API v5] Video generation completed:', videoUrl?.substring(0, 80));
        return {
          id: taskResponse.id,
          object: taskResponse.object || 'video',
          created: taskResponse.created_at || Date.now(),
          model: taskResponse.model || '',
          data: [{
            url: videoUrl,
            permalink: taskResponse.permalink || (taskResponse.metadata as any)?.permalink,
            revised_prompt: taskResponse.revised_prompt,
          }],
          channelId,
        };
      }
      // 状态是完成但没有 URL，尝试轮询获取
      if (isCompleted && !taskResponse.url) {
        logWarn('[Sora API v5] Completed without URL, retrying via polling...');
      }
    }
    
    // 如果失败，抛出错误
    if (taskResponse.status === 'failed') {
      logError('[Sora API v5] Video task failed', {
        taskId: taskResponse.id,
        error: taskResponse.error?.message || '视频生成失败',
      });
      throw new Error(taskResponse.error?.message || '视频生成失败');
    }
    
    // 如果还在处理中或需要获取 URL，轮询等待
    if (isInProgressStatus(taskResponse.status) || (taskResponse.id && !taskResponse.url)) {
      logInfo('[Sora API v5] Polling task status...', taskResponse.id);
      const finalStatus = await pollVideoCompletion(taskResponse.id, onProgress, channelId);
      
      if (!finalStatus.url) {
        logError('[Sora API v5] Video completed without URL', { taskId: finalStatus.id });
        throw new Error('视频生成完成但未返回 URL');
      }
      
      const videoUrl = await applyVideoProxy(parseVideoUrl(finalStatus.url));
      return {
        id: finalStatus.id,
        object: finalStatus.object || 'video',
        created: finalStatus.created_at || Date.now(),
        model: finalStatus.model || '',
        data: [{
          url: videoUrl,
          permalink: finalStatus.permalink || (finalStatus.metadata as any)?.permalink,
          revised_prompt: finalStatus.revised_prompt,
        }],
        channelId,
      };
    }
  }

  // 旧格式响应（直接返回 data 数组）
  if (data?.data && Array.isArray(data.data) && data.data.length > 0 && data.data[0]?.url) {
    logInfo('[Sora API] Video generation completed (legacy):', data.data[0].url);
    const legacy = data as VideoGenerationResponse;
    return { ...legacy, channelId };
  }

  // 未知格式，抛出错误
  logError('[Sora API] Unknown response format:', JSON.stringify(data).substring(0, 200));
  throw new Error('视频生成失败：API 返回了未知格式的响应');
}

// 异步创建视频任务（立即返回任务ID）
export async function createVideoTask(request: VideoGenerationRequest): Promise<VideoTaskResponse> {
  const { apiKey, baseUrl } = await getSoraConfig();

  if (!apiKey) {
    throw new Error('Sora API Key 未配置');
  }

  const normalizedBaseUrl = baseUrl.replace(/\/$/, '');
  const apiUrl = `${normalizedBaseUrl}/v1/videos`;

  const buildFormData = () => {
    const formData = new FormData();

    formData.append('prompt', request.prompt || 'Generate video');
    formData.append('async_mode', 'true');

    if (request.model) formData.append('model', request.model);
    if (request.seconds) formData.append('seconds', request.seconds);
    if (request.size) formData.append('size', request.size);
    if (request.orientation) formData.append('orientation', request.orientation);
    if (request.style_id) formData.append('style_id', request.style_id);
    if (request.remix_target_id) formData.append('remix_target_id', request.remix_target_id);

    if (request.input_image) {
      const imageBuffer = Buffer.from(request.input_image, 'base64');
      const imageBlob = new Blob([imageBuffer], { type: 'image/jpeg' });
      formData.append('input_reference', imageBlob, 'input.jpg');
    }

    return formData;
  };

  const response = await fetchWithRetry(undiciFetch, apiUrl, () => ({
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
    body: buildFormData(),
    dispatcher: soraAgent,
  }));

  const data = await response.json() as any;

  if (!response.ok) {
    throw new Error(data?.error?.message || '创建视频任务失败');
  }

  return data as VideoTaskResponse;
}

// ========================================
// Video Remix API (new-api compatible)
// POST /v1/videos/{video_id}/remix
// ========================================

export async function remixVideo(
  videoId: string,
  request: VideoRemixRequest,
  onProgress?: (progress: number, status: string) => void
): Promise<VideoGenerationResponse> {
  const { apiKey, baseUrl } = await getSoraConfig();

  if (!apiKey) {
    throw new Error('Sora API Key 未配置');
  }

  if (!baseUrl) {
    throw new Error('Sora Base URL 未配置');
  }

  const normalizedBaseUrl = baseUrl.replace(/\/$/, '');
  const apiUrl = `${normalizedBaseUrl}/v1/videos/${encodeURIComponent(videoId)}/remix`;

  logInfo('[Sora API] Remix request:', {
    apiUrl,
    videoId,
    prompt: request.prompt?.substring(0, 50),
    model: request.model,
  });

  const response = await fetchWithRetry(undiciFetch, apiUrl, () => ({
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      prompt: request.prompt,
      model: request.model,
      seconds: request.seconds,
      size: request.size,
      style_id: request.style_id,
      async_mode: request.async_mode ?? true,
    }),
    dispatcher: soraAgent,
  }));

  const rawData = await response.json() as any;
  logDebug('[Sora API] Remix response:', JSON.stringify(rawData).substring(0, 200));

  if (!response.ok && !rawData?.id) {
    const errorMessage = rawData?.error?.message || rawData?.message || 'Remix 失败';
    throw new Error(errorMessage);
  }

  const taskResponse = rawData as VideoTaskResponse;

  // 如果已完成且有 URL
  if (isCompletedStatus(taskResponse.status) && taskResponse.url) {
    const videoUrl = await applyVideoProxy(parseVideoUrl(taskResponse.url));
    return {
      id: taskResponse.id,
      object: taskResponse.object || 'video',
      created: taskResponse.created_at || Date.now(),
      model: taskResponse.model || '',
      data: [{
        url: videoUrl,
        permalink: taskResponse.permalink || (taskResponse.metadata as any)?.permalink,
        revised_prompt: taskResponse.revised_prompt,
      }],
    };
  }

  // 如果失败
  if (taskResponse.status === 'failed' || taskResponse.status === 'cancelled') {
    throw new Error(taskResponse.error?.message || 'Remix 失败');
  }

  // 异步模式或需要轮询
  if (isInProgressStatus(taskResponse.status) || (taskResponse.id && !taskResponse.url)) {
    logInfo('[Sora API] Remix polling started:', taskResponse.id);
    const finalStatus = await pollVideoCompletion(taskResponse.id, onProgress);

    if (!finalStatus.url) {
      throw new Error('Remix 完成但未返回 URL');
    }

    const videoUrl = await applyVideoProxy(parseVideoUrl(finalStatus.url));
    return {
      id: finalStatus.id,
      object: finalStatus.object || 'video',
      created: finalStatus.created_at || Date.now(),
      model: finalStatus.model || '',
      data: [{
        url: videoUrl,
        permalink: finalStatus.permalink || (finalStatus.metadata as any)?.permalink,
        revised_prompt: finalStatus.revised_prompt,
      }],
    };
  }

  throw new Error('Remix 返回了未知格式的响应');
}

// 异步创建 Remix 任务（立即返回任务ID）
export async function createRemixTask(
  videoId: string,
  request: VideoRemixRequest
): Promise<VideoTaskResponse> {
  const { apiKey, baseUrl } = await getSoraConfig();

  if (!apiKey) {
    throw new Error('Sora API Key 未配置');
  }

  const normalizedBaseUrl = baseUrl.replace(/\/$/, '');
  const apiUrl = `${normalizedBaseUrl}/v1/videos/${encodeURIComponent(videoId)}/remix`;

  const response = await fetchWithRetry(undiciFetch, apiUrl, () => ({
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      prompt: request.prompt,
      model: request.model,
      seconds: request.seconds,
      size: request.size,
      style_id: request.style_id,
      async_mode: true,
    }),
    dispatcher: soraAgent,
  }));

  const data = await response.json() as any;

  if (!response.ok) {
    throw new Error(data?.error?.message || '创建 Remix 任务失败');
  }

  return data as VideoTaskResponse;
}


// ========================================
// Image Generation API
// ========================================

export interface ImageGenerationRequest {
  prompt: string;
  model?: string;
  n?: number;
  size?: string;
  quality?: 'standard' | 'hd';
  style?: 'natural' | 'vivid';
  response_format?: 'url' | 'b64_json';
  input_image?: string; // Base64 encoded image
}

export interface ImageGenerationResponse {
  created: number;
  data: Array<{
    url?: string;
    b64_json?: string;
    revised_prompt?: string;
  }>;
}

export async function generateImage(request: ImageGenerationRequest): Promise<ImageGenerationResponse> {
  const { apiKey, baseUrl } = await getSoraConfig();

  if (!apiKey) {
    throw new Error('Sora API Key 未配置，请在管理后台「视频渠道」中配置 Sora 渠道');
  }

  if (!baseUrl) {
    throw new Error('Sora Base URL 未配置');
  }

  const normalizedBaseUrl = baseUrl.replace(/\/$/, '');
  const apiUrl = `${normalizedBaseUrl}/v1/images/generations`;

  logInfo('[Sora API] Image generation request:', {
    apiUrl,
    model: request.model,
    prompt: request.prompt?.substring(0, 50),
  });

  const response = await fetchWithRetry(undiciFetch, apiUrl, () => ({
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(request),
    dispatcher: soraAgent,
  }));

  const data = await response.json() as any;

  if (!response.ok) {
    const errorMessage = data?.error?.message || data?.message || '图片生成失败';
    logError('[Sora API] Image generation failed:', errorMessage);
    throw new Error(errorMessage);
  }

  logInfo('[Sora API] Image generation completed');
  return data as ImageGenerationResponse;
}

// ========================================
// Character Card API
// ========================================

export interface CharacterCardRequest {
  // 视频模式（二选一）
  video_base64?: string;
  // 图生角色卡模式（二选一）
  input_image?: string; // Base64 编码的参考图片
  prompt?: string; // 图生角色卡时的提示词（可选）
  style_id?: string; // 视频风格（仅图生角色卡时生效）
  // 通用参数
  model?: string;
  timestamps?: string;
  username?: string;
  display_name?: string;
  instruction_set?: string;
  safety_instruction_set?: string;
}

export interface CharacterCardResponse {
  id: string;
  object: string;
  created: number;
  model: string;
  data: {
    cameo_id: string;
    username: string;
    display_name?: string;
    message: string;
    generation_id?: string; // 图生角色卡时返回的生成 ID
  };
}

export async function createCharacterCard(request: CharacterCardRequest): Promise<CharacterCardResponse> {
  const { apiKey, baseUrl } = await getSoraConfig();

  if (!apiKey) {
    throw new Error('Sora API Key 未配置，请在管理后台「视频渠道」中配置 Sora 渠道');
  }

  if (!baseUrl) {
    throw new Error('Sora Base URL 未配置');
  }

  // 检查是视频模式还是图生角色卡模式
  const isImageMode = !request.video_base64 && request.input_image;
  if (!request.video_base64 && !request.input_image) {
    throw new Error('请提供视频或参考图片');
  }

  const normalizedBaseUrl = baseUrl.replace(/\/$/, '');
  const apiUrl = `${normalizedBaseUrl}/v1/characters`;

  logInfo('[Sora API] Character card request', { mode: isImageMode ? 'image' : 'video' });

  const buildFormData = () => {
    const formData = new FormData();
    formData.append('model', request.model || 'sora-video-10s');
    if (request.timestamps) formData.append('timestamps', request.timestamps);
    if (request.username) formData.append('username', request.username);
    if (request.display_name) formData.append('display_name', request.display_name);
    if (request.instruction_set) formData.append('instruction_set', request.instruction_set);
    if (request.safety_instruction_set) formData.append('safety_instruction_set', request.safety_instruction_set);

    if (isImageMode) {
      // 图生角色卡模式
      if (request.prompt) formData.append('prompt', request.prompt);
      if (request.style_id) formData.append('style_id', request.style_id);
      const imageBuffer = Buffer.from(request.input_image!, 'base64');
      const imageBlob = new Blob([imageBuffer], { type: 'image/jpeg' });
      formData.append('input_reference', imageBlob, 'reference.jpg');
    } else {
      // 视频模式
      formData.append('timestamps', request.timestamps || '0,3');
      const videoBuffer = Buffer.from(request.video_base64!, 'base64');
      const videoBlob = new Blob([videoBuffer], { type: 'video/mp4' });
      formData.append('video', videoBlob, 'video.mp4');
    }

    return formData;
  };

  const response = await fetchWithRetry(undiciFetch, apiUrl, () => ({
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
    body: buildFormData(),
    dispatcher: soraAgent,
  }));

  const data = await response.json() as any;

  if (!response.ok) {
    const errorMessage = data?.error?.message || data?.message || '角色卡创建失败';
    logError('[Sora API] Character card failed:', errorMessage);
    throw new Error(errorMessage);
  }

  logInfo('[Sora API] Character card completed:', JSON.stringify(data, null, 2));
  return data as CharacterCardResponse;
}

// ========================================
// Feed API (Public Feed)
// ========================================

export interface FeedRequest {
  limit?: number;
  cut?: 'nf2_latest' | 'nf2_top';
  cursor?: string;
}

export interface FeedItem {
  id: string;
  text: string;
  permalink: string;
  preview_image_url: string;
  posted_at: string;
  like_count: number;
  view_count: number;
  remix_count: number;
  attachment: {
    kind: string;
    url: string;
    downloadable_url: string;
    width: number;
    height: number;
    n_frames?: number;
    duration_seconds?: number;
  };
  author: {
    user_id: string;
    username: string;
    display_name: string;
    profile_picture_url: string;
  };
}

export interface FeedResponse {
  success: boolean;
  cut: string;
  count: number;
  cursor: string;
  items: FeedItem[];
}

export async function getFeed(request: FeedRequest = {}): Promise<FeedResponse> {
  const { apiKey, baseUrl } = await getSoraConfig();

  if (!apiKey) {
    throw new Error('Sora API Key 未配置');
  }

  if (!baseUrl) {
    throw new Error('Sora Base URL 未配置');
  }

  const normalizedBaseUrl = baseUrl.replace(/\/$/, '');
  const params = new URLSearchParams();
  if (request.limit) params.append('limit', String(request.limit));
  if (request.cut) params.append('cut', request.cut);
  if (request.cursor) params.append('cursor', request.cursor);

  const apiUrl = `${normalizedBaseUrl}/v1/feed?${params.toString()}`;

  const response = await fetchWithRetry(undiciFetch, apiUrl, () => ({
    method: 'GET',
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
    dispatcher: soraAgent,
  }));

  const data = await response.json() as any;

  if (!response.ok) {
    throw new Error(data?.error?.message || 'Feed 获取失败');
  }

  return data as FeedResponse;
}

// ========================================
// User Profile API
// ========================================

export interface ProfileResponse {
  success: boolean;
  profile: {
    user_id: string;
    username: string;
    display_name: string;
    profile_picture_url: string;
    follower_count: number;
  };
}

export async function getProfile(username: string): Promise<ProfileResponse> {
  const { apiKey, baseUrl } = await getSoraConfig();

  if (!apiKey) {
    throw new Error('Sora API Key 未配置');
  }

  if (!baseUrl) {
    throw new Error('Sora Base URL 未配置');
  }

  const normalizedBaseUrl = baseUrl.replace(/\/$/, '');
  const apiUrl = `${normalizedBaseUrl}/v1/profiles/${encodeURIComponent(username)}`;

  const response = await fetchWithRetry(undiciFetch, apiUrl, () => ({
    method: 'GET',
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
    dispatcher: soraAgent,
  }));

  const data = await response.json() as any;

  if (!response.ok) {
    throw new Error(data?.error?.message || '用户资料获取失败');
  }

  return data as ProfileResponse;
}

// ========================================
// User Feed API
// ========================================

export interface UserFeedRequest {
  user_id: string;
  limit?: number;
  cursor?: string;
}

export async function getUserFeed(request: UserFeedRequest): Promise<FeedResponse> {
  const { apiKey, baseUrl } = await getSoraConfig();

  if (!apiKey) {
    throw new Error('Sora API Key 未配置');
  }

  if (!baseUrl) {
    throw new Error('Sora Base URL 未配置');
  }

  const normalizedBaseUrl = baseUrl.replace(/\/$/, '');
  const params = new URLSearchParams();
  if (request.limit) params.append('limit', String(request.limit));
  if (request.cursor) params.append('cursor', request.cursor);

  const apiUrl = `${normalizedBaseUrl}/v1/users/${encodeURIComponent(request.user_id)}/feed?${params.toString()}`;

  const response = await fetchWithRetry(undiciFetch, apiUrl, () => ({
    method: 'GET',
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
    dispatcher: soraAgent,
  }));

  const data = await response.json() as any;

  if (!response.ok) {
    throw new Error(data?.error?.message || '用户内容获取失败');
  }

  return data as FeedResponse;
}

// ========================================
// Character Search API
// ========================================

export interface CharacterSearchRequest {
  username: string;
  intent?: 'users' | 'cameo';
  limit?: number;
}

export interface CharacterSearchResponse {
  success: boolean;
  query: string;
  count: number;
  results: Array<{
    user_id: string;
    username: string;
    display_name: string;
    profile_picture_url: string;
    can_cameo: boolean;
    token: string;
  }>;
}

export async function searchCharacters(request: CharacterSearchRequest): Promise<CharacterSearchResponse> {
  const { apiKey, baseUrl } = await getSoraConfig();

  if (!apiKey) {
    throw new Error('Sora API Key 未配置');
  }

  if (!baseUrl) {
    throw new Error('Sora Base URL 未配置');
  }

  const normalizedBaseUrl = baseUrl.replace(/\/$/, '');
  const params = new URLSearchParams();
  params.append('username', request.username);
  if (request.intent) params.append('intent', request.intent);
  if (request.limit) params.append('limit', String(request.limit));

  const apiUrl = `${normalizedBaseUrl}/v1/characters/search?${params.toString()}`;

  const response = await fetchWithRetry(undiciFetch, apiUrl, () => ({
    method: 'GET',
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
    dispatcher: soraAgent,
  }));

  const data = await response.json() as any;

  if (!response.ok) {
    throw new Error(data?.error?.message || '角色搜索失败');
  }

  return data as CharacterSearchResponse;
}

// ========================================
// Invite Code API
// ========================================

export interface InviteCodeResponse {
  success: boolean;
  invite_code: string;
  remaining_count: number;
  total_count: number;
  email: string;
}

export async function getInviteCode(): Promise<InviteCodeResponse> {
  const { apiKey, baseUrl } = await getSoraConfig();

  if (!apiKey) {
    throw new Error('Sora API Key 未配置');
  }

  if (!baseUrl) {
    throw new Error('Sora Base URL 未配置');
  }

  const normalizedBaseUrl = baseUrl.replace(/\/$/, '');
  const apiUrl = `${normalizedBaseUrl}/v1/invite-codes`;

  const response = await fetchWithRetry(undiciFetch, apiUrl, () => ({
    method: 'GET',
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
    dispatcher: soraAgent,
  }));

  const data = await response.json() as any;

  if (!response.ok) {
    throw new Error(data?.error?.message || '邀请码获取失败');
  }

  return data as InviteCodeResponse;
}


// ========================================
// Prompt Enhancement API
// ========================================

export interface EnhancePromptRequest {
  prompt: string;
  expansion_level?: 'short' | 'medium' | 'long';
  duration_s?: 10 | 15;
}

export interface EnhancePromptResponse {
  enhanced_prompt: string;
}

export async function enhancePrompt(request: EnhancePromptRequest): Promise<EnhancePromptResponse> {
  const { apiKey, baseUrl } = await getSoraConfig();

  if (!apiKey) {
    throw new Error('Sora API Key 未配置');
  }

  if (!baseUrl) {
    throw new Error('Sora Base URL 未配置');
  }

  const normalizedBaseUrl = baseUrl.replace(/\/$/, '');
  const apiUrl = `${normalizedBaseUrl}/v1/enhance_prompt`;

  logInfo('[Sora API] Prompt enhance request:', {
    prompt: request.prompt?.substring(0, 50),
    expansion_level: request.expansion_level,
    duration_s: request.duration_s,
  });

  const response = await fetchWithRetry(undiciFetch, apiUrl, () => ({
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      prompt: request.prompt,
      expansion_level: request.expansion_level || 'medium',
      duration_s: request.duration_s,
    }),
    dispatcher: soraAgent,
  }));

  const data = await response.json() as any;

  if (!response.ok) {
    const errorMessage = data?.error?.message || data?.message || '提示词增强失败';
    logError('[Sora API] Prompt enhance failed:', errorMessage);
    throw new Error(errorMessage);
  }

  logInfo('[Sora API] Prompt enhance completed');
  return data as EnhancePromptResponse;
}
