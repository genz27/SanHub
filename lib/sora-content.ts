import { getSoraConfig } from './sora-config';
import {
  applyProxiedVideoUrl,
  fetchWithRetry,
  parseVideoUrl,
  soraUndiciFetch,
  type UndiciRequestInit,
} from './sora-http';
import { logDebug, logError } from './sora-logger';

export async function getVideoContentUrl(videoId: string, channelId?: string): Promise<string> {
  const { apiKey, baseUrl } = await getSoraConfig({ channelId });

  if (!apiKey) {
    throw new Error('Sora API Key 未配置');
  }

  const normalizedBaseUrl = baseUrl.replace(/\/$/, '');
  const apiUrl = `${normalizedBaseUrl}/v1/videos/${videoId}/content`;

  logDebug('[Sora API v5] Fetch video content:', apiUrl);

  const requestInit: UndiciRequestInit = {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
    redirect: 'manual',
  };
  const response = await fetchWithRetry(soraUndiciFetch, apiUrl, () => requestInit);

  logDebug('[Sora API v5] /content status:', response.status);

  if ([301, 302, 307, 308].includes(response.status)) {
    const location = response.headers.get('location');
    logDebug('[Sora API v5] /content redirect location:', location?.substring(0, 100));
    if (location) {
      const rawUrl = parseVideoUrl(location);
      return applyProxiedVideoUrl(rawUrl);
    }
  }

  if (response.status === 200) {
    const contentType = response.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      const data = await response.json() as { url?: unknown };
      logDebug('[Sora API v5] /content JSON response:', JSON.stringify(data).substring(0, 200));
      if (data?.url) {
        const rawUrl = parseVideoUrl(data.url);
        return applyProxiedVideoUrl(rawUrl);
      }
    }
  }

  if (response.status >= 400) {
    const data = await response.json().catch(() => ({})) as { error?: { message?: string } };
    const errorMessage = data?.error?.message || `获取视频内容失败: ${response.status}`;
    logError('[Sora API v5] /content error response', {
      status: response.status,
      error: errorMessage,
      body: JSON.stringify(data).substring(0, 200),
    });
    throw new Error(errorMessage);
  }

  logError('[Sora API v5] /content missing redirect; cannot resolve public URL');
  throw new Error('无法获取视频直链');
}
