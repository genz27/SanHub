'use client';
/* eslint-disable @next/next/no-img-element */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Check,
  Circle,
  Eye,
  Loader2,
  MousePointer2,
  Square,
  Trash2,
  X,
} from 'lucide-react';
import type { Generation } from '@/types';
import { toast } from '@/components/ui/toaster';
import { toProxiedMediaUrl } from '@/lib/client-media-url';
import {
  clampNormalizedRect,
  clientPointToNormalized,
  fitContainSize,
  hitTestEllipse,
  hitTestRect,
  normalizeRect,
  type CanvasPoint,
  type NormalizedRect,
} from '@/lib/image-canvas';
import {
  buildRegionPrompt,
  createRegionId,
  exportRegionEditImages,
  paintRegionAnnotation,
  regionColor,
  type EditRegion,
  type RegionEditDraft,
} from '@/lib/region-edit-document';
import { cn } from '@/lib/utils';

export type RegionEditResult = {
  files: File[];
  prompt: string;
  aspectRatio?: string;
  draft: RegionEditDraft;
};

type EditorTool = 'box' | 'circle' | 'select';
type HandleId = 'nw' | 'ne' | 'sw' | 'se';

const MIN_SIZE = 0.03;
const HANDLE_SIZE = 10;

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

export function ImageRegionEditor({
  generation,
  draft = null,
  submitting = false,
  onClose,
  onDraftChange,
  onApply,
  onApplyAndGenerate,
}: {
  generation: Generation;
  draft?: RegionEditDraft | null;
  submitting?: boolean;
  onClose: () => void;
  onDraftChange?: (draft: RegionEditDraft) => void;
  onApply: (result: RegionEditResult) => void;
  onApplyAndGenerate: (result: RegionEditResult) => void | Promise<void>;
}) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const previewCanvasRef = useRef<HTMLCanvasElement>(null);
  const [tool, setTool] = useState<EditorTool>('box');
  const [regions, setRegions] = useState<EditRegion[]>(draft?.regions ?? []);
  const [selectedId, setSelectedId] = useState<string | null>(draft?.regions[0]?.id ?? null);
  const [globalNote, setGlobalNote] = useState(draft?.globalNote ?? '');
  const [fitted, setFitted] = useState({ width: 0, height: 0 });
  const [busy, setBusy] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [imageReady, setImageReady] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const dragRef = useRef<{
    mode: 'create' | 'move' | 'resize';
    id?: string;
    handle?: HandleId;
    start: CanvasPoint;
    origin?: EditRegion;
  } | null>(null);

  const selected = regions.find((region) => region.id === selectedId) || null;
  const sourceUrl = toProxiedMediaUrl(`/api/media/${generation.id}`);

  const onDraftChangeRef = useRef(onDraftChange);
  const draftRef = useRef<RegionEditDraft>({ regions, globalNote });
  onDraftChangeRef.current = onDraftChange;
  draftRef.current = { regions, globalNote };

  useEffect(() => {
    const timer = window.setTimeout(() => {
      onDraftChangeRef.current?.(draftRef.current);
    }, 250);
    return () => window.clearTimeout(timer);
  }, [globalNote, regions]);

  useEffect(() => {
    return () => {
      onDraftChangeRef.current?.(draftRef.current);
    };
  }, []);

  useEffect(() => {
    const image = imageRef.current;
    const canvas = previewCanvasRef.current;
    if (!imageReady || !image?.naturalWidth || !canvas) return;
    const timer = window.setTimeout(() => {
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      const width = image.naturalWidth || image.width;
      const height = image.naturalHeight || image.height;
      canvas.width = width;
      canvas.height = height;
      paintRegionAnnotation(ctx, image, width, height, regions, globalNote);
      setPreviewUrl(canvas.toDataURL('image/jpeg', 0.86));
    }, 120);
    return () => window.clearTimeout(timer);
  }, [globalNote, imageReady, regions]);

  const updateFitted = useCallback(() => {
    const viewport = viewportRef.current;
    const image = imageRef.current;
    if (!viewport || !image) return;
    const rect = viewport.getBoundingClientRect();
    const next = fitContainSize(
      rect.width,
      rect.height,
      image.naturalWidth || image.width,
      image.naturalHeight || image.height
    );
    setFitted({ width: next.width, height: next.height });
  }, []);

  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const viewport = viewportRef.current;
    const observer = viewport ? new ResizeObserver(() => updateFitted()) : null;
    if (viewport && observer) observer.observe(viewport);
    window.addEventListener('resize', updateFitted);
    return () => {
      document.body.style.overflow = previous;
      observer?.disconnect();
      window.removeEventListener('resize', updateFitted);
    };
  }, [updateFitted]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        if (previewOpen) {
          setPreviewOpen(false);
          return;
        }
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
  }, [onClose, previewOpen, selectedId]);

  const toNormalized = useCallback(
    (event: React.PointerEvent<HTMLElement>, clampToImage = false): CanvasPoint | null => {
      const stage = stageRef.current;
      const image = imageRef.current;
      if (!stage || !image?.naturalWidth || fitted.width <= 0) return null;
      return clientPointToNormalized(stage, event.clientX, event.clientY, { clamp: clampToImage });
    },
    [fitted.width]
  );

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    const point = toNormalized(event);
    if (!point) return;
    event.currentTarget.setPointerCapture(event.pointerId);

    if (tool === 'select' && selected) {
      const stageRect = event.currentTarget.getBoundingClientRect();
      const handle = handlePositions(selected).find((item) => {
        const hx = stageRect.left + item.x * stageRect.width;
        const hy = stageRect.top + item.y * stageRect.height;
        return Math.abs(event.clientX - hx) <= HANDLE_SIZE && Math.abs(event.clientY - hy) <= HANDLE_SIZE;
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

    const id = createRegionId();
    const shape = tool === 'circle' ? 'ellipse' : 'rect';
    const next: EditRegion = { id, shape, note: '', x: point.x, y: point.y, w: 0.01, h: 0.01 };
    dragRef.current = { mode: 'create', id, start: point, origin: next };
    setRegions((current) => [...current, next]);
    setSelectedId(id);
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    const point = toNormalized(event, true);
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
      const { original, annotated } = await exportRegionEditImages(sourceUrl, regions, globalNote);
      const aspectRatio =
        typeof generation.params?.aspectRatio === 'string'
          ? generation.params.aspectRatio
          : undefined;
      return {
        files: [annotated, original],
        prompt: buildRegionPrompt(regions, globalNote),
        aspectRatio,
        draft: { regions, globalNote },
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
  }, [generation.params?.aspectRatio, globalNote, regions, sourceUrl]);

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
      <canvas ref={previewCanvasRef} className="hidden" />
      <div className="flex h-full max-h-[56rem] w-full max-w-6xl flex-col overflow-hidden rounded-2xl border border-border/70 bg-card/95 shadow-2xl">
        <div className="flex items-center justify-between gap-3 border-b border-border/70 px-4 py-3">
          <div>
            <p className="text-sm font-medium text-foreground">区域编辑</p>
            <p className="text-xs text-foreground/45">
              选区会记住。提交前可预览标注稿，再改时会带回上次的框
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
            ref={viewportRef}
            className="absolute inset-0 flex items-center justify-center overflow-hidden"
          >
            <div
              ref={stageRef}
              className="relative touch-none"
              style={
                fitted.width > 0 && fitted.height > 0
                  ? { width: fitted.width, height: fitted.height }
                  : { width: '100%', height: '100%' }
              }
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onPointerCancel={handlePointerUp}
            >
              <img
                ref={imageRef}
                src={sourceUrl}
                alt={generation.prompt || 'Region editor source'}
                className="block h-full w-full"
                draggable={false}
                onLoad={() => {
                  setImageReady(true);
                  updateFitted();
                }}
              />
              {regions.map((region, index) => {
                const isSelected = region.id === selectedId;
                const color = regionColor(index);
                return (
                  <div
                    key={region.id}
                    className={cn(
                      'pointer-events-none absolute border-2',
                      region.shape === 'ellipse' ? 'rounded-full' : 'rounded-sm',
                      isSelected ? 'bg-white/10' : 'bg-black/5'
                    )}
                    style={{
                      left: `${region.x * 100}%`,
                      top: `${region.y * 100}%`,
                      width: `${region.w * 100}%`,
                      height: `${region.h * 100}%`,
                      borderColor: color,
                    }}
                  >
                    <span
                      className="absolute -left-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-[10px] font-semibold text-white"
                      style={{ backgroundColor: color }}
                    >
                      {index + 1}
                    </span>
                    {isSelected &&
                      tool === 'select' &&
                      handlePositions(region).map((handle) => (
                        <span
                          key={handle.id}
                          className="absolute h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-sm border border-white bg-sky-400"
                          style={{
                            left: `${((handle.x - region.x) / Math.max(region.w, 0.001)) * 100}%`,
                            top: `${((handle.y - region.y) / Math.max(region.h, 0.001)) * 100}%`,
                          }}
                        />
                      ))}
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        <div className="space-y-3 border-t border-border/70 p-4">
          {regions.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <p className="text-[11px] text-foreground/45">
                  将修改 {regions.length} 处，关闭后再打开会带回这些框
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setRegions([]);
                    setSelectedId(null);
                    setGlobalNote('');
                  }}
                  className="text-[11px] text-foreground/45 underline-offset-2 hover:text-foreground hover:underline"
                >
                  清空选区
                </button>
              </div>
              {regions.map((region, index) => (
                <div key={region.id} className="flex items-center gap-2">
                  <span
                    className="inline-flex h-6 min-w-6 items-center justify-center rounded-full text-[11px] font-semibold text-white"
                    style={{ backgroundColor: regionColor(index) }}
                  >
                    {index + 1}
                  </span>
                  <input
                    value={region.note}
                    onChange={(event) => {
                      const note = event.target.value;
                      setRegions((current) =>
                        current.map((item) => (item.id === region.id ? { ...item, note } : item))
                      );
                      setSelectedId(region.id);
                    }}
                    onFocus={() => setSelectedId(region.id)}
                    placeholder={`第 ${index + 1} 处怎么改，例如改成哈气咪`}
                    className="h-9 min-w-0 flex-1 rounded-lg border border-border/70 bg-input/70 px-3 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring/30"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      setRegions((current) => current.filter((item) => item.id !== region.id));
                      setSelectedId((current) => (current === region.id ? null : current));
                    }}
                    className="inline-flex h-9 items-center gap-1 rounded-lg border border-red-500/30 px-3 text-xs text-red-300 hover:bg-red-500/10"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    删除
                  </button>
                </div>
              ))}
            </div>
          )}

          <textarea
            value={globalNote}
            onChange={(event) => setGlobalNote(event.target.value)}
            placeholder="描述编辑：可写总说明，或先框选/画圈再给每个选区单独写"
            className="min-h-[72px] w-full resize-none rounded-lg border border-border/70 bg-input/70 px-3 py-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring/30"
          />

          <div className="flex flex-wrap items-center justify-end gap-2">
            {regions.length > 0 && (
              <button
                type="button"
                onClick={() => setPreviewOpen(true)}
                className="mr-auto inline-flex h-10 items-center gap-2 rounded-lg border border-border/70 px-3 text-sm text-foreground/80 hover:bg-card"
              >
                <span className="relative h-8 w-8 overflow-hidden rounded-md border border-border/60 bg-background">
                  {previewUrl ? (
                    <img src={previewUrl} alt="" className="h-full w-full object-cover" />
                  ) : null}
                </span>
                <Eye className="h-4 w-4" />
                预览标注稿
              </button>
            )}
            <button
              type="button"
              disabled={busy || submitting}
              onClick={async () => {
                const result = await buildResult();
                if (result) onApply(result);
              }}
              className="inline-flex h-10 items-center rounded-lg border border-border/70 px-4 text-sm text-foreground/80 hover:bg-card disabled:opacity-60"
            >
              填入输入栏
            </button>
            <button
              type="button"
              disabled={busy || submitting}
              onClick={async () => {
                const result = await buildResult();
                if (result) await onApplyAndGenerate(result);
              }}
              className="inline-flex h-10 items-center gap-2 rounded-lg bg-foreground px-4 text-sm font-medium text-background hover:opacity-90 disabled:opacity-60"
            >
              {busy || submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
              {submitting ? '提交中...' : busy ? '导出中...' : '立即生成'}
            </button>
          </div>
        </div>
      </div>
      {previewOpen && previewUrl && (
        <div
          className="absolute inset-0 z-20 flex items-center justify-center bg-background/80 p-4"
          onClick={() => setPreviewOpen(false)}
        >
          <div
            className="flex max-h-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-border/70 bg-card p-3 shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mb-2 flex items-center justify-between gap-3">
              <p className="text-sm text-foreground">模型将看到的标注稿</p>
              <button
                type="button"
                onClick={() => setPreviewOpen(false)}
                className="rounded-lg border border-border/70 p-1.5 text-foreground/70 hover:bg-background"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <img
              src={previewUrl}
              alt="Annotated region preview"
              className="max-h-[70vh] w-auto rounded-xl object-contain"
            />
          </div>
        </div>
      )}
    </div>
  );
}
