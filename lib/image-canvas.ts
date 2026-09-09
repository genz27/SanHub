import { toProxiedMediaUrl } from './client-media-url';

export type CanvasPoint = {
  x: number;
  y: number;
};

export type NormalizedRect = {
  x: number;
  y: number;
  w: number;
  h: number;
};

export type ContainedRect = NormalizedRect & {
  scale: number;
};

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function normalizeRect(x1: number, y1: number, x2: number, y2: number): NormalizedRect {
  return {
    x: Math.min(x1, x2),
    y: Math.min(y1, y2),
    w: Math.abs(x2 - x1),
    h: Math.abs(y2 - y1),
  };
}

export function getContainedRect(
  containerWidth: number,
  containerHeight: number,
  imageWidth: number,
  imageHeight: number
): ContainedRect {
  if (containerWidth <= 0 || containerHeight <= 0 || imageWidth <= 0 || imageHeight <= 0) {
    return { x: 0, y: 0, w: 0, h: 0, scale: 1 };
  }

  const scale = Math.min(containerWidth / imageWidth, containerHeight / imageHeight);
  const w = imageWidth * scale;
  const h = imageHeight * scale;
  return {
    x: (containerWidth - w) / 2,
    y: (containerHeight - h) / 2,
    w,
    h,
    scale,
  };
}

export function clientPointOnElement(
  element: HTMLElement,
  clientX: number,
  clientY: number
): CanvasPoint {
  const rect = element.getBoundingClientRect();
  return {
    x: clientX - rect.left,
    y: clientY - rect.top,
  };
}

export function pointerToNormalized(
  point: CanvasPoint,
  frame: ContainedRect
): CanvasPoint | null {
  if (frame.w <= 0 || frame.h <= 0) return null;
  const x = (point.x - frame.x) / frame.w;
  const y = (point.y - frame.y) / frame.h;
  if (x < 0 || y < 0 || x > 1 || y > 1) return null;
  return { x, y };
}

export function clampNormalizedRect(rect: NormalizedRect): NormalizedRect {
  const x = clamp(rect.x, 0, 1);
  const y = clamp(rect.y, 0, 1);
  return {
    x,
    y,
    w: clamp(rect.w, 0.01, 1 - x),
    h: clamp(rect.h, 0.01, 1 - y),
  };
}

export function hitTestRect(point: CanvasPoint, rect: NormalizedRect): boolean {
  return (
    point.x >= rect.x &&
    point.y >= rect.y &&
    point.x <= rect.x + rect.w &&
    point.y <= rect.y + rect.h
  );
}

export function hitTestEllipse(point: CanvasPoint, rect: NormalizedRect): boolean {
  const rx = rect.w / 2;
  const ry = rect.h / 2;
  if (rx <= 0 || ry <= 0) return false;
  const cx = rect.x + rx;
  const cy = rect.y + ry;
  const dx = (point.x - cx) / rx;
  const dy = (point.y - cy) / ry;
  return dx * dx + dy * dy <= 1;
}

export function canvasToPngFile(canvas: HTMLCanvasElement, filename: string): Promise<File> {
  return canvasToFile(canvas, filename, 'image/png');
}

export function canvasToFile(
  canvas: HTMLCanvasElement,
  filename: string,
  type = 'image/png',
  quality?: number
): Promise<File> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error('Failed to export canvas'));
          return;
        }
        resolve(new File([blob], filename, { type }));
      },
      type,
      quality
    );
  });
}

export async function fetchImageAsFile(url: string, filename: string): Promise<File> {
  const response = await fetch(toProxiedMediaUrl(url), {
    cache: 'no-store',
    credentials: 'same-origin',
  });
  if (!response.ok) {
    throw new Error('Failed to read image');
  }

  const blob = await response.blob();
  const type = blob.type && blob.type.startsWith('image/') ? blob.type : 'image/png';
  return new File([blob], filename, { type });
}

export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Failed to load image'));
    image.src = src;
  });
}

export async function loadImageFromUrl(url: string): Promise<HTMLImageElement> {
  const file = await fetchImageAsFile(url, 'source.png');
  const objectUrl = URL.createObjectURL(file);
  try {
    return await loadImage(objectUrl);
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}
