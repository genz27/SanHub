import { getSystemConfig, getVideoChannels } from './db';
import { fetch as undiciFetch, Agent, FormData } from 'undici';

// ========================================
// Sora OpenAI-Style Non-Streaming API
// ========================================

// 解析视频 URL（处理字符串、JSON 字符串数组、数组等格式）
function parseVideoUrl(url: string | string[] | unknown): string {
  if (typeof url === 'string') {
    if (url.startsWith('[')) {
      try {
        const urls = JSON.parse(url);
        return Array.isArray(urls) && urls.length > 0 ? urls[0] : url;
      } catch {
        return url;
      }
    }
    return url;
  }
  if (Array.isArray(url) && url.length > 0) {
    return url[0];
  }
  return String(url);
}

// 获取 Sora 配置（优先从新渠道表读取，回退到旧 system_config）
async function getSoraConfig(): Promise<{ apiKey: string; baseUrl: string }> {
  // 优先从 video_channels 表获取 sora 类型的渠道
  const channels = await getVideoChannels(true); // 只获取启用的
  const soraChannel = channels.find(c => c.type === 'sora');
  
  if (soraChannel && soraChannel.apiKey) {
    return {
      apiKey: soraChannel.apiKey,
      baseUrl: soraChannel.baseUrl || 'http://localhost:8000',
    };
  }
  
  // 回退到旧的 system_config
  const config = await getSystemConfig();
  return {
    apiKey: config.soraApiKey || '',
    baseUrl: config.soraBaseUrl || 'http://localhost:8000',
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
  async_mode?: boolean;
}

// New API response format
export interface VideoTaskResponse {
  id: string;
  object: string;
  model: string;
  created_at: number;
  status: 'processing' | 'succeeded' | 'failed';
  progress: number;
  expires_at?: number;
  size?: string;
  seconds?: string;
  quality?: string;
  url?: string;
  permalink?: string;
  revised_prompt?: string;
  remixed_from_video_id?: string | null;
  error?: {
    message: string;
    type: string;
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
export async function getVideoStatus(videoId: string): Promise<VideoTaskResponse> {
  const { apiKey, baseUrl } = await getSoraConfig();
  
  if (!apiKey) {
    throw new Error('Sora API Key 未配置');
  }
  
  const normalizedBaseUrl = baseUrl.replace(/\/$/, '');
  const apiUrl = `${normalizedBaseUrl}/v1/videos/${videoId}`;
  
  const response = await undiciFetch(apiUrl, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
    dispatcher: soraAgent,
  });
  
  const data = await response.json() as any;
  
  if (!response.ok) {
    const errorMessage = data?.error?.message || data?.message || '查询视频状态失败';
    throw new Error(errorMessage);
  }
  
  return data as VideoTaskResponse;
}

// 轮询等待视频完成
async function pollVideoCompletion(
  videoId: string,
  onProgress?: (progress: number, status: string) => void
): Promise<VideoTaskResponse> {
  let lastProgress = -1;
  let stallCount = 0;
  const maxStallCount = 60; // 最大停滞次数（约10分钟）
  
  while (true) {
    const status = await getVideoStatus(videoId);
    
    if (onProgress) {
      onProgress(status.progress, status.status);
    }
    
    console.log(`[Sora API] 视频状态: ${status.status}, 进度: ${status.progress}%`);
    
    if (status.status === 'succeeded') {
      return status;
    }
    
    if (status.status === 'failed') {
      throw new Error(status.error?.message || '视频生成失败');
    }
    
    // 检测停滞
    if (status.progress === lastProgress) {
      stallCount++;
      if (stallCount >= maxStallCount) {
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
  onProgress?: (progress: number, status: string) => void
): Promise<VideoGenerationResponse> {
  const { apiKey, baseUrl } = await getSoraConfig();

  if (!apiKey) {
    throw new Error('Sora API Key 未配置，请在管理后台「视频渠道」中配置 Sora 渠道');
  }

  if (!baseUrl) {
    throw new Error('Sora Base URL 未配置');
  }

  const normalizedBaseUrl = baseUrl.replace(/\/$/, '');
  const apiUrl = `${normalizedBaseUrl}/v1/videos`;

  console.log('[Sora API] 视频生成请求:', {
    apiUrl,
    model: request.model,
    prompt: request.prompt?.substring(0, 50),
    seconds: request.seconds,
    size: request.size,
    hasInputImage: !!request.input_image,
  });

  // 使用 form-data 格式
  const formData = new FormData();
  
  const prompt = request.prompt || 'Generate video';
  
  formData.append('prompt', prompt);
  if (request.model) formData.append('model', request.model);
  if (request.seconds) formData.append('seconds', request.seconds);
  if (request.size) formData.append('size', request.size);
  if (request.orientation) formData.append('orientation', request.orientation);
  if (request.style_id) formData.append('style_id', request.style_id);
  if (request.remix_target_id) formData.append('remix_target_id', request.remix_target_id);
  
  // 如果有输入图片，转换为 Blob
  if (request.input_image) {
    const imageBuffer = Buffer.from(request.input_image, 'base64');
    const imageBlob = new Blob([imageBuffer], { type: 'image/jpeg' });
    formData.append('input_reference', imageBlob, 'input.jpg');
  }

  const response = await undiciFetch(apiUrl, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
    body: formData,
    dispatcher: soraAgent,
  });

  const rawData = await response.json() as any;

  // 版本标记 v4 - 改进 NewAPI 格式解析
  console.log('[Sora API v4] 原始响应:', JSON.stringify(rawData));

  // 处理 NewAPI 包装格式：{code: "...", message: "{json string}", data: null}
  let data = rawData;
  if (rawData?.code && rawData?.message && typeof rawData.message === 'string') {
    try {
      // 尝试解析 message 字段中的 JSON
      const parsed = JSON.parse(rawData.message);
      if (parsed?.id) {
        console.log('[Sora API v4] 检测到 NewAPI 格式，解析 message 字段成功');
        data = parsed;
      }
    } catch (parseError) {
      console.log('[Sora API v4] message JSON 解析失败:', parseError);
      // 尝试修复常见的 JSON 问题（如未转义的特殊字符）
      try {
        // 提取关键字段
        const idMatch = rawData.message.match(/"id"\s*:\s*"([^"]+)"/);
        const statusMatch = rawData.message.match(/"status"\s*:\s*"([^"]+)"/);
        const urlMatch = rawData.message.match(/"url"\s*:\s*"(https?:\/\/[^"]+)"/);
        
        if (idMatch) {
          console.log('[Sora API v4] 使用正则提取关键字段');
          data = {
            id: idMatch[1],
            status: statusMatch ? statusMatch[1] : undefined,
            url: urlMatch ? urlMatch[1] : undefined,
          };
        }
      } catch {
        // 正则提取也失败，保持原样
      }
    }
  }

  console.log('[Sora API v4] 解析后数据:', {
    hasId: !!data?.id,
    taskStatus: data?.status,
    taskId: data?.id,
    hasUrl: !!data?.url,
  });

  // 检查是否是错误响应（NewAPI 格式的真正错误）
  if (!response.ok && !data?.id) {
    const errorMessage = data?.error?.message || rawData?.message || data?.error || '视频生成失败';
    console.error('[Sora API v4] 视频生成错误:', errorMessage);
    throw new Error(errorMessage);
  }

  // 检查是否是新格式响应（有 id 和 status 字段，或者有 id 和 url 字段）
  if (data?.id && (data?.status || data?.url)) {
    const taskResponse = data as VideoTaskResponse;
    
    // 如果已经成功（有 url 或 status === 'succeeded'）
    if (taskResponse.url || taskResponse.status === 'succeeded') {
      if (taskResponse.url) {
        const videoUrl = parseVideoUrl(taskResponse.url);
        console.log('[Sora API] 视频生成成功（同步模式）:', videoUrl);
        return {
          id: taskResponse.id,
          object: taskResponse.object || 'video',
          created: taskResponse.created_at || Date.now(),
          model: taskResponse.model || '',
          data: [{
            url: videoUrl,
            permalink: taskResponse.permalink,
            revised_prompt: taskResponse.revised_prompt,
          }],
        };
      }
    }
    
    // 如果失败，抛出错误
    if (taskResponse.status === 'failed') {
      throw new Error(taskResponse.error?.message || '视频生成失败');
    }
    
    // 如果还在处理中，轮询等待
    if (taskResponse.status === 'processing' || (taskResponse.id && !taskResponse.url)) {
      console.log('[Sora API] 视频正在处理中，开始轮询... taskId:', taskResponse.id);
      const finalStatus = await pollVideoCompletion(taskResponse.id, onProgress);
      
      if (!finalStatus.url) {
        throw new Error('视频生成完成但未返回 URL');
      }
      
      const videoUrl = parseVideoUrl(finalStatus.url);
      return {
        id: finalStatus.id,
        object: finalStatus.object || 'video',
        created: finalStatus.created_at || Date.now(),
        model: finalStatus.model || '',
        data: [{
          url: videoUrl,
          permalink: finalStatus.permalink,
          revised_prompt: finalStatus.revised_prompt,
        }],
      };
    }
  }

  // 旧格式响应（直接返回 data 数组）
  if (data?.data && Array.isArray(data.data) && data.data.length > 0 && data.data[0]?.url) {
    console.log('[Sora API] 视频生成成功（旧格式）:', data.data[0].url);
    return data as VideoGenerationResponse;
  }

  // 未知格式，抛出错误
  console.error('[Sora API] 未知响应格式:', JSON.stringify(data));
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

  const response = await undiciFetch(apiUrl, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
    body: formData,
    dispatcher: soraAgent,
  });

  const data = await response.json() as any;

  if (!response.ok) {
    throw new Error(data?.error?.message || '创建视频任务失败');
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

  console.log('[Sora API] 图片生成请求:', {
    apiUrl,
    model: request.model,
    prompt: request.prompt?.substring(0, 50),
  });

  const response = await undiciFetch(apiUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(request),
    dispatcher: soraAgent,
  });

  const data = await response.json() as any;

  if (!response.ok) {
    const errorMessage = data?.error?.message || data?.message || '图片生成失败';
    console.error('[Sora API] 图片生成错误:', errorMessage);
    throw new Error(errorMessage);
  }

  console.log('[Sora API] 图片生成成功');
  return data as ImageGenerationResponse;
}

// ========================================
// Character Card API
// ========================================

export interface CharacterCardRequest {
  video_base64: string;
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

  const normalizedBaseUrl = baseUrl.replace(/\/$/, '');
  const apiUrl = `${normalizedBaseUrl}/v1/characters`;

  console.log('[Sora API] 角色卡创建请求');

  // 使用 form-data 格式
  const formData = new FormData();
  formData.append('model', request.model || 'sora-video-10s');
  formData.append('timestamps', request.timestamps || '0,3');
  if (request.username) formData.append('username', request.username);
  if (request.display_name) formData.append('display_name', request.display_name);
  if (request.instruction_set) formData.append('instruction_set', request.instruction_set);
  if (request.safety_instruction_set) formData.append('safety_instruction_set', request.safety_instruction_set);
  
  // 视频转换为 Blob
  const videoBuffer = Buffer.from(request.video_base64, 'base64');
  const videoBlob = new Blob([videoBuffer], { type: 'video/mp4' });
  formData.append('video', videoBlob, 'video.mp4');

  const response = await undiciFetch(apiUrl, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
    body: formData,
    dispatcher: soraAgent,
  });

  const data = await response.json() as any;

  if (!response.ok) {
    const errorMessage = data?.error?.message || data?.message || '角色卡创建失败';
    console.error('[Sora API] 角色卡创建错误:', errorMessage);
    throw new Error(errorMessage);
  }

  console.log('[Sora API] 角色卡创建成功:', JSON.stringify(data, null, 2));
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

  const response = await undiciFetch(apiUrl, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
    dispatcher: soraAgent,
  });

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

  const response = await undiciFetch(apiUrl, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
    dispatcher: soraAgent,
  });

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

  const response = await undiciFetch(apiUrl, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
    dispatcher: soraAgent,
  });

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

  const response = await undiciFetch(apiUrl, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
    dispatcher: soraAgent,
  });

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

  const response = await undiciFetch(apiUrl, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
    dispatcher: soraAgent,
  });

  const data = await response.json() as any;

  if (!response.ok) {
    throw new Error(data?.error?.message || '邀请码获取失败');
  }

  return data as InviteCodeResponse;
}
