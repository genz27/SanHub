import { fetchWithRetry } from './http-retry';
import type { GenerateResult } from '@/types';
import {
  normalizeAspectRatio,
  normalizePixelSize,
  resolveGeminiAspectSpecificModel,
} from './image-sizing';
import type { ResolvedImageTarget } from './image-target';
import {
  GENERATION_POST_RETRY_OPTIONS,
  buildOpenAIImageInput,
  getNextApiKey,
  imageUndiciFetch,
  inferGeminiImageSize,
  isApi9GeminiCompatibleBaseUrl,
  isGeminiCompatibleImageModel,
  pickGeneratedImage,
  resolveGeminiCompatibleSize,
  throwMissingImage,
  type ImageGenerateRequest,
} from './image-generator-shared';

export async function generateWithOpenAI(
  request: ImageGenerateRequest,
  baseUrl: string,
  apiKey: string,
  target: ResolvedImageTarget,
  channelId: string
): Promise<GenerateResult> {
  const key = getNextApiKey(apiKey, channelId);
  const url = `${baseUrl.replace(/\/$/, '')}/v1/images/generations`;
  const normalizedRequest: ImageGenerateRequest = {
    ...request,
    size: normalizePixelSize(request.size) || request.size,
    aspectRatio: normalizeAspectRatio(request.aspectRatio) || normalizeAspectRatio(request.size) || request.aspectRatio,
  };
  const upstreamModel = isApi9GeminiCompatibleBaseUrl(baseUrl)
    ? resolveGeminiAspectSpecificModel(target.model, normalizedRequest, target.size)
    : target.model;
  const isGeminiModel = isGeminiCompatibleImageModel(upstreamModel);
  const compatibleGeminiSize = isGeminiModel ? resolveGeminiCompatibleSize(normalizedRequest, target.size) : undefined;

  const payload: Record<string, unknown> = {
    model: upstreamModel,
    prompt: request.prompt,
    n: 1,
    response_format: 'url',
  };

  // 添加尺寸参数：管理员配置的分辨率映射 > 显式 size > 硬编码兜底
  if (compatibleGeminiSize) {
    payload.size = compatibleGeminiSize;
  } else if (target.size) {
    payload.size = target.size;
  } else if (request.size && !isGeminiModel && !normalizeAspectRatio(request.size)) {
    payload.size = normalizePixelSize(request.size) || request.size;
  } else if (normalizedRequest.aspectRatio && !isGeminiModel) {
    const sizeMap: Record<string, string> = {
      '1:1': '1024x1024',
      '16:9': '1792x1024',
      '9:16': '1024x1792',
      '3:2': '1536x1024',
      '2:3': '1024x1536',
    };
    payload.size = sizeMap[normalizedRequest.aspectRatio] || '1024x1024';
  }

  // 统一乘号（管理员可能填了 Unicode ×）
  if (typeof payload.size === 'string') {
    payload.size = payload.size.replace(/×/g, 'x');
  }
  // quality (high / medium / low) — 部分上游代理支持
  if (request.quality) {
    payload.quality = request.quality;
  }

  const googleConfig: Record<string, string> = {};
  if (normalizedRequest.aspectRatio) {
    googleConfig.aspect_ratio = normalizedRequest.aspectRatio;
  }
  const compatibleImageSize = request.imageSize || (isGeminiModel ? inferGeminiImageSize(normalizedRequest.size) : undefined);
  if (compatibleImageSize) {
    googleConfig.image_size = compatibleImageSize;
  }
  if (typeof payload.size === 'string') {
    googleConfig.size = payload.size;
  }
  if (isGeminiModel && normalizedRequest.size && !compatibleImageSize && !normalizeAspectRatio(normalizedRequest.size)) {
    googleConfig.size = normalizePixelSize(normalizedRequest.size) || normalizedRequest.size.replace(/×/g, 'x');
  }
  if (Object.keys(googleConfig).length > 0) {
    payload.extra_body = { google: { image_config: googleConfig } };
  }

  const imageInput = buildOpenAIImageInput(request.images);
  if (imageInput) {
    payload.image = imageInput;
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
    throw new Error(`OpenAI API 错误 (${response.status}): ${errorText}`);
  }

  const data: any = await response.json();
  const imageData = data.data?.[0];

  const resultUrl = pickGeneratedImage(data, imageData);
  if (!resultUrl) throwMissingImage(data);

  return {
    type: 'gemini-image', // 统一类型
    url: resultUrl,
    cost: 0, // 由调用方设置
  };
}
