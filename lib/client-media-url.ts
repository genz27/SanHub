/**
 * Map stored result URLs to a browser-safe src.
 * Keep public http(s) as-is. Route only private / credentialed media
 * through /api/media so history tiles do not pay N extra media hops.
 * OpenAI hosted videos stay as https and are rewritten by rewriteOpenAIVideoUrl.
 */
export function toClientMediaUrl(
  resultUrl: string | undefined,
  id: string,
  _type?: string
): string {
  if (!resultUrl) return '';
  if (resultUrl.startsWith('/api/media/')) return resultUrl;
  if (resultUrl.startsWith('data:') || resultUrl.startsWith('file:')) {
    return `/api/media/${id}`;
  }
  if (resultUrl.includes('/v1/videos/') && resultUrl.includes('/content')) {
    return `/api/media/${id}`;
  }
  return resultUrl;
}

export function withClientMediaUrl<T extends { id: string; type: string; resultUrl?: string }>(
  generation: T
): T {
  const resultUrl = toClientMediaUrl(generation.resultUrl, generation.id, generation.type);
  if (resultUrl === (generation.resultUrl || '')) return generation;
  return { ...generation, resultUrl };
}

export function toProxiedMediaUrl(url: string): string {
  if (!url) return url;

  const applyProxy = (pathname: string, search: string) => {
    const params = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);
    params.set('proxy', '1');
    const query = params.toString();
    return query ? `${pathname}?${query}` : pathname;
  };

  if (url.startsWith('/api/media/')) {
    const [pathname, search = ''] = url.split('?');
    return applyProxy(pathname, search);
  }

  try {
    const parsed = new URL(url);
    if (!parsed.pathname.startsWith('/api/media/')) return url;
    return `${parsed.origin}${applyProxy(parsed.pathname, parsed.search)}`;
  } catch {
    return url;
  }
}
