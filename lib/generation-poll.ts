import type { Generation } from '@/types';
import { getFriendlyErrorMessage } from './polling-errors';
import {
  getPollingInterval,
  isTransientError,
  shouldContinuePolling,
  type TaskType,
} from './polling-utils';
import { parseJsonResponse } from './generation-http';

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

export type PollGenerationTaskOptions = {
  taskId: string;
  taskPrompt: string;
  taskType: TaskType;
  signal?: AbortSignal;
  onProgress: (payload: GenerationStatusPayload) => void;
  onCompleted: (generation: Generation, payload: GenerationStatusPayload) => void | Promise<void>;
  onFailed: (errorMessage: string, payload?: GenerationStatusPayload) => void | Promise<void>;
  onTimeout: () => void | Promise<void>;
};

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

      if (isTransientError(error)) {
        const retryDelay = Math.min(5000 * 2 ** (consecutiveErrors - 1), 60000);
        await waitFor(retryDelay, signal);
        continue;
      }

      await onFailed(getFriendlyErrorMessage(message));
      return;
    }
  }
}
