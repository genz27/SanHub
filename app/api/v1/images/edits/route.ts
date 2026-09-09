import { NextRequest, NextResponse } from 'next/server';
import type { ImageGenerateRequest } from '@/lib/image-generator';
import {
  buildErrorResponse,
  extractBearerToken,
  isAuthorized,
} from '@/lib/v1';
import {
  buildOpenAIImageData,
  loadReferenceImages,
  parseOpenAIImageRequest,
  resolveImageModelId,
  resolveImageSize,
} from '@/lib/v1-images';
import { assertPromptsAllowed } from '@/lib/prompt-blocklist';

export const dynamic = 'force-dynamic';
export const maxDuration = 600;

function requestIdempotencyKey(request: NextRequest, fallbackPrefix: string): string {
  return (
    request.headers.get('Idempotency-Key') ||
    request.headers.get('X-Idempotency-Key') ||
    `${fallbackPrefix}-${crypto.randomUUID()}`
  );
}

export async function POST(request: NextRequest) {
  const token = extractBearerToken(request);
  if (!isAuthorized(token)) {
    return buildErrorResponse('Unauthorized', 401, 'authentication_error');
  }

  const generateImagePromise = import('@/lib/image-generator').then((mod) => mod.generateImage);
  const saveMediaPromise = import('@/lib/media-storage');

  let parsed;
  try {
    parsed = await parseOpenAIImageRequest(request);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Invalid request body';
    return buildErrorResponse(message, 400);
  }

  if (parsed.imageReferences.length === 0) {
    return buildErrorResponse('Image input is required', 400);
  }

  if (!parsed.prompt) {
    return buildErrorResponse('Prompt is required', 400);
  }

  const origin = new URL(request.url).origin;
  const imageInputsPromise = loadReferenceImages(parsed.imageReferences, origin);

  let imageModelId: string | null;
  try {
    [imageModelId] = await Promise.all([
      resolveImageModelId(parsed.model),
      assertPromptsAllowed([parsed.prompt]),
    ]);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Prompt blocked by safety policy';
    return buildErrorResponse(message, 400);
  }

  if (!imageModelId) {
    return buildErrorResponse('Unknown model', 400);
  }

  try {
    const imageInputs = await imageInputsPromise;
    const imageRequest: ImageGenerateRequest = {
      modelId: imageModelId,
      prompt: parsed.prompt,
      quality: parsed.quality,
      ...resolveImageSize(parsed.size),
      images: imageInputs.length > 0 ? imageInputs : undefined,
      idempotencyKey: requestIdempotencyKey(request, 'sanhub-v1-image-edit'),
    };

    if (parsed.aspectRatio) {
      imageRequest.aspectRatio = parsed.aspectRatio;
    }
    if (parsed.imageSize) {
      imageRequest.imageSize = parsed.imageSize;
    }

    const generateImage = await generateImagePromise;
    const result = await generateImage(imageRequest);
    const { saveMediaAsync } = await saveMediaPromise;
    const outputUrl = parsed.responseFormat === 'b64_json'
      ? result.url
      : await saveMediaAsync(`v1-image-edit-${crypto.randomUUID()}`, result.url, { publicBaseUrl: origin });

    return NextResponse.json({
      created: Math.floor(Date.now() / 1000),
      data: [
        buildOpenAIImageData(outputUrl, parsed.responseFormat),
      ],
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Image edit failed';
    return buildErrorResponse(message, 500, 'server_error');
  }
}
