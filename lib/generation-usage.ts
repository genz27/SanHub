import type { DailyLimitConfig } from '@/types';
import type { DailyUsageKind, DailyUsageStats } from '@/lib/db/usage';
import { parseJsonResponse } from './generation-http';

export async function fetchDailyUsage(
  kind: DailyUsageKind = 'all'
): Promise<{ usage: DailyUsageStats; limits: DailyLimitConfig }> {
  const params = new URLSearchParams();
  if (kind !== 'all') {
    params.set('kind', kind);
  }
  const query = params.toString();
  const response = await fetch(query ? `/api/user/daily-usage?${query}` : '/api/user/daily-usage');
  const payload = await parseJsonResponse(response);

  if (!response.ok) {
    throw new Error(payload.error || '获取使用量失败');
  }

  return {
    usage: payload.data?.usage as DailyUsageStats,
    limits: payload.data?.limits as DailyLimitConfig,
  };
}
