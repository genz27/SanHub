import { fetchWithRetry } from './http-retry';
import { loadUndici } from './undici-http';
import type { GenerateResult } from '@/types';
import {
  GENERATION_POST_RETRY_OPTIONS,
  getNextApiKey,
  imageUndiciFetch,
  parseDataUrl,
  pickImageUrl,
  type ImageGenerateRequest,
} from './image-generator-shared';

export async function generateWithGitee(
  request: ImageGenerateRequest,
  baseUrl: string,
  apiKey: string,
  apiModel: string,
  channelId: string,
  size?: string
): Promise<GenerateResult> {
  const key = getNextApiKey(apiKey, channelId);
  const normalizedBaseUrl = baseUrl.replace(/\/$/, '') + '/';

  // 特殊模型处理
  if (apiModel === 'SeedVR2-3B') {
    return generateWithGiteeUpscale(request, normalizedBaseUrl, key, apiModel);
  }
  if (apiModel === 'RMBG-2.0') {
    return generateWithGiteeMatting(request, normalizedBaseUrl, key, apiModel);
  }

  const url = `${normalizedBaseUrl}v1/images/generations`;
  const payload = {
    prompt: request.prompt,
    model: apiModel,
    ...(size && { size }),
  };

  const response = await fetchWithRetry(imageUndiciFetch, url, () => ({
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${key}`,
      'Content-Type': 'application/json',
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
    throw new Error(`Gitee API 错误 (${response.status}): ${errorText}`);
  }

  const data: any = await response.json();
  const imageData = data.data?.[0];
  const remoteImageUrl = pickImageUrl(imageData);
  if (!remoteImageUrl && !imageData?.b64_json) {
    throw new Error('API 返回成功但未包含图片');
  }

  const mimeType = imageData.type || 'image/png';
  return {
    type: 'gitee-image',
    url: remoteImageUrl || `data:${mimeType};base64,${imageData.b64_json}`,
    cost: 0,
  };
}

async function generateWithGiteeUpscale(
  request: ImageGenerateRequest,
  baseUrl: string,
  apiKey: string,
  apiModel: string
): Promise<GenerateResult> {
  const url = `${baseUrl}v1/images/upscaling`;
  const input = request.images?.[0];
  if (!input?.data) throw new Error('缺少参考图');

  const { FormData } = await loadUndici();
  const buildFormData = () => {
    const formData = new FormData();
    formData.append('model', apiModel);
    formData.append('outscale', '1');
    formData.append('output_format', 'jpg');

    if (input.data.startsWith('http')) {
      formData.append('image_url', input.data);
    } else {
      const parsed = parseDataUrl(input.data);
      const mimeType = parsed?.mimeType || input.mimeType || 'application/octet-stream';
      const base64Data = parsed?.data || input.data;
      const buffer = Buffer.from(base64Data, 'base64');
      const blob = new Blob([buffer], { type: mimeType });
      formData.append('image', blob, 'input.jpg');
    }

    return formData;
  };

  const response = await fetchWithRetry(imageUndiciFetch, url, () => ({
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      ...(request.idempotencyKey
        ? {
            'Idempotency-Key': request.idempotencyKey,
            'X-Idempotency-Key': request.idempotencyKey,
          }
        : {}),
    },
    body: buildFormData() as any,
  }) as any, GENERATION_POST_RETRY_OPTIONS);

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Gitee API 错误 (${response.status}): ${errorText}`);
  }

  const data: any = await response.json();
  const imageData = data.data?.[0];
  const remoteImageUrl = pickImageUrl(imageData);
  if (!remoteImageUrl && !imageData?.b64_json) {
    throw new Error('API 返回成功但未包含图片');
  }

  const resultUrl = remoteImageUrl || `data:${imageData.type || 'image/jpeg'};base64,${imageData.b64_json}`;
  return { type: 'gitee-image', url: resultUrl, cost: 0 };
}

async function generateWithGiteeMatting(
  request: ImageGenerateRequest,
  baseUrl: string,
  apiKey: string,
  apiModel: string
): Promise<GenerateResult> {
  const url = `${baseUrl}v1/images/mattings`;
  const input = request.images?.[0];
  if (!input?.data) throw new Error('缺少参考图');

  const { FormData } = await loadUndici();
  const buildFormData = () => {
    const formData = new FormData();
    formData.append('model', apiModel);

    if (input.data.startsWith('http')) {
      formData.append('image_url', input.data);
    } else {
      const parsed = parseDataUrl(input.data);
      const mimeType = parsed?.mimeType || input.mimeType || 'application/octet-stream';
      const base64Data = parsed?.data || input.data;
      const buffer = Buffer.from(base64Data, 'base64');
      const blob = new Blob([buffer], { type: mimeType });
      formData.append('image', blob, 'input.webp');
    }

    return formData;
  };

  const response = await fetchWithRetry(imageUndiciFetch, url, () => ({
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'X-Failover-Enabled': 'true',
      ...(request.idempotencyKey
        ? {
            'Idempotency-Key': request.idempotencyKey,
            'X-Idempotency-Key': request.idempotencyKey,
          }
        : {}),
    },
    body: buildFormData() as any,
  }) as any, GENERATION_POST_RETRY_OPTIONS);

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Gitee API 错误 (${response.status}): ${errorText}`);
  }

  const data: any = await response.json();
  const imageData = data.data?.[0];
  const remoteImageUrl = pickImageUrl(imageData);
  if (!remoteImageUrl && !imageData?.b64_json) {
    throw new Error('API 返回成功但未包含图片');
  }

  const resultUrl = remoteImageUrl || `data:${imageData.type || 'image/png'};base64,${imageData.b64_json}`;
  return { type: 'gitee-image', url: resultUrl, cost: 0 };
}
