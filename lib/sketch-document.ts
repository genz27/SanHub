import { clamp, type CanvasPoint } from './image-canvas';

export type SketchTool = 'select' | 'pencil' | 'eraser' | 'text' | 'rect' | 'circle' | 'line';

export type SketchElement =
  | {
      id: string;
      kind: 'stroke';
      tool: 'pencil' | 'eraser';
      color: string;
      size: number;
      points: CanvasPoint[];
    }
  | {
      id: string;
      kind: 'shape';
      shape: 'rect' | 'circle' | 'line';
      color: string;
      size: number;
      x: number;
      y: number;
      w: number;
      h: number;
    }
  | {
      id: string;
      kind: 'text';
      color: string;
      size: number;
      x: number;
      y: number;
      text: string;
    };

export type SketchHandle = 'nw' | 'ne' | 'sw' | 'se';

export function createSketchId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function textBounds(element: Extract<SketchElement, { kind: 'text' }>) {
  const width = Math.max(48, element.text.length * element.size * 0.72);
  const height = element.size * 1.45;
  return {
    x: element.x,
    y: element.y - height,
    w: width,
    h: height,
  };
}

function distanceToSegment(point: CanvasPoint, start: CanvasPoint, end: CanvasPoint): number {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const length = dx * dx + dy * dy;
  if (length === 0) {
    return Math.hypot(point.x - start.x, point.y - start.y);
  }
  const t = clamp(((point.x - start.x) * dx + (point.y - start.y) * dy) / length, 0, 1);
  return Math.hypot(point.x - (start.x + t * dx), point.y - (start.y + t * dy));
}

export function hitTestSketchElement(element: SketchElement, point: CanvasPoint): boolean {
  if (element.kind === 'text') {
    const bounds = textBounds(element);
    return (
      point.x >= bounds.x &&
      point.y >= bounds.y &&
      point.x <= bounds.x + bounds.w &&
      point.y <= bounds.y + bounds.h
    );
  }

  if (element.kind === 'shape' && element.shape === 'line') {
    return (
      distanceToSegment(point, { x: element.x, y: element.y }, { x: element.x + element.w, y: element.y + element.h }) <=
      Math.max(8, element.size)
    );
  }

  if (element.kind === 'shape') {
    return (
      point.x >= element.x &&
      point.y >= element.y &&
      point.x <= element.x + element.w &&
      point.y <= element.y + element.h
    );
  }

  return false;
}

export function resizeSketchShape(
  element: Extract<SketchElement, { kind: 'shape' }>,
  handle: SketchHandle,
  point: CanvasPoint
): Extract<SketchElement, { kind: 'shape' }> {
  if (element.shape === 'line') {
    if (handle === 'nw' || handle === 'sw') {
      return {
        ...element,
        w: element.x + element.w - point.x,
        h: element.y + element.h - point.y,
        x: point.x,
        y: point.y,
      };
    }
    return {
      ...element,
      w: point.x - element.x,
      h: point.y - element.y,
    };
  }

  const right = element.x + element.w;
  const bottom = element.y + element.h;
  const next = { ...element };

  if (handle === 'nw') {
    next.x = Math.min(point.x, right - 8);
    next.y = Math.min(point.y, bottom - 8);
    next.w = right - next.x;
    next.h = bottom - next.y;
  } else if (handle === 'ne') {
    next.y = Math.min(point.y, bottom - 8);
    next.w = Math.max(8, point.x - element.x);
    next.h = bottom - next.y;
  } else if (handle === 'sw') {
    next.x = Math.min(point.x, right - 8);
    next.w = right - next.x;
    next.h = Math.max(8, point.y - element.y);
  } else {
    next.w = Math.max(8, point.x - element.x);
    next.h = Math.max(8, point.y - element.y);
  }

  return next;
}

export function sketchHandlePositions(element: Extract<SketchElement, { kind: 'shape' }>) {
  if (element.shape === 'line') {
    return [
      { id: 'nw' as const, x: element.x, y: element.y },
      { id: 'se' as const, x: element.x + element.w, y: element.y + element.h },
    ];
  }

  return [
    { id: 'nw' as const, x: element.x, y: element.y },
    { id: 'ne' as const, x: element.x + element.w, y: element.y },
    { id: 'sw' as const, x: element.x, y: element.y + element.h },
    { id: 'se' as const, x: element.x + element.w, y: element.y + element.h },
  ];
}
