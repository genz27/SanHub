import type { ImageModelFeatures } from '@/types';

export function parseImageFeatures(raw: unknown): ImageModelFeatures {
  const defaults: ImageModelFeatures = {
    textToImage: true,
    imageToImage: false,
    upscale: false,
    matting: false,
    multipleImages: false,
    imageSize: false,
  };
  if (!raw) return defaults;
  if (typeof raw === 'string') {
    try {
      return { ...defaults, ...JSON.parse(raw) };
    } catch {
      return defaults;
    }
  }
  if (typeof raw === 'object') {
    return { ...defaults, ...(raw as ImageModelFeatures) };
  }
  return defaults;
}

export function parseImageStringArray(raw: unknown): string[] {
  if (!raw) return [];
  if (typeof raw === 'string') {
    try {
      return JSON.parse(raw);
    } catch {
      return [];
    }
  }
  if (Array.isArray(raw)) return raw;
  return [];
}

export function parseImageResolutions(raw: unknown): Record<string, string | Record<string, string>> {
  if (!raw) return {};
  if (typeof raw === 'string') {
    try {
      return JSON.parse(raw);
    } catch {
      return {};
    }
  }
  if (typeof raw === 'object') return raw as Record<string, string | Record<string, string>>;
  return {};
}
