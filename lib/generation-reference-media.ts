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

function extensionFromImageData(data: string): string {
  const mime = data.match(/^data:([^;]+)/)?.[1] || '';
  if (mime.includes('png')) return 'png';
  if (mime.includes('webp')) return 'webp';
  if (mime.includes('gif')) return 'gif';
  return 'jpg';
}

function toPersistableImageData(data: string): string | null {
  if (!data) return null;
  if (
    data.startsWith('data:image/')
    || data.startsWith('http://')
    || data.startsWith('https://')
    || data.startsWith('/api/media/')
    || data.startsWith('file:')
  ) {
    return data;
  }
  if (/^[A-Za-z0-9+/=\s]+$/.test(data) && data.replace(/\s+/g, '').length > 32) {
    return `data:image/jpeg;base64,${data.replace(/\s+/g, '')}`;
  }
  return null;
}

function isDurableReferenceUrl(url: string): boolean {
  return (
    url.startsWith('file:')
    || url.startsWith('http://')
    || url.startsWith('https://')
    || url.startsWith('/api/media/')
  );
}

export async function persistGenerationReferenceImages(
  generationId: string,
  images: Array<{ data?: string }>,
  publicBaseUrl?: string
): Promise<string[]> {
  const limited = images.slice(0, MAX_STORED_REFERENCE_IMAGES);
  if (limited.length === 0) return [];

  const { saveMediaAsync, saveMediaToFile } = await import('@/lib/media-storage');
  const stored = await Promise.all(limited.map(async (image, index) => {
    const data = toPersistableImageData(image.data || '');
    if (!data) return null;

    if (data.startsWith('file:') || data.startsWith('/api/media/')) {
      return data;
    }

    if (data.startsWith('http://') || data.startsWith('https://')) {
      return data;
    }

    try {
      const local = await saveMediaToFile(`${generationId}-ref-${index}`, data);
      if (isDurableReferenceUrl(local)) {
        return local;
      }
    } catch (error) {
      console.warn(`[ReferenceMedia] Local persist failed for ${generationId} ref ${index}:`, error);
    }

    try {
      const saved = await saveMediaAsync(`${generationId}-ref-${index}`, data, {
        publicBaseUrl,
        filename: `${generationId}-ref-${index}.${extensionFromImageData(data)}`,
      });
      if (isDurableReferenceUrl(saved)) {
        return saved;
      }
      console.warn(`[ReferenceMedia] Skipped inlined data URL for ${generationId} ref ${index}`);
      return null;
    } catch (error) {
      console.warn(`[ReferenceMedia] Failed to persist ${generationId} ref ${index}:`, error);
      return null;
    }
  }));

  return stored.filter((url): url is string => Boolean(url));
}
