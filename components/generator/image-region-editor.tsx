'use client';
/* eslint-disable @next/next/no-img-element */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Check,
  Circle,
  Loader2,
  MousePointer2,
  Square,
  Trash2,
  X,
} from 'lucide-react';
import type { Generation } from '@/types';
import { toast } from '@/components/ui/toaster';
import {
  canvasToFile,
  clampNormalizedRect,
  clientPointOnElement,
  fetchImageAsFile,
  getContainedRect,
  hitTestEllipse,
  hitTestRect,
  loadImageFromUrl,
  normalizeRect,
  pointerToNormalized,
  type CanvasPoint,
  type ContainedRect,
  type NormalizedRect,
} from '@/lib/image-canvas';
import { cn } from '@/lib/utils';

export type RegionEditResult = {
  files: File[];
  prompt: string;
  aspectRatio?: string;
};

type EditorTool = 'box' | 'circle' | 'select';
type HandleId = 'nw' | 'ne' | 'sw' | 'se';

type EditRegion = NormalizedRect & {
  id: string;
  shape: 'rect' | 'ellipse';
  note: string;
};

const MIN_SIZE = 0.03;
const HANDLE_SIZE = 10;

function createId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function regionContains(region: EditRegion, point: CanvasPoint): boolean {
  return region.shape === 'ellipse' ? hitTestEllipse(point, region) : hitTestRect(point, region);
}

function handlePositions(region: EditRegion): Array<{ id: HandleId; x: number; y: number }> {
  return [
    { id: 'nw', x: region.x, y: region.y },
    { id: 'ne', x: region.x + region.w, y: region.y },
    { id: 'sw', x: region.x, y: region.y + region.h },
    { id: 'se', x: region.x + region.w, y: region.y + region.h },
  ];
}

function withClampedRect(region: EditRegion, rect: NormalizedRect): EditRegion {
  return {
    ...region,
    ...clampNormalizedRect(rect),
  };
}

function resizeRegion(region: EditRegion, handle: HandleId, point: CanvasPoint): EditRegion {
  const right = region.x + region.w;
  const bottom = region.y + region.h;
  let next = region;

  if (handle === 'nw') next = { ...region, ...normalizeRect(point.x, point.y, right, bottom) };
  if (handle === 'ne') next = { ...region, ...normalizeRect(region.x, point.y, point.x, bottom) };
  if (handle === 'sw') next = { ...region, ...normalizeRect(point.x, region.y, right, point.y) };
  if (handle === 'se') next = { ...region, ...normalizeRect(region.x, region.y, point.x, point.y) };

  return { ...next, id: region.id, shape: region.shape, note: region.note };
}

function buildRegionPrompt(
  regions: EditRegion[],
  globalNote: string,
  hasOriginalReference: boolean
): string {
  const labeled = regions.map((region, index) => {
    const shapeLabel = region.shape === 'ellipse' ? '圆形选区' : '矩形选区';
    const note = region.note.trim() || globalNote.trim() || '按整体说明修改此处';
    return `区域 ${index + 1}（${shapeLabel}，位置约 ${Math.round(region.x * 100)}%,${Math.round(region.y * 100)}%）: ${note}`;
  });

  const overall = globalNote.trim();
  return [
    hasOriginalReference
      ? '请以第一张参考图为原图，第二张带青色标注的参考图只用来指示修改范围。'
      : '请以这张参考图为原图。青色虚线框、编号和文字只是修改范围标记。',
    '除标注区域外，构图、人物身份、光影、背景和未标注细节必须保持一致，不要重绘整张图。',
    '最终结果里不要出现标注框、编号圆点或说明文字。',
    overall ? `整体修改说明：${overall}` : '',
    ...labeled,
  ]
    .filter(Boolean)
    .join('\n');
}

async function exportAnnotatedImage(
  sourceUrl: string,
  regions: EditRegion[]
): Promise<{ original: File; annotated: File }> {
  const original = await fetchImageAsFile(sourceUrl, `original-${Date.now()}.png`);
  const image = await loadImageFromUrl(sourceUrl);
  const canvas = document.createElement('canvas');
  canvas.width = image.naturalWidth || image.width;
  canvas.height = image.naturalHeight || image.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Failed to create annotation canvas');
  }

  ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
  const stroke = Math.max(4, Math.round(canvas.width * 0.0045));

  regions.forEach((region, index) => {
    const x = region.x * canvas.width;
    const y = region.y * canvas.height;
    const w = region.w * canvas.width;
    const h = region.h * canvas.height;

    ctx.save();
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = stroke;
    ctx.setLineDash([stroke * 2.2, stroke * 1.4]);
    if (region.shape === 'ellipse') {
      ctx.beginPath();
      ctx.ellipse(x + w / 2, y + h / 2, w / 2, h / 2, 0, 0, Math.PI * 2);
      ctx.stroke();
    } else {
      ctx.strokeRect(x, y, w, h);
    }

    const badge = String(index + 1);
    const badgeSize = Math.max(28, Math.round(canvas.width * 0.028));
    ctx.setLineDash([]);
    ctx.fillStyle = '#0ea5e9';
    ctx.beginPath();
    ctx.arc(x + 8 + badgeSize / 2, y + 8 + badgeSize / 2, badgeSize / 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.font = `700 ${Math.round(badgeSize * 0.55)}px ui-sans-serif, system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(badge, x + 8 + badgeSize / 2, y + 8 + badgeSize / 2);

    if (region.note.trim()) {
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      ctx.font = `600 ${Math.round(badgeSize * 0.42)}px ui-sans-serif, system-ui, sans-serif`;
      const label = region.note.trim().slice(0, 24);
      const labelX = x + badgeSize + 16;
      const labelY = y + 10;
      const metrics = ctx.measureText(label);
      ctx.fillStyle = 'rgba(15, 23, 42, 0.72)';
      ctx.fillRect(labelX - 6, labelY - 4, metrics.width + 12, badgeSize * 0.62);
      ctx.fillStyle = '#f8fafc';
      ctx.fillText(label, labelX, labelY);
    }
    ctx.restore();
  });

  const annotated = await canvasToFile(
    canvas,
    `region-edit-${Date.now()}.jpg`,
    'image/jpeg',
    0.92
  );
  return { original, annotated };
}

export function ImageRegionEditor({
  generation,
  allowMultipleReferences = true,
  onClose,
  onApply,
  onApplyAndGenerate,
}: {
  generation: Generation;
  allowMultipleReferences?: boolean;
  onClose: () => void;
  onApply: (result: RegionEditResult) => void;
  onApplyAndGenerate: (result: RegionEditResult) => void;
}) {
  const stageRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const [tool, setTool] = useState<EditorTool>('box');
  const [regions, setRegions] = useState<EditRegion[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [globalNote, setGlobalNote] = useState('');
  const [frame, setFrame] = useState<ContainedRect>({ x: 0, y: 0, w: 0, h: 0, scale: 1 });
  const [busy, setBusy] = useState(false);
  const dragRef = useRef<{
    mode: 'create' | 'move' | 'resize';
    id?: string;
    handle?: HandleId;
    start: CanvasPoint;
    origin?: EditRegion;
  } | null>(null);

  const selected = regions.find((region) => region.id === selectedId) || null;
  const previewUrl = generation.resultUrl || `/api/media/${generation.id}`;
  const sourceUrl = `/api/media/${generation.id}`;

  const updateFrame = useCallback(() => {
    const stage = stageRef.current;
    const image = imageRef.current;
    if (!stage || !image) return;
    setFrame(
      getContainedRect(
        stage.clientWidth,
        stage.clientHeight,
        image.naturalWidth || image.width,
        image.naturalHeight || image.height
      )
    );
  }, []);

  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.addEventListener('resize', updateFrame);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener('resize', updateFrame);
    };
  }, [updateFrame]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
        return;
      }
      if ((event.key === 'Delete' || event.key === 'Backspace') && selectedId) {
        const target = event.target as HTMLElement | null;
        if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return;
        setRegions((current) => current.filter((region) => region.id !== selectedId));
        setSelectedId(null);
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose, selectedId]);

  const toNormalized = useCallback(
    (event: React.PointerEvent<HTMLDivElement>): CanvasPoint | null => {
      const stage = stageRef.current;
      if (!stage) return null;
      return pointerToNormalized(clientPointOnElement(stage, event.clientX, event.clientY), frame);
    },
    [frame]
  );

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    const point = toNormalized(event);
    if (!point) return;
    event.currentTarget.setPointerCapture(event.pointerId);

    if (tool === 'select' && selected) {
      const handle = handlePositions(selected).find((item) => {
        const hx = frame.x + item.x * frame.w;
        const hy = frame.y + item.y * frame.h;
        const local = clientPointOnElement(event.currentTarget, event.clientX, event.clientY);
        return Math.abs(local.x - hx) <= HANDLE_SIZE && Math.abs(local.y - hy) <= HANDLE_SIZE;
      });
      if (handle) {
        dragRef.current = {
          mode: 'resize',
          id: selected.id,
          handle: handle.id,
          start: point,
          origin: selected,
        };
        return;
      }
    }

    if (tool === 'select') {
      const hit = [...regions].reverse().find((region) => regionContains(region, point));
      setSelectedId(hit?.id ?? null);
      if (hit) {
        dragRef.current = { mode: 'move', id: hit.id, start: point, origin: hit };
      }
      return;
    }

    const id = createId();
    const shape = tool === 'circle' ? 'ellipse' : 'rect';
    const next: EditRegion = { id, shape, note: '', x: point.x, y: point.y, w: 0.01, h: 0.01 };
    dragRef.current = { mode: 'create', id, start: point, origin: next };
    setRegions((current) => [...current, next]);
    setSelectedId(id);
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    const point = toNormalized(event);
    if (!drag || !point) return;

    setRegions((current) =>
      current.map((region) => {
        if (region.id !== drag.id || !drag.origin) return region;
        if (drag.mode === 'create') {
          return withClampedRect(
            region,
            normalizeRect(drag.start.x, drag.start.y, point.x, point.y)
          );
        }
        if (drag.mode === 'move') {
          return withClampedRect(region, {
            x: drag.origin.x + (point.x - drag.start.x),
            y: drag.origin.y + (point.y - drag.start.y),
            w: drag.origin.w,
            h: drag.origin.h,
          });
        }
        if (drag.handle) {
          return withClampedRect(region, resizeRegion(drag.origin, drag.handle, point));
        }
        return region;
      })
    );
  };

  const handlePointerUp = () => {
    const drag = dragRef.current;
    dragRef.current = null;
    if (!drag?.id) return;
    setRegions((current) => {
      const target = current.find((region) => region.id === drag.id);
      if (!target || target.w < MIN_SIZE || target.h < MIN_SIZE) {
        const next = current.filter((region) => region.id !== drag.id);
        if (selectedId === drag.id) setSelectedId(next.at(-1)?.id ?? null);
        return next;
      }
      return current;
    });
  };

  const buildResult = useCallback(async (): Promise<RegionEditResult | null> => {
    if (regions.length === 0) {
      toast({ title: '还没有选区', description: '先用框选或画圈标出要改的区域' });
      return null;
    }
    if (!globalNote.trim() && regions.every((region) => !region.note.trim())) {
      toast({ title: '请填写修改说明', description: '给选中区域或底部输入框写上要怎么改' });
      return null;
    }

    setBusy(true);
    try {
      const { original, annotated } = await exportAnnotatedImage(sourceUrl, regions);
      const files = allowMultipleReferences ? [original, annotated] : [annotated];
      const aspectRatio =
        typeof generation.params?.aspectRatio === 'string'
          ? generation.params.aspectRatio
          : undefined;
      return {
        files,
        prompt: buildRegionPrompt(regions, globalNote, allowMultipleReferences),
        aspectRatio,
      };
    } catch (error) {
      toast({
        title: '导出选区失败',
        description: error instanceof Error ? error.message : '请稍后重试',
        variant: 'destructive',
      });
      return null;
    } finally {
      setBusy(false);
    }
  }, [allowMultipleReferences, generation.params?.aspectRatio, globalNote, regions, sourceUrl]);

  const tools = useMemo(
    () =>
      [
        { id: 'box' as const, label: '框选编辑', icon: Square },
        { id: 'circle' as const, label: '画圈编辑', icon: Circle },
        { id: 'select' as const, label: '选中编辑', icon: MousePointer2 },
      ] satisfies Array<{ id: EditorTool; label: string; icon: typeof Square }>,
    []
  );

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-background/94 p-3 backdrop-blur-xl">
      <div className="flex h-full max-h-[56rem] w-full max-w-6xl flex-col overflow-hidden rounded-2xl border border-border/70 bg-card/95 shadow-2xl">
        <div className="flex items-center justify-between gap-3 border-b border-border/70 px-4 py-3">
          <div>
            <p className="text-sm font-medium text-foreground">区域编辑</p>
            <p className="text-xs text-foreground/45">
              框选或画圈标出要改的位置，选中后可拖动、缩放并填写说明
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-border/70 p-2 text-foreground/70 hover:bg-card"
            title="关闭"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="relative min-h-0 flex-1 bg-background/40">
          <div className="absolute top-4 left-1/2 z-10 flex -translate-x-1/2 items-center gap-1 rounded-full border border-border/70 bg-card/90 p-1 shadow-lg">
            {tools.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setTool(item.id)}
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-full px-3 py-2 text-xs font-medium transition-colors',
                  tool === item.id
                    ? 'bg-foreground text-background'
                    : 'text-foreground/70 hover:bg-card'
                )}
              >
                <item.icon className="h-3.5 w-3.5" />
                {item.label}
              </button>
            ))}
          </div>

          <div
            ref={stageRef}
            className="absolute inset-0 touch-none"
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
          >
            <img
              ref={imageRef}
              src={previewUrl}
              alt={generation.prompt || 'Region editor source'}
              className="h-full w-full object-contain"
              draggable={false}
              onLoad={updateFrame}
            />
            {regions.map((region, index) => {
              const isSelected = region.id === selectedId;
              return (
                <div
                  key={region.id}
                  className={cn(
                    'pointer-events-none absolute border-2',
                    region.shape === 'ellipse' ? 'rounded-full' : 'rounded-sm',
                    isSelected ? 'border-sky-400 bg-sky-400/10' : 'border-sky-300/80 bg-sky-400/5'
                  )}
                  style={{
                    left: frame.x + region.x * frame.w,
                    top: frame.y + region.y * frame.h,
                    width: region.w * frame.w,
                    height: region.h * frame.h,
                  }}
                >
                  <span className="absolute -left-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-sky-500 px-1 text-[10px] font-semibold text-white">
                    {index + 1}
                  </span>
                  {isSelected &&
                    tool === 'select' &&
                    handlePositions(region).map((handle) => (
                      <span
                        key={handle.id}
                        className="absolute h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-sm border border-white bg-sky-400"
                        style={{
                          left: (handle.x - region.x) * frame.w,
                          top: (handle.y - region.y) * frame.h,
                        }}
                      />
                    ))}
                </div>
              );
            })}
          </div>
        </div>

        <div className="space-y-3 border-t border-border/70 p-4">
          {selected && (
            <div className="flex items-center gap-2">
              <span className="shrink-0 text-xs text-foreground/50">
                选区 {regions.findIndex((region) => region.id === selected.id) + 1}
              </span>
              <input
                value={selected.note}
                onChange={(event) => {
                  const note = event.target.value;
                  setRegions((current) =>
                    current.map((region) =>
                      region.id === selected.id ? { ...region, note } : region
                    )
                  );
                }}
                placeholder="只改这个选区：例如把左眼改成轮回眼"
                className="h-9 min-w-0 flex-1 rounded-lg border border-border/70 bg-input/70 px-3 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring/30"
              />
              <button
                type="button"
                onClick={() => {
                  setRegions((current) => current.filter((region) => region.id !== selected.id));
                  setSelectedId(null);
                }}
                className="inline-flex h-9 items-center gap-1 rounded-lg border border-red-500/30 px-3 text-xs text-red-300 hover:bg-red-500/10"
              >
                <Trash2 className="h-3.5 w-3.5" />
                删除选区
              </button>
            </div>
          )}

          <textarea
            value={globalNote}
            onChange={(event) => setGlobalNote(event.target.value)}
            placeholder="描述编辑：可写总说明，或先框选/画圈再给每个选区单独写"
            className="min-h-[72px] w-full resize-none rounded-lg border border-border/70 bg-input/70 px-3 py-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring/30"
          />

          <div className="flex flex-wrap items-center justify-end gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={async () => {
                const result = await buildResult();
                if (result) onApply(result);
              }}
              className="inline-flex h-10 items-center rounded-lg border border-border/70 px-4 text-sm text-foreground/80 hover:bg-card disabled:opacity-60"
            >
              仅应用到输入
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={async () => {
                const result = await buildResult();
                if (result) onApplyAndGenerate(result);
              }}
              className="inline-flex h-10 items-center gap-2 rounded-lg bg-foreground px-4 text-sm font-medium text-background hover:opacity-90 disabled:opacity-60"
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
              应用并生成
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
