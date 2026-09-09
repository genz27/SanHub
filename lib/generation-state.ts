import type { Generation } from '@/types';
import {
  isImageGenerationType,
  isVideoGenerationType,
} from './generation-reference';

export const GENERATION_FEED_RESYNC_MS = 30_000;

export function shouldResyncGenerationFeed(
  lastResyncAt: number,
  intervalMs = GENERATION_FEED_RESYNC_MS
): boolean {
  return Date.now() - lastResyncAt >= intervalMs;
}

export type GenerationFeedKind = 'all' | 'image' | 'video';

export type PendingGenerationTask = {
  id: string;
  prompt: string;
  type: string;
  status: 'pending' | 'processing' | 'failed' | 'cancelled';
  progress?: number;
  modelId?: string;
  model?: string;
  errorMessage?: string;
  createdAt: number;
  updatedAt?: number;
};

export function isTerminalGenerationStatus(status?: string): boolean {
  return (
    status === 'completed' ||
    status === 'succeeded' ||
    status === 'failed' ||
    status === 'cancelled'
  );
}

export function isFailedGenerationStatus(status?: string): status is 'failed' | 'cancelled' {
  return status === 'failed' || status === 'cancelled';
}

export function filterGenerationsByKind(
  generations: Generation[],
  kind: GenerationFeedKind
): Generation[] {
  if (kind === 'all') return generations;
  return generations.filter((generation) =>
    kind === 'video'
      ? isVideoGenerationType(generation.type)
      : isImageGenerationType(generation.type)
  );
}

export function filterTasksByKind(
  tasks: PendingGenerationTask[],
  kind: GenerationFeedKind
): PendingGenerationTask[] {
  if (kind === 'all') return tasks;
  return tasks.filter((task) =>
    kind === 'video' ? isVideoGenerationType(task.type) : isImageGenerationType(task.type)
  );
}

export function mergeGenerationsById(
  current: Generation[],
  incoming: Generation[]
): Generation[] {
  const byId = new Map<string, Generation>();

  for (const generation of current) {
    byId.set(generation.id, generation);
  }

  for (const generation of incoming) {
    byId.set(generation.id, {
      ...(byId.get(generation.id) || {}),
      ...generation,
    });
  }

  return Array.from(byId.values()).sort((left, right) => right.createdAt - left.createdAt);
}

export function mergeTasksById<T extends { id: string; createdAt?: number }>(
  current: T[],
  incoming: T[]
): T[] {
  const byId = new Map<string, T>();

  for (const task of current) {
    byId.set(task.id, task);
  }

  for (const task of incoming) {
    byId.set(task.id, {
      ...(byId.get(task.id) || {}),
      ...task,
    });
  }

  return Array.from(byId.values()).sort(
    (left, right) => (right.createdAt || 0) - (left.createdAt || 0)
  );
}

export function replaceActiveTasks<
  T extends { id: string; status: string; createdAt?: number }
>(
  current: T[],
  incoming: T[]
): T[] {
  const incomingIds = new Set(incoming.map((task) => task.id));
  const terminalTasks = current.filter(
    (task) =>
      task.status !== 'pending' &&
      task.status !== 'processing' &&
      !incomingIds.has(task.id)
  );

  return mergeTasksById(terminalTasks, incoming);
}

export function buildTaskFromGeneration(generation: Generation): PendingGenerationTask {
  const status = isFailedGenerationStatus(generation.status)
    ? generation.status
    : generation.status === 'processing'
      ? 'processing'
      : 'pending';

  return {
    id: generation.id,
    prompt: generation.prompt,
    type: generation.type,
    status,
    progress:
      typeof generation.params?.progress === 'number'
        ? generation.params.progress
        : undefined,
    modelId: generation.params?.modelId,
    model: generation.params?.model,
    errorMessage:
      generation.errorMessage ||
      (status === 'cancelled' ? '任务已取消' : '生成失败'),
    createdAt: generation.createdAt,
    updatedAt: generation.updatedAt,
  };
}
