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
import { toProxiedMediaUrl } from '@/lib/client-media-url';
import {
  canvasToFile,
  clampNormalizedRect,
  clientPointToNormalized,
  fetchImageAsFile,
  fitContainSize,
  hitTestEllipse,
  hitTestRect,
  loadImage,
  normalizeRect,
  type CanvasPoint,
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
const REGION_COLORS = ['#38bdf8', '#f59e0b', '#c084fc', '#4ade80', '#fb7185'];

function regionColor(index: number): string {
  return REGION_COLORS[index % REGION_COLORS.length];
}

function regionInstruction(region: EditRegion, globalNote: string): string {
  return region.note.trim() || globalNote.trim() || '按整体说明修改此处';
}

function describeRegionPlace(region: EditRegion): string {
  const vertical = region.y < 0.34 ? '上部' : region.y + region.h > 0.66 ? '下部' : '中部';
  const horizontal = region.x < 0.34 ? '左侧' : region.x + region.w > 0.66 ? '右侧' : '中间';
  return `${vertical}${horizontal}`;
}

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

function buildRegionPrompt(regions: EditRegion[], globalNote: string): string {
  const count = regions.length;
  const items = regions.map((region, index) => {
    const shapeLabel = region.shape === 'ellipse' ? '圆形框' : '矩形框';
    return `${index + 1}. 第 ${index + 1} 号${shapeLabel}（${describeRegionPlace(region)}）必须改成：${regionInstruction(region, globalNote)}`;
  });
  const overall = globalNote.trim();
  const review =
    count > 1
      ? `输出前自检：${regions.map((_, index) => `${index + 1} 号`).join('、')} 是否都已换成新字。还是旧字就是失败。`
      : '输出前自检：框内必须是新字，还是旧字就是失败。';

  return [
    '不要原样复制任何一张参考图。',
    '第一张是编辑稿：每个编号框里已经写了要换成的新字。请把这些新字画成第二张原图那种手写书法，并去掉框、编号、白底和清单。',
    '第二张是干净原图，只用来对齐构图、光影、纸张质感和没有框到的文字。',
    `这次一共要改 ${count} 处，必须全部改完。`,
    '改动清单：',
    ...items,
    review,
    overall ? `补充说明：${overall}` : '',
    '框外内容保持原样。最终结果里不要出现标注框、编号、清单或提示标签。',
  ]
    .filter(Boolean)
    .join('\n');
}

function drawAnnotationLegend(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  regions: EditRegion[],
  globalNote: string
) {
  const pad = Math.max(16, Math.round(width * 0.018));
  const lineH = Math.max(22, Math.round(width * 0.022));
  const lines = [
    `必须全部改完：共 ${regions.length} 处`,
    ...regions.map((region, index) => `${index + 1}. ${regionInstruction(region, globalNote)}`),
  ];

  ctx.save();
  ctx.font = `700 ${Math.round(lineH * 0.72)}px ui-sans-serif, system-ui, sans-serif`;
  const textWidth = Math.max(...lines.map((line) => ctx.measureText(line).width));
  const boxW = Math.min(width - pad * 2, textWidth + pad * 1.6);
  const boxH = pad * 0.8 + lines.length * lineH;
  const regionsAreHigh = regions.every((region) => region.y < 0.55);
  const boxY = regionsAreHigh ? height - boxH - pad : pad;

  ctx.fillStyle = 'rgba(15, 23, 42, 0.78)';
  ctx.fillRect(pad, boxY, boxW, boxH);
  ctx.textBaseline = 'top';
  ctx.textAlign = 'left';
  lines.forEach((line, index) => {
    ctx.fillStyle = index === 0 ? '#f8fafc' : regionColor(index - 1);
    ctx.fillText(line, pad * 1.35, boxY + pad * 0.45 + index * lineH, boxW - pad);
  });
  ctx.restore();
}

function fitLabelSize(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  maxHeight: number
): number {
  let size = Math.min(maxHeight * 0.62, maxWidth * 0.48, 96);
  while (size > 14) {
    ctx.font = `700 ${Math.round(size)}px "KaiTi", "STKaiti", "Songti SC", serif`;
    if (ctx.measureText(text).width <= maxWidth * 0.88) return size;
    size -= 2;
  }
  return 14;
}

function drawReplacementInRegion(
  ctx: CanvasRenderingContext2D,
  region: EditRegion,
  x: number,
  y: number,
  w: number,
  h: number,
  text: string
) {
  ctx.save();
  ctx.beginPath();
  if (region.shape === 'ellipse') {
    ctx.ellipse(x + w / 2, y + h / 2, w / 2, h / 2, 0, 0, Math.PI * 2);
  } else {
    ctx.rect(x, y, w, h);
  }
  ctx.fillStyle = 'rgba(250, 248, 242, 0.94)';
  ctx.fill();

  const label = text.slice(0, 24);
  const fontSize = fitLabelSize(ctx, label, w, h);
  ctx.fillStyle = '#1c1917';
  ctx.font = `700 ${Math.round(fontSize)}px "KaiTi", "STKaiti", "Songti SC", serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, x + w / 2, y + h / 2, w * 0.9);
  ctx.restore();
}

async function exportAnnotatedImage(
  sourceUrl: string,
  regions: EditRegion[],
  globalNote: string
): Promise<{ original: File; annotated: File }> {
  const original = await fetchImageAsFile(sourceUrl, `original-${Date.now()}.png`);
  const objectUrl = URL.createObjectURL(original);
  let image: HTMLImageElement;
  try {
    image = await loadImage(objectUrl);
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
  const canvas = document.createElement('canvas');
  canvas.width = image.naturalWidth || image.width;
  canvas.height = image.naturalHeight || image.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Failed to create annotation canvas');
  }

  ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
  const stroke = Math.max(4, Math.round(canvas.width * 0.0045));
  const badgeSize = Math.max(28, Math.round(canvas.width * 0.028));

  drawAnnotationLegend(ctx, canvas.width, canvas.height, regions, globalNote);

  regions.forEach((region, index) => {
    const x = region.x * canvas.width;
    const y = region.y * canvas.height;
    const w = region.w * canvas.width;
    const h = region.h * canvas.height;
    const color = regionColor(index);

    drawReplacementInRegion(ctx, region, x, y, w, h, regionInstruction(region, globalNote));

    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = stroke;
    ctx.setLineDash([stroke * 2.2, stroke * 1.4]);
    if (region.shape === 'ellipse') {
      ctx.beginPath();
      ctx.ellipse(x + w / 2, y + h / 2, w / 2, h / 2, 0, 0, Math.PI * 2);
      ctx.stroke();
    } else {
      ctx.strokeRect(x, y, w, h);
    }

    ctx.setLineDash([]);
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(x + 8 + badgeSize / 2, y + 8 + badgeSize / 2, badgeSize / 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.font = `700 ${Math.round(badgeSize * 0.55)}px ui-sans-serif, system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(index + 1), x + 8 + badgeSize / 2, y + 8 + badgeSize / 2);
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
  onClose,
  onApply,
  onApplyAndGenerate,
}: {
  generation: Generation;
  onClose: () => void;
  onApply: (result: RegionEditResult) => void;
  onApplyAndGenerate: (result: RegionEditResult) => void;
}) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const [tool, setTool] = useState<EditorTool>('box');
  const [regions, setRegions] = useState<EditRegion[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [globalNote, setGlobalNote] = useState('');
  const [fitted, setFitted] = useState({ width: 0, height: 0 });
  const [busy, setBusy] = useState(false);
  const dragRef = useRef<{
    mode: 'create' | 'move' | 'resize';
    id?: string;
    handle?: HandleId;
    start: CanvasPoint;
    origin?: EditRegion;
  } | null>(null);

  const selected = regions.find((region) => region.id === selectedId) || null;
  const sourceUrl = toProxiedMediaUrl(`/api/media/${generation.id}`);

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

    const id = createId();
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
      const { original, annotated } = await exportAnnotatedImage(sourceUrl, regions, globalNote);
      const aspectRatio =
        typeof generation.params?.aspectRatio === 'string'
          ? generation.params.aspectRatio
          : undefined;
      return {
        files: [annotated, original],
        prompt: buildRegionPrompt(regions, globalNote),
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
      <div className="flex h-full max-h-[56rem] w-full max-w-6xl flex-col overflow-hidden rounded-2xl border border-border/70 bg-card/95 shadow-2xl">
        <div className="flex items-center justify-between gap-3 border-b border-border/70 px-4 py-3">
          <div>
            <p className="text-sm font-medium text-foreground">区域编辑</p>
            <p className="text-xs text-foreground/45">
              框选多处时，每处都要写说明。应用后会先提交带新字的标注稿，再带上原图保持画风
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
                onLoad={updateFitted}
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
              <p className="text-[11px] text-foreground/45">
                将修改 {regions.length} 处，每处都要单独写清楚，生成时会全部提交
              </p>
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
