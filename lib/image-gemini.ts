import { fetchWithRetry } from './http-retry';
import type { GenerateResult } from '@/types';
import { normalizeAspectRatio } from './image-sizing';
import {
  GENERATION_POST_RETRY_OPTIONS,
  getNextApiKey,
  imageUndiciFetch,
  inferGeminiImageSize,
  normalizeGeminiNativeModel,
  pickGeneratedImage,
  pickImageUrl,
  throwMissingImage,
  type ImageGenerateRequest,
} from './image-generator-shared';

export async function generateWithGemini(
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

  const aspectRatio = normalizeAspectRatio(request.aspectRatio) || normalizeAspectRatio(request.size) || '1:1';
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

  const response = await fetchWithRetry(imageUndiciFetch, url, () => ({
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
