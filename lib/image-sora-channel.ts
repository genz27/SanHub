import { fetchWithRetry } from './http-retry';
import type { GenerateResult } from '@/types';
import {
  GENERATION_POST_RETRY_OPTIONS,
  getNextApiKey,
  imageUndiciFetch,
  pickImageUrl,
  type ImageGenerateRequest,
} from './image-generator-shared';

export async function generateWithSoraImage(
  request: ImageGenerateRequest,
  baseUrl: string,
  apiKey: string,
  apiModel: string,
  channelId: string
): Promise<GenerateResult> {
  const key = getNextApiKey(apiKey, channelId);
  const normalizedBaseUrl = baseUrl.replace(/\/$/, '');
  const url = `${normalizedBaseUrl}/v1/images/generations`;

  const normalizedApiModel = (apiModel || '').trim().toLowerCase();
  const model = !normalizedApiModel || normalizedApiModel.startsWith('sora-image')
    ? 'gpt-image-2'
    : apiModel;
  let size = '1024x1024';

  if (request.aspectRatio) {
    switch (request.aspectRatio) {
      case '16:9':
        size = '1536x1024';
        break;
      case '9:16':
        size = '1024x1536';
        break;
      case '1:1':
      default:
        size = '1024x1024';
        break;
    }
  }

  const payload: Record<string, unknown> = {
    prompt: request.prompt,
    model,
    size,
    n: 1,
    response_format: 'url',
  };

  // 添加参考图（垫图）- 使用 input_image 参数传递 base64
  if (request.images && request.images.length > 0) {
    const img = request.images[0];
    // API 支持带 data:image/...;base64, 前缀的格式
    payload.input_image = img.data;
  }

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
    throw new Error(`Sora API 错误 (${response.status}): ${errorText}`);
  }

  const data: any = await response.json();

  // OpenAI 格式响应: { data: [{ url: '...' }] }
  const imageData = data.data?.[0];
  const remoteImageUrl = pickImageUrl(imageData);
  if (!remoteImageUrl && !imageData?.b64_json) {
    throw new Error('API 返回成功但未包含图片');
  }

  const resultUrl = remoteImageUrl || `data:image/png;base64,${imageData.b64_json}`;
  return {
    type: 'sora-image',
    url: resultUrl,
    cost: 0,
  };
}
