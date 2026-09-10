'use client';
/* eslint-disable @next/next/no-img-element */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Check,
  Circle,
  Eye,
  Loader2,
  MousePointer2,
  Redo2,
  Sparkles,
  Square,
  Trash2,
  Type,
  Undo2,
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
  createRegionEditDraft,
  createRegionId,
  exportRegionEditImages,
  paintRegionAnnotation,
  regionColor,
  resolveRegionEditIntent,
  type EditRegion,
  type RegionEditDraft,
  type RegionEditIntent,
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

function hydrateDraft(draft?: RegionEditDraft | null): RegionEditDraft {
  const regions = draft?.regions ?? [];
  const globalNote = draft?.globalNote ?? '';
  const mode = resolveRegionEditIntent(regions, globalNote, draft?.mode);
  if (regions.length === 1 && !regions[0].note.trim() && globalNote.trim()) {
    return createRegionEditDraft([{ ...regions[0], note: globalNote }], '', mode);
  }
  return createRegionEditDraft(regions, globalNote, mode);
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
  const [boot] = useState(() => hydrateDraft(draft));
  const viewportRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const previewCanvasRef = useRef<HTMLCanvasElement>(null);
  const [tool, setTool] = useState<EditorTool>('box');
  const [regions, setRegions] = useState<EditRegion[]>(boot.regions);
  const [selectedId, setSelectedId] = useState<string | null>(boot.regions[0]?.id ?? null);
  const [globalNote, setGlobalNote] = useState(boot.globalNote);
  const [mode, setMode] = useState<RegionEditIntent>(boot.mode ?? 'edit-content');
  const [showGuide, setShowGuide] = useState(false);
  const [fitted, setFitted] = useState({ width: 0, height: 0 });
  const [busy, setBusy] = useState(false);
  const [imageReady, setImageReady] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);
  const dragRef = useRef<{
    mode: 'create' | 'move' | 'resize';
    id?: string;
    handle?: HandleId;
    start: CanvasPoint;
    origin?: EditRegion;
  } | null>(null);
  const historyRef = useRef({
    stack: [boot],
    index: 0,
  });

  const selected = regions.find((region) => region.id === selectedId) || null;
  const currentDraft = useMemo(
    () => createRegionEditDraft(regions, globalNote, mode),
    [globalNote, mode, regions]
  );
  const sourceUrl = toProxiedMediaUrl(`/api/media/${generation.id}`);
  const singleRegion = regions.length === 1 ? regions[0] : null;
  const instructionValue = singleRegion ? singleRegion.note : globalNote;

  const onDraftChangeRef = useRef(onDraftChange);
  const draftRef = useRef(currentDraft);
  onDraftChangeRef.current = onDraftChange;
  draftRef.current = currentDraft;

  const applyDraft = useCallback((next: RegionEditDraft) => {
    setRegions(next.regions);
    setGlobalNote(next.globalNote);
    setMode(next.mode ?? 'edit-content');
    setSelectedId((current) => {
      if (current && next.regions.some((region) => region.id === current)) return current;
      return next.regions[0]?.id ?? null;
    });
  }, []);

  const commitHistory = useCallback((next: RegionEditDraft) => {
    const { stack, index } = historyRef.current;
    const last = stack[index];
    if (last && JSON.stringify(last) === JSON.stringify(next)) return;
    const merged = [...stack.slice(0, index + 1), next].slice(-40);
    historyRef.current = { stack: merged, index: merged.length - 1 };
    setCanUndo(merged.length > 1);
    setCanRedo(false);
  }, []);

  const undo = useCallback(() => {
    const { stack, index } = historyRef.current;
    if (index <= 0) return;
    const nextIndex = index - 1;
    historyRef.current = { stack, index: nextIndex };
    applyDraft(stack[nextIndex]);
    setCanUndo(nextIndex > 0);
    setCanRedo(true);
  }, [applyDraft]);

  const redo = useCallback(() => {
    const { stack, index } = historyRef.current;
    if (index >= stack.length - 1) return;
    const nextIndex = index + 1;
    historyRef.current = { stack, index: nextIndex };
    applyDraft(stack[nextIndex]);
    setCanUndo(true);
    setCanRedo(nextIndex < stack.length - 1);
  }, [applyDraft]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      onDraftChangeRef.current?.(draftRef.current);
      if (!dragRef.current) commitHistory(draftRef.current);
    }, 280);
    return () => window.clearTimeout(timer);
  }, [commitHistory, currentDraft]);

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
      paintRegionAnnotation(ctx, image, width, height, regions, globalNote, mode);
      setPreviewUrl(canvas.toDataURL('image/jpeg', 0.86));
    }, 120);
    return () => window.clearTimeout(timer);
  }, [globalNote, imageReady, mode, regions]);

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
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') {
        event.preventDefault();
        if (event.shiftKey) redo();
        else undo();
        return;
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'y') {
        event.preventDefault();
        redo();
        return;
      }
      if (event.key === 'Escape') {
        if (showGuide) {
          setShowGuide(false);
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
  }, [onClose, redo, selectedId, showGuide, undo]);

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
    if (showGuide) return;
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
          return withClampedRect(region, normalizeRect(drag.start.x, drag.start.y, point.x, point.y));
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

  const updateSingleInstruction = (value: string) => {
    if (singleRegion) {
      setRegions((current) =>
        current.map((region) => (region.id === singleRegion.id ? { ...region, note: value } : region))
      );
      if (globalNote) setGlobalNote('');
      return;
    }
    setGlobalNote(value);
  };

  const buildResult = useCallback(async (): Promise<RegionEditResult | null> => {
    if (regions.length === 0) {
      toast({ title: '还没有选区', description: '先框选或画圈标出要改的区域' });
      return null;
    }
    if (!globalNote.trim() && regions.every((region) => !region.note.trim())) {
      toast({
        title: mode === 'replace-text' ? '请填写要换成的字' : '请填写改图说明',
        description: mode === 'replace-text' ? '写下框里的新字' : '写下要怎么改圈住的内容',
      });
      return null;
    }

    setBusy(true);
    try {
      const { original, annotated } = await exportRegionEditImages(sourceUrl, regions, globalNote, mode);
      const aspectRatio =
        typeof generation.params?.aspectRatio === 'string'
          ? generation.params.aspectRatio
          : undefined;
      return {
        files: [annotated, original],
        prompt: buildRegionPrompt(regions, globalNote, mode),
        aspectRatio,
        draft: currentDraft,
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
  }, [currentDraft, generation.params?.aspectRatio, globalNote, mode, regions, sourceUrl]);

  const tools = useMemo(
    () =>
      [
        { id: 'box' as const, label: '框选', icon: Square },
        { id: 'circle' as const, label: '画圈', icon: Circle },
        { id: 'select' as const, label: '调整', icon: MousePointer2 },
      ] satisfies Array<{ id: EditorTool; label: string; icon: typeof Square }>,
    []
  );

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-background/94 p-3 backdrop-blur-xl">
      <canvas ref={previewCanvasRef} className="hidden" />
      <div className="flex h-full max-h-[56rem] w-full max-w-6xl flex-col overflow-hidden rounded-2xl border border-border/70 bg-card/95 shadow-2xl">
        <div className="flex items-center justify-between gap-3 border-b border-border/70 px-4 py-3">
          <div className="min-w-0">
            <p className="text-sm font-medium text-foreground">区域编辑</p>
            <p className="text-xs text-foreground/45">
              {mode === 'replace-text' ? '框里的字会画进标注稿，模型按新字来换' : '只标位置，说明发给模型，不会写到图上'}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex rounded-full border border-border/70 bg-background/70 p-1">
              {(
                [
                  { id: 'edit-content' as const, label: '改图', icon: Sparkles },
                  { id: 'replace-text' as const, label: '换字', icon: Type },
                ] as const
              ).map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setMode(item.id)}
                  className={cn(
                    'inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-colors',
                    mode === item.id ? 'bg-foreground text-background' : 'text-foreground/65 hover:bg-card'
                  )}
                >
                  <item.icon className="h-3.5 w-3.5" />
                  {item.label}
                </button>
              ))}
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
        </div>

        <div className="relative min-h-0 flex-1 bg-background/40">
          <div className="absolute top-4 left-1/2 z-10 flex -translate-x-1/2 items-center gap-1 rounded-full border border-border/70 bg-card/90 p-1 shadow-lg">
            {tools.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  setShowGuide(false);
                  setTool(item.id);
                }}
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-full px-3 py-2 text-xs font-medium transition-colors',
                  !showGuide && tool === item.id
                    ? 'bg-foreground text-background'
                    : 'text-foreground/70 hover:bg-card'
                )}
              >
                <item.icon className="h-3.5 w-3.5" />
                {item.label}
              </button>
            ))}
            <span className="mx-1 h-4 w-px bg-border/70" />
            <button
              type="button"
              onClick={undo}
              disabled={!canUndo}
              className="rounded-full p-2 text-foreground/70 hover:bg-card disabled:opacity-35"
              title="撤销"
            >
              <Undo2 className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={redo}
              disabled={!canRedo}
              className="rounded-full p-2 text-foreground/70 hover:bg-card disabled:opacity-35"
              title="重做"
            >
              <Redo2 className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              disabled={!previewUrl}
              onClick={() => setShowGuide((current) => !current)}
              className={cn(
                'inline-flex items-center gap-1.5 rounded-full px-3 py-2 text-xs font-medium transition-colors disabled:opacity-35',
                showGuide ? 'bg-foreground text-background' : 'text-foreground/70 hover:bg-card'
              )}
            >
              <Eye className="h-3.5 w-3.5" />
              标注稿
            </button>
          </div>

          <div
            ref={viewportRef}
            className="absolute inset-0 flex items-center justify-center overflow-hidden"
          >
            {showGuide && previewUrl ? (
              <img
                src={previewUrl}
                alt="Annotated region preview"
                className="absolute z-10 max-h-full max-w-full object-contain"
              />
            ) : null}
              <div
                ref={stageRef}
                className={cn('relative touch-none', showGuide && previewUrl && 'invisible')}
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
                  const label =
                    mode === 'replace-text'
                      ? (region.note.trim() || globalNote.trim() || '新字')
                      : '';
                  return (
                    <div
                      key={region.id}
                      className={cn(
                        'pointer-events-none absolute border-2',
                        region.shape === 'ellipse' ? 'rounded-full' : 'rounded-sm'
                      )}
                      style={{
                        left: `${region.x * 100}%`,
                        top: `${region.y * 100}%`,
                        width: `${region.w * 100}%`,
                        height: `${region.h * 100}%`,
                        borderColor: color,
                        backgroundColor: isSelected
                          ? 'rgba(255,255,255,0.12)'
                          : mode === 'edit-content'
                            ? `${color}33`
                            : 'rgba(0,0,0,0.04)',
                      }}
                    >
                      {regions.length > 1 && (
                        <span
                          className="absolute -left-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-[10px] font-semibold text-white"
                          style={{ backgroundColor: color }}
                        >
                          {index + 1}
                        </span>
                      )}
                      {mode === 'replace-text' && (
                        <span className="absolute inset-0 flex items-center justify-center px-2 text-center text-[11px] font-semibold leading-tight text-stone-900">
                          {label.slice(0, 16)}
                        </span>
                      )}
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
          {regions.length === 0 ? (
            <p className="text-sm text-foreground/45">
              {mode === 'replace-text' ? '先框住要换的字，再写下新字' : '先框住要改的人、衣服或背景，再写说明'}
            </p>
          ) : regions.length === 1 ? (
            <textarea
              value={instructionValue}
              onChange={(event) => updateSingleInstruction(event.target.value)}
              placeholder={
                mode === 'replace-text' ? '要换成的字，例如哈气咪' : '要怎么改，例如让她穿原神COS服'
              }
              className="min-h-[72px] w-full resize-none rounded-lg border border-border/70 bg-input/70 px-3 py-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring/30"
            />
          ) : (
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <p className="text-[11px] text-foreground/45">
                  {mode === 'replace-text' ? `换字 ${regions.length} 处` : `改图 ${regions.length} 处`}
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
                    placeholder={
                      mode === 'replace-text'
                        ? `第 ${index + 1} 处换成什么字`
                        : `第 ${index + 1} 处怎么改`
                    }
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
              <textarea
                value={globalNote}
                onChange={(event) => setGlobalNote(event.target.value)}
                placeholder="补充说明，可选"
                className="min-h-[56px] w-full resize-none rounded-lg border border-border/70 bg-input/70 px-3 py-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring/30"
              />
            </div>
          )}

          {regions.length === 1 && (
            <div className="flex justify-end">
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
          )}

          <div className="flex flex-wrap items-center justify-end gap-2">
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
    </div>
  );
}
