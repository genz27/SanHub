import type { UserRole } from '@/types';

const DEFAULT_TIMEOUT_MS = 10000;
const INTERNAL_MEDIA_PATH_PATTERN = /^\/api\/media\/([^/?#]+)/i;

type ReferenceImageOptions = {
  origin: string;
  userId: string;
  userRole: UserRole;
  maxBytes: number;
  timeoutMs?: number;
  headers?: Record<string, string>;
};

type ReferenceImagePayload = {
  mimeType: string;
  base64: string;
  dataUrl: string;
};

function normalizeMimeType(contentType: string): string {
  return contentType.split(';')[0]?.trim().toLowerCase() || 'application/octet-stream';
}

function ensureImageMimeType(contentType: string): string {
  const mimeType = normalizeMimeType(contentType);
  if (!mimeType.startsWith('image/')) {
    throw new Error('Reference asset must be an image');
  }
  return mimeType;
}

function parseDataUrl(dataUrl: string): ReferenceImagePayload | null {
  const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/i);
  if (!match) {
    return null;
  }

  const mimeType = ensureImageMimeType(match[1]);
  const base64 = match[2];
  return {
    mimeType,
    base64,
    dataUrl: `data:${mimeType};base64,${base64}`,
  };
}

function extractInternalGenerationId(input: string, origin: string): string | null {
  const relativeMatch = input.match(INTERNAL_MEDIA_PATH_PATTERN);
  if (relativeMatch?.[1]) {
    return decodeURIComponent(relativeMatch[1]);
  }

  try {
    const inputUrl = new URL(input);
    const originUrl = new URL(origin);
    if (inputUrl.origin !== originUrl.origin) {
      return null;
    }

    const absoluteMatch = inputUrl.pathname.match(INTERNAL_MEDIA_PATH_PATTERN);
    return absoluteMatch?.[1] ? decodeURIComponent(absoluteMatch[1]) : null;
  } catch {
    return null;
  }
}

async function readInternalGenerationImage(
  generationId: string,
  options: ReferenceImageOptions
): Promise<ReferenceImagePayload> {
  const { getGenerationMedia } = await import('./db/generation-lookup-reads');
  const generation = await getGenerationMedia(generationId);
  if (!generation) {
    throw new Error('Reference generation not found');
  }

  const isPrivilegedUser =
    options.userRole === 'admin' || options.userRole === 'moderator';
  if (generation.userId !== options.userId && !isPrivilegedUser) {
    throw new Error('Reference generation is not accessible');
  }

  if (!generation.resultUrl) {
    throw new Error('Reference generation has no media');
  }

  if (generation.resultUrl.startsWith('file:')) {
    const { readMediaFile } = await import('./media-read');
    const file = await readMediaFile(generation.resultUrl);
    if (!file) {
      throw new Error('Reference media file not found');
    }

    const mimeType = ensureImageMimeType(file.mimeType);
    const base64 = file.buffer.toString('base64');
    return {
      mimeType,
      base64,
      dataUrl: `data:${mimeType};base64,${base64}`,
    };
  }

  const parsedDataUrl = parseDataUrl(generation.resultUrl);
  if (parsedDataUrl) {
    return parsedDataUrl;
  }

  const nestedGenerationId = extractInternalGenerationId(generation.resultUrl, options.origin);
  if (nestedGenerationId) {
    if (nestedGenerationId === generationId) {
      throw new Error('Invalid recursive reference image');
    }
    return readInternalGenerationImage(nestedGenerationId, options);
  }

  const { fetchExternalBuffer } = await import('./safe-fetch');
  const { buffer, contentType } = await fetchExternalBuffer(generation.resultUrl, {
    origin: options.origin,
    allowRelative: true,
    maxBytes: options.maxBytes,
    timeoutMs: options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    headers: options.headers,
  });

  const mimeType = ensureImageMimeType(contentType);
  const base64 = buffer.toString('base64');
  return {
    mimeType,
    base64,
    dataUrl: `data:${mimeType};base64,${base64}`,
  };
}

export async function fetchReferenceImage(
  input: string,
  options: ReferenceImageOptions
): Promise<ReferenceImagePayload> {
  const internalGenerationId = extractInternalGenerationId(input, options.origin);
  if (internalGenerationId) {
    return readInternalGenerationImage(internalGenerationId, options);
  }

  const parsedDataUrl = parseDataUrl(input);
  if (parsedDataUrl) {
    return parsedDataUrl;
  }

  const { fetchExternalBuffer } = await import('./safe-fetch');
  const { buffer, contentType } = await fetchExternalBuffer(input, {
    origin: options.origin,
    allowRelative: true,
    maxBytes: options.maxBytes,
    timeoutMs: options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    headers: options.headers,
  });

  const mimeType = ensureImageMimeType(contentType);
  const base64 = buffer.toString('base64');
  return {
    mimeType,
    base64,
    dataUrl: `data:${mimeType};base64,${base64}`,
  };
}
