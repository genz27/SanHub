// ========================================
// In-process TTL cache
// ========================================

interface CacheEntry<T> {
  value: T;
  expireAt: number;
}

function prefixBucket(key: string): string {
  const colon = key.indexOf(':');
  return colon === -1 ? key : key.slice(0, colon + 1);
}

class MemoryCache {
  private cache = new Map<string, CacheEntry<unknown>>();
  private keysByBucket = new Map<string, Set<string>>();
  private cleanupInterval: NodeJS.Timeout | null = null;

  constructor() {
    this.cleanupInterval = setInterval(() => this.cleanup(), 60000);
    this.cleanupInterval.unref?.();
  }

  private remember(key: string): void {
    const bucket = prefixBucket(key);
    let keys = this.keysByBucket.get(bucket);
    if (!keys) {
      keys = new Set();
      this.keysByBucket.set(bucket, keys);
    }
    keys.add(key);
  }

  private forget(key: string): void {
    const bucket = prefixBucket(key);
    const keys = this.keysByBucket.get(bucket);
    if (!keys) return;
    keys.delete(key);
    if (keys.size === 0) {
      this.keysByBucket.delete(bucket);
    }
  }

  private evict(key: string): void {
    this.cache.delete(key);
    this.forget(key);
  }

  private deleteMatching(bucket: string, prefix: string): void {
    const keys = this.keysByBucket.get(bucket);
    if (!keys) return;

    for (const key of Array.from(keys)) {
      if (key.startsWith(prefix)) {
        this.cache.delete(key);
        keys.delete(key);
      }
    }

    if (keys.size === 0) {
      this.keysByBucket.delete(bucket);
    }
  }

  get<T>(key: string): T | null {
    const entry = this.cache.get(key);
    if (!entry) return null;

    if (Date.now() > entry.expireAt) {
      this.evict(key);
      return null;
    }

    return entry.value as T;
  }

  set<T>(key: string, value: T, ttlSeconds: number): void {
    this.cache.set(key, {
      value,
      expireAt: Date.now() + ttlSeconds * 1000,
    });
    this.remember(key);
  }

  delete(key: string): void {
    if (!this.cache.has(key)) return;
    this.evict(key);
  }

  // Bucket by the first `segment:` so user-scoped writes do not scan catalogs,
  // status/media keys, or other users. Bare prefixes (system_config) also
  // drop the exact key plus `prefix:*`.
  deleteByPrefix(prefix: string): void {
    const colon = prefix.indexOf(':');
    if (colon === -1) {
      this.delete(prefix);
      this.deleteMatching(`${prefix}:`, prefix);
      return;
    }

    this.deleteMatching(prefix.slice(0, colon + 1), prefix);
  }

  private cleanup(): void {
    const now = Date.now();
    for (const [key, entry] of Array.from(this.cache.entries())) {
      if (now > entry.expireAt) {
        this.evict(key);
      }
    }
  }

  stats(): { size: number; keys: string[] } {
    return {
      size: this.cache.size,
      keys: Array.from(this.cache.keys()),
    };
  }
}

export const cache = new MemoryCache();

export const CacheKeys = {
  USER: 'user:',
  SYSTEM_CONFIG: 'system_config',
  CHAT_MODELS: 'chat_models:',
  IMAGE_MODELS: 'image_models:',
  IMAGE_CHANNELS: 'image_channels:',
  VIDEO_MODELS: 'video_models:',
  VIDEO_CHANNELS: 'video_channels:',
  GALLERY: 'gallery:',
  USER_GENERATIONS: 'user_generations:',
  CHARACTER_CARDS: 'character_cards:',
  WORKSPACES: 'workspaces:',
  PENDING_GENERATIONS: 'pending_generations:',
  PENDING_COUNT: 'pending_count',
  DAILY_USAGE: 'daily_usage:',
  ADMIN_STATS: 'admin_stats:',
  PROMPTS: 'prompt_templates',
  INVITE_CODE: 'invite_code:',
} as const;

export const CacheTTL = {
  USER: 15,
  SYSTEM_CONFIG: 300,
  CHAT_MODELS: 60,
  IMAGE_MODELS: 60,
  VIDEO_MODELS: 60,
  GALLERY: 120,
  USER_GENERATIONS: 30,
  GENERATION_STATUS: 1,
  CHARACTER_CARDS: 15,
  WORKSPACES: 15,
  PENDING_GENERATIONS: 3,
  PENDING_COUNT: 15,
  DAILY_USAGE: 15,
  ADMIN_STATS: 20,
  PROMPTS: 60,
  INVITE_CODE: 60,
} as const;

const inflight = new Map<string, Promise<unknown>>();

export async function withCache<T>(
  key: string,
  ttlSeconds: number | ((result: NonNullable<T>) => number),
  fn: () => Promise<T>
): Promise<T> {
  const cached = cache.get<T>(key);
  if (cached !== null) {
    return cached;
  }

  const pending = inflight.get(key);
  if (pending) {
    return pending as Promise<T>;
  }

  const request = fn()
    .then((result) => {
      // cache.get treats null as a miss, so storing null only pollutes the map.
      if (result !== null) {
        const ttl =
          typeof ttlSeconds === 'function'
            ? ttlSeconds(result as NonNullable<T>)
            : ttlSeconds;
        cache.set(key, result, ttl);
      }
      return result;
    })
    .finally(() => {
      inflight.delete(key);
    });

  inflight.set(key, request);
  return request;
}

export function invalidateUserCache(userId: string): void {
  cache.delete(`${CacheKeys.USER}${userId}`);
}

export function invalidateImageCatalogCache(): void {
  cache.deleteByPrefix(CacheKeys.IMAGE_MODELS);
  cache.deleteByPrefix(CacheKeys.IMAGE_CHANNELS);
}

export function invalidateVideoCatalogCache(): void {
  cache.deleteByPrefix(CacheKeys.VIDEO_MODELS);
  cache.deleteByPrefix(CacheKeys.VIDEO_CHANNELS);
}

export function invalidateChatModelsCache(): void {
  cache.deleteByPrefix(CacheKeys.CHAT_MODELS);
}
