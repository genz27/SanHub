import dns from 'dns/promises';
import net from 'net';
import { fetchWithRetry } from './http-retry';

const DEFAULT_TIMEOUT_MS = 10000;
const DEFAULT_MAX_REDIRECTS = 3;
const DEFAULT_MAX_BYTES = 10 * 1024 * 1024;

export interface FetchBinaryOptions {
  origin?: string;
  allowRelative?: boolean;
  maxBytes?: number;
  timeoutMs?: number;
  maxRedirects?: number;
  headers?: Record<string, string>;
}

const BLOCKED_HOSTS = new Set(['localhost']);
const BLOCKED_SUFFIXES = ['.localhost', '.local', '.internal'];

function isBlockedHostname(hostname: string): boolean {
  const host = hostname.toLowerCase();
  if (BLOCKED_HOSTS.has(host)) return true;
  return BLOCKED_SUFFIXES.some((suffix) => host.endsWith(suffix));
}

function isPrivateIPv4(ip: string): boolean {
  const parts = ip.split('.').map((part) => Number(part));
  if (parts.length !== 4 || parts.some((part) => Number.isNaN(part))) return true;
  const [a, b, c] = parts;
  if (a === 10) return true;
  if (a === 127) return true;
  if (a === 0) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 100 && b >= 64 && b <= 127) return true;
  if (a === 192 && b === 0 && c === 0) return true;
  if (a === 192 && b === 0 && c === 2) return true;
  if (a === 198 && (b === 18 || b === 19)) return true;
  if (a === 198 && b === 51 && c === 100) return true;
  if (a === 203 && b === 0 && c === 113) return true;
  if (a >= 224) return true;
  return false;
}

function isPrivateIPv6(ip: string): boolean {
  const normalized = ip.toLowerCase();
  if (normalized === '::' || normalized === '::1') return true;
  if (normalized.startsWith('fc') || normalized.startsWith('fd')) return true;
  if (normalized.startsWith('fe8') || normalized.startsWith('fe9') || normalized.startsWith('fea') || normalized.startsWith('feb')) {
    return true;
  }
  if (normalized.startsWith('::ffff:')) {
    const v4 = normalized.substring('::ffff:'.length);
    if (net.isIP(v4) === 4) {
      return isPrivateIPv4(v4);
    }
  }
  return false;
}

function isPrivateIp(ip: string): boolean {
  const ipVersion = net.isIP(ip);
  if (ipVersion === 4) return isPrivateIPv4(ip);
  if (ipVersion === 6) return isPrivateIPv6(ip);
  return true;
}

function isSameOrigin(url: URL, origin: string): boolean {
  try {
    const originUrl = new URL(origin);
    return url.protocol === originUrl.protocol && url.host === originUrl.host;
  } catch {
    return false;
  }
}

export async function assertSafeUrl(url: URL, origin?: string): Promise<void> {
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('Unsupported URL protocol');
  }

  if (origin && isSameOrigin(url, origin)) {
    return;
  }

  if (isBlockedHostname(url.hostname)) {
    throw new Error('Blocked hostname');
  }

  const ipVersion = net.isIP(url.hostname);
  if (ipVersion) {
    if (isPrivateIp(url.hostname)) {
      throw new Error('Blocked IP address');
    }
    return;
  }

  const records = await dns.lookup(url.hostname, { all: true });
  if (!records.length) {
    throw new Error('Unable to resolve host');
  }
  for (const record of records) {
    if (isPrivateIp(record.address)) {
      throw new Error('Blocked IP address');
    }
  }
}

export async function resolveAndValidateUrl(
  input: string,
  options: { origin?: string; allowRelative?: boolean } = {}
): Promise<URL> {
  const { origin, allowRelative = false } = options;
  if (input.startsWith('/')) {
    if (!allowRelative || !origin) {
      throw new Error('Relative URL is not allowed');
    }
    const url = new URL(input, origin);
    return url;
  }
  const url = new URL(input);
  await assertSafeUrl(url, origin);
  return url;
}

function isRedirectStatus(status: number): boolean {
  return status === 301 || status === 302 || status === 303 || status === 307 || status === 308;
}

async function readResponseBuffer(response: Response, maxBytes: number): Promise<Buffer> {
  const contentLength = response.headers.get('content-length');
  if (contentLength && Number(contentLength) > maxBytes) {
    throw new Error('Response too large');
  }

  if (!response.body) {
    const arrayBuffer = await response.arrayBuffer();
    if (arrayBuffer.byteLength > maxBytes) {
      throw new Error('Response too large');
    }
    return Buffer.from(arrayBuffer);
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) {
      total += value.length;
      if (total > maxBytes) {
        await reader.cancel();
        throw new Error('Response too large');
      }
      chunks.push(value);
    }
  }

  return Buffer.concat(chunks.map((chunk) => Buffer.from(chunk)));
}

export async function fetchExternalBuffer(
  input: string,
  options: FetchBinaryOptions = {}
): Promise<{ buffer: Buffer; contentType: string; finalUrl: string }> {
  const {
    origin,
    allowRelative = false,
    maxBytes = DEFAULT_MAX_BYTES,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    maxRedirects = DEFAULT_MAX_REDIRECTS,
    headers,
  } = options;

  let currentUrl = await resolveAndValidateUrl(input, { origin, allowRelative });
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    for (let i = 0; i <= maxRedirects; i += 1) {
      const requestInit: RequestInit = {
        method: 'GET',
        headers,
        redirect: 'manual',
        signal: controller.signal,
      };
      const response = await fetchWithRetry(fetch, currentUrl.toString(), () => requestInit);

      if (isRedirectStatus(response.status)) {
        const location = response.headers.get('location');
        if (!location) {
          throw new Error('Redirect without location');
        }
        currentUrl = await resolveAndValidateUrl(location, {
          origin: currentUrl.toString(),
          allowRelative: true,
        });
        continue;
      }

      if (!response.ok) {
        throw new Error(`Fetch failed with status ${response.status}`);
      }

      const buffer = await readResponseBuffer(response, maxBytes);
      const contentType = response.headers.get('content-type') || 'application/octet-stream';
      return { buffer, contentType, finalUrl: currentUrl.toString() };
    }

    throw new Error('Too many redirects');
  } finally {
    clearTimeout(timeout);
  }
}
