import { fetchWithRetry } from './http-retry';
import { isTransientError } from './polling-utils';
import type { GenerateResult } from '@/types';
import {
  GENERATION_POST_RETRY_OPTIONS,
  downloadImageAsBase64,
  getNextApiKey,
  imageUndiciFetch,
  uploadImageForApi,
  type ImageGenerateRequest,
} from './image-generator-shared';

const MODELSCOPE_ASYNC_MODELS = new Set([
  'Qwen/Qwen-Image',
  'Qwen/Qwen-Image-2512',
  'Qwen/Qwen-Image-Edit-2509',
  'Qwen/Qwen-Image-Edit-2511',
  'black-forest-labs/FLUX.2-dev',
]);

async function pollModelScopeTask(baseUrl: string, apiKey: string, taskId: string): Promise<string> {
  const interval = 5000;
  let consecutiveErrors = 0;

  while (true) {
    try {
      const response = await fetchWithRetry(imageUndiciFetch, `${baseUrl}v1/tasks/${taskId}`, () => ({
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'X-ModelScope-Task-Type': 'image_generation',
        },
      }));

      if (!response.ok) {
        throw new Error(
          response.status >= 500
            ? `Server Error: ${response.status}`
            : `ModelScope 任务查询失败 (${response.status})`
        );
      }

      const data: any = await response.json();
      consecutiveErrors = 0;

      if (data.task_status === 'SUCCEED') {
        const outputUrl = data.output_images?.[0];
        if (!outputUrl) throw new Error('任务完成但未返回图片');
        return outputUrl;
      }

      if (data.task_status === 'FAILED') {
        throw new Error(data.message || '任务失败');
      }
    } catch (error) {
      if (!isTransientError(error)) {
        throw error;
      }
      consecutiveErrors += 1;
      const retryDelayMs = Math.min(5000 * 2 ** (consecutiveErrors - 1), 60000);
      await new Promise(resolve => setTimeout(resolve, retryDelayMs));
      continue;
    }

    await new Promise(resolve => setTimeout(resolve, interval));
  }
}

export async function generateWithModelScope(
  request: ImageGenerateRequest,
  baseUrl: string,
  apiKey: string,
  apiModel: string,
  channelId: string,
  size?: string
): Promise<GenerateResult> {
  const key = getNextApiKey(apiKey, channelId);
  const normalizedBaseUrl = baseUrl.replace(/\/$/, '') + '/';
  const url = `${normalizedBaseUrl}v1/images/generations`;
  const useAsync = MODELSCOPE_ASYNC_MODELS.has(apiModel);

  // 上传参考图获取 URL
  const imageUrls: string[] = [];
  if (request.images && request.images.length > 0) {
    for (let i = 0; i < request.images.length; i++) {
      const img = request.images[i];
      const imgUrl = await uploadImageForApi(img.data, i);
      imageUrls.push(imgUrl);
    }
  }

  const payload: Record<string, unknown> = {
    model: apiModel,
    prompt: request.prompt,
    ...(size && { size }),
    ...(imageUrls.length > 0 && { image_url: imageUrls }),
  };

  const response = await fetchWithRetry(imageUndiciFetch, url, () => ({
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${key}`,
      'Content-Type': 'application/json',
      ...(useAsync ? { 'X-ModelScope-Async-Mode': 'true' } : {}),
      ...(request.idempotencyKey
        ? {
            'Idempotency-Key': request.idempotencyKey,
            'X-Idempotency-Key': request.idempotencyKey,
          }
        : {}),
    },
    body: JSON.stringify(payload),
  }), GENERATION_POST_RETRY_OPTIONS);

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`ModelScope API 错误 (${response.status}): ${errorText}`);
  }

  if (useAsync) {
    const data: any = await response.json();
    if (!data.task_id) throw new Error('未返回任务 ID');
    const imageUrl = await pollModelScopeTask(normalizedBaseUrl, key, data.task_id);
    const base64Image = await downloadImageAsBase64(imageUrl);
    return { type: 'zimage-image', url: base64Image, cost: 0 };
  }

  const data: any = await response.json();
  if (!data.images?.[0]?.url) {
    throw new Error('API 返回成功但未包含图片');
  }

  const base64Image = await downloadImageAsBase64(data.images[0].url);
  return { type: 'zimage-image', url: base64Image, cost: 0 };
}
