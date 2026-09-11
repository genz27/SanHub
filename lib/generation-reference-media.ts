import {
  databaseReferencePointer,
  putGenerationReferenceAsset,
} from '@/lib/db/generation-reference-assets';

const MAX_STORED_REFERENCE_IMAGES = 10;
const MAX_STORED_REFERENCE_URL_LENGTH = 2000;

export function parseStoredReferenceImages(raw: unknown): string[] {
  if (raw == null || raw === '') return [];

  let value: unknown = raw;
  if (typeof Buffer !== 'undefined' && Buffer.isBuffer(raw)) {
    value = raw.toString('utf8');
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed || trimmed === 'null') return [];
    try {
      value = JSON.parse(trimmed);
    } catch {
      return [];
    }
  }
  if (!Array.isArray(value)) return [];

  return value
    .filter((item): item is string => (
      typeof item === 'string'
      && item.length > 0
      && item.length <= MAX_STORED_REFERENCE_URL_LENGTH
      && !item.startsWith('data:')
    ))
    .slice(0, MAX_STORED_REFERENCE_IMAGES);
}

export function clientGenerationReferenceUrls(generationId: string, count: number): string[] {
  const safeCount = Math.max(0, Math.min(MAX_STORED_REFERENCE_IMAGES, Math.floor(count) || 0));
  return Array.from({ length: safeCount }, (_, index) => `/api/media/${generationId}?input=${index}`);
}

function parseImagePayload(data: string): { mimeType: string; buffer: Buffer } | null {
  const match = data.match(/^data:([^;]+);base64,(.+)$/);
  if (match) {
    const buffer = Buffer.from(match[2], 'base64');
    if (buffer.length === 0) return null;
    return { mimeType: match[1] || 'image/jpeg', buffer };
  }
  if (/^[A-Za-z0-9+/=\s]+$/.test(data) && data.replace(/\s+/g, '').length > 32) {
    const buffer = Buffer.from(data.replace(/\s+/g, ''), 'base64');
    if (buffer.length === 0) return null;
    return { mimeType: 'image/jpeg', buffer };
  }
  return null;
}

function toPersistableImageData(data: string): string | null {
  if (!data) return null;
  if (
    data.startsWith('data:image/')
    || data.startsWith('http://')
    || data.startsWith('https://')
    || data.startsWith('/api/media/')
    || data.startsWith('file:')
    || data.startsWith('db:')
  ) {
    return data;
  }
  if (/^[A-Za-z0-9+/=\s]+$/.test(data) && data.replace(/\s+/g, '').length > 32) {
    return `data:image/jpeg;base64,${data.replace(/\s+/g, '')}`;
  }
  return null;
}

export async function persistGenerationReferenceImages(
  generationId: string,
  images: Array<{ data?: string }>,
  publicBaseUrl?: string
): Promise<string[]> {
  const limited = images.slice(0, MAX_STORED_REFERENCE_IMAGES);
  if (limited.length === 0) return [];

  const stored = await Promise.all(limited.map(async (image, index) => {
    const data = toPersistableImageData(image.data || '');
    if (!data) return null;

    if (data.startsWith('db:') || data.startsWith('/api/media/')) {
      return data;
    }

    if (data.startsWith('http://') || data.startsWith('https://')) {
      return data;
    }

    const parsed = parseImagePayload(data);
    if (parsed) {
      try {
        await putGenerationReferenceAsset(generationId, index, parsed.mimeType, parsed.buffer);
        return databaseReferencePointer(index);
      } catch (error) {
        console.warn(`[ReferenceMedia] Database persist failed for ${generationId} ref ${index}:`, error);
      }
    }

    try {
      const { saveMediaAsync } = await import('@/lib/media-storage');
      const saved = await saveMediaAsync(`${generationId}-ref-${index}`, data, {
        publicBaseUrl,
      });
      if (saved.startsWith('http://') || saved.startsWith('https://')) {
        return saved;
      }
    } catch (error) {
      console.warn(`[ReferenceMedia] Remote persist failed for ${generationId} ref ${index}:`, error);
    }

    return null;
  }));

  return stored.filter((url): url is string => Boolean(url));
}
