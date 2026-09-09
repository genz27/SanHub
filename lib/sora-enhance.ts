import { getSoraConfig } from './sora-config';
import { fetchWithRetry, soraUndiciFetch } from './sora-http';
import { logError, logInfo } from './sora-logger';

export interface EnhancePromptRequest {
  prompt: string;
  expansion_level?: 'short' | 'medium' | 'long';
  duration_s?: 10 | 15;
}

export interface EnhancePromptResponse {
  enhanced_prompt: string;
}

export async function enhancePrompt(request: EnhancePromptRequest): Promise<EnhancePromptResponse> {
  const { apiKey, baseUrl } = await getSoraConfig();

  if (!apiKey) {
    throw new Error('Sora API Key 未配置');
  }

  if (!baseUrl) {
    throw new Error('Sora Base URL 未配置');
  }

  const normalizedBaseUrl = baseUrl.replace(/\/$/, '');
  const apiUrl = `${normalizedBaseUrl}/v1/enhance_prompt`;

  logInfo('[Sora API] Prompt enhance request:', {
    prompt: request.prompt?.substring(0, 50),
    expansion_level: request.expansion_level,
    duration_s: request.duration_s,
  });

  const response = await fetchWithRetry(soraUndiciFetch, apiUrl, () => ({
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      prompt: request.prompt,
      expansion_level: request.expansion_level || 'medium',
      duration_s: request.duration_s,
    }),
  }));

  const data = await response.json() as { error?: { message?: string }; message?: string };

  if (!response.ok) {
    const errorMessage = data?.error?.message || data?.message || '提示词增强失败';
    logError('[Sora API] Prompt enhance failed:', errorMessage);
    throw new Error(errorMessage);
  }

  logInfo('[Sora API] Prompt enhance completed');
  return data as EnhancePromptResponse;
}
