import type { VideoConfigObject, VideoDuration, VideoModelFeatures } from '@/types';

export function parseVideoFeatures(raw: unknown): VideoModelFeatures {
  const defaults: VideoModelFeatures = {
    textToVideo: true,
    imageToVideo: false,
    videoToVideo: false,
    supportStyles: false,
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
    return { ...defaults, ...(raw as VideoModelFeatures) };
  }
  return defaults;
}

export function parseVideoAspectRatios(raw: unknown): Array<{ value: string; label: string }> {
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

export function parseVideoDurations(raw: unknown): VideoDuration[] {
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

export function parseVideoConfigObject(raw: unknown): VideoConfigObject | undefined {
  if (!raw) return undefined;
  let parsed: unknown = raw;

  if (typeof raw === 'string') {
    try {
      parsed = JSON.parse(raw);
    } catch {
      return undefined;
    }
  }

  if (!parsed || typeof parsed !== 'object') return undefined;
  const candidate = parsed as Record<string, unknown>;
  const output: VideoConfigObject = {};

  if (typeof candidate.aspect_ratio === 'string' && candidate.aspect_ratio.trim()) {
    output.aspect_ratio = candidate.aspect_ratio.trim() as VideoConfigObject['aspect_ratio'];
  }
  if (typeof candidate.video_length === 'number' && Number.isFinite(candidate.video_length)) {
    output.video_length = Math.floor(candidate.video_length);
  }
  if (typeof candidate.resolution === 'string' && candidate.resolution.trim()) {
    output.resolution = candidate.resolution.trim().toUpperCase() as VideoConfigObject['resolution'];
  }
  if (typeof candidate.preset === 'string' && candidate.preset.trim()) {
    output.preset = candidate.preset.trim().toLowerCase() as VideoConfigObject['preset'];
  }

  return Object.keys(output).length > 0 ? output : undefined;
}
