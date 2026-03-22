'use client';
/* eslint-disable @next/next/no-img-element */

import { useEffect, useRef, useState } from 'react';
import {
  Download,
  Maximize2,
  X,
  Play,
  Image as ImageIcon,
  Sparkles,
  Loader2,
  AlertCircle,
  Copy,
  ExternalLink,
  Trash2,
} from 'lucide-react';
import type { Generation } from '@/types';
import { formatDate } from '@/lib/utils';
import { downloadAsset } from '@/lib/download';
import { toast } from '@/components/ui/toaster';

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
}

interface ResultGalleryProps {
  generations: Generation[];
  tasks?: Task[];
  onRemoveTask?: (taskId: string) => void;
  onRemoveGeneration?: (generation: Generation) => void;
  onReuseGeneration?: (generation: Generation, target: 'image' | 'video') => void;
  busyGenerationId?: string | null;
}

export function ResultGallery({
  generations,
  tasks = [],
  onRemoveTask,
  onRemoveGeneration,
  onReuseGeneration,
  busyGenerationId = null,
}: ResultGalleryProps) {
  const [selected, setSelected] = useState<Generation | null>(null);
  const [selectedFailedTask, setSelectedFailedTask] = useState<Task | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

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
  const canReuse = (gen: Generation) => !isVideo(gen) && typeof onReuseGeneration === 'function';
  const isTaskVideo = (task: Task) => task.type?.includes('video') || task.model?.includes('video');
  const handleRemoveGeneration = (generation: Generation) => {
    if (!onRemoveGeneration) return;
    const confirmed = window.confirm('确定删除这个作品吗？删除后将无法恢复。');
    if (!confirmed) return;
    void onRemoveGeneration(generation);
  };

  // 过滤出正在进行的任务（不包括已完成的，已完成的会在 generations 中显示）
  // 同时排除已经存在于 generations 中的任务（通过 id 匹配）
  const generationIds = new Set(generations.map(g => g.id));
  const activeTasks = tasks.filter(t => 
    (t.status === 'pending' || t.status === 'processing') && !generationIds.has(t.id)
  );
  const failedTasks = tasks.filter(t => t.status === 'failed' || t.status === 'cancelled');
  
  const totalCount = generations.length + activeTasks.length;

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
      <div className="surface overflow-hidden flex flex-col h-full">
        {/* Header */}
        <div className="p-4 sm:p-6 border-b border-border/70 shrink-0">
          <div className="flex items-center justify-between">
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
        </div>

        <div ref={scrollContainerRef} className="p-4 sm:p-6 flex-1 overflow-y-auto min-h-0">
          {totalCount === 0 && failedTasks.length === 0 ? (
            <div className="h-64 flex flex-col items-center justify-center border border-dashed border-border/70 rounded-xl">
              <div className="w-16 h-16 bg-card/60 rounded-2xl flex items-center justify-center mb-4">
                <ImageIcon className="w-8 h-8 text-foreground/30" />
              </div>
              <p className="text-foreground/50">暂无生成结果</p>
              <p className="text-foreground/30 text-sm mt-1">开始创作你的第一个作品</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 md:gap-5">
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
                          Click to view details
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
              {generations.map((gen, index) => (
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
                        <span className="text-[10px] font-medium text-foreground">#{index + 1}</span>
                        <Play className="w-3 h-3 text-foreground" />
                      </div>
                    </>
                  ) : (
                    <>
                      <img
                        src={gen.resultUrl}
                        alt={gen.prompt}
                        className="w-full h-full object-cover"
                        loading="lazy"
                        decoding="async"
                      />
                      <div className="absolute top-2 left-2 px-2 py-1 bg-card/70 border border-border/70 backdrop-blur-sm rounded-md">
                        <span className="text-[10px] font-medium text-foreground">#{index + 1}</span>
                      </div>
                    </>
                  )}
                  <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity">
                    <div className="w-14 h-14 bg-background/50 backdrop-blur-sm rounded-full flex items-center justify-center">
                      <Maximize2 className="w-6 h-6 text-foreground" />
                    </div>
                  </div>
                  <div
                    className="absolute top-2 right-2 z-10 opacity-0 group-hover:opacity-100 [@media(hover:none)]:opacity-100 transition-opacity"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <div className="flex items-center gap-1">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          downloadFile(gen.resultUrl, gen.id, gen.type);
                        }}
                        className="w-8 h-8 bg-card/70 border border-border/70 backdrop-blur-sm rounded-lg flex items-center justify-center text-foreground hover:bg-card/90 transition-colors"
                        title="Download"
                      >
                        <Download className="w-3.5 h-3.5" />
                      </button>
                      {onRemoveGeneration && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleRemoveGeneration(gen);
                          }}
                          disabled={busyGenerationId === gen.id}
                          className="w-8 h-8 bg-card/70 border border-border/70 backdrop-blur-sm rounded-lg flex items-center justify-center text-foreground hover:bg-red-500/40 transition-colors disabled:cursor-not-allowed disabled:opacity-70"
                          title="删除作品"
                        >
                          {busyGenerationId === gen.id ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <Trash2 className="w-3.5 h-3.5" />
                          )}
                        </button>
                      )}
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

      {/* Lightbox */}
      {selected && (
        <div
          className="fixed inset-0 z-50 bg-background/95 p-3 backdrop-blur-xl md:p-6"
          onClick={() => setSelected(null)}
          role="dialog"
          aria-modal="true"
          aria-labelledby="generation-lightbox-title"
        >
          <div
            className="mx-auto flex h-full max-h-[calc(100vh-1.5rem)] w-full max-w-6xl flex-col overflow-hidden rounded-2xl border border-border/70 bg-card/95 shadow-2xl md:max-h-[calc(100vh-3rem)] md:flex-row"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex min-h-0 min-w-0 flex-1 flex-col">
              <div className="flex items-start justify-between gap-3 border-b border-border/70 px-4 py-3 md:px-5">
                <div className="min-w-0">
                  <h2
                    id="generation-lightbox-title"
                    className="truncate text-sm font-medium text-foreground md:text-base"
                  >
                    {selected.prompt || '无提示词'}
                  </h2>
                  <p className="mt-1 text-xs text-foreground/40">
                    {formatDate(selected.createdAt)} · 消耗 {selected.cost} 积分
                  </p>
                </div>
                <button
                  onClick={() => setSelected(null)}
                  className="shrink-0 rounded-xl border border-border/70 bg-card/70 p-2 text-foreground/60 transition-colors hover:bg-card/90 hover:text-foreground"
                  title="关闭"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="flex flex-1 min-h-0 items-center justify-center bg-background/40 p-3 md:p-6">
                {isVideo(selected) ? (
                  <video
                    src={selected.resultUrl}
                    className="max-h-full max-w-full rounded-xl border border-border/70 object-contain"
                    controls
                    autoPlay
                    loop
                  />
                ) : (
                  <img
                    src={selected.resultUrl}
                    alt={selected.prompt}
                    className="max-h-full max-w-full rounded-xl border border-border/70 object-contain"
                  />
                )}
              </div>
            </div>

            <aside className="flex w-full shrink-0 flex-col border-t border-border/70 md:max-w-[380px] md:border-l md:border-t-0">
              <div className="flex-1 min-h-0 space-y-4 overflow-y-auto p-4 md:p-5">
                <div className="flex flex-wrap gap-2">
                  {canReuse(selected) && (
                    <>
                      <button
                        onClick={() => void onReuseGeneration?.(selected, 'image')}
                        className="flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl border border-border/70 bg-card/60 px-4 py-2.5 text-sm font-medium text-foreground transition-colors hover:bg-card/80"
                      >
                        <ImageIcon className="w-4 h-4" />
                        图片创作
                      </button>
                      <button
                        onClick={() => void onReuseGeneration?.(selected, 'video')}
                        className="flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl border border-border/70 bg-card/60 px-4 py-2.5 text-sm font-medium text-foreground transition-colors hover:bg-card/80"
                      >
                        <Play className="w-4 h-4" />
                        视频创作
                      </button>
                    </>
                  )}
                  <button
                    onClick={() => downloadFile(selected.resultUrl, selected.id, selected.type)}
                    className="flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-foreground px-4 py-2.5 text-sm font-medium text-background transition-colors hover:opacity-90"
                  >
                    <Download className="w-4 h-4" />
                    下载
                  </button>
                  {onRemoveGeneration && (
                    <button
                      onClick={() => handleRemoveGeneration(selected)}
                      disabled={busyGenerationId === selected.id}
                      className="flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-2.5 text-sm font-medium text-red-300 transition-colors hover:bg-red-500/20 disabled:cursor-not-allowed disabled:opacity-70"
                    >
                      {busyGenerationId === selected.id ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Trash2 className="w-4 h-4" />
                      )}
                      删除
                    </button>
                  )}
                </div>

                <div className="space-y-1">
                  <p className="text-xs font-medium text-foreground/40">
                    提示词
                  </p>
                  <div className="rounded-xl border border-border/70 bg-card/40 p-3">
                    <p className="text-sm leading-relaxed text-foreground/80 whitespace-pre-wrap break-words">
                      {selected.prompt || '无提示词'}
                    </p>
                  </div>
                </div>

                <div className="space-y-1">
                  <p className="text-xs font-medium text-foreground/40">
                    资源地址
                  </p>
                  <div className="rounded-xl border border-border/70 bg-card/40 p-3">
                    <div className="flex items-start gap-2">
                      <p className="min-w-0 flex-1 break-all text-xs leading-5 text-foreground/70">
                        {selected.resultUrl || '-'}
                      </p>
                      {selected.resultUrl && (
                        <button
                          onClick={() => {
                            navigator.clipboard.writeText(selected.resultUrl);
                            toast({ title: '已复制 URL' });
                          }}
                          className="shrink-0 rounded-lg p-1.5 text-foreground/40 transition-colors hover:bg-card/70 hover:text-foreground"
                          title="复制 URL"
                        >
                          <Copy className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>
                </div>

                {typeof selected.params?.permalink === 'string' && selected.params.permalink && (
                  <div className="space-y-1">
                    <p className="text-xs font-medium text-foreground/40">
                      详情链接
                    </p>
                    <div className="rounded-xl border border-border/70 bg-card/40 p-3">
                      <div className="flex items-start gap-2">
                        <a
                          href={selected.params.permalink}
                          target="_blank"
                          rel="noreferrer"
                          className="min-w-0 flex-1 break-all text-xs leading-5 text-foreground/70 underline underline-offset-2 transition-colors hover:text-foreground"
                        >
                          {selected.params.permalink}
                        </a>
                        <div className="flex shrink-0 items-center gap-1">
                          <button
                            onClick={() => {
                              navigator.clipboard.writeText(selected.params.permalink as string);
                              toast({ title: '已复制 Permalink' });
                            }}
                            className="rounded-lg p-1.5 text-foreground/40 transition-colors hover:bg-card/70 hover:text-foreground"
                            title="复制 Permalink"
                          >
                            <Copy className="w-4 h-4" />
                          </button>
                          <a
                            href={selected.params.permalink}
                            target="_blank"
                            rel="noreferrer"
                            className="rounded-lg p-1.5 text-foreground/40 transition-colors hover:bg-card/70 hover:text-foreground"
                            title="打开链接"
                          >
                            <ExternalLink className="w-4 h-4" />
                          </a>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {typeof selected.params?.revised_prompt === 'string' && selected.params.revised_prompt && (
                  <div className="space-y-1">
                    <p className="text-xs font-medium text-foreground/40">
                      改写提示词
                    </p>
                    <div className="rounded-xl border border-border/70 bg-card/40 p-3">
                      <div className="flex items-start gap-2">
                        <p className="min-w-0 flex-1 break-words text-xs leading-5 text-foreground/70">
                          {selected.params.revised_prompt}
                        </p>
                        <button
                          onClick={() => {
                            navigator.clipboard.writeText(selected.params.revised_prompt as string);
                            toast({ title: '已复制改写提示词' });
                          }}
                          className="shrink-0 rounded-lg p-1.5 text-foreground/40 transition-colors hover:bg-card/70 hover:text-foreground"
                          title="复制改写提示词"
                        >
                          <Copy className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </aside>
          </div>
        </div>
      )}

      {selectedFailedTask && (
        <div
          className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setSelectedFailedTask(null)}
          role="dialog"
          aria-modal="true"
          aria-labelledby="error-modal-title"
        >
          <div
            className="bg-card/95 border border-red-500/30 rounded-2xl p-6 w-full max-w-md"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 bg-red-500/20 rounded-xl flex items-center justify-center">
                <AlertCircle className="w-5 h-5 text-red-400" />
              </div>
              <div>
                <h2 id="error-modal-title" className="text-lg font-medium text-foreground">
                  {selectedFailedTask.status === 'cancelled' ? 'Task cancelled' : 'Generation failed'}
                </h2>
                <p className="text-xs text-foreground/40">
                  {formatDate(selectedFailedTask.createdAt)}
                </p>
              </div>
            </div>

            <div className="space-y-3">
              <div>
                <p className="text-xs text-foreground/50 mb-1">Error</p>
                <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg">
                  <p className="text-sm text-red-300 whitespace-pre-wrap break-words">
                    {selectedFailedTask.errorMessage}
                  </p>
                </div>
              </div>

              {selectedFailedTask.prompt && (
                <div>
                  <p className="text-xs text-foreground/50 mb-1">Prompt</p>
                  <p className="text-sm text-foreground/70 break-words">
                    {selectedFailedTask.prompt}
                  </p>
                </div>
              )}

              {selectedFailedTask.model && (
                <div>
                  <p className="text-xs text-foreground/50 mb-1">Model</p>
                  <p className="text-sm text-foreground/70">{selectedFailedTask.model}</p>
                </div>
              )}
            </div>

            <button
              onClick={() => setSelectedFailedTask(null)}
              className="mt-6 w-full py-2.5 bg-card/60 border border-border/70 text-foreground rounded-xl hover:bg-card/80 transition-colors text-sm font-medium"
              autoFocus
            >
              Close
            </button>
          </div>
        </div>
      )}
    </>
  );
}
