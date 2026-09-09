import type { CharacterCard, DailyLimitConfig } from '@/types';
import type { DailyUsageStats } from '@/lib/db/usage';
import { parseJsonResponse } from './generation-http';

export async function fetchCharacterCardLists(options: { includeUsage?: boolean } = {}): Promise<{
  completed: CharacterCard[];
  pending: CharacterCard[];
  usage?: DailyUsageStats;
  limits?: DailyLimitConfig;
}> {
  const params = new URLSearchParams({ includePending: 'true' });
  if (options.includeUsage) {
    params.set('includeUsage', 'true');
  }
  const response = await fetch(`/api/user/character-cards?${params.toString()}`, {
    cache: 'no-store',
  });
  const payload = await parseJsonResponse(response);

  if (!response.ok) {
    throw new Error(payload.error || '获取角色卡失败');
  }

  return {
    completed: Array.isArray(payload.data) ? payload.data : [],
    pending: Array.isArray(payload.pending) ? payload.pending : [],
    usage: payload.usage as DailyUsageStats | undefined,
    limits: payload.limits as DailyLimitConfig | undefined,
  };
}
