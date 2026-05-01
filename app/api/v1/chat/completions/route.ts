import { NextRequest, NextResponse } from 'next/server';
import { generateWithSora } from '@/lib/sora';
import { generateImage, type ImageGenerateRequest } from '@/lib/image-generator';
import { saveMediaAsync } from '@/lib/media-storage';
import { getSystemConfig, getVideoChannel, getVideoChannels } from '@/lib/db';
import { fetchWithRetry } from '@/lib/http-retry';
import { generateId } from '@/lib/utils';
import {
  buildErrorResponse,
  extractBearerToken,
  isAuthorized,
} from '@/lib/v1';
import {
  collectPayloadImageReferences,
  loadImageSource,
  loadReferenceImages,
  normalizeImageReferences,
  resolveImageModelId,
  resolveImageSize,
} from '@/lib/v1-images';
import { processVideoPrompt } from '@/lib/prompt-processor';
import { assertPromptsAllowed } from '@/lib/prompt-blocklist';

export const dynamic = 'force-dynamic';
export const maxDuration = 600;

const OPENAI_CHAT_VIDEO_CHANNEL_TYPES = new Set(['apexerapi', 'sora', 'openai-compatible', 'flow2api']);

type MediaType = 'image' | 'video';

type ChatContentPart =
  | { type: 'text'; text?: string }
  | { type: 'image_url'; image_url?: string | { url?: string } }
  | { type: 'input_image'; image_url?: string | { url?: string }; file_data?: string }
  | { type: 'file'; file?: { file_data?: string; url?: string } };

type ChatMessage = {
  role: string;
  content: string | ChatContentPart[];
};

function isLikelyVideoModel(model: string): boolean {
  const value = model.toLowerCase();
  if (value.includes('image')) return false;
  if (value === 'sora') return true;
  const markers = ['sora2', 'sora-2', 'video', 'landscape', 'portrait', '10s', '15s', '20s', '25s'];
  return markers.some((marker) => value.includes(marker));
}

function shouldUseOpenAiStream(body: Record<string, unknown>, model: string, streamEnabled: boolean): boolean {
  if (!streamEnabled) return false;
  if (body.openai_stream === true) return true;
  if (typeof body.stream_mode === 'string' && body.stream_mode.toLowerCase() === 'openai') return true;
  return false;
}

function requestIdempotencyKey(request: NextRequest, fallbackPrefix: string): string {
  return (
    request.headers.get('Idempotency-Key') ||
    request.headers.get('X-Idempotency-Key') ||
    `${fallbackPrefix}-${crypto.randomUUID()}`
  );
}

function inferMediaTypeFromUrl(url: string): MediaType | null {
  const lower = url.toLowerCase();
  if (lower.startsWith('data:image/')) return 'image';
  if (lower.startsWith('data:video/')) return 'video';
  if (/\.(mp4|mov|webm|mkv)(\?|#|$)/.test(lower)) return 'video';
  if (/\.(png|jpe?g|webp|gif|bmp)(\?|#|$)/.test(lower)) return 'image';
  if (lower.includes('videos.openai.com')) return 'video';
  return null;
}

const MEDIA_URL_KEYS = [
  'url',
  'preview_url',
  'previewUrl',
  'image_url',
  'imageUrl',
  'video_url',
  'videoUrl',
  'fileUri',
  'file_uri',
];

function isUsableMediaUrl(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const trimmed = value.trim();
  return (
    trimmed.startsWith('http://') ||
    trimmed.startsWith('https://') ||
    trimmed.startsWith('data:image/') ||
    trimmed.startsWith('data:video/')
  );
}

function pickMediaUrl(value: unknown, depth = 0): string | undefined {
  if (!value || typeof value !== 'object' || depth > 6) return undefined;

  if (Array.isArray(value)) {
    for (const item of value) {
      const nested = pickMediaUrl(item, depth + 1);
      if (nested) return nested;
    }
    return undefined;
  }

  const record = value as Record<string, unknown>;
  for (const key of MEDIA_URL_KEYS) {
    if (isUsableMediaUrl(record[key])) {
      return record[key].trim();
    }
  }

  const priorityNestedKeys = [
    'inlineData',
    'inline_data',
    'fileData',
    'file_data',
    'image',
    'images',
    'video',
    'videos',
    'output',
    'outputs',
    'result',
    'results',
    'data',
    'parts',
    'content',
  ];

  for (const key of priorityNestedKeys) {
    const nested = pickMediaUrl(record[key], depth + 1);
    if (nested) return nested;
  }

  for (const [key, candidate] of Object.entries(record)) {
    if (/url|uri/i.test(key) && isUsableMediaUrl(candidate)) {
      return candidate.trim();
    }
  }

  for (const candidate of Object.values(record)) {
    if (candidate && typeof candidate === 'object') {
      const nested = pickMediaUrl(candidate, depth + 1);
      if (nested) return nested;
    }
  }

  return undefined;
}

function extractMediaFromContent(content: string): { type: MediaType; url: string } | null {
  const trimmed = content.trim();
  if (!trimmed) return null;

  try {
    const parsed = JSON.parse(trimmed);
    const url = pickMediaUrl(parsed);
    if (url) {
      const type = parsed.type === 'video' || parsed.type === 'image'
        ? parsed.type
        : inferMediaTypeFromUrl(url);
      if (type) return { type, url };
    }
  } catch {
    // ignore
  }

  const dataUrlMatch = trimmed.match(/data:(image|video)\/[^;]+;base64,[A-Za-z0-9+/=]+/);
  if (dataUrlMatch) {
    const type = dataUrlMatch[1] === 'video' ? 'video' : 'image';
    return { type, url: dataUrlMatch[0] };
  }

  const tagMatch = trimmed.match(/<(video|img)[^>]*\s(?:src|srcset)=['"]([^'"]+)['"]/i);
  if (tagMatch) {
    const type = tagMatch[1].toLowerCase() === 'video' ? 'video' : 'image';
    return { type, url: tagMatch[2] };
  }

  const mdImageMatch = trimmed.match(/!\[[^\]]*]\((https?:\/\/[^)]+)\)/i);
  if (mdImageMatch) {
    return { type: 'image', url: mdImageMatch[1] };
  }

  const urlMatch = trimmed.match(/https?:\/\/[^\s"'<>`]+/);
  if (urlMatch) {
    const inferred = inferMediaTypeFromUrl(urlMatch[0]);
    if (inferred) {
      return { type: inferred, url: urlMatch[0] };
    }
  }

  return null;
}

function extractPromptAndImages(messages: ChatMessage[]): { prompt: string; imageUrls: string[] } {
  const lastUser = [...messages].reverse().find((message) => message.role === 'user');
  if (!lastUser) return { prompt: '', imageUrls: [] };

  if (typeof lastUser.content === 'string') {
    return { prompt: lastUser.content.trim(), imageUrls: [] };
  }

  const promptParts: string[] = [];
  const imageUrls: string[] = [];

  for (const part of lastUser.content) {
    if (part.type === 'text' && part.text) {
      promptParts.push(part.text);
    }
    if (part.type !== 'text') {
      imageUrls.push(...normalizeImageReferences(part));
    }
  }

  return { prompt: promptParts.join('\n').trim(), imageUrls };
}

function normalizeIncomingVideoConfigObject(payload: Record<string, unknown>):
  | { aspect_ratio?: '16:9' | '9:16' | '1:1' | '2:3' | '3:2'; video_length?: number; resolution?: 'SD' | 'HD'; preset?: 'fun' | 'normal' | 'spicy' }
  | undefined {
  const raw =
    (payload.videoConfigObject as Record<string, unknown> | undefined) ||
    (payload.video_config as Record<string, unknown> | undefined);
  if (!raw || typeof raw !== 'object') return undefined;

  const output: {
    aspect_ratio?: '16:9' | '9:16' | '1:1' | '2:3' | '3:2';
    video_length?: number;
    resolution?: 'SD' | 'HD';
    preset?: 'fun' | 'normal' | 'spicy';
  } = {};

  if (typeof raw.aspect_ratio === 'string' && ['16:9', '9:16', '1:1', '2:3', '3:2'].includes(raw.aspect_ratio.trim())) {
    output.aspect_ratio = raw.aspect_ratio.trim() as '16:9' | '9:16' | '1:1' | '2:3' | '3:2';
  }
  if (typeof raw.video_length === 'number' && Number.isFinite(raw.video_length)) {
    output.video_length = Math.max(5, Math.min(30, Math.floor(raw.video_length)));
  }
  if (typeof raw.resolution === 'string') {
    const resolution = raw.resolution.trim().toUpperCase();
    if (resolution === 'SD' || resolution === 'HD') {
      output.resolution = resolution;
    }
  }
  if (typeof raw.preset === 'string') {
    const preset = raw.preset.trim().toLowerCase();
    if (preset === 'fun' || preset === 'normal' || preset === 'spicy') {
      output.preset = preset;
    }
  }

  return Object.keys(output).length > 0 ? output : undefined;
}

async function resolveVideoChatConfig(channelId?: string): Promise<{ apiKey: string; baseUrl: string }> {
  if (channelId) {
    const channel = await getVideoChannel(channelId);
    if (
      channel &&
      OPENAI_CHAT_VIDEO_CHANNEL_TYPES.has(channel.type) &&
      channel.apiKey &&
      channel.baseUrl
    ) {
      return { apiKey: channel.apiKey, baseUrl: channel.baseUrl };
    }
  }

  const channels = await getVideoChannels(true);
  const candidates = channels.filter(
    (channel) =>
      OPENAI_CHAT_VIDEO_CHANNEL_TYPES.has(channel.type) &&
      channel.apiKey &&
      channel.baseUrl
  );
  if (candidates.length > 0) {
    const preferred = candidates.find((channel) => channel.type === 'openai-compatible') || candidates[0];
    return { apiKey: preferred.apiKey, baseUrl: preferred.baseUrl };
  }

  const config = await getSystemConfig();
  return { apiKey: config.soraApiKey || '', baseUrl: config.soraBaseUrl || '' };
}

function isSameOrigin(left: string, right: string): boolean {
  try {
    return new URL(left).origin === new URL(right).origin;
  } catch {
    return false;
  }
}

function buildChatResponseContent(type: 'image' | 'video', url: string): string {
  return JSON.stringify({ type, url });
}

function buildChatChunk(params: {
  id: string;
  model: string;
  created: number;
  delta: Record<string, unknown>;
  finishReason: string | null;
}) {
  return {
    id: params.id,
    object: 'chat.completion.chunk',
    created: params.created,
    model: params.model,
    choices: [
      {
        index: 0,
        delta: params.delta,
        finish_reason: params.finishReason,
      },
    ],
  };
}

export async function POST(request: NextRequest) {
  const token = extractBearerToken(request);
  if (!isAuthorized(token)) {
    return buildErrorResponse('Unauthorized', 401, 'authentication_error');
  }

  let body: any;
  try {
    body = await request.json();
  } catch {
    return buildErrorResponse('Invalid JSON body', 400);
  }

  const payload = body && typeof body === 'object' ? body : {};
  const { model, messages, stream } = payload;
  if (!model || typeof model !== 'string') {
    return buildErrorResponse('Model is required', 400);
  }
  if (!Array.isArray(messages)) {
    return buildErrorResponse('Messages must be an array', 400);
  }

  const { prompt, imageUrls: extractedImageUrls } = extractPromptAndImages(messages as ChatMessage[]);
  const imageUrls = [
    ...collectPayloadImageReferences(payload as Record<string, unknown>),
    ...extractedImageUrls,
  ];

  if (!prompt && imageUrls.length === 0) {
    return buildErrorResponse('Prompt or image input is required', 400);
  }

  try {
    await assertPromptsAllowed([prompt]);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Prompt blocked by safety policy';
    return buildErrorResponse(message, 400);
  }

  const origin = new URL(request.url).origin;
  const created = Math.floor(Date.now() / 1000);
  const completionId = `chatcmpl-${generateId()}`;
  const streamEnabled = Boolean(stream);
  const normalizedVideoConfigObject = normalizeIncomingVideoConfigObject(payload as Record<string, unknown>);
  const openAiStream = shouldUseOpenAiStream(payload, model, streamEnabled);

  if (openAiStream) {
    const requestedChannelId = typeof payload?.channel_id === 'string' ? payload.channel_id : undefined;
    const { apiKey, baseUrl } = await resolveVideoChatConfig(requestedChannelId);
    if (!apiKey || !baseUrl) {
      return buildErrorResponse('Sora API Key or Base URL is not configured', 500, 'server_error');
    }

    const upstreamUrl = `${baseUrl.replace(/\/$/, '')}/v1/chat/completions`;
    if (isSameOrigin(upstreamUrl, request.url)) {
      return buildErrorResponse('Upstream URL cannot point to itself', 500, 'server_error');
    }

    const upstreamResponse = await fetchWithRetry(fetch, upstreamUrl, () => ({
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({ ...payload, stream: true }),
    }));

    if (!upstreamResponse.ok) {
      const errorText = await upstreamResponse.text();
      return buildErrorResponse(
        `Upstream error (${upstreamResponse.status}): ${errorText}`,
        502,
        'server_error'
      );
    }

    if (!upstreamResponse.body) {
      return buildErrorResponse('Upstream response body is empty', 502, 'server_error');
    }

    const streamResponse = new ReadableStream({
      async start(controller) {
        const encoder = new TextEncoder();
        const decoder = new TextDecoder();
        const reader = upstreamResponse.body!.getReader();
        let buffer = '';
        let doneSent = false;

        const sendRaw = (payload: string) => {
          controller.enqueue(encoder.encode(`data: ${payload}\n\n`));
        };

        const sendJson = (payload: unknown) => {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));
        };

        const sendDone = () => {
          if (doneSent) return;
          doneSent = true;
          controller.enqueue(encoder.encode('data: [DONE]\n\n'));
        };

        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });

            let index = buffer.indexOf('\n\n');
            while (index !== -1) {
              const rawEvent = buffer.slice(0, index);
              buffer = buffer.slice(index + 2);
              index = buffer.indexOf('\n\n');

              const dataLines = rawEvent
                .split('\n')
                .filter((line) => line.startsWith('data:'))
                .map((line) => line.slice(5).trim());

              if (dataLines.length === 0) continue;
              const data = dataLines.join('\n');

              if (data === '[DONE]') {
                sendDone();
                continue;
              }

              let parsed: any;
              try {
                parsed = JSON.parse(data);
              } catch {
                sendRaw(data);
                continue;
              }

              const content = parsed?.choices?.[0]?.delta?.content;
              if (typeof content === 'string') {
                const extracted = extractMediaFromContent(content);
                if (extracted) {
                  // 对视频链接应用视频加速代理
                  if (extracted.type === 'video') {
                    try {
                      const { applyVideoProxy } = await import('@/lib/sora-api');
                      extracted.url = await applyVideoProxy(extracted.url);
                    } catch (e) {
                      // 忽略代理失败，使用原始 URL
                    }
                  }
                  parsed.choices[0].delta.content = JSON.stringify(extracted);
                }
              }

              sendJson(parsed);
            }
          }
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Upstream stream failed';
          sendJson({ error: { message, type: 'server_error' } });
        } finally {
          sendDone();
          controller.close();
        }
      },
    });

    return new NextResponse(streamResponse, {
      headers: {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
        'X-Accel-Buffering': 'no',
      },
    });
  }

  if (isLikelyVideoModel(model)) {
    const referenceImage = imageUrls[0];
    const fileList: { mimeType: string; data: string }[] = [];
    if (referenceImage) {
      const imageSource = await loadImageSource(referenceImage, origin);
      fileList.push({ mimeType: imageSource.mimeType, data: imageSource.data });
    }

    let processedPrompt = prompt;
    if (processedPrompt) {
      const processed = await processVideoPrompt(processedPrompt);
      processedPrompt = processed.processedPrompt;
    }

    if (!streamEnabled) {
      try {
        const result = await generateWithSora({
          prompt: processedPrompt,
          model,
          files: fileList,
          videoConfigObject: normalizedVideoConfigObject,
          video_config: normalizedVideoConfigObject,
        });
        const outputUrl = await saveMediaAsync(`v1-video-${completionId}`, result.url, { publicBaseUrl: origin });
        const content = buildChatResponseContent('video', outputUrl);
        return NextResponse.json({
          id: completionId,
          object: 'chat.completion',
          created,
          model,
          choices: [
            {
              index: 0,
              message: {
                role: 'assistant',
                content,
              },
              finish_reason: 'stop',
            },
          ],
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Video generation failed';
        return buildErrorResponse(message, 500, 'server_error');
      }
    }

    const streamResponse = new ReadableStream({
      async start(controller) {
        const encoder = new TextEncoder();
        const send = (payload: unknown) => {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));
        };
        const sendDone = () => {
          controller.enqueue(encoder.encode('data: [DONE]\n\n'));
        };

        try {
          const result = await generateWithSora(
            {
              prompt: processedPrompt,
              model,
              files: fileList,
              videoConfigObject: normalizedVideoConfigObject,
              video_config: normalizedVideoConfigObject,
            },
            (progress) => {
              const chunk = buildChatChunk({
                id: completionId,
                model,
                created,
                delta: {
                  reasoning_content: {
                    stage: 'generation',
                    status: 'processing',
                    progress,
                    message: 'Processing',
                  },
                },
                finishReason: null,
              });
              send(chunk);
            }
          );

          const outputUrl = await saveMediaAsync(`v1-video-${completionId}`, result.url, { publicBaseUrl: origin });
          const content = buildChatResponseContent('video', outputUrl);
          send(
            buildChatChunk({
              id: completionId,
              model,
              created,
              delta: { content },
              finishReason: 'stop',
            })
          );
          sendDone();
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Video generation failed';
          send({ error: { message, type: 'server_error' } });
          sendDone();
        } finally {
          controller.close();
        }
      },
    });

    return new NextResponse(streamResponse, {
      headers: {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
        'X-Accel-Buffering': 'no',
      },
    });
  }

  const imageModelId = await resolveImageModelId(model);
  if (!imageModelId) {
    return buildErrorResponse('Unknown model', 400);
  }

  const imageInputs = await loadReferenceImages(imageUrls, origin);

  // 提取 extra_body.google.image_config（Gemini/Banana 原生参数透传）
  let aspectRatioFromConfig: string | undefined;
  let imageSizeFromConfig: string | undefined;
  const extraBody = (payload as Record<string, unknown>).extra_body as Record<string, unknown> | undefined;
  const googleCfg = extraBody?.google as Record<string, unknown> | undefined;
  const imageCfg = googleCfg?.image_config as Record<string, unknown> | undefined;
  if (imageCfg) {
    aspectRatioFromConfig = (typeof imageCfg.aspect_ratio === 'string' ? imageCfg.aspect_ratio : undefined)
      || (typeof imageCfg.aspectRatio === 'string' ? imageCfg.aspectRatio : undefined);
    imageSizeFromConfig = (typeof imageCfg.image_size === 'string' ? imageCfg.image_size : undefined)
      || (typeof imageCfg.imageSize === 'string' ? imageCfg.imageSize : undefined);
  }

  const imageRequest: ImageGenerateRequest = {
    modelId: imageModelId,
    prompt: prompt || '',
    quality: typeof payload.quality === 'string' ? payload.quality.trim() : undefined,
    ...resolveImageSize(payload.size),
    images: imageInputs.length > 0 ? imageInputs : undefined,
    idempotencyKey: requestIdempotencyKey(request, completionId),
  };

  if (!imageRequest.aspectRatio && aspectRatioFromConfig) {
    imageRequest.aspectRatio = aspectRatioFromConfig;
  }
  if (!imageRequest.imageSize && imageSizeFromConfig) {
    imageRequest.imageSize = imageSizeFromConfig;
  }

  if (!stream) {
    try {
      const result = await generateImage(imageRequest);
      const outputUrl = await saveMediaAsync(`v1-chat-image-${completionId}`, result.url, { publicBaseUrl: origin });
      const content = buildChatResponseContent('image', outputUrl);
      return NextResponse.json({
        id: completionId,
        object: 'chat.completion',
        created,
        model,
        choices: [
          {
            index: 0,
            message: {
              role: 'assistant',
              content,
            },
            finish_reason: 'stop',
          },
        ],
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Image generation failed';
      return buildErrorResponse(message, 500, 'server_error');
    }
  }

  const streamResponse = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      const send = (payload: unknown) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));
      };
      const sendDone = () => {
        controller.enqueue(encoder.encode('data: [DONE]\n\n'));
      };

      try {
        const result = await generateImage(imageRequest);
        const outputUrl = await saveMediaAsync(`v1-chat-image-${completionId}`, result.url, { publicBaseUrl: origin });
        const content = buildChatResponseContent('image', outputUrl);
        send(
          buildChatChunk({
            id: completionId,
            model,
            created,
            delta: { content },
            finishReason: 'stop',
          })
        );
        sendDone();
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Image generation failed';
        send({ error: { message, type: 'server_error' } });
        sendDone();
      } finally {
        controller.close();
      }
    },
  });

  return new NextResponse(streamResponse, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
