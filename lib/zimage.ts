import { getSystemConfig } from './db';
import { uploadToPicUI } from './picui';
import { FormData, File } from 'undici';
import type { ZImageGenerateRequest, GenerateResult } from '@/types';

// ========================================
// Z-Image API 封装 (ModelScope & Gitee)
// ========================================

const ASYNC_MODELS = new Set([
  'Qwen/Qwen-Image-Edit-2509',
  'Qwen/Qwen-Image',
  'black-forest-labs/FLUX.2-dev',
]);
const REQUIRE_REFERENCE_MODELS = new Set([
  'Qwen/Qwen-Image-Edit-2509',
]);

const TASK_POLL_INTERVAL_MS = 5000;
const TASK_POLL_MAX_ATTEMPTS = 60;

// ModelScope API 响应（同步返回图片URL）
interface ModelScopeImageResponse {
  images: Array<{
    url: string;
  }>;
  request_id: string;
}

// ModelScope API 响应（异步返回 task_id）
interface ModelScopeAsyncResponse {
  task_id: string;
}

interface ModelScopeTaskResponse {
  task_status: 'SUCCEED' | 'FAILED' | 'RUNNING' | 'PENDING' | string;
  output_images?: string[];
  message?: string;
}

// Gitee API 响应（同步返回base64）
interface GiteeImageResponse {
  data: Array<{
    b64_json?: string;
    type?: string;
    url?: string;
  }>;
  created: number;
}

// Key 轮询索引
let giteeKeyIndex = 0;

// 获取下一个 Gitee API Key
function getNextGiteeApiKey(keys: string): string {
  const keyList = keys.split(',').map(k => k.trim()).filter(k => k);
  if (keyList.length === 0) {
    throw new Error('Gitee API Key 未配置');
  }
  const key = keyList[giteeKeyIndex % keyList.length];
  giteeKeyIndex++;
  return key;
}

// 下载图片并转换为 base64
async function downloadImageAsBase64(imageUrl: string): Promise<string> {
  const response = await fetch(imageUrl);
  
  if (!response.ok) {
    throw new Error(`下载图片失败 (${response.status})`);
  }

  const arrayBuffer = await response.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  const base64 = buffer.toString('base64');
  
  // 获取 content-type
  const contentType = response.headers.get('content-type') || 'image/jpeg';
  
  return `data:${contentType};base64,${base64}`;
}

function isHttpUrl(value: string): boolean {
  return value.startsWith('http://') || value.startsWith('https://');
}

async function resolveImageUrls(
  images: NonNullable<ZImageGenerateRequest['images']>,
  config: Awaited<ReturnType<typeof getSystemConfig>>
): Promise<string[]> {
  const urls: string[] = [];

  for (let i = 0; i < images.length; i++) {
    const data = images[i]?.data || '';
    if (!data) continue;

    if (isHttpUrl(data)) {
      urls.push(data);
      continue;
    }

    if (!config.picuiApiKey) {
      throw new Error('参考图需要配置 PicUI 图床');
    }

    const filename = `input_${Date.now()}_${i}.jpg`;
    const url = await uploadToPicUI(data, filename);
    if (!url) {
      throw new Error('参考图上传失败，请稍后重试');
    }
    urls.push(url);
  }

  return urls;
}

function parseDataUrl(dataUrl: string): { mimeType: string; data: string } | null {
  const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (!match) return null;
  return {
    mimeType: match[1],
    data: match[2],
  };
}

function getGiteeFreeKey(config: Awaited<ReturnType<typeof getSystemConfig>>): string {
  return config.giteeFreeApiKey || process.env.GITEE_FREE_API_KEY || '';
}

function getGiteePaidKeys(config: Awaited<ReturnType<typeof getSystemConfig>>): string {
  return config.giteeApiKey || process.env.GITEE_API_KEY || '';
}

async function requestGiteeWithFallback<T>(
  config: Awaited<ReturnType<typeof getSystemConfig>>,
  makeRequest: (apiKey: string) => Promise<T>
): Promise<T> {
  const freeKey = getGiteeFreeKey(config);
  let lastError: unknown;

  if (freeKey) {
    try {
      return await makeRequest(freeKey);
    } catch (error) {
      console.warn('[Gitee] 免费 Key 请求失败，尝试付费 Keys:', error);
      lastError = error;
    }
  }

  const paidKeys = getGiteePaidKeys(config);
  if (!paidKeys) {
    throw (lastError as Error) || new Error('Gitee API Key 未配置，请在管理后台配置 API 密钥');
  }

  const apiKey = getNextGiteeApiKey(paidKeys);
  return makeRequest(apiKey);
}

async function requestGiteeJson(
  url: string,
  apiKey: string,
  payload: Record<string, unknown>
): Promise<GiteeImageResponse> {
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorText = await response.text();
    let errMsg = errorText;
    try {
      const errJson = JSON.parse(errorText);
      errMsg = errJson.error?.message || errJson.message || errorText;
    } catch {
      // ignore
    }
    throw new Error(`Gitee API 错误 (${response.status}): ${errMsg}`);
  }

  return response.json() as Promise<GiteeImageResponse>;
}

async function requestGiteeFormData(
  url: string,
  apiKey: string,
  formData: FormData
): Promise<GiteeImageResponse> {
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
    },
    body: formData,
  });

  if (!response.ok) {
    const errorText = await response.text();
    let errMsg = errorText;
    try {
      const errJson = JSON.parse(errorText);
      errMsg = errJson.error?.message || errJson.message || errorText;
    } catch {
      // ignore
    }
    throw new Error(`Gitee API 错误 (${response.status}): ${errMsg}`);
  }

  return response.json() as Promise<GiteeImageResponse>;
}

async function pollModelScopeTask(baseUrl: string, apiKey: string, taskId: string): Promise<string> {
  for (let attempt = 0; attempt < TASK_POLL_MAX_ATTEMPTS; attempt++) {
    const response = await fetch(`${baseUrl}v1/tasks/${taskId}`, {
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'X-ModelScope-Task-Type': 'image_generation',
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`ModelScope 任务查询失败 (${response.status}): ${errorText}`);
    }

    const data: ModelScopeTaskResponse = await response.json();

    if (data.task_status === 'SUCCEED') {
      const outputUrl = data.output_images?.[0];
      if (!outputUrl) {
        throw new Error('ModelScope 任务完成但未返回图片');
      }
      return outputUrl;
    }

    if (data.task_status === 'FAILED') {
      throw new Error(data.message || 'ModelScope 任务失败');
    }

    await new Promise((resolve) => setTimeout(resolve, TASK_POLL_INTERVAL_MS));
  }

  throw new Error('ModelScope 任务超时');
}

// ========================================
// Gitee 渠道生成（同步返回）
// ========================================

async function generateWithGitee(
  request: ZImageGenerateRequest,
  config: Awaited<ReturnType<typeof getSystemConfig>>
): Promise<GenerateResult> {
  if (request.model === 'SeedVR2-3B') {
    return generateWithGiteeUpscale(request, config);
  }

  const baseUrl = (config.giteeBaseUrl || process.env.GITEE_BASE_URL || 'https://ai.gitee.com/').replace(/\/$/, '') + '/';

  const url = `${baseUrl}v1/images/generations`;
  
  const payload = {
    prompt: request.prompt,
    model: request.model || 'z-image-turbo',
    ...(request.size && { size: request.size }),
    ...(request.numInferenceSteps && { num_inference_steps: request.numInferenceSteps }),
  };

  console.log('[Gitee] 开始生成:', { model: payload.model, size: request.size });

  const data = await requestGiteeWithFallback(config, (apiKey) =>
    requestGiteeJson(url, apiKey, payload)
  );
  
  if (!data.data || data.data.length === 0 || !data.data[0].b64_json) {
    throw new Error('Gitee API 返回成功但未包含图片数据');
  }

  const imageData = data.data[0];
  const mimeType = imageData.type || 'image/png';
  const base64Image = `data:${mimeType};base64,${imageData.b64_json}`;
  const cost = config.pricing?.giteeImage || 30;
  
  console.log('[Gitee] 生成完成:', { cost });

  return {
    type: 'gitee-image',
    url: base64Image,
    cost,
  };
}

// ========================================
// Gitee 超分辨率（SeedVR2）
// ========================================

async function generateWithGiteeUpscale(
  request: ZImageGenerateRequest,
  config: Awaited<ReturnType<typeof getSystemConfig>>
): Promise<GenerateResult> {
  const baseUrl = (config.giteeBaseUrl || process.env.GITEE_BASE_URL || 'https://ai.gitee.com/').replace(/\/$/, '') + '/';
  const url = `${baseUrl}v1/images/upscaling`;

  const input = request.images?.[0];
  if (!input?.data) {
    throw new Error('缺少参考图');
  }

  const outscale = request.outscale ?? 1;
  const outputFormat = request.outputFormat || 'jpg';

  const buildFormData = () => {
    const formData = new FormData();
    formData.append('model', request.model || 'SeedVR2-3B');
    formData.append('outscale', String(outscale));
    formData.append('output_format', outputFormat);

    if (isHttpUrl(input.data)) {
      formData.append('image_url', input.data);
      return formData;
    }

    const parsed = parseDataUrl(input.data);
    const mimeType = parsed?.mimeType || input.mimeType || 'application/octet-stream';
    const base64Data = parsed?.data || input.data;
    const buffer = Buffer.from(base64Data, 'base64');
    const file = new File([buffer], 'input.jpg', { type: mimeType });
    formData.append('image', file);
    return formData;
  };

  const data = await requestGiteeWithFallback(config, (apiKey) =>
    requestGiteeFormData(url, apiKey, buildFormData())
  );

  const imageData = data.data?.[0];
  if (!imageData?.url && !imageData?.b64_json) {
    throw new Error('Gitee API 返回成功但未包含图片');
  }

  const resultUrl = imageData.url
    ? imageData.url
    : `data:${imageData.type || 'image/jpeg'};base64,${imageData.b64_json}`;
  const cost = config.pricing?.giteeImage || 30;

  console.log('[Gitee] 超分完成:', { cost });

  return {
    type: 'gitee-image',
    url: resultUrl,
    cost,
  };
}

// ========================================
// ModelScope 渠道生成（同步返回图片URL）
// ========================================

async function generateWithModelScope(
  request: ZImageGenerateRequest,
  config: Awaited<ReturnType<typeof getSystemConfig>>
): Promise<GenerateResult> {
  const apiKey = config.zimageApiKey || process.env.ZIMAGE_API_KEY;
  if (!apiKey) {
    throw new Error('Z-Image API Key 未配置，请在管理后台配置 API 密钥');
  }

  const baseUrl = (config.zimageBaseUrl || process.env.ZIMAGE_BASE_URL || 'https://api-inference.modelscope.cn/').replace(/\/$/, '') + '/';

  const modelId = request.model || 'Tongyi-MAI/Z-Image-Turbo';
  const useAsync = ASYNC_MODELS.has(modelId);

  console.log('[ModelScope] 开始生成:', { model: modelId, size: request.size, async: useAsync });

  const url = `${baseUrl}v1/images/generations`;
  
  const imageUrls = request.images && request.images.length > 0
    ? await resolveImageUrls(request.images, config)
    : [];
  if (REQUIRE_REFERENCE_MODELS.has(modelId) && imageUrls.length === 0) {
    throw new Error('该模型需要参考图');
  }

  const payload = {
    model: modelId,
    prompt: request.prompt,
    ...(request.size && { size: request.size }),
    ...(request.loras && { loras: request.loras }),
    ...(imageUrls.length > 0 && { image_url: imageUrls }),
  };

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      ...(useAsync ? { 'X-ModelScope-Async-Mode': 'true' } : {}),
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorText = await response.text();
    let errMsg = errorText;
    try {
      const errJson = JSON.parse(errorText);
      errMsg = errJson.error?.message || errJson.message || errorText;
    } catch {
      // ignore
    }
    throw new Error(`ModelScope API 错误 (${response.status}): ${errMsg}`);
  }

  if (useAsync) {
    const data: ModelScopeAsyncResponse = await response.json();
    if (!data.task_id) {
      throw new Error('ModelScope API 未返回任务 ID');
    }
    const imageUrl = await pollModelScopeTask(baseUrl, apiKey, data.task_id);
    const base64Image = await downloadImageAsBase64(imageUrl);
    const cost = config.pricing?.zimageImage || 30;

    console.log('[ModelScope] 生成完成:', { cost });

    return {
      type: 'zimage-image',
      url: base64Image,
      cost,
    };
  }

  const data: ModelScopeImageResponse = await response.json();

  if (!data.images || data.images.length === 0 || !data.images[0].url) {
    throw new Error('ModelScope API 返回成功但未包含图片');
  }

  const imageUrl = data.images[0].url;
  
  // 下载图片并转换为 base64
  const base64Image = await downloadImageAsBase64(imageUrl);
  const cost = config.pricing?.zimageImage || 30;
  
  console.log('[ModelScope] 生成完成:', { cost });

  return {
    type: 'zimage-image',
    url: base64Image,
    cost,
  };
}

// ========================================
// 统一入口
// ========================================

export async function generateWithZImage(
  request: ZImageGenerateRequest
): Promise<GenerateResult> {
  const config = await getSystemConfig();
  const channel = request.channel || 'modelscope';

  if (channel === 'gitee') {
    return generateWithGitee(request, config);
  } else {
    return generateWithModelScope(request, config);
  }
}
