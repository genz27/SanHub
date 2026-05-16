export type ImageSizingRequest = {
  size?: string;
  aspectRatio?: string;
  imageSize?: string;
};

export type ResolvedImageSize = Pick<ImageSizingRequest, 'size' | 'aspectRatio' | 'imageSize'>;

export const PIXEL_SIZE_PATTERN = /^\d+[x×]\d+$/i;
export const ASPECT_RATIO_PATTERN = /^\d+:\d+$/;

const FULL_WIDTH_DIGIT_OFFSET = '０'.charCodeAt(0) - '0'.charCodeAt(0);

function normalizeFullWidthDigits(value: string): string {
  return value.replace(/[０-９]/g, (digit) =>
    String.fromCharCode(digit.charCodeAt(0) - FULL_WIDTH_DIGIT_OFFSET)
  );
}

function greatestCommonDivisor(a: number, b: number): number {
  return b === 0 ? a : greatestCommonDivisor(b, a % b);
}

export function normalizePixelSize(size?: string): string | undefined {
  if (!size) return undefined;
  const normalized = normalizeFullWidthDigits(size)
    .trim()
    .replace(/[×Ｘｘ]/g, 'x')
    .replace(/\s+/g, '');
  return PIXEL_SIZE_PATTERN.test(normalized) ? normalized : undefined;
}

export function normalizeAspectRatio(aspectRatio?: string): string | undefined {
  if (!aspectRatio) return undefined;
  const normalized = normalizeFullWidthDigits(aspectRatio)
    .trim()
    .replace(/[：]/g, ':')
    .replace(/\s+/g, '');
  if (!ASPECT_RATIO_PATTERN.test(normalized)) return undefined;
  const [width, height] = normalized.split(':').map(Number);
  if (!width || !height) return undefined;
  const divisor = greatestCommonDivisor(width, height);
  return `${width / divisor}:${height / divisor}`;
}

export function aspectRatioOfSize(size?: string): string | undefined {
  const normalized = normalizePixelSize(size);
  if (!normalized) return undefined;
  const [width, height] = normalized.split('x').map(Number);
  if (!width || !height) return undefined;
  const divisor = greatestCommonDivisor(width, height);
  return `${width / divisor}:${height / divisor}`;
}

export function inferImageSizeLabel(size?: string): string | undefined {
  if (!size) return undefined;
  const trimmed = normalizeFullWidthDigits(size).trim().replace(/[×Ｘｘ]/g, 'x');
  if (/^(512|1K|2K|4K)$/i.test(trimmed)) return trimmed.toUpperCase();
  const pixelSize = normalizePixelSize(trimmed);
  if (!pixelSize) return undefined;
  const [width, height] = pixelSize.split('x').map(Number);
  const maxSide = Math.max(width, height);
  if (maxSide >= 3000) return '4K';
  if (maxSide >= 1500) return '2K';
  if (maxSide <= 768) return '512';
  return '1K';
}

export function resolveImageSize(size: unknown): ResolvedImageSize {
  if (typeof size !== 'string') return {};
  const normalizedRatio = normalizeAspectRatio(size);
  if (normalizedRatio) return { aspectRatio: normalizedRatio };

  const normalizedPixel = normalizePixelSize(size);
  if (normalizedPixel) {
    return { size: normalizedPixel, aspectRatio: aspectRatioOfSize(normalizedPixel) };
  }

  const normalized = normalizeFullWidthDigits(size)
    .trim()
    .replace(/[×Ｘｘ]/g, 'x');
  return normalized ? { size: normalized } : {};
}

export function compatibleGeminiSizeForConfig(aspectRatio?: string, imageSize?: string): string | undefined {
  const normalizedRatio = normalizeAspectRatio(aspectRatio);
  if (!normalizedRatio) return undefined;

  const normalizedImageSize = (imageSize || '2K').trim().toUpperCase();
  const sizeMap: Record<string, Record<string, string>> = {
    '512': {
      '1:1': '512x512',
    },
    '1K': {
      '1:1': '1024x1024',
      '16:9': '1536x864',
      '9:16': '864x1536',
      '4:3': '1024x768',
      '3:4': '768x1024',
      '3:2': '1536x1024',
      '2:3': '1024x1536',
      '4:5': '1024x1280',
      '5:4': '1280x1024',
      '21:9': '1792x768',
    },
    '2K': {
      '1:1': '2048x2048',
      '16:9': '2048x1152',
      '9:16': '1152x2048',
      '4:3': '2048x1536',
      '3:4': '1536x2048',
      '3:2': '1536x1024',
      '2:3': '1024x1536',
      '4:5': '1536x1920',
      '5:4': '1920x1536',
      '21:9': '2560x1080',
    },
    '4K': {
      '1:1': '4096x4096',
      '16:9': '3840x2160',
      '9:16': '2160x3840',
      '4:3': '4096x3072',
      '3:4': '3072x4096',
      '3:2': '5056x3392',
      '2:3': '3392x5056',
      '4:5': '3072x3840',
      '5:4': '3840x3072',
      '21:9': '5120x2160',
    },
  };

  return sizeMap[normalizedImageSize]?.[normalizedRatio] || sizeMap['2K'][normalizedRatio];
}


const GEMINI_ASPECT_MODEL_SUFFIX: Record<string, string> = {
  '1:1': 'square',
  '16:9': 'landscape',
  '9:16': 'portrait',
  '4:3': 'four-three',
  '3:4': 'three-four',
};

function geminiAspectModelFamily(model: string): 'pro' | 'flash' | undefined {
  const lower = model.toLowerCase();
  if (lower.includes('3.1') || lower.includes('flash') || lower.includes('banana2') || lower.includes('banana-2')) {
    return 'flash';
  }
  if (lower.includes('3.0') || lower.includes('3-pro') || lower.includes('pro') || lower.includes('banana')) {
    return 'pro';
  }
  return undefined;
}

function geminiAspectSizeSuffix(imageSize?: string): string {
  const normalized = imageSize?.trim().toUpperCase();
  if (normalized === '4K') return '-4k';
  if (normalized === '2K') return '-2k';
  return '';
}

export function resolveGeminiAspectSpecificModel(
  model: string,
  request: ImageSizingRequest,
  targetSize?: string
): string {
  const targetPixelSize = normalizePixelSize(targetSize);
  const explicitPixelSize = normalizePixelSize(request.size);
  const aspectRatio =
    normalizeAspectRatio(request.aspectRatio) ||
    normalizeAspectRatio(request.size) ||
    normalizeAspectRatio(targetSize) ||
    aspectRatioOfSize(targetPixelSize) ||
    aspectRatioOfSize(explicitPixelSize);
  const suffix = aspectRatio ? GEMINI_ASPECT_MODEL_SUFFIX[aspectRatio] : undefined;
  if (!suffix) return model;

  const family = geminiAspectModelFamily(model);
  if (!family) return model;

  const imageSize = request.imageSize || inferImageSizeLabel(targetPixelSize) || inferImageSizeLabel(explicitPixelSize);
  const sizeSuffix = geminiAspectSizeSuffix(imageSize);
  if (family === 'flash') {
    return `gemini-3.1-flash-image-${suffix}${sizeSuffix}`;
  }
  return `gemini-3.0-pro-image-${suffix}${sizeSuffix}`;
}

export function resolveGeminiCompatibleImageSize(
  request: ImageSizingRequest,
  targetSize?: string
): string | undefined {
  const normalizedTargetPixel = normalizePixelSize(targetSize);
  if (normalizedTargetPixel) return normalizedTargetPixel;

  const targetAspectRatio = normalizeAspectRatio(targetSize);
  const requestAspectRatio = normalizeAspectRatio(request.aspectRatio);
  const sizeAspectRatio = normalizeAspectRatio(request.size);
  const explicitPixelSize = normalizePixelSize(request.size);
  const explicitPixelRatio = aspectRatioOfSize(explicitPixelSize);
  const effectiveAspectRatio = targetAspectRatio || requestAspectRatio || sizeAspectRatio || explicitPixelRatio;

  if (explicitPixelSize && (!effectiveAspectRatio || explicitPixelRatio === effectiveAspectRatio)) {
    return explicitPixelSize;
  }

  if (effectiveAspectRatio) {
    const mappedSize = compatibleGeminiSizeForConfig(
      effectiveAspectRatio,
      request.imageSize || inferImageSizeLabel(explicitPixelSize)
    );
    if (mappedSize) return mappedSize;
  }

  return explicitPixelSize;
}
