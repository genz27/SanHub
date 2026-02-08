import { NextRequest, NextResponse } from 'next/server';
import { generateWithSora } from '@/lib/sora';
import { generateImage, type ImageGenerateRequest } from '@/lib/image-generator';
import { getImageModels, getImageChannels, getSystemConfig, getVideoChannel, getVideoChannels } from '@/lib/db';
import { fetchWithRetry } from '@/lib/http-retry';
import { fetchExternalBuffer } from '@/lib/safe-fetch';
import { generateId } from '@/lib/utils';
import {
  buildDataUrl,
  buildErrorResponse,
  extractBearerToken,
  isAuthorized,
  parseDataUrl,
} from '@/lib/v1';
import { processVideoPrompt } from '@/lib/prompt-processor';
import { assertPromptsAllowed } from '@/lib/prompt-blocklist';

export const dynamic = 'force-dynamic';

const MAX_REFERENCE_IMAGE_BYTES = 10 * 1024 * 1024;
const MAX_IMAGE_COUNT = 10;

type MediaType = 'image' | 'video';

type ChatContentPart =
  | { type: 'text'; text?: string }
  | { type: 'image_url'; image_url?: { url: string } };

type ChatMessage = {
  role: string;
  content: string | ChatContentPart[];
};

function isLikelyVideoModel(model: string): boolean {
  const value = model.toLowerCase();
  if (value.includes('image')) return false;
  const markers = ['sora2', 'sora-2', 'video', 'landscape', 'portrait', '10s', '15s', '25s'];
  return markers.some((marker) => value.includes(marker));
}

function shouldUseOpenAiStream(body: Record<string, unknown>, model: string, streamEnabled: boolean): boolean {
  if (!streamEnabled) return false;
  if (body.openai_stream === true) return true;
  if (typeof body.stream_mode === 'string' && body.stream_mode.toLowerCase() === 'openai') return true;
  return model.toLowerCase() === 'sora';
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

function extractMediaFromContent(content: string): { type: MediaType; url: string } | null {
  const trimmed = content.trim();
  if (!trimmed) return null;

  try {
    const parsed = JSON.parse(trimmed);
    if (parsed && typeof parsed === 'object' && typeof parsed.url === 'string') {
      const type = parsed.type === 'video' || parsed.type === 'image'
        ? parsed.type
        : inferMediaTypeFromUrl(parsed.url);
      if (type) return { type, url: parsed.url };
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
    if (part.type === 'image_url' && part.image_url?.url) {
      imageUrls.push(part.image_url.url);
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
    output.video_length = Math.max(5, Math.min(15, Math.floor(raw.video_length)));
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

async function loadImageSource(input: string, origin: string): Promise<{ mimeType: string; data: string; dataUrl: string }> {
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
      maxBytes: MAX_REFERENCE_IMAGE_BYTES,
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

async function resolveVideoChatConfig(channelId?: string): Promise<{ apiKey: string; baseUrl: string }> {
  if (channelId) {
    const channel = await getVideoChannel(channelId);
    if (
      channel &&
      (channel.type === 'sora' || channel.type === 'openai-compatible') &&
      channel.apiKey &&
      channel.baseUrl
    ) {
      return { apiKey: channel.apiKey, baseUrl: channel.baseUrl };
    }
  }

  const channels = await getVideoChannels(true);
  const candidates = channels.filter(
    (channel) =>
      (channel.type === 'sora' || channel.type === 'openai-compatible') &&
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

async function resolveImageModelId(model: string): Promise<string | null> {
  const channels = await getImageChannels(true);
  const enabledChannelIds = new Set(channels.map((channel) => channel.id));
  const models = (await getImageModels(true)).filter((item) => enabledChannelIds.has(item.channelId));
  if (models.length === 0) return null;

  const normalized = model.toLowerCase();
  const byId = models.find((m) => m.id.toLowerCase() === normalized);
  if (byId) return byId.id;

  const byApiModel = models.find((m) => m.apiModel.toLowerCase() === normalized);
  if (byApiModel) return byApiModel.id;

  const byName = models.find((m) => m.name.toLowerCase() === normalized);
  if (byName) return byName.id;

  const aliases = ['gpt-image', 'gpt-image-1', 'image', 'sora-image'];
  if (!aliases.some((alias) => normalized.includes(alias))) {
    return null;
  }

  const channelById = new Map(channels.map((channel) => [channel.id, channel]));
  const soraModel = models.find((m) => channelById.get(m.channelId)?.type === 'sora');
  return soraModel?.id || models[0].id;
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
  const imageUrls = [...extractedImageUrls];
  if (typeof payload?.image === 'string' && payload.image.trim()) {
    imageUrls.unshift(payload.image.trim());
  }

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
        const content = buildChatResponseContent('video', result.url);
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

          const content = buildChatResponseContent('video', result.url);
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

  const limitedImages = imageUrls.slice(0, MAX_IMAGE_COUNT);
  const imageInputs = await Promise.all(
    limitedImages.map(async (url) => {
      const source = await loadImageSource(url, origin);
      return { mimeType: source.mimeType, data: source.dataUrl };
    })
  );

  const imageRequest: ImageGenerateRequest = {
    modelId: imageModelId,
    prompt: prompt || '',
    images: imageInputs.length > 0 ? imageInputs : undefined,
  };

  if (!stream) {
    try {
      const result = await generateImage(imageRequest);
      const content = buildChatResponseContent('image', result.url);
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
        const content = buildChatResponseContent('image', result.url);
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
