import { getSoraConfig } from './sora-config';
import { fetchWithRetry, soraUndiciFetch } from './sora-http';

export interface InviteCodeResponse {
  success: boolean;
  invite_code: string;
  remaining_count: number;
  total_count: number;
  email: string;
}

export async function getInviteCode(): Promise<InviteCodeResponse> {
  const { apiKey, baseUrl } = await getSoraConfig();

  if (!apiKey) {
    throw new Error('Sora API Key 未配置');
  }

  if (!baseUrl) {
    throw new Error('Sora Base URL 未配置');
  }

  const normalizedBaseUrl = baseUrl.replace(/\/$/, '');
  const apiUrl = `${normalizedBaseUrl}/v1/invite-codes`;

  const response = await fetchWithRetry(soraUndiciFetch, apiUrl, () => ({
    method: 'GET',
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
  }));

  const data = await response.json() as { error?: { message?: string } };

  if (!response.ok) {
    throw new Error(data?.error?.message || '邀请码获取失败');
  }

  return data as InviteCodeResponse;
}
