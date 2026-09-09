import { GENERATION_POLL_TIMEOUT_MS } from './polling-timeouts';

export type TaskType = 'image' | 'video';

export {
  GENERATION_TIMEOUT_MS,
  GENERATION_SUBMIT_TIMEOUT_MS,
  GENERATION_POLL_TIMEOUT_MS,
} from './polling-timeouts';

export function getPollingInterval(elapsedMs: number, taskType: TaskType): number {
  const isFirstMinute = elapsedMs < 60_000;
  if (taskType === 'image') {
    return isFirstMinute ? 10_000 : 30_000;
  }
  return isFirstMinute ? 5_000 : 15_000;
}

export function shouldContinuePolling(elapsedMs: number, taskType: TaskType): boolean {
  void taskType;
  return elapsedMs < GENERATION_POLL_TIMEOUT_MS;
}

export function isTransientError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  const lowerMessage = message.toLowerCase();

  const transientKeywords = [
    'socket',
    'network',
    'fetch',
    'timeout',
    'econnreset',
    'etimedout',
    'connection',
    'server error',
    'bad gateway',
    'service unavailable',
    'gateway timeout',
    'status: 5',
    'invalid response',
    'unexpected token',
    'json',
    'missing video payload',
    'missing image payload',
    'missing content',
    'payload missing',
    'request failed: 400',
    'status: 400',
    'generation process begins',
    'still processing',
    'heavy_load',
    'heavy load',
    'under heavy load',
    'try again later',
    'please try again',
  ];

  return transientKeywords.some((keyword) => lowerMessage.includes(keyword));
}
