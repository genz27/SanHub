'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Check,
  Circle,
  Eraser,
  MousePointer2,
  Pencil,
  Redo2,
  Square,
  Type,
  Undo2,
  X,
} from 'lucide-react';
import { toast } from '@/components/ui/toaster';
import {
  canvasToPngFile,
  clientPointOnElement,
  normalizeRect,
  type CanvasPoint,
} from '@/lib/image-canvas';
import { cn } from '@/lib/utils';

type SketchTool = 'select' | 'pencil' | 'eraser' | 'text' | 'rect' | 'circle';

type SketchElement =
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
      shape: 'rect' | 'circle';
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

const SKETCH_COLORS = [
  '#111827',
  '#6b7280',
  '#92400e',
  '#dc2626',
  '#ea580c',
  '#eab308',
  '#16a34a',
  '#0d9488',
  '#2563eb',
  '#38bdf8',
  '#7c3aed',
  '#ec4899',
];

const CANVAS_CSS_SIZE = 720;

function createId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function hitTestElement(element: SketchElement, point: CanvasPoint): boolean {
  if (element.kind === 'text') {
    const width = Math.max(48, element.text.length * element.size * 0.7);
    const height = element.size * 1.4;
    return (
      point.x >= element.x &&
      point.y >= element.y - height &&
      point.x <= element.x + width &&
      point.y <= element.y + 8
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

function drawElements(
  ctx: CanvasRenderingContext2D,
  elements: SketchElement[],
  cssWidth: number,
  cssHeight: number,
  selectedId?: string | null
) {
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, cssWidth, cssHeight);

  for (const element of elements) {
    if (element.kind === 'stroke') {
      if (element.points.length === 0) continue;
      ctx.save();
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.lineWidth = element.size;
      ctx.strokeStyle = element.tool === 'eraser' ? '#ffffff' : element.color;
      ctx.globalCompositeOperation = 'source-over';
      ctx.beginPath();
      ctx.moveTo(element.points[0].x, element.points[0].y);
      for (let index = 1; index < element.points.length; index += 1) {
        ctx.lineTo(element.points[index].x, element.points[index].y);
      }
      if (element.points.length === 1) {
        ctx.lineTo(element.points[0].x + 0.1, element.points[0].y);
      }
      ctx.stroke();
      ctx.restore();
      continue;
    }

    ctx.save();
    ctx.globalCompositeOperation = 'source-over';
    ctx.strokeStyle = element.color;
    ctx.fillStyle = element.color;

    if (element.kind === 'shape') {
      ctx.lineWidth = element.size;
      if (element.shape === 'rect') {
        ctx.strokeRect(element.x, element.y, element.w, element.h);
      } else {
        ctx.beginPath();
        ctx.ellipse(
          element.x + element.w / 2,
          element.y + element.h / 2,
          Math.abs(element.w / 2),
          Math.abs(element.h / 2),
          0,
          0,
          Math.PI * 2
        );
        ctx.stroke();
      }
    } else {
      ctx.font = `${element.size}px ui-sans-serif, system-ui, sans-serif`;
      ctx.textBaseline = 'alphabetic';
      ctx.fillText(element.text, element.x, element.y);
    }
    ctx.restore();

    if (selectedId && element.id === selectedId && element.kind === 'shape') {
      ctx.save();
      ctx.setLineDash([6, 4]);
      ctx.strokeStyle = '#0ea5e9';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(element.x - 4, element.y - 4, element.w + 8, element.h + 8);
      ctx.restore();
    } else if (selectedId && element.id === selectedId && element.kind === 'text') {
      ctx.save();
      ctx.setLineDash([6, 4]);
      ctx.strokeStyle = '#0ea5e9';
      ctx.lineWidth = 1.5;
      const width = Math.max(48, element.text.length * element.size * 0.7);
      const height = element.size * 1.4;
      ctx.strokeRect(element.x - 4, element.y - height - 4, width + 8, height + 12);
      ctx.restore();
    }
  }
}

export function SketchPad({
  open,
  onClose,
  onConfirm,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: (file: File) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const elementsRef = useRef<SketchElement[]>([]);
  const [elements, setElements] = useState<SketchElement[]>([]);
  const [redoStack, setRedoStack] = useState<SketchElement[][]>([]);
  const [tool, setTool] = useState<SketchTool>('pencil');
  const [color, setColor] = useState('#111827');
  const [brushSize, setBrushSize] = useState(6);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [pendingText, setPendingText] = useState<{ x: number; y: number; value: string } | null>(
    null
  );
  const [exporting, setExporting] = useState(false);
  const drawingRef = useRef<{
    id: string;
    start: CanvasPoint;
    lastSelected?: SketchElement;
  } | null>(null);

  useEffect(() => {
    elementsRef.current = elements;
  }, [elements]);

  const paint = useCallback((nextElements: SketchElement[]) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    const cssWidth = canvas.width / dpr;
    const cssHeight = canvas.height / dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawElements(ctx, nextElements, cssWidth, cssHeight, selectedId);
  }, [selectedId]);

  useEffect(() => {
    paint(elements);
  }, [elements, paint]);

  useEffect(() => {
    if (!open) return;

    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;

    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      const max = Math.min(wrap.clientWidth, wrap.clientHeight, CANVAS_CSS_SIZE);
      canvas.style.width = `${max}px`;
      canvas.style.height = `${max}px`;
      canvas.width = Math.floor(max * dpr);
      canvas.height = Math.floor(max * dpr);
      paint(elementsRef.current);
    };

    resize();
    const raf = window.requestAnimationFrame(resize);
    window.addEventListener('resize', resize);
    return () => {
      window.cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
    };
  }, [open, paint]);

  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);

  const getPoint = useCallback((event: React.PointerEvent<HTMLCanvasElement>): CanvasPoint => {
    return clientPointOnElement(event.currentTarget, event.clientX, event.clientY);
  }, []);

  const handlePointerDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (pendingText) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    const point = getPoint(event);

    if (tool === 'select') {
      const hit = [...elements].reverse().find((element) => hitTestElement(element, point));
      setSelectedId(hit?.id ?? null);
      if (hit && hit.kind !== 'stroke') {
        drawingRef.current = { id: hit.id, start: point, lastSelected: hit };
      }
      return;
    }

    if (tool === 'text') {
      setSelectedId(null);
      setPendingText({ x: point.x, y: point.y, value: '' });
      return;
    }

    const id = createId();
    drawingRef.current = { id, start: point };
    setSelectedId(id);
    setRedoStack([]);

    if (tool === 'pencil' || tool === 'eraser') {
      setElements((current) => {
        const next: SketchElement[] = [
          ...current,
          {
            id,
            kind: 'stroke',
            tool,
            color,
            size: brushSize,
            points: [point],
          },
        ];
        elementsRef.current = next;
        return next;
      });
      return;
    }

    setElements((current) => {
      const next: SketchElement[] = [
        ...current,
        {
          id,
          kind: 'shape',
          shape: tool === 'circle' ? 'circle' : 'rect',
          color,
          size: Math.max(2, brushSize / 2),
          x: point.x,
          y: point.y,
          w: 0,
          h: 0,
        },
      ];
      elementsRef.current = next;
      return next;
    });
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const drawing = drawingRef.current;
    if (!drawing) return;
    const point = getPoint(event);

    if (tool === 'select' && drawing.lastSelected && drawing.lastSelected.kind !== 'stroke') {
      const dx = point.x - drawing.start.x;
      const dy = point.y - drawing.start.y;
      setElements((current) =>
        current.map((element) => {
          if (element.id !== drawing.id || element.kind === 'stroke') return element;
          if (drawing.lastSelected?.kind === 'text' && element.kind === 'text') {
            return {
              ...element,
              x: drawing.lastSelected.x + dx,
              y: drawing.lastSelected.y + dy,
            };
          }
          if (drawing.lastSelected?.kind === 'shape' && element.kind === 'shape') {
            return {
              ...element,
              x: drawing.lastSelected.x + dx,
              y: drawing.lastSelected.y + dy,
            };
          }
          return element;
        })
      );
      return;
    }

    if (tool === 'pencil' || tool === 'eraser') {
      setElements((current) =>
        current.map((element) =>
          element.id === drawing.id && element.kind === 'stroke'
            ? { ...element, points: [...element.points, point] }
            : element
        )
      );
      return;
    }

    if (tool === 'rect' || tool === 'circle') {
      const next = normalizeRect(drawing.start.x, drawing.start.y, point.x, point.y);
      setElements((current) =>
        current.map((element) =>
          element.id === drawing.id && element.kind === 'shape'
            ? { ...element, ...next }
            : element
        )
      );
    }
  };

  const handlePointerUp = () => {
    drawingRef.current = null;
  };

  const commitPendingText = useCallback(() => {
    if (!pendingText) return;
    const value = pendingText.value.trim();
    setPendingText(null);
    if (!value) return;
    setElements((current) => {
      const next: SketchElement[] = [
        ...current,
        {
          id: createId(),
          kind: 'text',
          color,
          size: Math.max(16, brushSize * 3),
          x: pendingText.x,
          y: pendingText.y,
          text: value,
        },
      ];
      elementsRef.current = next;
      return next;
    });
    setRedoStack([]);
  }, [brushSize, color, pendingText]);

  const undo = () => {
    setElements((current) => {
      if (current.length === 0) return current;
      const next = current.slice(0, -1);
      setRedoStack((stack) => [...stack, current]);
      elementsRef.current = next;
      setSelectedId(null);
      return next;
    });
  };

  const redo = () => {
    setRedoStack((stack) => {
      if (stack.length === 0) return stack;
      const nextStack = stack.slice(0, -1);
      const restored = stack[stack.length - 1];
      elementsRef.current = restored;
      setElements(restored);
      return nextStack;
    });
  };

  const handleConfirm = async () => {
    if (elements.length === 0) {
      toast({
        title: '草图是空的',
        description: '先画一点内容，确认后会自动导入为参考图',
      });
      return;
    }

    const canvas = canvasRef.current;
    if (!canvas) return;

    setExporting(true);
    try {
      const file = await canvasToPngFile(canvas, `sketch-${Date.now()}.png`);
      onConfirm(file);
      setElements([]);
      elementsRef.current = [];
      setRedoStack([]);
      setSelectedId(null);
      toast({
        title: '草图已导入参考图',
        description: '可以直接配合提示词生成，或再叠加照片参考',
      });
    } catch (error) {
      toast({
        title: '导出草图失败',
        description: error instanceof Error ? error.message : '请重试',
        variant: 'destructive',
      });
    } finally {
      setExporting(false);
    }
  };

  const tools = useMemo(
    () =>
      [
        { id: 'select' as const, label: '选中', icon: MousePointer2 },
        { id: 'pencil' as const, label: '画笔', icon: Pencil },
        { id: 'text' as const, label: '文字', icon: Type },
        { id: 'rect' as const, label: '矩形', icon: Square },
        { id: 'circle' as const, label: '圆形', icon: Circle },
        { id: 'eraser' as const, label: '橡皮', icon: Eraser },
      ] satisfies Array<{ id: SketchTool; label: string; icon: typeof Pencil }>,
    []
  );

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-background/92 p-3 backdrop-blur-xl">
      <div className="flex h-full max-h-[52rem] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-border/70 bg-card/95 shadow-2xl">
        <div className="flex items-center justify-between gap-3 border-b border-border/70 px-4 py-3">
          <div>
            <p className="text-sm font-medium text-foreground">绘制草图</p>
            <p className="text-xs text-foreground/45">确认后自动导入为参考图，可继续叠加照片</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={undo}
              disabled={elements.length === 0}
              className="rounded-lg border border-border/70 p-2 text-foreground/70 hover:bg-card disabled:opacity-40"
              title="撤销"
            >
              <Undo2 className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={redo}
              disabled={redoStack.length === 0}
              className="rounded-lg border border-border/70 p-2 text-foreground/70 hover:bg-card disabled:opacity-40"
              title="重做"
            >
              <Redo2 className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-border/70 p-2 text-foreground/70 hover:bg-card"
              title="关闭"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="relative flex min-h-0 flex-1 items-center justify-center bg-background/50 p-4">
          <input
            type="range"
            min={2}
            max={28}
            value={brushSize}
            onChange={(event) => setBrushSize(Number(event.target.value))}
            className="absolute left-[-2.5rem] top-1/2 z-10 w-32 origin-center -translate-y-1/2 -rotate-90 cursor-pointer accent-sky-500"
            title="笔刷大小"
            aria-label="Brush size"
          />

          <div className="absolute top-4 left-1/2 z-10 flex -translate-x-1/2 items-center gap-1 rounded-full border border-border/70 bg-card/90 p-1 shadow-lg">
            {tools.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  setTool(item.id);
                  setPendingText(null);
                }}
                className={cn(
                  'rounded-full p-2 text-foreground/70 transition-colors',
                  tool === item.id ? 'bg-foreground text-background' : 'hover:bg-card'
                )}
                title={item.label}
              >
                <item.icon className="h-4 w-4" />
              </button>
            ))}
          </div>

          <div ref={wrapRef} className="flex h-full w-full items-center justify-center">
            <div className="relative">
              <canvas
                ref={canvasRef}
                className="max-h-full max-w-full touch-none rounded-xl border border-border/70 bg-white shadow-xl"
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
                onPointerCancel={handlePointerUp}
              />
              {pendingText && (
                <input
                  autoFocus
                  value={pendingText.value}
                  onChange={(event) =>
                    setPendingText((current) =>
                      current ? { ...current, value: event.target.value } : current
                    )
                  }
                  onBlur={commitPendingText}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault();
                      commitPendingText();
                    }
                    if (event.key === 'Escape') {
                      setPendingText(null);
                    }
                  }}
                  className="absolute rounded-md border border-sky-400 bg-white px-2 py-1 text-sm text-black shadow-lg outline-none"
                  style={{ left: pendingText.x, top: pendingText.y }}
                  placeholder="输入文字"
                />
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-border/70 px-4 py-3">
          <div className="flex flex-wrap items-center gap-2">
            {SKETCH_COLORS.map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => setColor(value)}
                className={cn(
                  'h-6 w-6 rounded-full border border-black/10',
                  color === value && 'ring-2 ring-sky-400 ring-offset-2 ring-offset-background'
                )}
                style={{ backgroundColor: value }}
                title={value}
              />
            ))}
            <input
              type="color"
              value={color}
              onChange={(event) => setColor(event.target.value)}
              className="h-7 w-7 cursor-pointer rounded-full border border-border/70 bg-transparent p-0"
              title="自定义颜色"
            />
          </div>
          <button
            type="button"
            onClick={() => void handleConfirm()}
            disabled={exporting}
            className="inline-flex h-10 items-center gap-2 rounded-full bg-sky-500 px-4 text-sm font-medium text-white hover:bg-sky-600 disabled:opacity-60"
          >
            <Check className="h-4 w-4" />
            {exporting ? '导入中...' : '导入为参考图'}
          </button>
        </div>
      </div>
    </div>
  );
}
