/* eslint-disable no-console */
import { getSoraConfig, warmupSoraConfig } from './sora-config';
import { loadUndici } from './undici-http';
import {
  applyProxiedVideoUrl,
  fetchWithRetry,
  parseVideoUrl,
  shouldUseApexerVideoContract,
  soraUndiciFetch,
} from './sora-http';
import { logDebug, logInfo, logWarn, logError } from './sora-logger';

export { warmupSoraConfig };

// ========================================
// Video Generation API (New Format)
// ========================================

export interface VideoGenerationRequest {
  prompt: string;
  model?: string;
  seconds?: string;
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
  seconds?: string;
  orientation?: 'landscape' | 'portrait';
  size?: string;
  style_id?: string;
  remix_target_id?: string;
  async_mode?: boolean;
}

function parseSeconds(value: unknown, fallback = 8): number {
  if (value === undefined || value === null) return fallback;
  const matched = String(value).match(/(\d+)/);
  if (!matched) return fallback;
  const parsed = Number.parseInt(matched[1], 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return parsed;
}

function normalizeApexerSeconds(...values: unknown[]): string {
  const raw = values.find((value) => value !== undefined && value !== null && String(value).trim());
  const seconds = parseSeconds(raw, 8);
  return String(Math.max(1, Math.min(seconds, 20)));
}

function inferApexerOrientation(request: Pick<VideoGenerationRequest, 'model' | 'orientation' | 'size'>): 'landscape' | 'portrait' {
  if (request.orientation === 'portrait' || request.orientation === 'landscape') {
    return request.orientation;
  }

  const model = String(request.model || '').toLowerCase();
  if (model.includes('portrait')) return 'portrait';
  if (model.includes('landscape')) return 'landscape';

  const size = String(request.size || '').toLowerCase();
  const matched = size.match(/^(\d+)x(\d+)$/);
  if (matched) {
    const width = Number.parseInt(matched[1], 10);
    const height = Number.parseInt(matched[2], 10);
    if (Number.isFinite(width) && Number.isFinite(height) && height > width) {
      return 'portrait';
    }
  }

  return 'landscape';
}

function apexerSizeForOrientation(orientation: 'landscape' | 'portrait'): string {
  return orientation === 'portrait' ? '720x1280' : '1280x720';
}

function normalizeApexerVideoRequest(request: VideoGenerationRequest): VideoGenerationRequest {
  const orientation = inferApexerOrientation(request);
  return {
    ...request,
    model: 'sora-2',
    seconds: normalizeApexerSeconds(request.seconds, request.model),
    orientation,
    size: request.size || apexerSizeForOrientation(orientation),
  };
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
  
  const response = await fetchWithRetry(soraUndiciFetch, apiUrl, () => ({
    method: 'GET',
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
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

// 轮询等待视频完成
async function pollVideoCompletion(
  videoId: string,
  onProgress?: (progress: number, status: string) => void,
  channelId?: string
): Promise<VideoTaskResponse> {
  let lastProgress = -1;
  let stallCount = 0;
  let failedCount = 0;
  let consecutiveStatusErrors = 0;
  const failedRetryDelayMs = 5000;
  const retryableFailedPatterns = ['stale in_progress timeout', 'stale in progress timeout'];

  const isRetryableFailedError = (message?: string | null): boolean => {
    if (!message) return false;
    const lower = message.toLowerCase();
    return retryableFailedPatterns.some(pattern => lower.includes(pattern));
  };
  
  while (true) {
    let status: VideoTaskResponse;
    try {
      status = await getVideoStatus(videoId, channelId);
      consecutiveStatusErrors = 0;
    } catch (error) {
      const { isTransientError } = await import('./polling-utils');
      if (!isTransientError(error)) {
        throw error;
      }
      consecutiveStatusErrors += 1;
      const retryDelayMs = Math.min(5000 * 2 ** (consecutiveStatusErrors - 1), 60000);
      logWarn(
        `[Sora API v5] Status fetch transient error (${consecutiveStatusErrors}), retrying after ${retryDelayMs}ms`,
        error
      );
      await new Promise(resolve => setTimeout(resolve, retryDelayMs));
      continue;
    }
    
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
          const { getVideoContentUrl } = await import('./sora-content');
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
      logWarn(
        `[Sora API v5] Status failed (${failedCount}), retrying after ${failedRetryDelayMs}ms: ${errorMessage}`
      );
      await new Promise(resolve => setTimeout(resolve, failedRetryDelayMs));
      continue;
    } else {
      failedCount = 0;
    }
    
    // 检测停滞
    if (status.progress === lastProgress) {
      stallCount++;
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
  const { apiKey, baseUrl, channelId, channelType } = await getSoraConfig({
    channelId: options?.channelId,
    mode: options?.channelId ? 'default' : 'round-robin',
  });
  const upstreamRequest = shouldUseApexerVideoContract(channelType)
    ? normalizeApexerVideoRequest(request)
    : request;

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
    model: upstreamRequest.model,
    prompt: upstreamRequest.prompt?.substring(0, 50),
    seconds: upstreamRequest.seconds,
    size: upstreamRequest.size,
    hasInputImage: !!upstreamRequest.input_image,
  });

  const { FormData } = await loadUndici();
  const buildFormData = () => {
    const formData = new FormData();

    const prompt = upstreamRequest.prompt || 'Generate video';

    formData.append('prompt', prompt);
    if (upstreamRequest.model) formData.append('model', upstreamRequest.model);
    if (upstreamRequest.seconds) formData.append('seconds', upstreamRequest.seconds);
    if (upstreamRequest.size) formData.append('size', upstreamRequest.size);
    if (upstreamRequest.orientation) formData.append('orientation', upstreamRequest.orientation);
    if (upstreamRequest.style_id) formData.append('style_id', upstreamRequest.style_id);
    if (upstreamRequest.remix_target_id) formData.append('remix_target_id', upstreamRequest.remix_target_id);

    if (upstreamRequest.input_image) {
      const imageBuffer = Buffer.from(upstreamRequest.input_image, 'base64');
      const imageBlob = new Blob([imageBuffer], { type: 'image/jpeg' });
      formData.append('input_reference', imageBlob, 'input.jpg');
    }

    return formData;
  };

  const response = await fetchWithRetry(soraUndiciFetch, apiUrl, () => ({
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
    body: buildFormData(),
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
        const videoUrl = await applyProxiedVideoUrl(parseVideoUrl(taskResponse.url));
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
      
      const videoUrl = await applyProxiedVideoUrl(parseVideoUrl(finalStatus.url));
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
  const { apiKey, baseUrl, channelType } = await getSoraConfig();
  const upstreamRequest = shouldUseApexerVideoContract(channelType)
    ? normalizeApexerVideoRequest(request)
    : request;

  if (!apiKey) {
    throw new Error('Sora API Key 未配置');
  }

  const normalizedBaseUrl = baseUrl.replace(/\/$/, '');
  const apiUrl = `${normalizedBaseUrl}/v1/videos`;

  const { FormData } = await loadUndici();
  const buildFormData = () => {
    const formData = new FormData();

    formData.append('prompt', upstreamRequest.prompt || 'Generate video');
    formData.append('async_mode', 'true');

    if (upstreamRequest.model) formData.append('model', upstreamRequest.model);
    if (upstreamRequest.seconds) formData.append('seconds', upstreamRequest.seconds);
    if (upstreamRequest.size) formData.append('size', upstreamRequest.size);
    if (upstreamRequest.orientation) formData.append('orientation', upstreamRequest.orientation);
    if (upstreamRequest.style_id) formData.append('style_id', upstreamRequest.style_id);
    if (upstreamRequest.remix_target_id) formData.append('remix_target_id', upstreamRequest.remix_target_id);

    if (upstreamRequest.input_image) {
      const imageBuffer = Buffer.from(upstreamRequest.input_image, 'base64');
      const imageBlob = new Blob([imageBuffer], { type: 'image/jpeg' });
      formData.append('input_reference', imageBlob, 'input.jpg');
    }

    return formData;
  };

  const response = await fetchWithRetry(soraUndiciFetch, apiUrl, () => ({
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
    body: buildFormData(),
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
  const { apiKey, baseUrl, channelType } = await getSoraConfig();

  if (!apiKey) {
    throw new Error('Sora API Key 未配置');
  }

  if (!baseUrl) {
    throw new Error('Sora Base URL 未配置');
  }

  const normalizedBaseUrl = baseUrl.replace(/\/$/, '');
  const usesApexerContract = shouldUseApexerVideoContract(channelType);
  const upstreamRequest = usesApexerContract
    ? normalizeApexerVideoRequest({ ...request, remix_target_id: videoId })
    : request;
  const apiUrl = usesApexerContract
    ? `${normalizedBaseUrl}/v1/videos`
    : `${normalizedBaseUrl}/v1/videos/${encodeURIComponent(videoId)}/remix`;

  logInfo('[Sora API] Remix request:', {
    apiUrl,
    videoId,
    prompt: upstreamRequest.prompt?.substring(0, 50),
    model: upstreamRequest.model,
  });

  const response = await fetchWithRetry(soraUndiciFetch, apiUrl, () => ({
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      prompt: upstreamRequest.prompt,
      model: upstreamRequest.model,
      seconds: upstreamRequest.seconds,
      size: upstreamRequest.size,
      orientation: upstreamRequest.orientation,
      style_id: upstreamRequest.style_id,
      remix_target_id: upstreamRequest.remix_target_id,
      async_mode: upstreamRequest.async_mode ?? true,
    }),
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
    const videoUrl = await applyProxiedVideoUrl(parseVideoUrl(taskResponse.url));
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

    const videoUrl = await applyProxiedVideoUrl(parseVideoUrl(finalStatus.url));
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
  const { apiKey, baseUrl, channelType } = await getSoraConfig();

  if (!apiKey) {
    throw new Error('Sora API Key 未配置');
  }

  const normalizedBaseUrl = baseUrl.replace(/\/$/, '');
  const usesApexerContract = shouldUseApexerVideoContract(channelType);
  const upstreamRequest = usesApexerContract
    ? normalizeApexerVideoRequest({ ...request, remix_target_id: videoId })
    : request;
  const apiUrl = usesApexerContract
    ? `${normalizedBaseUrl}/v1/videos`
    : `${normalizedBaseUrl}/v1/videos/${encodeURIComponent(videoId)}/remix`;

  const response = await fetchWithRetry(soraUndiciFetch, apiUrl, () => ({
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      prompt: upstreamRequest.prompt,
      model: upstreamRequest.model,
      seconds: upstreamRequest.seconds,
      size: upstreamRequest.size,
      orientation: upstreamRequest.orientation,
      style_id: upstreamRequest.style_id,
      remix_target_id: upstreamRequest.remix_target_id,
      async_mode: true,
    }),
  }));

  const data = await response.json() as any;

  if (!response.ok) {
    throw new Error(data?.error?.message || '创建 Remix 任务失败');
  }

  return data as VideoTaskResponse;
}
