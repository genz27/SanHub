import type { ChatModel } from '@/types';
import { resolveChatCompletionsUrl } from '@/lib/chat-completions-url';

const VISION_NAME_RE = /vl|vision|gpt-4o|gpt-4\.1|gpt-5|gemini|qwen3-vl|qwen-vl|qwen2.?5-vl|claude|sonnet|grok|glm-4\.?5v|glm-4v|pixtral|llama-4|mimo/i;
const IMAGE_GEN_NAME_RE = /imagen|dall-e|dalle|flux|sdxl|stable-diffusion|image-gen|gpt-image/i;

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function firstText(...candidates: unknown[]): string {
  for (const candidate of candidates) {
    if (typeof candidate === 'number' && Number.isFinite(candidate)) {
      return String(candidate);
    }
    if (typeof candidate === 'string' && candidate.trim()) {
      return candidate.trim();
    }
  }
  return '';
}

export function visionModelScore(model: ChatModel): number {
  const label = `${model.modelId} ${model.name}`;
  if (IMAGE_GEN_NAME_RE.test(label) && !VISION_NAME_RE.test(label)) return -20;
  if (VISION_NAME_RE.test(label)) return 10;
  return 0;
}

export function rankVisionChatModels(models: ChatModel[]): ChatModel[] {
  return [...models].sort((left, right) => visionModelScore(right) - visionModelScore(left));
}

export function describeVisionError(status: number, payload: unknown): string {
  const root = asRecord(payload) || {};
  const error = asRecord(root.error);
  const message = firstText(
    error?.message,
    error?.msg,
    typeof root.error === 'string' ? root.error : '',
    root.message,
    root.msg,
    root.error_msg
  );
  const code = firstText(error?.code, root.code, status);
  const readable = mapVisionErrorCode(code) || mapVisionErrorCode(message);

  if (readable) return readable;
  if (message && !/^\d+$/.test(message)) return message;
  return status ? `识图失败（${status}）` : '识图失败';
}

function mapVisionErrorCode(code: string): string {
  switch (code) {
    case '4044':
    case '404':
    case 'model_not_found':
      return '识图接口没有命中聊天补全地址，请确认 Base URL 填到 /v1 即可';
    case '401':
    case '403':
      return '识图模型密钥无效或没有权限';
    case '413':
      return '图片太大，换一张小一点的再试';
    case '429':
      return '识图请求过于频繁，请稍后再试';
    default:
      return '';
  }
}

function isMiMoModel(model: ChatModel): boolean {
  return /xiaomimimo\.com|mimo-/i.test(`${model.apiUrl} ${model.modelId}`);
}

function usesGeminiNative(apiUrl: string): boolean {
  const url = apiUrl.toLowerCase();
  return (url.includes('generativelanguage.googleapis.com') || url.includes(':generatecontent'))
    && !url.includes('/openai/');
}

function chatCompletionEndpoints(apiUrl: string): string[] {
  return [resolveChatCompletionsUrl(apiUrl)];
}

function chatAuthHeaders(model: ChatModel): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${model.apiKey}`,
  };
  if (/xiaomimimo\.com/i.test(model.apiUrl)) {
    headers['api-key'] = model.apiKey;
  }
  return headers;
}

function parseDataUrl(dataUrl: string): { mimeType: string; data: string } {
  const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (!match) {
    throw new Error('图片数据格式错误');
  }
  return { mimeType: match[1], data: match[2] };
}

function extractOpenAIContent(payload: unknown): string {
  const root = asRecord(payload);
  const choice = Array.isArray(root?.choices) ? asRecord(root.choices[0]) : null;
  const message = asRecord(choice?.message);
  const content = message?.content;
  if (typeof content === 'string') return content.trim();
  if (Array.isArray(content)) {
    return content
      .map((part) => {
        const item = asRecord(part);
        return typeof item?.text === 'string' ? item.text : '';
      })
      .join('')
      .trim();
  }
  return '';
}

function extractGeminiContent(payload: unknown): string {
  const root = asRecord(payload);
  const candidate = Array.isArray(root?.candidates) ? asRecord(root.candidates[0]) : null;
  const content = asRecord(candidate?.content);
  const parts = Array.isArray(content?.parts) ? content.parts : [];
  return parts
    .map((part) => {
      const item = asRecord(part);
      return typeof item?.text === 'string' ? item.text : '';
    })
    .join('')
    .trim();
}

function buildOpenAIVisionPayload(model: ChatModel, dataUrl: string, instruction: string): Record<string, unknown> {
  const imagePart = {
    type: 'image_url',
    image_url: { url: dataUrl },
  };
  const textPart = { type: 'text', text: instruction };
  const payload: Record<string, unknown> = {
    model: model.modelId,
    messages: [
      {
        role: 'user',
        content: isMiMoModel(model) ? [imagePart, textPart] : [textPart, imagePart],
      },
    ],
  };

  const maxTokens = Math.min(1024, model.maxTokens || 1024);
  if (isMiMoModel(model)) {
    payload.max_completion_tokens = maxTokens;
  } else {
    payload.max_tokens = maxTokens;
  }
  return payload;
}

async function completeGeminiVision(
  model: ChatModel,
  dataUrl: string,
  instruction: string
): Promise<string> {
  const { mimeType, data } = parseDataUrl(dataUrl);
  const response = await fetch(model.apiUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${model.apiKey}`,
      'x-goog-api-key': model.apiKey,
    },
    body: JSON.stringify({
      contents: [
        {
          role: 'user',
          parts: [
            { text: instruction },
            { inline_data: { mime_type: mimeType, data } },
          ],
        },
      ],
      generationConfig: {
        maxOutputTokens: Math.min(1024, model.maxTokens || 1024),
      },
    }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(describeVisionError(response.status, payload));
  }
  const text = extractGeminiContent(payload);
  if (!text) {
    throw new Error('模型没有返回可用的提示词');
  }
  return text;
}

async function completeOpenAIVision(
  model: ChatModel,
  dataUrl: string,
  instruction: string
): Promise<string> {
  let lastError: Error | null = null;
  for (const endpoint of chatCompletionEndpoints(model.apiUrl)) {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: chatAuthHeaders(model),
      body: JSON.stringify(buildOpenAIVisionPayload(model, dataUrl, instruction)),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      lastError = new Error(describeVisionError(response.status, payload));
      continue;
    }
    const text = extractOpenAIContent(payload);
    if (!text) {
      lastError = new Error('模型没有返回可用的提示词');
      continue;
    }
    return text;
  }
  throw lastError || new Error('识图失败');
}

export async function completeVisionChat(
  model: ChatModel,
  dataUrl: string,
  instruction: string
): Promise<string> {
  if (usesGeminiNative(model.apiUrl)) {
    return completeGeminiVision(model, dataUrl, instruction);
  }
  return completeOpenAIVision(model, dataUrl, instruction);
}
