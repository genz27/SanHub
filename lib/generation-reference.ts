import type { Generation } from '@/types';

export type ReusableImageReference = {
  generationId: string;
  sourceUrl: string;
  previewUrl: string;
  prompt: string;
};

export function isVideoGenerationType(type?: string): boolean {
  return Boolean(type && type.includes('video'));
}

export function isImageGenerationType(type?: string): boolean {
  return Boolean(type && !isVideoGenerationType(type) && type.endsWith('-image'));
}

export function buildReusableImageReference(
  generation: Pick<Generation, 'id' | 'type' | 'prompt'>
): ReusableImageReference | null {
  if (!isImageGenerationType(generation.type)) {
    return null;
  }

  const mediaUrl = `/api/media/${generation.id}`;
  return {
    generationId: generation.id,
    sourceUrl: mediaUrl,
    previewUrl: mediaUrl,
    prompt: generation.prompt || '',
  };
}

export function generationReferenceImageUrls(
  generation: Pick<Generation, 'id'> & { params?: Generation['params'] }
): string[] {
  const refs = generation.params?.referenceImages;
  if (Array.isArray(refs) && refs.length > 0) {
    return refs.map((url, index) => (
      typeof url === 'string' && (url.startsWith('/api/media/') || url.startsWith('http://') || url.startsWith('https://'))
        ? url
        : `/api/media/${generation.id}?input=${index}`
    ));
  }

  const sourceId = generation.params?.sourceGenerationId;
  if (sourceId) {
    return [`/api/media/${sourceId}`];
  }

  const count = Number(generation.params?.imageCount) || 0;
  if (count > 0) {
    return Array.from({ length: Math.min(10, count) }, (_, index) => (
      `/api/media/${generation.id}?input=${index}`
    ));
  }

  return [];
}

export function buildReusableImageReferenceFromId(
  generationId: string,
  prompt = ''
): ReusableImageReference {
  const mediaUrl = `/api/media/${generationId}`;
  return {
    generationId,
    sourceUrl: mediaUrl,
    previewUrl: mediaUrl,
    prompt,
  };
}
