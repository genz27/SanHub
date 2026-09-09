/**
 * Shared helpers for image generation adapters.
 */

import { fetchWithRetry } from './http-retry';
import { createAgentFetch } from './undici-http';
import {
  inferImageSizeLabel,
  resolveGeminiCompatibleImageSize,
} from './image-sizing';
import { resolveImageTarget, type ResolutionMap, type ResolvedImageTarget } from './image-target';

export { resolveImageTarget };
export type { ResolutionMap, ResolvedImageTarget };

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

export function getNextApiKey(keys: string, channelId: string): string {
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
export async function downloadImageAsBase64(imageUrl: string): Promise<string> {
  const response = await fetchWithRetry(imageUndiciFetch, imageUrl);
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
export async function uploadImageForApi(
  imageData: string,
  index: number
): Promise<string> {
  const filename = `input_${Date.now()}_${index}.jpg`;
  const { uploadToPicUI } = await import('./picui');
  const url = await uploadToPicUI(imageData, filename, { preferDirectS3Url: true });
  if (!url) {
    throw new Error('参考图上传失败，请检查默认图床桶配置');
  }
  return url;
}

export const GENERATION_POST_RETRY_OPTIONS = { attempts: 1 };
const IMAGE_REQUEST_TIMEOUT_MS = 5 * 60 * 1000;

export const imageUndiciFetch = createAgentFetch('image', {
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

export function pickImageUrl(value: unknown, depth = 0): string | undefined {
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

export function pickGeneratedImage(data: unknown, preferred?: unknown): string | undefined {
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

export function throwMissingImage(data: unknown): never {
  const upstreamError = upstreamErrorMessage(data);
  if (upstreamError) {
    throw new Error(`API 返回错误: ${upstreamError}`);
  }
  const diagnostic = missingImageDiagnostic(data);
  throw new Error(`API 返回成功但未包含图片${diagnostic ? `（${diagnostic}）` : ''}，响应结构: ${summarizeImageResponse(data)}`);
}

export function buildOpenAIImageInput(
  images: ImageGenerateRequest['images']
): string | string[] | undefined {
  const refs = (images || [])
    .map((image) => image.data)
    .filter((data): data is string => Boolean(data));

  if (refs.length === 0) return undefined;
  return refs.length === 1 ? refs[0] : refs;
}

export function isGoogleGeminiNativeBaseUrl(baseUrl: string): boolean {
  return baseUrl.toLowerCase().includes('generativelanguage.googleapis.com');
}

export function isApi9GeminiCompatibleBaseUrl(baseUrl: string): boolean {
  const lower = baseUrl.toLowerCase();
  return lower.includes('api9.de');
}

export function isGeminiCompatibleImageModel(model: string): boolean {
  const lower = model.toLowerCase();
  return lower.includes('gemini') || lower.includes('banana') || lower.includes('nano-banana');
}

export function normalizeGeminiNativeModel(apiModel: string, baseUrl: string): string {
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

export function inferGeminiImageSize(size?: string): string | undefined {
  return inferImageSizeLabel(size);
}
export function resolveGeminiCompatibleSize(request: ImageGenerateRequest, targetSize?: string): string | undefined {
  return resolveGeminiCompatibleImageSize(request, targetSize);
}

export function parseDataUrl(dataUrl: string): { mimeType: string; data: string } | null {
  const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (!match) return null;
  return { mimeType: match[1], data: match[2] };
}

