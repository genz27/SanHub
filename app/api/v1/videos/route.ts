import { NextRequest, NextResponse } from 'next/server';
import { createVideoTask, generateVideo, type VideoGenerationRequest, type VideoTaskResponse } from '@/lib/sora-api';
import { buildErrorResponse, extractBearerToken, isAuthorized, parseDataUrl } from '@/lib/v1';
import { processVideoPrompt } from '@/lib/prompt-processor';

export const dynamic = 'force-dynamic';

function normalizeSeconds(value: unknown): '10' | '15' | '25' | undefined {
  if (value === undefined || value === null) return undefined;
  const text = String(value).trim();
  if (text === '10') return '10';
  if (text === '15') return '15';
  if (text === '25') return '25';
  return undefined;
}

function normalizeBoolean(value: unknown): boolean | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value === 'boolean') return value;
  const text = String(value).toLowerCase();
  if (text === 'true' || text === '1') return true;
  if (text === 'false' || text === '0') return false;
  return undefined;
}

function normalizeTimestamp(value: unknown): number {
  const now = Math.floor(Date.now() / 1000);
  if (typeof value !== 'number' || Number.isNaN(value)) return now;
  if (value > 1e12) return Math.floor(value / 1000);
  return value;
}

async function fileToBase64(file: File): Promise<string> {
  const buffer = Buffer.from(await file.arrayBuffer());
  return buffer.toString('base64');
}

async function parseVideoRequest(request: NextRequest): Promise<{ request: VideoGenerationRequest; asyncMode: boolean }> {
  const contentType = request.headers.get('content-type') || '';

  if (contentType.includes('multipart/form-data')) {
    const form = await request.formData();
    const prompt = String(form.get('prompt') || '').trim();
    const model = String(form.get('model') || '').trim() || undefined;
    const seconds = normalizeSeconds(form.get('seconds'));
    const size = String(form.get('size') || '').trim() || undefined;
    const orientation = String(form.get('orientation') || '').trim() as 'landscape' | 'portrait' | undefined;
    const styleId = String(form.get('style_id') || '').trim() || undefined;
    const remixTargetId = String(form.get('remix_target_id') || '').trim() || undefined;
    const metadata = String(form.get('metadata') || '').trim() || undefined;
    const asyncMode = normalizeBoolean(form.get('async_mode')) ?? true;

    let inputImage: string | undefined;
    const inputImageField = form.get('input_image');
    if (typeof inputImageField === 'string' && inputImageField.trim()) {
      const parsed = parseDataUrl(inputImageField.trim());
      inputImage = parsed ? parsed.data : inputImageField.trim();
    }

    if (!inputImage) {
      const inputReference = form.get('input_reference');
      if (inputReference instanceof File) {
        inputImage = await fileToBase64(inputReference);
      }
    }

    return {
      request: {
        prompt,
        model: model || undefined,
        seconds,
        size,
        orientation,
        style_id: styleId || undefined,
        remix_target_id: remixTargetId || undefined,
        metadata: metadata || undefined,
        input_image: inputImage,
      },
      asyncMode,
    };
  }

  const body = await request.json();
  const prompt = String(body?.prompt || '').trim();
  const asyncMode = normalizeBoolean(body?.async_mode) ?? true;
  const inputImageRaw = typeof body?.input_image === 'string' ? body.input_image.trim() : '';
  const parsedInput = inputImageRaw ? parseDataUrl(inputImageRaw) : null;

  return {
    request: {
      prompt,
      model: typeof body?.model === 'string' ? body.model : undefined,
      seconds: normalizeSeconds(body?.seconds),
      size: typeof body?.size === 'string' ? body.size : undefined,
      orientation: typeof body?.orientation === 'string' ? body.orientation : undefined,
      style_id: typeof body?.style_id === 'string' ? body.style_id : undefined,
      remix_target_id: typeof body?.remix_target_id === 'string' ? body.remix_target_id : undefined,
      metadata: typeof body?.metadata === 'string' ? body.metadata : undefined,
      input_image: parsedInput ? parsedInput.data : inputImageRaw || undefined,
    },
    asyncMode,
  };
}

function buildSyncResponse(request: VideoGenerationRequest, result: { id: string; model: string; created: number; data: Array<{ url: string; permalink?: string; revised_prompt?: string }> }): VideoTaskResponse {
  return {
    id: result.id,
    object: 'video',
    model: request.model || result.model || '',
    status: 'completed',
    progress: 100,
    created_at: normalizeTimestamp(result.created),
    completed_at: Math.floor(Date.now() / 1000),
    seconds: request.seconds,
    size: request.size,
    url: result.data?.[0]?.url,
    permalink: result.data?.[0]?.permalink,
    revised_prompt: result.data?.[0]?.revised_prompt,
  };
}

export async function POST(request: NextRequest) {
  const token = extractBearerToken(request);
  if (!isAuthorized(token)) {
    return buildErrorResponse('Unauthorized', 401, 'authentication_error');
  }

  let parsed;
  try {
    parsed = await parseVideoRequest(request);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Invalid request body';
    return buildErrorResponse(message, 400);
  }

  if (!parsed.request.prompt) {
    return buildErrorResponse('Prompt is required', 400);
  }

  try {
    const processedRequest: VideoGenerationRequest = { ...parsed.request };
    if (processedRequest.prompt) {
      const processed = await processVideoPrompt(processedRequest.prompt);
      processedRequest.prompt = processed.processedPrompt;
    }

    if (parsed.asyncMode) {
      const task = await createVideoTask(processedRequest);
      return NextResponse.json(task, { status: 201 });
    }

    const result = await generateVideo(processedRequest);
    const response = buildSyncResponse(processedRequest, result);
    return NextResponse.json(response);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Video generation failed';
    return buildErrorResponse(message, 500, 'server_error');
  }
}
