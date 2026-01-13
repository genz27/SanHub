'use client';
/* eslint-disable @next/next/no-img-element */

import { useEffect, useMemo, useRef, useState } from 'react';
import { Download, Maximize2, X, Play, Image as ImageIcon, Sparkles, Loader2, AlertCircle, Copy, ExternalLink } from 'lucide-react';
import type { Generation } from '@/types';
import { formatDate, truncate } from '@/lib/utils';
import { downloadAsset } from '@/lib/download';
import { toast } from '@/components/ui/toaster';

// 任务类型
export interface Task {
  id: string;
  prompt: string;
  model?: string;
  type?: string;
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled';
  progress?: number; // 0-100
  errorMessage?: string;
  result?: Generation;
  createdAt: number;
}

interface ResultGalleryProps {
  generations: Generation[];
  tasks?: Task[];
  onRemoveTask?: (taskId: string) => void;
}

export function ResultGallery({ generations, tasks = [], onRemoveTask }: ResultGalleryProps) {
  const [selected, setSelected] = useState<Generation | null>(null);
  const [visibleCount, setVisibleCount] = useState(12);
  const renderMoreRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setVisibleCount((prev) => {
      if (generations.length === 0) return 0;
      if (prev === 0) return Math.min(12, generations.length);
      return Math.min(prev, generations.length);
    });
  }, [generations.length]);

  const downloadFile = async (url: string, id: string, type: string) => {
    if (!url) {
      toast({
        title: '下载失败',
        description: '文件地址不存在',
        variant: 'destructive',
      });
      return;
    }

    const extension = type.includes('video') ? 'mp4' : 'png';
    try {
      await downloadAsset(url, `sanhub-${id}.${extension}`);
    } catch (err) {
      console.error('Download failed', err);
      toast({
        title: '下载失败',
        description: '请稍后重试',
        variant: 'destructive',
      });
    }
  };

  const isVideo = (gen: Generation) => gen.type.includes('video');
  const isTaskVideo = (task: Task) => task.type?.includes('video') || task.model?.includes('video');

  // 过滤出正在进行的任务（不包括已完成的，已完成的会在 generations 中显示）
  // 同时排除已经存在于 generations 中的任务（通过 id 匹配）
  const generationIds = new Set(generations.map(g => g.id));
  const activeTasks = tasks.filter(t => 
    (t.status === 'pending' || t.status === 'processing') && !generationIds.has(t.id)
  );
  const failedTasks = tasks.filter(t => t.status === 'failed' || t.status === 'cancelled');
  
  const totalCount = generations.length + activeTasks.length;
  const visibleGenerations = useMemo(
    () => generations.slice(0, visibleCount),
    [generations, visibleCount]
  );
  const hasMoreGenerations = visibleCount < generations.length;

  useEffect(() => {
    if (!hasMoreGenerations) return;
    const target = renderMoreRef.current;
    if (!target) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries[0].isIntersecting) return;
        setVisibleCount((prev) => Math.min(prev + 12, generations.length));
      },
      { rootMargin: '200px' }
    );
    observer.observe(target);
    return () => observer.disconnect();
  }, [hasMoreGenerations, generations.length]);

  const handleRenderMore = () => {
    setVisibleCount((prev) => Math.min(prev + 12, generations.length));
  };

  return (
    <>
      <div className="surface overflow-hidden">
        {/* Header */}
        <div className="p-4 sm:p-6 border-b border-border/70">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-card/60 border border-border/70 rounded-xl flex items-center justify-center">
              <Sparkles className="w-5 h-5 text-foreground" />
            </div>
            <div>
              <h2 className="text-lg font-medium text-foreground">生成结果</h2>
              <p className="text-sm text-foreground/40">
                {activeTasks.length > 0 ? `${activeTasks.length} 个任务进行中 · ` : ''}
                {generations.length} 个作品
              </p>
            </div>
          </div>
        </div>

        <div className="p-4 sm:p-6">
          {totalCount === 0 && failedTasks.length === 0 ? (
            <div className="h-64 flex flex-col items-center justify-center border border-dashed border-border/70 rounded-xl">
              <div className="w-16 h-16 bg-card/60 rounded-2xl flex items-center justify-center mb-4">
                <ImageIcon className="w-8 h-8 text-foreground/30" />
              </div>
              <p className="text-foreground/50">暂无生成结果</p>
              <p className="text-foreground/30 text-sm mt-1">开始创作你的第一个作品</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
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
                            className="h-full bg-gradient-to-r from-sky-500 to-emerald-500 transition-all duration-300"
                            style={{ width: `${task.progress}%` }}
                          />
                        </div>
                        <p className="text-[10px] text-foreground/50 text-center mt-1">{task.progress}%</p>
                      </div>
                    )}
                  </div>
                  {/* 任务类型标签 */}
                  <div className="absolute top-2 left-2 px-2 py-1 bg-sky-500/40 backdrop-blur-sm rounded-md flex items-center gap-1">
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
                      className="absolute top-2 right-2 p-1.5 bg-card/70 border border-border/70 backdrop-blur-sm rounded-md hover:bg-red-500/40 transition-colors"
                    >
                      <X className="w-3 h-3 text-foreground" />
                    </button>
                  )}
                  {/* 提示词 */}
                  <div className="absolute bottom-0 left-0 right-0 p-3 bg-gradient-to-t from-background/80 via-background/30 to-transparent">
                    <p className="text-xs text-foreground/80 truncate">{task.prompt || '无提示词'}</p>
                  </div>
                </div>
              ))}

              {/* 失败的任务 */}
              {failedTasks.map((task) => (
                <div
                  key={task.id}
                  className="group relative aspect-video bg-card/60 rounded-xl overflow-hidden border border-red-500/30"
                >
                  <div className="absolute inset-0 flex flex-col items-center justify-center bg-red-500/10">
                    <AlertCircle className="w-8 h-8 text-red-300 mb-2" />
                    <p className="text-xs text-red-300">
                      {task.status === 'cancelled' ? '已取消' : '生成失败'}
                    </p>
                    {task.errorMessage && (
                      <p className="text-xs text-red-300/70 mt-1 px-4 text-center truncate max-w-full">
                        {task.errorMessage}
                      </p>
                    )}
                  </div>
                  {/* 移除按钮 */}
                  {onRemoveTask && (
                    <button
                      onClick={() => onRemoveTask(task.id)}
                      className="absolute top-2 right-2 p-1.5 bg-card/70 border border-border/70 backdrop-blur-sm rounded-md hover:bg-card/90 transition-colors"
                    >
                      <X className="w-3 h-3 text-foreground" />
                    </button>
                  )}
                  <div className="absolute bottom-0 left-0 right-0 p-3 bg-gradient-to-t from-background/80 via-background/30 to-transparent">
                    <p className="text-xs text-foreground/80 truncate">{task.prompt || '无提示词'}</p>
                  </div>
                </div>
              ))}

              {/* 已完成的生成结果 */}
              {visibleGenerations.map((gen) => (
                <div
                  key={gen.id}
                  className="group relative aspect-video bg-card/60 rounded-xl overflow-hidden cursor-pointer border border-border/70 hover:border-border transition-all"
                  onClick={() => setSelected(gen)}
                >
                  {isVideo(gen) ? (
                    <>
                      <video
                        src={gen.resultUrl}
                        className="w-full h-full object-cover"
                        muted
                        loop
                        preload="metadata"
                        onMouseEnter={(e) => e.currentTarget.play()}
                        onMouseLeave={(e) => {
                          e.currentTarget.pause();
                          e.currentTarget.currentTime = 0;
                        }}
                      />
                      <div className="absolute top-2 left-2 px-2 py-1 bg-card/70 border border-border/70 backdrop-blur-sm rounded-md flex items-center gap-1">
                        <Play className="w-3 h-3 text-foreground" />
                        <span className="text-[10px] text-foreground">VIDEO</span>
                      </div>
                    </>
                  ) : (
                    <img
                      src={gen.resultUrl}
                      alt={gen.prompt}
                      className="w-full h-full object-cover"
                      loading="lazy"
                      decoding="async"
                    />
                  )}
                  <div className="absolute inset-0 bg-background/70 opacity-0 group-hover:opacity-100 transition-all flex items-center justify-center">
                    <div className="w-12 h-12 bg-card/70 border border-border/70 backdrop-blur-sm rounded-full flex items-center justify-center">
                      <Maximize2 className="w-5 h-5 text-foreground" />
                    </div>
                  </div>
                  <div className="absolute bottom-0 left-0 right-0 p-3 bg-gradient-to-t from-background/80 via-background/30 to-transparent">
                    <p className="text-xs text-foreground/80 truncate">{gen.prompt || '无提示词'}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {hasMoreGenerations && (
        <div ref={renderMoreRef} className="mt-6 flex items-center justify-center">
          <button
            type="button"
            onClick={handleRenderMore}
            className="px-4 py-2 rounded-lg bg-card/60 border border-border/70 text-foreground/70 text-sm hover:text-foreground hover:border-border transition"
          >
            Load more
          </button>
        </div>
      )}

      {/* Lightbox */}
      {selected && (
        <div
          className="fixed inset-0 z-50 bg-background/95 backdrop-blur-xl flex items-center justify-center p-4 md:p-8"
          onClick={() => setSelected(null)}
        >
          <div className="w-full h-full flex flex-col items-center justify-center" onClick={(e) => e.stopPropagation()}>
            <div className="w-full max-w-[90vw] max-h-[70vh] md:max-h-[75vh] flex items-center justify-center">
              {isVideo(selected) ? (
                <video
                  src={selected.resultUrl}
                  className="max-w-full max-h-[70vh] md:max-h-[75vh] w-auto h-auto rounded-xl border border-border/70"
                  controls
                  autoPlay
                  loop
                />
              ) : (
                <img
                  src={selected.resultUrl}
                  alt={selected.prompt}
                  className="max-w-full max-h-[70vh] md:max-h-[75vh] w-auto h-auto rounded-xl border border-border/70 object-contain"
                />
              )}
            </div>

            <div className="w-full max-w-3xl mt-4 md:mt-6 px-2">
              <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <p className="text-foreground text-sm leading-relaxed truncate md:whitespace-normal">{truncate(selected.prompt || '无提示词', 150)}</p>
                  <p className="text-foreground/40 text-xs mt-2">
                    {formatDate(selected.createdAt)} · 消耗 {selected.cost} 积分
                  </p>
                  <div className="mt-3 space-y-2">
                    <div className="flex items-start gap-2">
                      <span className="text-foreground/40 text-xs shrink-0 w-14">URL</span>
                      <span className="text-foreground/70 text-xs break-all flex-1">{selected.resultUrl || '-'}</span>
                      {selected.resultUrl && (
                        <button
                          onClick={() => {
                            navigator.clipboard.writeText(selected.resultUrl);
                            toast({ title: '已复制 URL' });
                          }}
                          className="shrink-0 p-1.5 text-foreground/40 hover:text-foreground hover:bg-card/70 rounded-lg transition-colors"
                          title="复制 URL"
                        >
                          <Copy className="w-4 h-4" />
                        </button>
                      )}
                    </div>

                    {typeof selected.params?.permalink === 'string' && selected.params.permalink && (
                      <div className="flex items-start gap-2">
                        <span className="text-foreground/40 text-xs shrink-0 w-14">详情</span>
                        <a
                          href={selected.params.permalink}
                          target="_blank"
                          rel="noreferrer"
                          className="text-foreground/70 text-xs break-all flex-1 hover:text-foreground underline underline-offset-2"
                        >
                          {selected.params.permalink}
                        </a>
                        <button
                          onClick={() => {
                            navigator.clipboard.writeText(selected.params.permalink as string);
                            toast({ title: '已复制 Permalink' });
                          }}
                          className="shrink-0 p-1.5 text-foreground/40 hover:text-foreground hover:bg-card/70 rounded-lg transition-colors"
                          title="复制 Permalink"
                        >
                          <Copy className="w-4 h-4" />
                        </button>
                        <a
                          href={selected.params.permalink}
                          target="_blank"
                          rel="noreferrer"
                          className="shrink-0 p-1.5 text-foreground/40 hover:text-foreground hover:bg-card/70 rounded-lg transition-colors"
                          title="打开链接"
                        >
                          <ExternalLink className="w-4 h-4" />
                        </a>
                      </div>
                    )}

                    {typeof selected.params?.revised_prompt === 'string' && selected.params.revised_prompt && (
                      <div className="flex items-start gap-2">
                        <span className="text-foreground/40 text-xs shrink-0 w-14">改写</span>
                        <span className="text-foreground/70 text-xs break-words flex-1">{selected.params.revised_prompt}</span>
                        <button
                          onClick={() => {
                            navigator.clipboard.writeText(selected.params.revised_prompt as string);
                            toast({ title: '已复制改写提示词' });
                          }}
                          className="shrink-0 p-1.5 text-foreground/40 hover:text-foreground hover:bg-card/70 rounded-lg transition-colors"
                          title="复制改写提示词"
                        >
                          <Copy className="w-4 h-4" />
                        </button>
                      </div>
                    )}
                  </div>
                </div>
                <div className="flex gap-2 shrink-0 w-full md:w-auto">
                  <button
                    onClick={() => downloadFile(selected.resultUrl, selected.id, selected.type)}
                    className="flex-1 md:flex-initial flex items-center justify-center gap-2 px-5 py-2.5 bg-foreground text-background rounded-xl hover:opacity-90 transition-colors text-sm font-medium"
                  >
                    <Download className="w-4 h-4" />
                    下载
                  </button>
                  <button
                    onClick={() => setSelected(null)}
                    className="flex items-center justify-center gap-2 px-5 py-2.5 bg-card/60 text-foreground border border-border/70 rounded-xl hover:bg-card/80 transition-colors text-sm font-medium"
                  >
                    <X className="w-4 h-4" />
                    关闭
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
