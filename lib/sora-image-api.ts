import { getSoraConfig } from './sora-config';
import { fetchWithRetry, shouldUseApexerVideoContract, soraUndiciFetch } from './sora-http';
import { logError, logInfo } from './sora-logger';

export interface ImageGenerationRequest {
  prompt: string;
  model?: string;
  n?: number;
  size?: string;
  quality?: 'standard' | 'hd';
  style?: 'natural' | 'vivid';
  response_format?: 'url' | 'b64_json';
  input_image?: string;
}

export interface ImageGenerationResponse {
  created: number;
  data: Array<{
    url?: string;
    b64_json?: string;
    revised_prompt?: string;
  }>;
}

function normalizeApexerImageRequest(request: ImageGenerationRequest): ImageGenerationRequest {
  const requestedModel = String(request.model || '').trim().toLowerCase();
  const model = !requestedModel || requestedModel.startsWith('sora-image')
    ? 'gpt-image-2'
    : request.model;

  let size = request.size;
  if (!size || size === '1792x1024') {
    size = requestedModel.includes('landscape') ? '1536x1024' : size;
  }
  if (!size || size === '1024x1792') {
    size = requestedModel.includes('portrait') ? '1024x1536' : size;
  }
  if (!size) {
    size = '1024x1024';
  }

  return {
    ...request,
    model,
    size,
  };
}

export async function generateImage(request: ImageGenerationRequest): Promise<ImageGenerationResponse> {
  const { apiKey, baseUrl, channelType } = await getSoraConfig();
  const upstreamRequest = shouldUseApexerVideoContract(channelType)
    ? normalizeApexerImageRequest(request)
    : request;

  if (!apiKey) {
    throw new Error('Sora API Key 未配置，请在管理后台「视频渠道」中配置 Sora 渠道');
  }

  if (!baseUrl) {
    throw new Error('Sora Base URL 未配置');
  }

  const normalizedBaseUrl = baseUrl.replace(/\/$/, '');
  const apiUrl = `${normalizedBaseUrl}/v1/images/generations`;

  logInfo('[Sora API] Image generation request:', {
    apiUrl,
    model: upstreamRequest.model,
    prompt: upstreamRequest.prompt?.substring(0, 50),
  });

  const response = await fetchWithRetry(soraUndiciFetch, apiUrl, () => ({
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(upstreamRequest),
  }));

  const data = await response.json() as { error?: { message?: string }; message?: string };

  if (!response.ok) {
    const errorMessage = data?.error?.message || data?.message || '图片生成失败';
    logError('[Sora API] Image generation failed:', errorMessage);
    throw new Error(errorMessage);
  }

  logInfo('[Sora API] Image generation completed');
  return data as ImageGenerationResponse;
}
