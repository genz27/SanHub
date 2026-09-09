import { GENERATION_SUBMIT_TIMEOUT_MS } from './polling-timeouts';

export async function fetchGenerationSubmit(
  input: RequestInfo | URL,
  init: RequestInit = {}
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), GENERATION_SUBMIT_TIMEOUT_MS);
  const upstreamSignal = init.signal;

  const abortHandler = () => {
    controller.abort();
  };

  try {
    if (upstreamSignal) {
      if (upstreamSignal.aborted) {
        controller.abort();
      } else {
        upstreamSignal.addEventListener('abort', abortHandler, { once: true });
      }
    }

    return await fetch(input, {
      ...init,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeoutId);
    upstreamSignal?.removeEventListener('abort', abortHandler);
  }
}
