export type TaskType = 'image' | 'video';

export const GENERATION_POLL_TIMEOUT_MS = 30 * 60 * 1000;

const MAX_DURATION_MS: Record<TaskType, number> = {
  image: GENERATION_POLL_TIMEOUT_MS,
  video: GENERATION_POLL_TIMEOUT_MS,
};

export function getPollingInterval(elapsedMs: number, taskType: TaskType): number {
  const isFirstMinute = elapsedMs < 60_000;
  if (taskType === 'image') {
    return isFirstMinute ? 10_000 : 30_000;
  }
  return isFirstMinute ? 30_000 : 60_000;
}

export function shouldContinuePolling(elapsedMs: number, taskType: TaskType): boolean {
  return elapsedMs < MAX_DURATION_MS[taskType];
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

export function getFriendlyErrorMessage(errMsg: string): string {
  const lowerMsg = errMsg.toLowerCase();
  if (
    lowerMsg.includes('generation process begins') ||
    lowerMsg.includes('missing video payload') ||
    lowerMsg.includes('missing image payload')
  ) {
    return 'Server timeout. Please try again later.';
  }
  if (
    lowerMsg.includes('heavy_load') ||
    lowerMsg.includes('heavy load') ||
    lowerMsg.includes('try again later')
  ) {
    return 'Server is busy. Please try again later.';
  }
  if (lowerMsg.includes('status: 400') || lowerMsg.includes('request failed: 400')) {
    return 'Request failed. Please retry.';
  }
  if (
    lowerMsg.includes('network') ||
    lowerMsg.includes('socket') ||
    lowerMsg.includes('timeout') ||
    lowerMsg.includes('connection')
  ) {
    return 'Network error. Please check your connection.';
  }
  return errMsg;
}
