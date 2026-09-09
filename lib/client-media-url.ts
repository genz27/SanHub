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
