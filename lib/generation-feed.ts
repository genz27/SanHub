import type { DailyLimitConfig, Generation } from '@/types';
import type { DailyUsageStats } from '@/lib/db/usage';
import { parseJsonResponse } from './generation-http';
import {
  type GenerationFeedKind,
  type PendingGenerationTask,
} from './generation-state';

export async function fetchGenerationFeed(
  recentLimit = 24,
  kind: GenerationFeedKind = 'all',
  pendingLimit = 50,
  options: { includeUsage?: boolean } = {}
): Promise<{
  generations: Generation[];
  pending: PendingGenerationTask[];
  usage?: DailyUsageStats;
  limits?: DailyLimitConfig;
}> {
  const params = new URLSearchParams({
    page: '1',
    limit: String(recentLimit),
    status: 'feed',
    includePending: 'true',
    pendingLimit: String(pendingLimit),
  });
  if (kind !== 'all') {
    params.set('kind', kind);
  }
  if (options.includeUsage) {
    params.set('includeUsage', 'true');
  }
  const response = await fetch(`/api/user/history?${params.toString()}`, {
    cache: 'no-store',
  });
  const payload = await parseJsonResponse(response);

  if (!response.ok) {
    throw new Error(payload.error || '获取历史记录失败');
  }

  return {
    generations: (payload.data || []) as Generation[],
    pending: (payload.pending || []) as PendingGenerationTask[],
    usage: payload.usage as DailyUsageStats | undefined,
    limits: payload.limits as DailyLimitConfig | undefined,
  };
}
