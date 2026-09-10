'use client';
/* eslint-disable @next/next/no-img-element */

import { memo, useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import dynamic from 'next/dynamic';
import {
  Maximize2,
  X,
  Play,
  Image as ImageIcon,
  Sparkles,
  Loader2,
  AlertCircle,
  ExternalLink,
  Pencil,
  Trash2,
} from 'lucide-react';
import type { Generation } from '@/types';
import { toast } from '@/components/ui/toaster';
import { displayPromptTitle } from '@/lib/region-edit-document';

const ResultGalleryLightbox = dynamic(
  () => import('./result-gallery-lightbox').then((mod) => mod.ResultGalleryLightbox),
  { ssr: false }
);

// 任务类型
export interface Task {
  id: string;
  prompt: string;
  model?: string;
  modelId?: string;
  type?: string;
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled';
  progress?: number; // 0-100
  errorMessage?: string;
  result?: Generation;
  createdAt: number;
  persisted?: boolean;
}

interface ResultGalleryProps {
  generations: Generation[];
  tasks?: Task[];
  onRemoveTask?: (taskId: string) => void;
  onClearFailedTasks?: () => void;
  onRemoveGeneration?: (generation: Generation) => void;
  onReuseGeneration?: (generation: Generation, target: 'image' | 'video') => void;
  onEditGeneration?: (generation: Generation) => void;
  onApplyExtractedPrompt?: (prompt: string) => void;
  hasRegionDraft?: (generationId: string) => boolean;
  busyGenerationId?: string | null;
  clearingFailedTasks?: boolean;
}

const MEDIA_ROOT_MARGIN = '320px 0px';
const CARD_CONTAIN_STYLE: CSSProperties = {
  contentVisibility: 'auto',
  containIntrinsicSize: '240px 135px',
  contain: 'layout paint style',
};

function openAssetInNewTab(url: string) {
  if (!url) {
    toast({
      title: '打开失败',
      description: '文件地址不存在',
      variant: 'destructive',
    });
    return;
  }

  const link = document.createElement('a');
  link.href = url;
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  document.body.appendChild(link);
  link.click();
  link.remove();
}

const isVideoGeneration = (gen: Generation) => gen.type.includes('video');
const isReusableGeneration = (
  gen: Generation,
  onReuseGeneration?: ResultGalleryProps['onReuseGeneration']
) => !isVideoGeneration(gen) && typeof onReuseGeneration === 'function';

interface GenerationResultCardProps {
  generation: Generation;
  index: number;
  busyGenerationId: string | null;
  deferMedia: boolean;
  onSelect: (generation: Generation) => void;
  onRemoveGeneration?: (generation: Generation) => void;
  onEditGeneration?: (generation: Generation) => void;
  hasRegionDraft?: boolean;
}

const GenerationResultCard = memo(function GenerationResultCard({
  generation,
  index,
  busyGenerationId,
  deferMedia,
  onSelect,
  onRemoveGeneration,
  onEditGeneration,
  hasRegionDraft,
}: GenerationResultCardProps) {
  const cardRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [imageLoaded, setImageLoaded] = useState(false);
  const [hasRequestedMedia, setHasRequestedMedia] = useState(!deferMedia);
  const shouldLoadMedia = hasRequestedMedia;
  const isVideo = isVideoGeneration(generation);
  const openTitle = isVideo ? '打开视频地址' : '打开图片地址';

  useEffect(() => {
    if (!deferMedia) {
      setHasRequestedMedia(true);
    }
  }, [deferMedia]);

  useEffect(() => {
    if (!deferMedia || hasRequestedMedia) return;

    const element = cardRef.current;
    if (!element) return;

    if (typeof IntersectionObserver === 'undefined') {
      setHasRequestedMedia(true);
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;
        setHasRequestedMedia(true);
        observer.disconnect();
      },
      { rootMargin: MEDIA_ROOT_MARGIN }
    );

    observer.observe(element);
    return () => observer.disconnect();
  }, [deferMedia, hasRequestedMedia]);

  const handleClick = useCallback(() => {
    onSelect(generation);
  }, [generation, onSelect]);

  const handleMouseEnter = useCallback(() => {
    setHasRequestedMedia(true);
    window.setTimeout(() => {
      videoRef.current?.play().catch(() => {});
    }, 0);
  }, []);

  const handleMouseLeave = useCallback(() => {
    if (!videoRef.current) return;
    videoRef.current.pause();
    videoRef.current.currentTime = 0;
  }, []);

  return (
    <div
      ref={cardRef}
      className="group relative aspect-video bg-card/60 rounded-xl overflow-hidden cursor-pointer border border-border/70 hover:border-sky-500/50 hover:scale-[1.02] hover:shadow-[0_8px_24px_rgba(0,0,0,0.4),0_0_15px_rgba(14,165,233,0.15)] transition-all duration-300"
      style={deferMedia ? CARD_CONTAIN_STYLE : undefined}
      onClick={handleClick}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      {isVideo ? (
        <>
          {shouldLoadMedia ? (
            <video
              ref={videoRef}
              src={generation.resultUrl}
              className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
              muted
              loop
              playsInline
              preload="none"
            />
          ) : (
            <div className="absolute inset-0 bg-gradient-to-br from-card/70 to-background/80" />
          )}
          <div className="absolute top-2.5 left-2.5 px-2.5 py-1 bg-card/75 border border-border/80 backdrop-blur-md rounded-lg flex items-center gap-1.5 shadow-[0_2px_8px_rgba(0,0,0,0.2)]">
            <span className="text-[10px] font-bold text-sky-400">#{index + 1}</span>
            <Play className="w-3 h-3 text-sky-400 animate-pulse" />
          </div>
        </>
      ) : (
        <>
          {!imageLoaded && <div className="absolute inset-0 bg-card/60 animate-pulse" />}
          {shouldLoadMedia && (
            <img
              src={generation.resultUrl}
              alt={displayPromptTitle(generation.prompt)}
              className={`w-full h-full object-cover transition-all duration-500 group-hover:scale-105 ${
                imageLoaded ? 'opacity-100' : 'opacity-0'
              }`}
              loading="lazy"
              decoding="async"
              draggable={false}
              onLoad={() => setImageLoaded(true)}
            />
          )}
          <div className="absolute top-2.5 left-2.5 px-2.5 py-1 bg-card/75 border border-border/80 backdrop-blur-md rounded-lg shadow-[0_2px_8px_rgba(0,0,0,0.2)]">
            <span className="text-[10px] font-bold text-sky-400">#{index + 1}</span>
          </div>
        </>
      )}
      <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 pointer-events-none transition-all duration-300 bg-gradient-to-t from-background/40 via-transparent to-transparent">
        <div className="w-12 h-12 bg-background/85 border border-border/80 rounded-full flex items-center justify-center shadow-lg transform translate-y-2 group-hover:translate-y-0 transition-transform duration-300 backdrop-blur-sm">
          <Maximize2 className="w-5 h-5 text-foreground/90" />
        </div>
      </div>
      <div
        className="absolute top-2.5 right-2.5 z-10 opacity-0 group-hover:opacity-100 [@media(hover:none)]:opacity-100 transition-all duration-300 transform -translate-y-1 group-hover:translate-y-0"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              openAssetInNewTab(generation.resultUrl);
            }}
            className="w-8 h-8 bg-card/85 border border-border/80 rounded-lg flex items-center justify-center text-foreground/80 hover:text-sky-400 hover:bg-sky-500/10 hover:border-sky-500/30 backdrop-blur-sm transition-all duration-200 shadow-md"
            title={openTitle}
            aria-label={openTitle}
          >
            <ExternalLink className="w-3.5 h-3.5" />
          </button>
          {onEditGeneration && !isVideo && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onEditGeneration(generation);
              }}
              className="w-8 h-8 bg-card/85 border border-border/80 rounded-lg flex items-center justify-center text-foreground/80 hover:text-sky-400 hover:bg-sky-500/10 hover:border-sky-500/30 backdrop-blur-sm transition-all duration-200 shadow-md"
              title={hasRegionDraft ? '继续编辑' : '区域编辑'}
              aria-label={hasRegionDraft ? '继续编辑' : '区域编辑'}
            >
              <Pencil className="w-3.5 h-3.5" />
            </button>
          )}
          {onRemoveGeneration && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onRemoveGeneration(generation);
              }}
              disabled={busyGenerationId === generation.id}
              className="w-8 h-8 bg-card/85 border border-border/80 rounded-lg flex items-center justify-center text-foreground/80 hover:text-red-400 hover:bg-red-500/15 hover:border-red-500/35 backdrop-blur-sm transition-all duration-200 shadow-md disabled:cursor-not-allowed disabled:opacity-70"
              title="删除作品"
            >
              {busyGenerationId === generation.id ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin text-red-400" />
              ) : (
                <Trash2 className="w-3.5 h-3.5" />
              )}
            </button>
          )}
        </div>
      </div>
      <div className="absolute bottom-0 left-0 right-0 p-3 bg-gradient-to-t from-background/90 via-background/40 to-transparent pointer-events-none">
        <p className="text-xs text-foreground/90 font-medium truncate tracking-wide">
          {displayPromptTitle(generation.prompt)}
        </p>
      </div>
    </div>
  );
});

export function ResultGallery({
  generations,
  tasks = [],
  onRemoveTask,
  onClearFailedTasks,
  onRemoveGeneration,
  onReuseGeneration,
  onEditGeneration,
  onApplyExtractedPrompt,
  hasRegionDraft,
  busyGenerationId = null,
  clearingFailedTasks = false,
}: ResultGalleryProps) {
  const [selected, setSelected] = useState<Generation | null>(null);
  const [selectedFailedTask, setSelectedFailedTask] = useState<Task | null>(null);
  const canReuse = (gen: Generation) => isReusableGeneration(gen, onReuseGeneration);
  const isTaskVideo = (task: Task) => task.type?.includes('video') || task.model?.includes('video');
  const handleSelectGeneration = useCallback((generation: Generation) => {
    setSelected(generation);
  }, []);
  const handleRemoveGeneration = useCallback((generation: Generation) => {
    if (!onRemoveGeneration) return;
    void onRemoveGeneration(generation);
  }, [onRemoveGeneration]);
  const handleReuseGeneration = useCallback((generation: Generation, target: 'image' | 'video') => {
    if (!onReuseGeneration) return;
    setSelected(null);
    void onReuseGeneration(generation, target);
  }, [onReuseGeneration]);
  const handleEditGeneration = useCallback((generation: Generation) => {
    if (!onEditGeneration) return;
    setSelected(null);
    onEditGeneration(generation);
  }, [onEditGeneration]);

  // 过滤出正在进行的任务（不包括已完成的，已完成的会在 generations 中显示）
  // 同时排除已经存在于 generations 中的任务（通过 id 匹配）
  const generationIds = new Set(generations.map(g => g.id));
  const activeTasks = tasks.filter(t => 
    (t.status === 'pending' || t.status === 'processing') && !generationIds.has(t.id)
  );
  const failedTasks = tasks.filter(t => t.status === 'failed' || t.status === 'cancelled');
  
  const totalCount = generations.length + activeTasks.length;
  const failedCount = failedTasks.length;
  const deferCompletedMedia = generations.length > 12;

  useEffect(() => {
    if (!selectedFailedTask) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSelectedFailedTask(null);
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [selectedFailedTask]);

  useEffect(() => {
    if (!selected) return;
    const stillExists = generations.some((generation) => generation.id === selected.id);
    if (!stillExists) {
      setSelected(null);
    }
  }, [generations, selected]);

  useEffect(() => {
    if (!selected) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSelected(null);
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [selected]);

  return (
    <>
      <div className="surface bg-card overflow-hidden flex flex-col h-full">
        {/* Header */}
        <div className="p-4 sm:p-6 border-b border-border/70 shrink-0">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-card/60 border border-border/70 rounded-xl flex items-center justify-center">
                <Sparkles className="w-5 h-5 text-foreground" />
              </div>
              <div>
                <h2 className="text-lg font-medium text-foreground">生成结果</h2>
                <p className="text-sm text-foreground/40">
                  {activeTasks.length > 0 ? `${activeTasks.length} 个任务进行中 · ` : ''}
                  {generations.length} 个作品
                  {failedCount > 0 ? ` · ${failedCount} 个错误` : ''}
                </p>
              </div>
            </div>
            {failedCount > 0 && onClearFailedTasks && (
              <button
                type="button"
                onClick={onClearFailedTasks}
                disabled={clearingFailedTasks}
                className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs font-medium text-red-300 transition-colors hover:bg-red-500/20 disabled:cursor-not-allowed disabled:opacity-70"
              >
                {clearingFailedTasks ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Trash2 className="w-3.5 h-3.5" />
                )}
                清理错误
              </button>
            )}
          </div>
        </div>

        <div className="p-4 sm:p-6 flex-1 overflow-y-auto overscroll-contain min-h-0 [contain:layout_paint] [scrollbar-gutter:stable]">
          {totalCount === 0 && failedTasks.length === 0 ? (
            <div className="h-64 flex flex-col items-center justify-center border border-dashed border-border/70 rounded-xl">
              <div className="w-16 h-16 bg-card/60 rounded-2xl flex items-center justify-center mb-4">
                <ImageIcon className="w-8 h-8 text-foreground/30" />
              </div>
              <p className="text-foreground/50">暂无生成结果</p>
              <p className="text-foreground/30 text-sm mt-1">开始创作你的第一个作品</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-4 2xl:grid-cols-5">
              {/* 正在进行的任务 */}
              {activeTasks.map((task) => (
                <div
                  key={task.id}
                  className="group relative aspect-video bg-card/60 rounded-xl overflow-hidden border border-sky-500/30"
                >
                  {/* 加载动画背景 */}
                  <div className="absolute inset-0 flex flex-col items-center justify-center bg-gradient-to-br from-sky-500/10 to-emerald-500/10">
                    <Loader2 className="w-8 h-8 text-foreground/60 animate-spin mb-2" />
                    <p className="text-xs text-foreground/60">
                      {task.status === 'processing' ? '生成中...' : '排队中...'}
                    </p>
                    {/* 进度显示 */}
                    {typeof task.progress === 'number' && task.progress > 0 && (
                      <div className="mt-2 w-24">
                        <div className="h-1.5 bg-card/60 rounded-full overflow-hidden">
                          <div 
                            className="h-full bg-foreground transition-all duration-300"
                            style={{ width: `${task.progress}%` }}
                          />
                        </div>
                        <p className="text-[10px] text-foreground/50 text-center mt-1">{task.progress}%</p>
                      </div>
                    )}
                  </div>
                  {/* 任务类型标签 */}
                  <div className="absolute top-2 left-2 px-2 py-1 bg-sky-500/50 rounded-md flex items-center gap-1">
                    {isTaskVideo(task) ? (
                      <>
                        <Play className="w-3 h-3 text-foreground" />
                        <span className="text-[10px] text-foreground">VIDEO</span>
                      </>
                    ) : (
                      <>
                        <ImageIcon className="w-3 h-3 text-foreground" />
                        <span className="text-[10px] text-foreground">IMAGE</span>
                      </>
                    )}
                  </div>
                  {/* 取消按钮 */}
                  {onRemoveTask && (
                    <button
                      onClick={() => onRemoveTask(task.id)}
                      className="absolute top-2 right-2 p-1.5 bg-background/70 border border-border/70 rounded-md hover:bg-red-500/40 transition-colors"
                    >
                      <X className="w-3 h-3 text-foreground" />
                    </button>
                  )}
                  {/* 提示词 */}
                  <div className="absolute bottom-0 left-0 right-0 p-3 bg-gradient-to-t from-background/80 via-background/30 to-transparent">
                    <p className="text-xs text-foreground/80 truncate">{displayPromptTitle(task.prompt)}</p>
                  </div>
                </div>
              ))}

              {/* 失败的任务 */}
              {failedTasks.map((task) => (
                <div
                  key={task.id}
                  className={`group relative aspect-video bg-card/60 rounded-xl overflow-hidden border border-red-500/30 ${
                    task.errorMessage ? 'cursor-pointer' : ''
                  }`}
                  onClick={() => task.errorMessage && setSelectedFailedTask(task)}
                >
                  <div className="absolute inset-0 flex flex-col items-center justify-center bg-red-500/10">
                    <AlertCircle className="w-8 h-8 text-red-300 mb-2" />
                    <p className="text-xs text-red-300">
                      {task.status === 'cancelled' ? '已取消' : '生成失败'}
                    </p>
                    {task.errorMessage && (
                      <>
                        <p className="text-xs text-red-300/70 mt-1 px-4 text-center truncate max-w-full">
                          {task.errorMessage}
                        </p>
                        <p className="text-[10px] text-red-300/50 mt-2 opacity-0 group-hover:opacity-100 transition-opacity">
                          点击查看详情
                        </p>
                      </>
                    )}
                  </div>
                  {/* 移除按钮 */}
                  {onRemoveTask && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onRemoveTask(task.id);
                      }}
                      className="absolute top-2 right-2 p-1.5 bg-background/70 border border-border/70 rounded-md hover:bg-background/90 transition-colors"
                    >
                      <X className="w-3 h-3 text-foreground" />
                    </button>
                  )}
                  <div className="absolute bottom-0 left-0 right-0 p-3 bg-gradient-to-t from-background/80 via-background/30 to-transparent">
                    <p className="text-xs text-foreground/80 truncate">{displayPromptTitle(task.prompt)}</p>
                  </div>
                </div>
              ))}

              {/* 已完成的生成结果 */}
              {generations.map((gen, index) => (
                <GenerationResultCard
                  key={gen.id}
                  generation={gen}
                  index={index}
                  busyGenerationId={busyGenerationId}
                  deferMedia={deferCompletedMedia}
                  onSelect={handleSelectGeneration}
                  onRemoveGeneration={onRemoveGeneration ? handleRemoveGeneration : undefined}
                  onEditGeneration={onEditGeneration ? handleEditGeneration : undefined}
                  hasRegionDraft={hasRegionDraft?.(gen.id)}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {(selected || selectedFailedTask) && (
        <ResultGalleryLightbox
          selected={selected}
          selectedFailedTask={selectedFailedTask}
          busyGenerationId={busyGenerationId}
          canReuse={Boolean(selected && canReuse(selected))}
          onCloseSelected={() => setSelected(null)}
          onCloseFailed={() => setSelectedFailedTask(null)}
          onReuseGeneration={onReuseGeneration ? handleReuseGeneration : undefined}
          onEditGeneration={onEditGeneration ? handleEditGeneration : undefined}
          onApplyExtractedPrompt={
            onApplyExtractedPrompt
              ? (prompt) => {
                  setSelected(null);
                  onApplyExtractedPrompt(prompt);
                }
              : undefined
          }
          hasRegionDraft={Boolean(selected && hasRegionDraft?.(selected.id))}
          onRemoveGeneration={onRemoveGeneration ? handleRemoveGeneration : undefined}
        />
      )}
    </>
  );
}
