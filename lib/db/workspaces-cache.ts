import { cache, CacheKeys } from '../cache';

export function invalidateWorkspaceCache(userId: string): void {
  cache.deleteByPrefix(`${CacheKeys.WORKSPACES}${userId}:`);
}
