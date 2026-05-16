/**
 * 统一图像生成器
 * 根据渠道类型动态选择请求方式
 */

import { fetch as undiciFetch, Agent } from 'undici';
import { getImageModelWithChannel } from './db';
import { uploadToPicUI } from './picui';
import { fetchWithRetry } from './http-retry';
import { isTransientError } from './polling-utils';
import type { GenerateResult } from '@/types';

export interface ImageGenerateRequest {
  modelId: string;
  prompt: string;
  size?: string;
  aspectRatio?: string;
  imageSize?: string;
  quality?: string;
  images?: Array<{ mimeType: string; data: string }>;
  idempotencyKey?: string;
}

// Key 轮询索引
const keyIndexMap = new Map<string, number>();

function getNextApiKey(keys: string, channelId: string): string {
  const keyList = keys.split(',').map(k => k.trim()).filter(k => k);
  if (keyList.length === 0) {
    throw new Error('API Key 未配置');
  }
  const currentIndex = keyIndexMap.get(channelId) || 0;
  const key = keyList[currentIndex % keyList.length];
  keyIndexMap.set(channelId, currentIndex + 1);
  return key;
}

// 下载图片并转换为 base64
async function downloadImageAsBase64(imageUrl: string): Promise<string> {
  const response = await fetchWithRetry(undiciFetch, imageUrl, () => ({ dispatcher: imageAgent }));
  if (!response.ok) {
    throw new Error(`下载图片失败 (${response.status})`);
  }
  const arrayBuffer = await response.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  const base64 = buffer.toString('base64');
  const contentType = response.headers.get('content-type') || 'image/jpeg';
  return `data:${contentType};base64,${base64}`;
}

// 上传图片到图床获取 URL
async function uploadImageForApi(
  imageData: string,
  index: number
): Promise<string> {
  const filename = `input_${Date.now()}_${index}.jpg`;
  const url = await uploadToPicUI(imageData, filename, { preferDirectS3Url: true });
  if (!url) {
    throw new Error('参考图上传失败，请检查默认图床桶配置');
  }
  return url;
}

export type ResolutionMap = Record<string, string | Record<string, string>>;

export type ResolvedImageTarget = {
  model: string;
  size?: string;
  usedModelFromMapping: boolean;
};

const PIXEL_SIZE_PATTERN = /^\d+[x×]\d+$/i;
const ASPECT_RATIO_PATTERN = /^\d+:\d+$/;

const isSizeValue = (value: string): boolean =>
  PIXEL_SIZE_PATTERN.test(value) || ASPECT_RATIO_PATTERN.test(value);

const GENERATION_POST_RETRY_OPTIONS = { attempts: 1 };
const IMAGE_REQUEST_TIMEOUT_MS = 5 * 60 * 1000;

const imageAgent = new Agent({
  bodyTimeout: 0,
  headersTimeout: IMAGE_REQUEST_TIMEOUT_MS,
  keepAliveTimeout: IMAGE_REQUEST_TIMEOUT_MS,
  keepAliveMaxTimeout: IMAGE_REQUEST_TIMEOUT_MS,
  pipelining: 0,
  connections: 30,
  connect: {
    timeout: IMAGE_REQUEST_TIMEOUT_MS,
  },
});

const IMAGE_URL_KEYS = [
  'url',
  'preview_url',
  'previewUrl',
  'image_url',
  'imageUrl',
  'output_url',
  'outputUrl',
  'fileUri',
  'file_uri',
];

function isUsableImageUrl(value: unknown): boolean {
  if (typeof value !== 'string') return false;
  const trimmed = value.trim();
  return (
    trimmed.startsWith('http://') ||
    trimmed.startsWith('https://') ||
    trimmed.startsWith('data:image/')
  );
}

function pickImageUrlFromString(value: string, depth: number): string | undefined {
  const trimmed = value.trim();
  if (!trimmed) return undefined;

  if (isUsableImageUrl(trimmed)) {
    return trimmed;
  }

  if ((trimmed.startsWith('{') && trimmed.endsWith('}')) || (trimmed.startsWith('[') && trimmed.endsWith(']'))) {
    try {
      const parsed = JSON.parse(trimmed);
      const nested = pickImageUrl(parsed, depth + 1);
      if (nested) return nested;
    } catch {
      // Continue with pattern extraction below.
    }
  }

  const keyedUrlMatch = trimmed.match(
    /"(?:url|preview_url|previewUrl|image_url|imageUrl|output_url|outputUrl|fileUri|file_uri)"\s*:\s*"([^"]+)"/i
  );
  if (keyedUrlMatch && isUsableImageUrl(keyedUrlMatch[1])) {
    return keyedUrlMatch[1].trim();
  }

  const dataUrlMatch = trimmed.match(/data:image\/[^;]+;base64,[A-Za-z0-9+/=]+/);
  if (dataUrlMatch) {
    return dataUrlMatch[0];
  }

  const directUrlMatch = trimmed.match(/https?:\/\/[^\s"'<>\])`]+/);
  if (directUrlMatch && isUsableImageUrl(directUrlMatch[0])) {
    return directUrlMatch[0].trim();
  }

  return undefined;
}

function pickImageUrl(value: unknown, depth = 0): string | undefined {
  if (typeof value === 'string') return pickImageUrlFromString(value, depth);
  if (!value || typeof value !== 'object' || depth > 6) return undefined;

  if (Array.isArray(value)) {
    for (const item of value) {
      const nested = pickImageUrl(item, depth + 1);
      if (nested) return nested;
    }
    return undefined;
  }

  const record = value as Record<string, unknown>;
  for (const key of IMAGE_URL_KEYS) {
    const candidate = record[key];
    if (typeof candidate === 'string' && isUsableImageUrl(candidate)) {
      return candidate.trim();
    }
  }

  const priorityNestedKeys = [
    'inlineData',
    'inline_data',
    'fileData',
    'file_data',
    'image',
    'images',
    'output',
    'outputs',
    'result',
    'results',
    'data',
    'parts',
    'content',
  ];

  for (const key of priorityNestedKeys) {
    const nested = pickImageUrl(record[key], depth + 1);
    if (nested) return nested;
  }

  for (const [key, candidate] of Object.entries(record)) {
    if (/url|uri/i.test(key) && typeof candidate === 'string' && isUsableImageUrl(candidate)) {
      return candidate.trim();
    }
  }

  for (const candidate of Object.values(record)) {
    const nested = pickImageUrl(candidate, depth + 1);
    if (nested) return nested;
  }

  return undefined;
}

function normalizeImageDataUrl(data: unknown, mimeType: unknown): string | undefined {
  if (typeof data !== 'string') return undefined;
  const trimmed = data.trim();
  if (!trimmed) return undefined;
  if (trimmed.startsWith('data:image/')) return trimmed;

  const mime = typeof mimeType === 'string' && mimeType.trim()
    ? mimeType.trim()
    : 'image/png';
  return `data:${mime};base64,${trimmed.replace(/^data:[^;]+;base64,/, '')}`;
}

function pickImageDataUrl(value: unknown, depth = 0): string | undefined {
  if (!value || typeof value !== 'object' || depth > 6) return undefined;

  if (Array.isArray(value)) {
    for (const item of value) {
      const nested = pickImageDataUrl(item, depth + 1);
      if (nested) return nested;
    }
    return undefined;
  }

  const record = value as Record<string, unknown>;
  const inlineData = record.inlineData || record.inline_data;
  if (inlineData && typeof inlineData === 'object') {
    const inline = inlineData as Record<string, unknown>;
    const dataUrl = normalizeImageDataUrl(
      inline.data,
      inline.mimeType || inline.mime_type || inline.type
    );
    if (dataUrl) return dataUrl;
  }

  const recordMime = record.mimeType || record.mime_type || record.type;
  if (typeof record.b64_json === 'string') {
    const dataUrl = normalizeImageDataUrl(record.b64_json, recordMime);
    if (dataUrl) return dataUrl;
  }

  if (recordMime && typeof record.data === 'string') {
    const dataUrl = normalizeImageDataUrl(record.data, recordMime);
    if (dataUrl) return dataUrl;
  }

  const priorityNestedKeys = [
    'data',
    'candidates',
    'choices',
    'parts',
    'content',
    'message',
    'output',
    'outputs',
    'result',
    'results',
    'image',
    'images',
  ];

  for (const key of priorityNestedKeys) {
    const nested = pickImageDataUrl(record[key], depth + 1);
    if (nested) return nested;
  }

  for (const candidate of Object.values(record)) {
    const nested = pickImageDataUrl(candidate, depth + 1);
    if (nested) return nested;
  }

  return undefined;
}

function pickGeneratedImage(data: unknown, preferred?: unknown): string | undefined {
  return (
    pickImageUrl(preferred) ||
    pickImageUrl(data) ||
    pickImageDataUrl(preferred) ||
    pickImageDataUrl(data)
  );
}

function summarizeImageResponse(value: unknown): string {
  const seen = new WeakSet<object>();
  const summarize = (item: unknown, depth = 0): unknown => {
    if (depth > 6) return Array.isArray(item) ? `[array:${item.length}]` : typeof item;
    if (typeof item === 'string') {
      if (item.startsWith('data:image/')) return `data-url(${item.length})`;
      return item.length > 120 ? `string(${item.length})` : item;
    }
    if (!item || typeof item !== 'object') return item;
    if (seen.has(item)) return '[circular]';
    seen.add(item);
    if (Array.isArray(item)) {
      return item.slice(0, 3).map((entry) => summarize(entry, depth + 1));
    }
    const output: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(item as Record<string, unknown>)) {
      output[key] = key === 'data' || key === 'b64_json'
        ? (typeof val === 'string' ? `string(${val.length})` : summarize(val, depth + 1))
        : summarize(val, depth + 1);
    }
    return output;
  };

  try {
    return JSON.stringify(summarize(value));
  } catch {
    return String(value);
  }
}

function upstreamErrorMessage(data: unknown): string | undefined {
  if (!data || typeof data !== 'object') return undefined;
  const record = data as Record<string, unknown>;
  const error = record.error;
  if (typeof error === 'string') return error;
  if (error && typeof error === 'object') {
    const err = error as Record<string, unknown>;
    if (typeof err.message === 'string') return err.message;
    if (typeof err.detail === 'string') return err.detail;
  }
  if (typeof record.message === 'string' && !pickGeneratedImage(data)) return record.message;
  if (typeof record.detail === 'string' && !pickGeneratedImage(data)) return record.detail;
  return undefined;
}

function missingImageDiagnostic(data: unknown): string | undefined {
  if (!data || typeof data !== 'object') return undefined;
  const record = data as Record<string, unknown>;
  const candidates = record.candidates;
  if (!Array.isArray(candidates) || candidates.length === 0) return undefined;
  const first = candidates[0] as Record<string, unknown>;
  const content = first.content as Record<string, unknown> | undefined;
  const parts = content?.parts;
  const usage = record.usageMetadata as Record<string, unknown> | undefined;
  const candidateTokens = Number(usage?.candidatesTokenCount ?? usage?.candidatesTokensCount ?? NaN);
  if (Array.isArray(parts) && parts.length === 0 && first.finishReason === 'STOP' && candidateTokens === 0) {
    return 'Gemini 已接收 prompt 但没有生成候选内容，通常是模型名不是当前图像生成模型，或 generationConfig 没有触发 image 输出';
  }
  return undefined;
}

function throwMissingImage(data: unknown): never {
  const upstreamError = upstreamErrorMessage(data);
  if (upstreamError) {
    throw new Error(`API 返回错误: ${upstreamError}`);
  }
  const diagnostic = missingImageDiagnostic(data);
  throw new Error(`API 返回成功但未包含图片${diagnostic ? `（${diagnostic}）` : ''}，响应结构: ${summarizeImageResponse(data)}`);
}

function buildOpenAIImageInput(
  images: ImageGenerateRequest['images']
): string | string[] | undefined {
  const refs = (images || [])
    .map((image) => image.data)
    .filter((data): data is string => Boolean(data));

  if (refs.length === 0) return undefined;
  return refs.length === 1 ? refs[0] : refs;
}

function isGoogleGeminiNativeBaseUrl(baseUrl: string): boolean {
  return baseUrl.toLowerCase().includes('generativelanguage.googleapis.com');
}

function isGeminiCompatibleImageModel(model: string): boolean {
  const lower = model.toLowerCase();
  return lower.includes('gemini') || lower.includes('banana') || lower.includes('nano-banana');
}

function normalizeGeminiNativeModel(apiModel: string, baseUrl: string): string {
  const model = apiModel.trim();
  const lower = model.toLowerCase();
  const isGoogleNative = isGoogleGeminiNativeBaseUrl(baseUrl);

  if (!isGoogleNative) {
    if (/^gemini-3\.0-pro-image-(square|landscape|portrait|four-three|three-four)(-2k|-4k)?$/.test(lower)) {
      return 'gemini_3.0_pro_image_preview';
    }
    return model;
  }

  if (/^gemini-3\.0-pro-image-(square|landscape|portrait|four-three|three-four)(-2k|-4k)?$/.test(lower)) {
    return 'gemini-3-pro-image-preview';
  }

  const aliases: Record<string, string> = {
    'gemini_3_pro_image_preview': 'gemini-3-pro-image-preview',
    'gemini_3.0_pro_image_preview': 'gemini-3-pro-image-preview',
    'gemini-3.0-pro-image-preview': 'gemini-3-pro-image-preview',
    'nano-banana-pro': 'gemini-3-pro-image-preview',
    'banana-pro': 'gemini-3-pro-image-preview',
    'gemini_3.1_flash_image_preview': 'gemini-3.1-flash-image-preview',
    'nano-banana-2': 'gemini-3.1-flash-image-preview',
    'banana2': 'gemini-3.1-flash-image-preview',
    'banana-2': 'gemini-3.1-flash-image-preview',
  };

  return aliases[lower] || model;
}

function inferGeminiImageSize(size?: string): string | undefined {
  if (!size) return undefined;
  const normalized = size.trim().replace(/×/g, 'x');
  if (/^(512|1K|2K|4K)$/i.test(normalized)) return normalized.toUpperCase();
  const match = normalized.match(/^(\d+)x(\d+)$/i);
  if (!match) return undefined;
  const maxSide = Math.max(Number(match[1]), Number(match[2]));
  if (maxSide >= 3000) return '4K';
  if (maxSide >= 1500) return '2K';
  if (maxSide <= 768) return '512';
  return '1K';
}

export function resolveImageTarget(
  apiModel: string,
  resolutions: ResolutionMap | undefined,
  aspectRatio?: string,
  imageSize?: string
): ResolvedImageTarget {
  let resolvedModel = apiModel;
  let resolvedSize: string | undefined;
  let usedModelFromMapping = false;

  const applyValue = (value: string | undefined) => {
    if (!value) return;
    if (isSizeValue(value)) {
      resolvedSize = value;
    } else {
      resolvedModel = value;
      usedModelFromMapping = true;
    }
  };

  if (resolutions && aspectRatio) {
    const ratioConfig = resolutions[aspectRatio];
    if (typeof ratioConfig === 'string') {
      applyValue(ratioConfig);
    } else if (ratioConfig && typeof ratioConfig === 'object' && imageSize) {
      applyValue((ratioConfig as Record<string, string>)[imageSize]);
    }
  }

  if (resolutions && imageSize) {
    const sizeConfig = resolutions[imageSize];
    if (typeof sizeConfig === 'string') {
      applyValue(sizeConfig);
    } else if (sizeConfig && typeof sizeConfig === 'object' && aspectRatio) {
      applyValue((sizeConfig as Record<string, string>)[aspectRatio]);
    }
  }

  return { model: resolvedModel, size: resolvedSize, usedModelFromMapping };
}

// ========================================
// OpenAI Compatible API
// ========================================

async function generateWithOpenAI(
  request: ImageGenerateRequest,
  baseUrl: string,
  apiKey: string,
  target: ResolvedImageTarget,
  channelId: string
): Promise<GenerateResult> {
  const key = getNextApiKey(apiKey, channelId);
  const url = `${baseUrl.replace(/\/$/, '')}/v1/images/generations`;
  const isGeminiModel = isGeminiCompatibleImageModel(target.model);

  const payload: Record<string, unknown> = {
    model: target.model,
    prompt: request.prompt,
    n: 1,
    response_format: 'url',
  };

  // 添加尺寸参数：管理员配置的分辨率映射 > 显式 size > 硬编码兜底
  if (target.size) {
    payload.size = target.size;
  } else if (request.size && !isGeminiModel) {
    payload.size = request.size;
  } else if (request.aspectRatio && !isGeminiModel) {
    const sizeMap: Record<string, string> = {
      '1:1': '1024x1024',
      '16:9': '1792x1024',
      '9:16': '1024x1792',
      '3:2': '1536x1024',
      '2:3': '1024x1536',
    };
    payload.size = sizeMap[request.aspectRatio] || '1024x1024';
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
  if (request.aspectRatio) {
    googleConfig.aspect_ratio = request.aspectRatio;
  }
  const compatibleImageSize = request.imageSize || (isGeminiModel ? inferGeminiImageSize(request.size) : undefined);
  if (compatibleImageSize) {
    googleConfig.image_size = compatibleImageSize;
  }
  if (typeof payload.size === 'string') {
    googleConfig.size = payload.size;
  }
  if (isGeminiModel && request.size && !compatibleImageSize && !ASPECT_RATIO_PATTERN.test(request.size)) {
    googleConfig.size = request.size.replace(/×/g, 'x');
  }
  if (Object.keys(googleConfig).length > 0) {
    payload.extra_body = { google: { image_config: googleConfig } };
  }

  const imageInput = buildOpenAIImageInput(request.images);
  if (imageInput) {
    payload.image = imageInput;
  }

  const response = await fetchWithRetry(undiciFetch, url, () => ({
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
    dispatcher: imageAgent,
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

// ========================================
// Gemini Native API
// ========================================

async function generateWithGemini(
  request: ImageGenerateRequest,
  baseUrl: string,
  apiKey: string,
  apiModel: string,
  channelId: string
): Promise<GenerateResult> {
  const key = getNextApiKey(apiKey, channelId);
  const normalizedModel = normalizeGeminiNativeModel(apiModel, baseUrl);
  const url = `${baseUrl.replace(/\/$/, '')}/v1beta/models/${normalizedModel}:generateContent?key=${key}`;

  const parts: Array<{ text?: string; inline_data?: { mime_type: string; data: string } }> = [];

  // 官方 REST 示例使用 prompt 在前，参考图在后。
  if (request.prompt) {
    parts.push({ text: request.prompt });
  }

  if (request.images && request.images.length > 0) {
    for (const img of request.images) {
      parts.push({
        inline_data: {
          mime_type: img.mimeType || 'image/jpeg',
          data: img.data.replace(/^data:[^;]+;base64,/, ''),
        },
      });
    }
  }

  const aspectRatio = request.aspectRatio || '1:1';
  const imageConfig: Record<string, unknown> = { aspectRatio };
  const responseImageConfig: Record<string, unknown> = { aspectRatio };
  const generationConfig: Record<string, unknown> = {
    responseModalities: ['TEXT', 'IMAGE'],
    imageConfig,
    responseFormat: {
      image: responseImageConfig,
    },
  };

  const imageSize = request.imageSize || inferGeminiImageSize(request.size);
  if (imageSize) {
    imageConfig.imageSize = imageSize;
    responseImageConfig.imageSize = imageSize;
  }
  if (request.size) {
    const normalizedSize = request.size.replace(/×/g, 'x');
    imageConfig.size = normalizedSize;
    responseImageConfig.size = normalizedSize;
  }

  const response = await fetchWithRetry(undiciFetch, url, () => ({
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': key,
      'Authorization': `Bearer ${key}`,
      ...(request.idempotencyKey
        ? {
            'Idempotency-Key': request.idempotencyKey,
            'X-Idempotency-Key': request.idempotencyKey,
          }
        : {}),
    },
    body: JSON.stringify({
      contents: [{ parts }],
      generationConfig,
    }),
    dispatcher: imageAgent,
  }), GENERATION_POST_RETRY_OPTIONS);

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Gemini API 错误 (${response.status}): ${errorText}`);
  }

  const data: any = await response.json();
  const generatedImages: string[] = [];
  const responseImageUrl = pickGeneratedImage(data);

  if (responseImageUrl) {
    generatedImages.push(responseImageUrl);
  }

  const responseParts = data.candidates?.[0]?.content?.parts;
  if (generatedImages.length === 0 && Array.isArray(responseParts)) {
    for (const part of responseParts) {
      const inlineData = part.inlineData || part.inline_data;
      const remoteImageUrl = pickImageUrl(part) || pickImageUrl(inlineData);
      if (remoteImageUrl) {
        generatedImages.push(remoteImageUrl);
        continue;
      }
      if (inlineData?.data) {
        const mime = inlineData.mimeType || inlineData.mime_type || 'image/png';
        generatedImages.push(`data:${mime};base64,${inlineData.data}`);
      }
    }
  }

  if (generatedImages.length === 0) {
    const textPart = data.candidates?.[0]?.content?.parts?.find((p: { text?: string }) => p.text);
    if (textPart?.text) {
      throw new Error(`生成失败: ${textPart.text}`);
    }
    throwMissingImage(data);
  }

  return {
    type: 'gemini-image',
    url: generatedImages[0],
    cost: 0,
  };
}

// ========================================
// ModelScope API
// ========================================

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
      const response = await fetchWithRetry(undiciFetch, `${baseUrl}v1/tasks/${taskId}`, () => ({
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'X-ModelScope-Task-Type': 'image_generation',
        },
        dispatcher: imageAgent,
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

async function generateWithModelScope(
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

  const response = await fetchWithRetry(undiciFetch, url, () => ({
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
    dispatcher: imageAgent,
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

// ========================================
// Gitee AI API
// ========================================

function parseDataUrl(dataUrl: string): { mimeType: string; data: string } | null {
  const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (!match) return null;
  return { mimeType: match[1], data: match[2] };
}

async function generateWithGitee(
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

  const response = await fetchWithRetry(undiciFetch, url, () => ({
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
    dispatcher: imageAgent,
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

  const response = await fetchWithRetry(undiciFetch, url, () => ({
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
    dispatcher: imageAgent,
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

  const response = await fetchWithRetry(undiciFetch, url, () => ({
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
    dispatcher: imageAgent,
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

// ========================================
// Sora API
// ========================================

// ========================================
// OpenAI Chat Completions API (for image generation)
// ========================================

async function generateWithOpenAIChat(
  request: ImageGenerateRequest,
  baseUrl: string,
  apiKey: string,
  apiModel: string,
  channelId: string
): Promise<GenerateResult> {
  const key = getNextApiKey(apiKey, channelId);
  const url = `${baseUrl.replace(/\/$/, '')}/v1/chat/completions`;

  // Build message content
  const contentParts: Array<{ type: string; text?: string; image_url?: { url: string } }> = [];

  // Add reference images first
  if (request.images && request.images.length > 0) {
    for (const img of request.images) {
      contentParts.push({
        type: 'image_url',
        image_url: { url: img.data },
      });
    }
  }

  // Add prompt text
  if (request.prompt) {
    contentParts.push({ type: 'text', text: request.prompt });
  }

  const imageConfig: Record<string, string> = {};
  if (request.aspectRatio) imageConfig.aspect_ratio = request.aspectRatio;
  if (request.imageSize) imageConfig.image_size = request.imageSize;
  if (request.size) imageConfig.size = request.size.replace(/×/g, 'x');

  const payload: Record<string, unknown> = {
    model: apiModel,
    messages: [
      {
        role: 'user',
        content: contentParts.length === 1 && contentParts[0].type === 'text'
          ? request.prompt
          : contentParts,
      },
    ],
    stream: true,
  };
  if (Object.keys(imageConfig).length > 0) {
    payload.extra_body = { google: { image_config: imageConfig } };
  }

  const response = await fetchWithRetry(undiciFetch, url, () => ({
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
    dispatcher: imageAgent,
  }), GENERATION_POST_RETRY_OPTIONS);

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`OpenAI Chat API error (${response.status}): ${errorText}`);
  }

  // Handle streaming response
  const reader = response.body?.getReader();
  if (!reader) {
    throw new Error('No response body');
  }

  const decoder = new TextDecoder();
  let fullContent = '';
  let reasoningContent = '';
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });

    // Process SSE events
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      if (!line.startsWith('data:')) continue;
      const data = line.slice(5).trim();
      if (data === '[DONE]') continue;

      try {
        const parsed = JSON.parse(data);
        const delta = parsed.choices?.[0]?.delta;
        if (typeof delta?.content === 'string') {
          fullContent += delta.content;
        } else if (Array.isArray(delta?.content)) {
          fullContent += delta.content
            .map((item: unknown) => {
              if (typeof item === 'string') return item;
              const imageUrl = pickImageUrl(item);
              if (imageUrl) return imageUrl;
              if (item && typeof item === 'object' && typeof (item as { text?: unknown }).text === 'string') {
                return (item as { text: string }).text;
              }
              return '';
            })
            .join('');
        }
        if (delta?.reasoning_content) {
          reasoningContent += delta.reasoning_content;
        }
      } catch {
        // Ignore parse errors for individual chunks
      }
    }
  }

  // Use content first, fallback to reasoning_content
  const responseText = fullContent || reasoningContent;

  if (!responseText) {
    throw new Error('API returned success but no content');
  }

  // Parse response content - extract URL from various formats
  let resultUrl: string | undefined;

  // 1. HTML video/img tags: <video src='...'> or <img src='...'>
  const htmlSrcMatch = responseText.match(/<(?:video|img)[^>]*\ssrc=['"]([^'"]+)['"]/i);
  if (htmlSrcMatch) {
    resultUrl = htmlSrcMatch[1];
  }

  // 2. Markdown image: ![...](URL) or ![...](data:image/...)
  if (!resultUrl) {
    const mdImageMatch = responseText.match(/!\[[^\]]*\]\(([^)]+)\)/);
    if (mdImageMatch) {
      resultUrl = mdImageMatch[1];
    }
  }

  // 3. JSON format: { "url": "..." } or { "preview_url": "..." }
  if (!resultUrl) {
    try {
      const parsed = JSON.parse(responseText);
      resultUrl = pickImageUrl(parsed);
    } catch {
      // Not JSON, continue
    }
  }

  // 4. Direct URL in text
  if (!resultUrl) {
    const urlMatch = responseText.match(/https?:\/\/[^\s"'<>\])`]+/);
    if (urlMatch) {
      resultUrl = urlMatch[0];
    }
  }

  // 5. Direct data URL
  if (!resultUrl && responseText.includes('data:image/')) {
    const dataUrlMatch = responseText.match(/data:image\/[^;]+;base64,[A-Za-z0-9+/=]+/);
    if (dataUrlMatch) {
      resultUrl = dataUrlMatch[0];
    }
  }

  if (!resultUrl) {
    // Check if response contains error message from upstream
    const errorPatterns = [
      /生成失败[：:]\s*(.+)/,
      /❌\s*(.+)/,
      /error[：:]\s*(.+)/i,
      /failed[：:]\s*(.+)/i,
    ];
    for (const pattern of errorPatterns) {
      const match = responseText.match(pattern);
      if (match) {
        throw new Error(match[1].trim());
      }
    }
    throw new Error(`Cannot parse response: ${responseText.substring(0, 200)}`);
  }

  return {
    type: 'gemini-image',
    url: resultUrl,
    cost: 0,
  };
}

// ========================================
// Sora API
// ========================================

async function generateWithSora(
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

  const response = await fetchWithRetry(undiciFetch, url, () => ({
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
    dispatcher: imageAgent,
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

// ========================================
// 统一入口
// ========================================

export async function generateImage(request: ImageGenerateRequest): Promise<GenerateResult> {
  const modelConfig = await getImageModelWithChannel(request.modelId);
  if (!modelConfig) {
    throw new Error('模型不存在或未配置');
  }

  const { model, channel, effectiveBaseUrl, effectiveApiKey } = modelConfig;

  if (!model.enabled) {
    throw new Error('模型已禁用');
  }
  if (!channel.enabled) {
    throw new Error('渠道已禁用');
  }
  if (!effectiveBaseUrl) {
    throw new Error('未配置 Base URL');
  }
  if (!effectiveApiKey) {
    throw new Error('未配置 API Key');
  }

  const resolvedTarget = resolveImageTarget(
    model.apiModel,
    model.resolutions as ResolutionMap | undefined,
    request.aspectRatio,
    request.imageSize
  );

  let result: GenerateResult;

  switch (channel.type) {
    case 'apexerapi':
    case 'openai-compatible':
      result = await generateWithOpenAI(
        request,
        effectiveBaseUrl,
        effectiveApiKey,
        resolvedTarget,
        channel.id
      );
      break;

    case 'openai-chat':
      result = await generateWithOpenAIChat(
        request,
        effectiveBaseUrl,
        effectiveApiKey,
        resolvedTarget.model,
        channel.id
      );
      break;

    case 'gemini':
      result = isGoogleGeminiNativeBaseUrl(effectiveBaseUrl)
        ? await generateWithGemini(
            request,
            effectiveBaseUrl,
            effectiveApiKey,
            resolvedTarget.model,
            channel.id
          )
        : await generateWithOpenAI(
            request,
            effectiveBaseUrl,
            effectiveApiKey,
            resolvedTarget,
            channel.id
          );
      break;

    case 'modelscope':
      result = await generateWithModelScope(
        request,
        effectiveBaseUrl,
        effectiveApiKey,
        model.apiModel,
        channel.id,
        resolvedTarget.size
      );
      break;

    case 'gitee':
      result = await generateWithGitee(
        request,
        effectiveBaseUrl,
        effectiveApiKey,
        model.apiModel,
        channel.id,
        resolvedTarget.size
      );
      break;

    case 'sora':
      result = await generateWithSora(
        request,
        effectiveBaseUrl,
        effectiveApiKey,
        model.apiModel,
        channel.id
      );
      break;

    default:
      throw new Error(`不支持的渠道类型: ${channel.type}`);
  }

  // 设置实际成本
  result.cost = model.costPerGeneration;

  return result;
}
