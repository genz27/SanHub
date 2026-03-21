import type { Generation } from '@/types';
import {
  getFriendlyErrorMessage,
  getPollingInterval,
  isTransientError,
  shouldContinuePolling,
  type TaskType,
} from './polling-utils';

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

export type GenerationStatusPayload = {
  id: string;
  status: Generation['status'] | 'succeeded';
  type: Generation['type'];
  url: string;
  cost: number;
  progress: number;
  errorMessage?: string;
  params?: Generation['params'];
  createdAt: number;
  updatedAt: number;
};

export function isTerminalGenerationStatus(status?: string): boolean {
  return (
    status === 'completed' ||
    status === 'succeeded' ||
    status === 'failed' ||
    status === 'cancelled'
  );
}

export function isVideoGenerationType(type?: string): boolean {
  return Boolean(type && type.includes('video'));
}

export function isImageGenerationType(type?: string): boolean {
  return Boolean(type && !isVideoGenerationType(type) && type.endsWith('-image'));
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
  _current: T[],
  incoming: T[]
): T[] {
  return mergeTasksById([], incoming);
}

async function parseJsonResponse(response: Response): Promise<any> {
  const contentType = response.headers.get('content-type') || '';
  if (!contentType.includes('application/json')) {
    const rawText = await response.text();
    throw new Error(
      `Invalid response format${rawText ? `: ${rawText.slice(0, 120)}` : ''}`
    );
  }

  return response.json();
}

export async function fetchGenerationStatus(
  taskId: string,
  signal?: AbortSignal
): Promise<GenerationStatusPayload> {
  const response = await fetch(`/api/generate/status/${taskId}`, {
    cache: 'no-store',
    signal,
  });

  if (response.status >= 500) {
    throw new Error(`Server Error: ${response.status}`);
  }

  const payload = await parseJsonResponse(response);
  if (!response.ok) {
    throw new Error(payload.error || `Request failed: ${response.status}`);
  }

  return payload.data as GenerationStatusPayload;
}

export function buildCompletedGeneration(
  payload: GenerationStatusPayload,
  prompt: string
): Generation {
  return {
    id: payload.id,
    userId: '',
    type: payload.type,
    prompt,
    params: payload.params || {},
    resultUrl: payload.url || `/api/media/${payload.id}`,
    cost: payload.cost,
    status: 'completed',
    createdAt: payload.createdAt,
    updatedAt: payload.updatedAt,
  };
}

function waitFor(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const complete = () => {
      if (signal) {
        signal.removeEventListener('abort', abortHandler);
      }
      resolve();
    };
    const timeoutId = setTimeout(complete, ms);

    const abortHandler = () => {
      clearTimeout(timeoutId);
      signal?.removeEventListener('abort', abortHandler);
      reject(new DOMException('Aborted', 'AbortError'));
    };

    if (!signal) return;

    signal.addEventListener('abort', abortHandler, { once: true });
  });
}

type PollGenerationTaskOptions = {
  taskId: string;
  taskPrompt: string;
  taskType: TaskType;
  signal?: AbortSignal;
  onProgress: (payload: GenerationStatusPayload) => void;
  onCompleted: (generation: Generation, payload: GenerationStatusPayload) => void | Promise<void>;
  onFailed: (errorMessage: string, payload?: GenerationStatusPayload) => void | Promise<void>;
  onTimeout: () => void | Promise<void>;
};

const MAX_CONSECUTIVE_ERRORS = 5;

export async function pollGenerationTask(
  options: PollGenerationTaskOptions
): Promise<void> {
  const { taskId, taskPrompt, taskType, signal, onProgress, onCompleted, onFailed, onTimeout } = options;
  const startedAt = Date.now();
  let consecutiveErrors = 0;

  while (!signal?.aborted) {
    const elapsed = Date.now() - startedAt;
    if (!shouldContinuePolling(elapsed, taskType)) {
      await onTimeout();
      return;
    }

    try {
      const payload = await fetchGenerationStatus(taskId, signal);
      consecutiveErrors = 0;

      if (payload.status === 'failed' || payload.status === 'cancelled') {
        await onFailed(payload.errorMessage || '生成失败', payload);
        return;
      }

      if (payload.status === 'completed' || payload.status === 'succeeded' || payload.url) {
        await onCompleted(buildCompletedGeneration(payload, taskPrompt), payload);
        return;
      }

      onProgress(payload);
      await waitFor(getPollingInterval(elapsed, taskType), signal);
    } catch (error) {
      if ((error as Error)?.name === 'AbortError') {
        return;
      }

      consecutiveErrors += 1;
      const message = error instanceof Error ? error.message : '网络错误';

      if (isTransientError(error) && consecutiveErrors < MAX_CONSECUTIVE_ERRORS) {
        const retryDelay = Math.min(5000 * 2 ** (consecutiveErrors - 1), 60000);
        await waitFor(retryDelay, signal);
        continue;
      }

      await onFailed(getFriendlyErrorMessage(message));
      return;
    }
  }
}

export async function fetchPendingGenerationTasks(
  limit = 200
): Promise<PendingGenerationTask[]> {
  const response = await fetch(`/api/user/tasks?limit=${limit}`, {
    cache: 'no-store',
  });
  const payload = await parseJsonResponse(response);

  if (!response.ok) {
    throw new Error(payload.error || '获取任务失败');
  }

  return (payload.data || []) as PendingGenerationTask[];
}

export async function fetchRecentUserGenerations(limit = 24): Promise<Generation[]> {
  const response = await fetch(`/api/user/history?page=1&limit=${limit}`, {
    cache: 'no-store',
  });
  const payload = await parseJsonResponse(response);

  if (!response.ok) {
    throw new Error(payload.error || '获取历史记录失败');
  }

  return (payload.data || []) as Generation[];
}
