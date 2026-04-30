import { NextRequest, NextResponse } from 'next/server';
import { generateImage, type ImageGenerateRequest } from '@/lib/image-generator';
import { saveMediaAsync } from '@/lib/media-storage';
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

  try {
    await assertPromptsAllowed([parsed.prompt]);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Prompt blocked by safety policy';
    return buildErrorResponse(message, 400);
  }

  const imageModelId = await resolveImageModelId(parsed.model);
  if (!imageModelId) {
    return buildErrorResponse('Unknown model', 400);
  }

  try {
    const origin = new URL(request.url).origin;
    const imageInputs = await loadReferenceImages(parsed.imageReferences, origin);
    const imageRequest: ImageGenerateRequest = {
      modelId: imageModelId,
      prompt: parsed.prompt,
      quality: parsed.quality,
      ...resolveImageSize(parsed.size),
      images: imageInputs.length > 0 ? imageInputs : undefined,
      idempotencyKey: requestIdempotencyKey(request, 'sanhub-v1-image-edit'),
    };

    if (!imageRequest.aspectRatio && parsed.aspectRatio) {
      imageRequest.aspectRatio = parsed.aspectRatio;
    }
    if (!imageRequest.imageSize && parsed.imageSize) {
      imageRequest.imageSize = parsed.imageSize;
    }

    const result = await generateImage(imageRequest);
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
