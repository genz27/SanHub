import { fetchWithRetry } from './http-retry';
import { createAgentFetch, type UndiciRequestInit } from './undici-http';
import { GENERATION_SUBMIT_TIMEOUT_MS } from './polling-timeouts';
import type { SoraConfig } from './sora-config';

export const SORA_REQUEST_TIMEOUT_MS = GENERATION_SUBMIT_TIMEOUT_MS;

export const soraUndiciFetch = createAgentFetch('sora', {
  bodyTimeout: 0,
  headersTimeout: SORA_REQUEST_TIMEOUT_MS,
  keepAliveTimeout: SORA_REQUEST_TIMEOUT_MS,
  keepAliveMaxTimeout: SORA_REQUEST_TIMEOUT_MS,
  pipelining: 0,
  connections: 30,
  connect: {
    timeout: SORA_REQUEST_TIMEOUT_MS,
  },
});

export async function applyProxiedVideoUrl(url: string): Promise<string> {
  const { applyVideoProxy } = await import('./video-proxy');
  return applyVideoProxy(url);
}

export function parseVideoUrl(url: string | string[] | unknown): string {
  if (Array.isArray(url)) {
    return url.length > 0 ? parseVideoUrl(url[0]) : '';
  }
  if (typeof url !== 'string') {
    return String(url);
  }

  const trimmed = url.trim();
  if (!trimmed) {
    return trimmed;
  }

  const parsedArray = tryParseJsonArray(trimmed);
  if (parsedArray) {
    return normalizeUrlString(parsedArray);
  }

  const unwrapped = unwrapEncodedArray(trimmed);
  if (unwrapped) {
    return normalizeUrlString(unwrapped);
  }

  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    const inner = trimmed.slice(1, -1).trim();
    const innerParsed = tryParseJsonArray(inner);
    if (innerParsed) {
      return normalizeUrlString(innerParsed);
    }
    const innerUnwrapped = unwrapEncodedArray(inner);
    if (innerUnwrapped) {
      return normalizeUrlString(innerUnwrapped);
    }
  }

  return trimmed;
}

function tryParseJsonArray(value: string): string | null {
  if (!value.startsWith('[')) {
    return null;
  }
  try {
    const parsed = JSON.parse(value);
    if (Array.isArray(parsed) && parsed.length > 0) {
      return String(parsed[0]);
    }
  } catch {
    return null;
  }
  return null;
}

function unwrapEncodedArray(value: string): string | null {
  const trimmed = value.trim();
  const lower = trimmed.toLowerCase();

  const encodedOpen = '%5b%22';
  const encodedClose = '%22%5d';
  if (lower.startsWith(encodedOpen) && lower.endsWith(encodedClose)) {
    return trimmed.slice(encodedOpen.length, trimmed.length - encodedClose.length);
  }

  const mixedOpen = '[%22';
  const mixedClose = '%22]';
  if (lower.startsWith(mixedOpen) && lower.endsWith(mixedClose)) {
    return trimmed.slice(mixedOpen.length, trimmed.length - mixedClose.length);
  }

  return null;
}

function normalizeUrlString(value: string): string {
  const trimmed = value.trim();
  if (/^https?:%2f%2f/i.test(trimmed)) {
    try {
      return decodeURIComponent(trimmed);
    } catch {
      return trimmed;
    }
  }
  return trimmed;
}

export function shouldUseApexerVideoContract(channelType?: SoraConfig['channelType']): boolean {
  return channelType === 'apexerapi' || channelType === 'sora' || channelType === 'legacy';
}

export { fetchWithRetry };
export type { UndiciRequestInit };
