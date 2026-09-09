import { fetchWithRetry } from './http-retry';
import type { GenerateResult } from '@/types';
import { normalizeAspectRatio } from './image-sizing';
import {
  GENERATION_POST_RETRY_OPTIONS,
  getNextApiKey,
  imageUndiciFetch,
  pickImageUrl,
  type ImageGenerateRequest,
} from './image-generator-shared';

export async function generateWithOpenAIChat(
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
  const normalizedAspectRatio = normalizeAspectRatio(request.aspectRatio) || normalizeAspectRatio(request.size);
  if (normalizedAspectRatio) imageConfig.aspect_ratio = normalizedAspectRatio;
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
