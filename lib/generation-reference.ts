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
