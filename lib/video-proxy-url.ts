const OPENAI_HOSTED_VIDEO = /^https:\/\/videos\.openai\.com\//;

export function isOpenAIHostedVideoUrl(url: string): boolean {
  return OPENAI_HOSTED_VIDEO.test(url);
}

export function rewriteOpenAIVideoUrl(
  url: string,
  config: { videoProxyEnabled?: boolean; videoProxyBaseUrl?: string }
): string {
  if (!url || !config.videoProxyEnabled || !config.videoProxyBaseUrl) return url;
  if (!OPENAI_HOSTED_VIDEO.test(url)) return url;
  const proxyBase = config.videoProxyBaseUrl.replace(/\/$/, '') + '/';
  return url.replace(OPENAI_HOSTED_VIDEO, proxyBase);
}
