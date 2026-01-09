export interface RetryOptions {
  attempts?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  retryOnStatuses?: number[];
}

const DEFAULT_ATTEMPTS = 3;
const DEFAULT_BASE_DELAY_MS = 500;
const DEFAULT_MAX_DELAY_MS = 4000;

function isRetryableStatus(status: number, retryOnStatuses?: number[]): boolean {
  if (retryOnStatuses && retryOnStatuses.length > 0) {
    return retryOnStatuses.includes(status);
  }
  if (status === 408 || status === 429) return true;
  return status >= 500 && status <= 599;
}

function isRetryableError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const message = error.message.toLowerCase();
  return (
    message.includes('network') ||
    message.includes('fetch') ||
    message.includes('socket') ||
    message.includes('econnreset') ||
    message.includes('econnrefused') ||
    message.includes('etimedout') ||
    message.includes('timeout') ||
    message.includes('timed out')
  );
}

type ResponseHeaders = {
  get: (name: string) => string | null;
};

type ResponseLike = {
  ok: boolean;
  status: number;
  headers: ResponseHeaders;
  arrayBuffer: () => Promise<ArrayBuffer>;
};

function getRetryAfterMs(response: ResponseLike): number | null {
  const retryAfter = response.headers.get('retry-after');
  if (!retryAfter) return null;
  const seconds = Number(retryAfter);
  if (!Number.isNaN(seconds) && seconds > 0) {
    return seconds * 1000;
  }
  const date = Date.parse(retryAfter);
  if (!Number.isNaN(date)) {
    const diff = date - Date.now();
    return diff > 0 ? diff : null;
  }
  return null;
}

function getBackoffDelay(attempt: number, baseDelayMs: number, maxDelayMs: number): number {
  const delay = Math.min(baseDelayMs * 2 ** (attempt - 1), maxDelayMs);
  const jitter = Math.floor(delay * 0.3 * Math.random());
  return delay - jitter;
}

async function drainResponse(response: ResponseLike): Promise<void> {
  try {
    await response.arrayBuffer();
  } catch {
    // ignore
  }
}

export async function fetchWithRetry<TInput, TInit extends object, TResponse extends ResponseLike>(
  fetcher: (input: TInput, init?: TInit) => Promise<TResponse>,
  input: TInput,
  initFactory: () => TInit = () => ({} as TInit),
  options: RetryOptions = {}
): Promise<TResponse> {
  const attempts = Math.max(1, options.attempts ?? DEFAULT_ATTEMPTS);
  const baseDelayMs = Math.max(0, options.baseDelayMs ?? DEFAULT_BASE_DELAY_MS);
  const maxDelayMs = Math.max(baseDelayMs, options.maxDelayMs ?? DEFAULT_MAX_DELAY_MS);

  let lastError: unknown;
  let lastResponse: TResponse | null = null;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetcher(input, initFactory());
      if (response.ok) return response;

      if (!isRetryableStatus(response.status, options.retryOnStatuses) || attempt === attempts) {
        return response;
      }

      lastResponse = response;
      const retryAfterMs = response.status === 429 ? getRetryAfterMs(response) : null;
      await drainResponse(response);

      const delayMs = retryAfterMs ?? getBackoffDelay(attempt, baseDelayMs, maxDelayMs);
      await new Promise((resolve) => setTimeout(resolve, delayMs));
      continue;
    } catch (error) {
      lastError = error;
      if (!isRetryableError(error) || attempt === attempts) {
        throw error;
      }
      const delayMs = getBackoffDelay(attempt, baseDelayMs, maxDelayMs);
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }

  if (lastResponse) return lastResponse;
  throw lastError ?? new Error('Retry failed');
}
