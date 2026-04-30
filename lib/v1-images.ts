import { getImageChannels, getImageModels } from '@/lib/db';
import { fetchExternalBuffer } from '@/lib/safe-fetch';
import { buildDataUrl, parseDataUrl } from '@/lib/v1';
import type { ImageGenerateRequest } from '@/lib/image-generator';
import type { NextRequest } from 'next/server';

export const MAX_V1_REFERENCE_IMAGE_BYTES = 10 * 1024 * 1024;
export const MAX_V1_IMAGE_COUNT = 10;

const ASPECT_RATIO_PATTERN = /^\d+:\d+$/;
const PIXEL_SIZE_PATTERN = /^\d+x\d+$/i;

type ImageLikeObject = {
  url?: unknown;
  image_url?: unknown;
  file_data?: unknown;
  file?: unknown;
};

export type ParsedOpenAIImageRequest = {
  model?: string;
  prompt: string;
  size?: string;
  responseFormat?: string;
  imageReferences: string[];
  aspectRatio?: string;
  imageSize?: string;
  quality?: string;
};

export function normalizeImageReferences(input: unknown): string[] {
  if (input === undefined || input === null) return [];

  if (typeof input === 'string') {
    const trimmed = input.trim();
    return trimmed ? [trimmed] : [];
  }

  if (Array.isArray(input)) {
    return input.flatMap((item) => normalizeImageReferences(item));
  }

  if (typeof input !== 'object') return [];

  const value = input as ImageLikeObject;
  if (typeof value.url === 'string') {
    return normalizeImageReferences(value.url);
  }

  if (typeof value.image_url === 'string') {
    return normalizeImageReferences(value.image_url);
  }

  if (value.image_url && typeof value.image_url === 'object') {
    return normalizeImageReferences((value.image_url as ImageLikeObject).url);
  }

  if (typeof value.file_data === 'string') {
    return normalizeImageReferences(value.file_data);
  }

  if (value.file && typeof value.file === 'object') {
    const file = value.file as ImageLikeObject;
    return [
      ...normalizeImageReferences(file.file_data),
      ...normalizeImageReferences(file.url),
    ];
  }

  return [];
}

export function collectPayloadImageReferences(payload: Record<string, unknown>): string[] {
  return [
    ...normalizeImageReferences(payload.image),
    ...normalizeImageReferences(payload.images),
    ...normalizeImageReferences(payload.references),
    ...normalizeImageReferences(payload.input_image),
  ];
}

export async function fileToDataUrl(file: File): Promise<string> {
  const buffer = Buffer.from(await file.arrayBuffer());
  const mimeType = file.type || 'application/octet-stream';
  return buildDataUrl(mimeType, buffer.toString('base64'));
}

export async function loadImageSource(input: string, origin: string): Promise<{ mimeType: string; data: string; dataUrl: string }> {
  const trimmed = input.trim();
  const parsed = parseDataUrl(trimmed);
  if (parsed) {
    return {
      mimeType: parsed.mimeType,
      data: parsed.data,
      dataUrl: buildDataUrl(parsed.mimeType, parsed.data),
    };
  }

  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    const { buffer, contentType } = await fetchExternalBuffer(trimmed, {
      origin,
      allowRelative: false,
      maxBytes: MAX_V1_REFERENCE_IMAGE_BYTES,
      timeoutMs: 10000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
    });

    const data = buffer.toString('base64');
    const mimeType = (contentType || 'image/jpeg').split(';')[0]?.trim() || 'image/jpeg';
    return {
      mimeType,
      data,
      dataUrl: buildDataUrl(mimeType, data),
    };
  }

  const fallbackMime = 'image/jpeg';
  return {
    mimeType: fallbackMime,
    data: trimmed,
    dataUrl: buildDataUrl(fallbackMime, trimmed),
  };
}

export async function loadReferenceImages(
  inputs: string[],
  origin: string
): Promise<NonNullable<ImageGenerateRequest['images']>> {
  const limited = inputs.slice(0, MAX_V1_IMAGE_COUNT);
  return Promise.all(
    limited.map(async (input) => {
      const source = await loadImageSource(input, origin);
      return { mimeType: source.mimeType, data: source.dataUrl };
    })
  );
}

export async function readFormImageReferences(form: FormData): Promise<string[]> {
  const references: string[] = [];
  const fields = ['image', 'image[]', 'images', 'references', 'input_image', 'input_reference'];

  for (const field of fields) {
    const values = form.getAll(field);
    for (const value of values) {
      if (typeof value === 'string') {
        references.push(...normalizeImageReferences(value));
      } else if (value instanceof File && value.size > 0) {
        references.push(await fileToDataUrl(value));
      }
    }
  }

  return references;
}

export async function parseOpenAIImageRequest(request: NextRequest): Promise<ParsedOpenAIImageRequest> {
  const contentType = request.headers.get('content-type') || '';

  if (contentType.includes('multipart/form-data')) {
    const form = await request.formData();
    return {
      model: String(form.get('model') || '').trim() || undefined,
      prompt: String(form.get('prompt') || '').trim(),
      size: String(form.get('size') || '').trim() || undefined,
      responseFormat: String(form.get('response_format') || '').trim() || undefined,
      imageReferences: await readFormImageReferences(form),
    };
  }

  const body = await request.json();
  const payload = body && typeof body === 'object' ? body as Record<string, unknown> : {};

  // 提取 standard OpenAI 参数
  const quality = typeof payload.quality === 'string' ? payload.quality.trim() : undefined;

  // 提取 extra_body.google.image_config（Gemini/Banana 原生参数透传）
  let aspectRatio: string | undefined;
  let imageSize: string | undefined;
  const extraBody = payload.extra_body as Record<string, unknown> | undefined;
  const googleConfig = extraBody?.google as Record<string, unknown> | undefined;
  const imageConfig = googleConfig?.image_config as Record<string, unknown> | undefined;
  if (imageConfig) {
    aspectRatio = (typeof imageConfig.aspect_ratio === 'string' ? imageConfig.aspect_ratio : undefined)
      || (typeof imageConfig.aspectRatio === 'string' ? imageConfig.aspectRatio : undefined);
    imageSize = (typeof imageConfig.image_size === 'string' ? imageConfig.image_size : undefined)
      || (typeof imageConfig.imageSize === 'string' ? imageConfig.imageSize : undefined);
  }

  return {
    model: typeof payload.model === 'string' ? payload.model.trim() : undefined,
    prompt: typeof payload.prompt === 'string' ? payload.prompt.trim() : '',
    size: typeof payload.size === 'string' ? payload.size.trim() : undefined,
    responseFormat: typeof payload.response_format === 'string' ? payload.response_format.trim() : undefined,
    imageReferences: collectPayloadImageReferences(payload),
    aspectRatio,
    imageSize,
    quality,
  };
}

export function resolveImageSize(size: unknown): Pick<ImageGenerateRequest, 'size' | 'aspectRatio' | 'imageSize'> {
  if (typeof size !== 'string') return {};
  const normalized = size.trim();
  if (!normalized) return {};

  if (ASPECT_RATIO_PATTERN.test(normalized)) {
    return { aspectRatio: normalized };
  }

  if (PIXEL_SIZE_PATTERN.test(normalized)) {
    const [w, h] = normalized.split('x').map(Number);
    if (w && h) {
      const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));
      const divisor = gcd(w, h);
      // 保留原始 size 作为后备，同时提供 aspectRatio 用于分辨率映射表
      return { size: normalized, aspectRatio: `${w / divisor}:${h / divisor}` };
    }
    return {};
  }

  return { size: normalized };
}

export async function resolveImageModelId(model?: string): Promise<string | null> {
  const channels = await getImageChannels(true);
  const enabledChannelIds = new Set(channels.map((channel) => channel.id));
  const models = (await getImageModels(true)).filter((item) => enabledChannelIds.has(item.channelId));
  if (models.length === 0) return null;

  if (!model) return models[0].id;

  const normalized = model.toLowerCase();
  const byId = models.find((m) => m.id.toLowerCase() === normalized);
  if (byId) return byId.id;

  const byApiModel = models.find((m) => m.apiModel.toLowerCase() === normalized);
  if (byApiModel) return byApiModel.id;

  const byName = models.find((m) => m.name.toLowerCase() === normalized);
  if (byName) return byName.id;

  const channelById = new Map(channels.map((channel) => [channel.id, channel]));
  const apexerModels = models.filter((m) => channelById.get(m.channelId)?.type === 'apexerapi');
  if (apexerModels.length > 0) {
    if ((normalized.includes('banana') || normalized.includes('香蕉')) && (normalized.includes('pro') || normalized.includes('hd'))) {
      const bananaPro = apexerModels.find((m) => m.apiModel.toLowerCase() === 'gemini_3.0_pro_image_preview');
      if (bananaPro) return bananaPro.id;
    }
    if (normalized.includes('banana') || normalized.includes('nanobanana') || normalized.includes('香蕉')) {
      const banana2 = apexerModels.find((m) => m.apiModel.toLowerCase() === 'gemini_3.1_flash_image_preview');
      if (banana2) return banana2.id;
    }
    if (normalized.includes('gpt-image')) {
      const gptImage = apexerModels.find((m) => m.apiModel.toLowerCase() === 'gpt-image-2');
      if (gptImage) return gptImage.id;
    }
  }

  const aliases = ['gpt-image', 'gpt-image-1', 'gpt-image-2', 'image', 'sora-image'];
  if (!aliases.some((alias) => normalized.includes(alias))) {
    return null;
  }

  const apexerModel = models.find((m) => channelById.get(m.channelId)?.type === 'apexerapi');
  if (apexerModel) return apexerModel.id;

  const openAIModel = models.find((m) => channelById.get(m.channelId)?.type === 'openai-compatible');
  if (openAIModel) return openAIModel.id;

  const soraModel = models.find((m) => channelById.get(m.channelId)?.type === 'sora');
  return soraModel?.id || models[0].id;
}

export function buildOpenAIImageData(url: string, responseFormat?: unknown): Record<string, string> {
  const format = typeof responseFormat === 'string' ? responseFormat : 'url';
  const parsed = parseDataUrl(url);

  if (format === 'b64_json' && parsed) {
    return { b64_json: parsed.data };
  }

  return { url };
}
