import { cache, CacheKeys } from '../cache';

export function generationStatusCacheKey(id: string): string {
  return `${CacheKeys.USER_GENERATIONS}status:${id}`;
}

export function generationMediaCacheKey(id: string): string {
  return `${CacheKeys.USER_GENERATIONS}media:${id}`;
}

export function invalidateGenerationLookups(ids?: string[]): void {
  if (ids && ids.length > 0) {
    for (const id of ids) {
      cache.delete(generationStatusCacheKey(id));
      cache.delete(generationMediaCacheKey(id));
    }
    return;
  }

  cache.deleteByPrefix(generationStatusCacheKey(''));
  cache.deleteByPrefix(generationMediaCacheKey(''));
}
