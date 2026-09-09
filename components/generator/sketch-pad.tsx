'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Check,
  Circle,
  Eraser,
  Minus,
  MousePointer2,
  Pencil,
  Redo2,
  Square,
  Trash2,
  Type,
  Undo2,
  X,
} from 'lucide-react';
import { toast } from '@/components/ui/toaster';
import { canvasToPngFile, clientPointOnElement, normalizeRect, type CanvasPoint } from '@/lib/image-canvas';
import {
  createSketchId,
  hitTestSketchElement,
  resizeSketchShape,
  sketchHandlePositions,
  textBounds,
  type SketchElement,
  type SketchHandle,
  type SketchTool,
} from '@/lib/sketch-document';
import { cn } from '@/lib/utils';

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

const CANVAS_CSS_SIZE = 760;
const MIN_SHAPE_SIZE = 8;

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
    ctx.strokeStyle = element.color;
    ctx.fillStyle = element.color;
    ctx.lineCap = 'round';

    if (element.kind === 'shape') {
      ctx.lineWidth = element.size;
      if (element.shape === 'rect') {
        ctx.strokeRect(element.x, element.y, element.w, element.h);
      } else if (element.shape === 'circle') {
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
      } else {
        ctx.beginPath();
        ctx.moveTo(element.x, element.y);
        ctx.lineTo(element.x + element.w, element.y + element.h);
        ctx.stroke();
      }
    } else {
      ctx.font = `${element.size}px ui-sans-serif, system-ui, sans-serif`;
      ctx.textBaseline = 'alphabetic';
      ctx.fillText(element.text, element.x, element.y);
    }
    ctx.restore();

    if (selectedId !== element.id) continue;

    ctx.save();
    ctx.setLineDash([6, 4]);
    ctx.strokeStyle = '#0ea5e9';
    ctx.lineWidth = 1.5;
    if (element.kind === 'shape' && element.shape !== 'line') {
      ctx.strokeRect(element.x - 4, element.y - 4, element.w + 8, element.h + 8);
    } else if (element.kind === 'text') {
      const bounds = textBounds(element);
      ctx.strokeRect(bounds.x - 4, bounds.y - 4, bounds.w + 8, bounds.h + 8);
    }
    ctx.restore();
  }
}

export function SketchPad({
  open,
  elements,
  onElementsChange,
  onClose,
  onConfirm,
}: {
  open: boolean;
  elements: SketchElement[];
  onElementsChange: (elements: SketchElement[]) => void;
  onClose: () => void;
  onConfirm: (file: File) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const elementsRef = useRef<SketchElement[]>(elements);
  const [history, setHistory] = useState<SketchElement[][]>([elements]);
  const [historyIndex, setHistoryIndex] = useState(0);
  const [tool, setTool] = useState<SketchTool>('pencil');
  const [color, setColor] = useState('#111827');
  const [brushSize, setBrushSize] = useState(6);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editingTextId, setEditingTextId] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const drawingRef = useRef<{
    mode: 'draw' | 'move' | 'resize';
    id: string;
    start: CanvasPoint;
    origin?: SketchElement;
    handle?: SketchHandle;
  } | null>(null);

  const selected = elements.find((element) => element.id === selectedId) || null;
  const editingText = elements.find(
    (element): element is Extract<SketchElement, { kind: 'text' }> =>
      element.kind === 'text' && element.id === editingTextId
  );

  useEffect(() => {
    elementsRef.current = elements;
  }, [elements]);

  const replaceElements = useCallback(
    (next: SketchElement[], recordHistory = false) => {
      elementsRef.current = next;
      onElementsChange(next);
      if (!recordHistory) return;
      setHistory((current) => {
        const clipped = current.slice(0, historyIndex + 1);
        const updated = [...clipped, next].slice(-40);
        setHistoryIndex(updated.length - 1);
        return updated;
      });
    },
    [historyIndex, onElementsChange]
  );

  const paint = useCallback(
    (nextElements: SketchElement[]) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      const dpr = window.devicePixelRatio || 1;
      const cssWidth = canvas.width / dpr;
      const cssHeight = canvas.height / dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      drawElements(ctx, nextElements, cssWidth, cssHeight, selectedId);
    },
    [selectedId]
  );

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

  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const typing = target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA');
      if (event.key === 'Escape') {
        if (editingTextId) {
          setEditingTextId(null);
          return;
        }
        onClose();
        return;
      }
      if ((event.key === 'Delete' || event.key === 'Backspace') && selectedId && !typing) {
        event.preventDefault();
        replaceElements(
          elementsRef.current.filter((element) => element.id !== selectedId),
          true
        );
        setSelectedId(null);
        setEditingTextId(null);
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [editingTextId, onClose, open, replaceElements, selectedId]);

  const getPoint = useCallback((event: { clientX: number; clientY: number }): CanvasPoint => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    return clientPointOnElement(canvas, event.clientX, event.clientY);
  }, []);

  const startTextAt = (point: CanvasPoint, existing?: Extract<SketchElement, { kind: 'text' }>) => {
    if (existing) {
      setSelectedId(existing.id);
      setEditingTextId(existing.id);
      return;
    }
    const id = createSketchId();
    const next: SketchElement = {
      id,
      kind: 'text',
      color,
      size: Math.max(18, brushSize * 3),
      x: point.x,
      y: point.y,
      text: '',
    };
    replaceElements([...elementsRef.current, next], true);
    setSelectedId(id);
    setEditingTextId(id);
  };

  const handlePointerDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (editingTextId) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    const point = getPoint(event);

    if (tool === 'select') {
      const hit = [...elements].reverse().find((element) => hitTestSketchElement(element, point));
      setSelectedId(hit?.id ?? null);
      if (hit && hit.kind !== 'stroke') {
        drawingRef.current = { mode: 'move', id: hit.id, start: point, origin: hit };
      }
      return;
    }

    if (tool === 'text') {
      const hit = [...elements]
        .reverse()
        .find(
          (element): element is Extract<SketchElement, { kind: 'text' }> =>
            element.kind === 'text' && hitTestSketchElement(element, point)
        );
      startTextAt(point, hit);
      return;
    }

    const id = createSketchId();
    drawingRef.current = { mode: 'draw', id, start: point };
    setSelectedId(id);

    if (tool === 'pencil' || tool === 'eraser') {
      replaceElements([
        ...elements,
        {
          id,
          kind: 'stroke',
          tool,
          color,
          size: brushSize,
          points: [point],
        },
      ]);
      return;
    }

    replaceElements([
      ...elements,
      {
        id,
        kind: 'shape',
        shape: tool === 'circle' ? 'circle' : tool === 'line' ? 'line' : 'rect',
        color,
        size: Math.max(2, brushSize / 2),
        x: point.x,
        y: point.y,
        w: 0,
        h: 0,
      },
    ]);
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLElement>) => {
    const drawing = drawingRef.current;
    if (!drawing) return;
    const point = getPoint(event);

    if (drawing.mode === 'move' && drawing.origin && drawing.origin.kind !== 'stroke') {
      const origin = drawing.origin;
      const dx = point.x - drawing.start.x;
      const dy = point.y - drawing.start.y;
      replaceElements(
        elementsRef.current.map((element) => {
          if (element.id !== drawing.id) return element;
          if (element.kind === 'text' && origin.kind === 'text') {
            return { ...element, x: origin.x + dx, y: origin.y + dy };
          }
          if (element.kind === 'shape' && origin.kind === 'shape') {
            return { ...element, x: origin.x + dx, y: origin.y + dy };
          }
          return element;
        })
      );
      return;
    }

    if (drawing.mode === 'resize' && drawing.origin?.kind === 'shape' && drawing.handle) {
      replaceElements(
        elementsRef.current.map((element) =>
          element.id === drawing.id && element.kind === 'shape'
            ? resizeSketchShape(drawing.origin as Extract<SketchElement, { kind: 'shape' }>, drawing.handle!, point)
            : element
        )
      );
      return;
    }

    if (tool === 'pencil' || tool === 'eraser') {
      replaceElements(
        elementsRef.current.map((element) =>
          element.id === drawing.id && element.kind === 'stroke'
            ? { ...element, points: [...element.points, point] }
            : element
        )
      );
      return;
    }

    if (tool === 'rect' || tool === 'circle' || tool === 'line') {
      const next =
        tool === 'line'
          ? { x: drawing.start.x, y: drawing.start.y, w: point.x - drawing.start.x, h: point.y - drawing.start.y }
          : normalizeRect(drawing.start.x, drawing.start.y, point.x, point.y);
      replaceElements(
        elementsRef.current.map((element) =>
          element.id === drawing.id && element.kind === 'shape' ? { ...element, ...next } : element
        )
      );
    }
  };

  const finishStroke = () => {
    const drawing = drawingRef.current;
    drawingRef.current = null;
    if (!drawing) return;

    const next = elementsRef.current.filter((element) => {
      if (element.id !== drawing.id) return true;
      if (element.kind === 'shape') {
        return Math.abs(element.w) >= MIN_SHAPE_SIZE || Math.abs(element.h) >= MIN_SHAPE_SIZE;
      }
      return true;
    });
    replaceElements(next, true);
    if (next.every((element) => element.id !== drawing.id)) {
      setSelectedId(null);
    }
  };

  const updateSelected = (patch: Partial<SketchElement>) => {
    if (!selectedId) return;
    replaceElements(
      elementsRef.current.map((element) =>
        element.id === selectedId ? ({ ...element, ...patch } as SketchElement) : element
      ),
      true
    );
  };

  const undo = () => {
    if (historyIndex <= 0) return;
    const nextIndex = historyIndex - 1;
    setHistoryIndex(nextIndex);
    const next = history[nextIndex] || [];
    elementsRef.current = next;
    onElementsChange(next);
    setSelectedId(null);
    setEditingTextId(null);
  };

  const redo = () => {
    if (historyIndex >= history.length - 1) return;
    const nextIndex = historyIndex + 1;
    setHistoryIndex(nextIndex);
    const next = history[nextIndex] || [];
    elementsRef.current = next;
    onElementsChange(next);
  };

  const handleConfirm = async () => {
    if (elements.length === 0) {
      toast({
        title: '草图是空的',
        description: '先画一点、写文字或加图形，再导入为参考图',
      });
      return;
    }

    const canvas = canvasRef.current;
    if (!canvas) return;

    setExporting(true);
    try {
      const file = await canvasToPngFile(canvas, `sketch-${Date.now()}.png`);
      onConfirm(file);
      toast({
        title: '草图已导入参考图',
        description: '之后还可以再打开这张草图继续改文字和图形',
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
        { id: 'select' as const, label: '选中编辑', icon: MousePointer2 },
        { id: 'pencil' as const, label: '画笔', icon: Pencil },
        { id: 'text' as const, label: '文字', icon: Type },
        { id: 'rect' as const, label: '矩形', icon: Square },
        { id: 'circle' as const, label: '圆形', icon: Circle },
        { id: 'line' as const, label: '直线', icon: Minus },
        { id: 'eraser' as const, label: '橡皮', icon: Eraser },
      ] satisfies Array<{ id: SketchTool; label: string; icon: typeof Pencil }>,
    []
  );

  const applyStyleToSelected = (nextColor: string, nextSize: number) => {
    if (!selected || selected.kind === 'stroke') return;
    updateSelected({
      color: nextColor,
      size: selected.kind === 'text' ? Math.max(14, nextSize * 3) : Math.max(2, nextSize / 2),
    });
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-background/92 p-3 backdrop-blur-xl">
      <div className="flex h-full max-h-[56rem] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-border/70 bg-card/95 shadow-2xl">
        <div className="flex items-center justify-between gap-3 border-b border-border/70 px-4 py-3">
          <div>
            <p className="text-sm font-medium text-foreground">网页草图</p>
            <p className="text-xs text-foreground/45">
              在当前页面画图、改文字、改矩形/圆形/直线。选中后可拖动、缩放或改内容。
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={undo}
              disabled={historyIndex <= 0}
              className="rounded-lg border border-border/70 p-2 text-foreground/70 hover:bg-card disabled:opacity-40"
              title="撤销"
            >
              <Undo2 className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={redo}
              disabled={historyIndex >= history.length - 1}
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

        <div className="relative flex min-h-0 flex-1 items-center justify-center bg-zinc-200/80 p-4">
          <div className="absolute top-4 left-1/2 z-10 flex -translate-x-1/2 items-center gap-1 rounded-full border border-border/70 bg-card/95 p-1 shadow-lg">
            {tools.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  setTool(item.id);
                  setEditingTextId(null);
                }}
                className={cn(
                  'inline-flex items-center gap-1 rounded-full px-2.5 py-2 text-[11px] font-medium text-foreground/70 transition-colors',
                  tool === item.id ? 'bg-foreground text-background' : 'hover:bg-card'
                )}
                title={item.label}
              >
                <item.icon className="h-4 w-4" />
                <span className="hidden sm:inline">{item.label}</span>
              </button>
            ))}
          </div>

          <div ref={wrapRef} className="flex h-full w-full items-center justify-center pt-12">
            <div className="relative">
              <canvas
                ref={canvasRef}
                className="max-h-full max-w-full touch-none rounded-xl border border-black/10 bg-white shadow-xl"
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={finishStroke}
                onPointerCancel={finishStroke}
                onDoubleClick={(event) => {
                  const point = getPoint(event);
                  const hit = [...elements]
                    .reverse()
                    .find(
                      (element): element is Extract<SketchElement, { kind: 'text' }> =>
                        element.kind === 'text' && hitTestSketchElement(element, point)
                    );
                  if (hit) startTextAt(point, hit);
                }}
              />

              {selected?.kind === 'shape' && tool === 'select' && (
                <>
                  {sketchHandlePositions(selected).map((handle) => (
                    <button
                      key={handle.id}
                      type="button"
                      className="absolute z-10 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-sm border border-white bg-sky-500 shadow"
                      style={{ left: handle.x, top: handle.y }}
                      onPointerDown={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        event.currentTarget.setPointerCapture(event.pointerId);
                        drawingRef.current = {
                          mode: 'resize',
                          id: selected.id,
                          start: getPoint(event),
                          origin: selected,
                          handle: handle.id,
                        };
                      }}
                      onPointerMove={handlePointerMove}
                      onPointerUp={finishStroke}
                    />
                  ))}
                </>
              )}

              {editingText && (
                <textarea
                  autoFocus
                  value={editingText.text}
                  onChange={(event) => {
                    replaceElements(
                      elementsRef.current.map((element) =>
                        element.id === editingText.id && element.kind === 'text'
                          ? { ...element, text: event.target.value }
                          : element
                      )
                    );
                  }}
                  onBlur={() => {
                    if (!editingText.text.trim()) {
                      replaceElements(
                        elementsRef.current.filter((element) => element.id !== editingText.id),
                        true
                      );
                    } else {
                      replaceElements(elementsRef.current, true);
                    }
                    setEditingTextId(null);
                  }}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' && !event.shiftKey) {
                      event.preventDefault();
                      (event.target as HTMLTextAreaElement).blur();
                    }
                  }}
                  className="absolute z-20 min-h-8 min-w-32 resize-none rounded-md border border-sky-400 bg-white px-2 py-1 text-sm text-black shadow-lg outline-none"
                  style={{
                    left: editingText.x,
                    top: editingText.y - editingText.size,
                    fontSize: editingText.size,
                    color: editingText.color,
                  }}
                  placeholder="输入文字"
                />
              )}
            </div>
          </div>
        </div>

        <div className="space-y-3 border-t border-border/70 px-4 py-3">
          {selected && selected.kind !== 'stroke' && (
            <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border/70 bg-background/40 p-2">
              <span className="text-xs text-foreground/50">
                {selected.kind === 'text'
                  ? '编辑文字'
                  : selected.shape === 'circle'
                    ? '编辑圆形'
                    : selected.shape === 'line'
                      ? '编辑直线'
                      : '编辑矩形'}
              </span>
              {selected.kind === 'text' && (
                <input
                  value={selected.text}
                  onChange={(event) => updateSelected({ text: event.target.value })}
                  className="h-8 min-w-[12rem] flex-1 rounded-md border border-border/70 bg-input/70 px-2 text-sm text-foreground outline-none"
                  placeholder="修改文字内容"
                />
              )}
              <button
                type="button"
                onClick={() => {
                  replaceElements(
                    elementsRef.current.filter((element) => element.id !== selected.id),
                    true
                  );
                  setSelectedId(null);
                  setEditingTextId(null);
                }}
                className="inline-flex h-8 items-center gap-1 rounded-md border border-red-500/30 px-2 text-xs text-red-300 hover:bg-red-500/10"
              >
                <Trash2 className="h-3.5 w-3.5" />
                删除
              </button>
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              {SKETCH_COLORS.map((value) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => {
                    setColor(value);
                    applyStyleToSelected(value, brushSize);
                  }}
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
                onChange={(event) => {
                  setColor(event.target.value);
                  applyStyleToSelected(event.target.value, brushSize);
                }}
                className="h-7 w-7 cursor-pointer rounded-full border border-border/70 bg-transparent p-0"
                title="自定义颜色"
              />
              <label className="ml-2 flex items-center gap-2 text-xs text-foreground/50">
                粗细
                <input
                  type="range"
                  min={2}
                  max={28}
                  value={brushSize}
                  onChange={(event) => {
                    const nextSize = Number(event.target.value);
                    setBrushSize(nextSize);
                    applyStyleToSelected(color, nextSize);
                  }}
                  className="w-24 accent-sky-500"
                />
              </label>
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
    </div>
  );
}
