import { logDebug, logWarn } from './sora-logger';
import { rewriteOpenAIVideoUrl } from './video-proxy-url';

export { isOpenAIHostedVideoUrl, rewriteOpenAIVideoUrl } from './video-proxy-url';

export async function applyVideoProxy(url: string): Promise<string> {
  if (!url) return url;

  try {
    const { getVideoProxyConfig } = await import('./db/system-config-video-proxy');
    const config = await getVideoProxyConfig();
    const proxied = rewriteOpenAIVideoUrl(url, config);
    if (proxied !== url) {
      logDebug('[Video Proxy] URL replaced:', {
        original: url.substring(0, 80),
        proxied: proxied.substring(0, 80),
      });
    }
    return proxied;
  } catch (error) {
    logWarn('[Video Proxy] Failed to apply proxy:', error);
    return url;
  }
}
