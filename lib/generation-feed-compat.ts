import type { Generation } from '@/types';
import { parseJsonResponse } from './generation-http';
import {
  type GenerationFeedKind,
  type PendingGenerationTask,
} from './generation-state';

export async function fetchPendingGenerationTasks(
  limit = 200,
  kind: GenerationFeedKind = 'all'
): Promise<PendingGenerationTask[]> {
  const params = new URLSearchParams({ limit: String(limit) });
  if (kind !== 'all') {
    params.set('kind', kind);
  }
  const response = await fetch(`/api/user/tasks?${params.toString()}`, {
    cache: 'no-store',
  });
  const payload = await parseJsonResponse(response);

  if (!response.ok) {
    throw new Error(payload.error || '获取任务失败');
  }

  return (payload.data || []) as PendingGenerationTask[];
}

export async function fetchRecentUserGenerations(
  limit = 24,
  kind: GenerationFeedKind = 'all'
): Promise<Generation[]> {
  const params = new URLSearchParams({
    page: '1',
    limit: String(limit),
    status: 'feed',
  });
  if (kind !== 'all') {
    params.set('kind', kind);
  }
  const response = await fetch(`/api/user/history?${params.toString()}`, {
    cache: 'no-store',
  });
  const payload = await parseJsonResponse(response);

  if (!response.ok) {
    throw new Error(payload.error || '获取历史记录失败');
  }

  return (payload.data || []) as Generation[];
}
