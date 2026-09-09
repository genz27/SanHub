'use client';
/* eslint-disable @next/next/no-img-element */

import {
  AlertCircle,
  Copy,
  ExternalLink,
  Image as ImageIcon,
  Loader2,
  Trash2,
  Video,
  X,
} from 'lucide-react';
import type { Generation } from '@/types';
import { formatDate } from '@/lib/utils';
import { toast } from '@/components/ui/toaster';

type FailedTask = {
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled';
  createdAt: number;
  errorMessage?: string;
  prompt?: string;
  model?: string;
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

function isVideoGeneration(gen: Generation) {
  return gen.type.includes('video');
}

export function ResultGalleryLightbox({
  selected,
  selectedFailedTask,
  busyGenerationId,
  canReuse,
  onCloseSelected,
  onCloseFailed,
  onReuseGeneration,
  onRemoveGeneration,
}: {
  selected: Generation | null;
  selectedFailedTask: FailedTask | null;
  busyGenerationId: string | null;
  canReuse: boolean;
  onCloseSelected: () => void;
  onCloseFailed: () => void;
  onReuseGeneration?: (generation: Generation, target: 'image' | 'video') => void;
  onRemoveGeneration?: (generation: Generation) => void;
}) {
  if (!selected && !selectedFailedTask) return null;

  return (
    <>
      {selected && (
        <div
          className="fixed inset-0 z-50 bg-background/95 p-3 backdrop-blur-xl md:p-6"
          onClick={onCloseSelected}
          role="dialog"
          aria-modal="true"
          aria-labelledby="generation-lightbox-title"
        >
          <div
            className="mx-auto flex h-full max-h-[calc(100vh-1.5rem)] w-full max-w-6xl flex-col overflow-hidden rounded-2xl border border-border/70 bg-card/95 shadow-2xl md:max-h-[calc(100vh-3rem)] md:flex-row"
            onClick={(event) => event.stopPropagation()}
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
                  onClick={onCloseSelected}
                  className="shrink-0 rounded-xl border border-border/70 bg-card/70 p-2 text-foreground/60 transition-colors hover:bg-card/90 hover:text-foreground"
                  title="关闭"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="flex flex-1 min-h-0 items-center justify-center bg-background/40 p-3 md:p-6">
                {isVideoGeneration(selected) ? (
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
                    decoding="async"
                  />
                )}
              </div>
            </div>

            <aside className="flex w-full shrink-0 flex-col border-t border-border/70 md:max-w-[380px] md:border-l md:border-t-0">
              <div className="flex-1 min-h-0 space-y-4 overflow-y-auto p-4 md:p-5">
                <div className="space-y-3">
                  {canReuse && onReuseGeneration && (
                    <div className="space-y-2">
                      <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-foreground/35">
                        以此继续
                      </p>
                      <div className="grid grid-cols-2 gap-2">
                        <button
                          onClick={() => onReuseGeneration(selected, 'image')}
                          className="group flex items-center gap-2.5 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2.5 text-left transition-colors hover:border-white/20 hover:bg-white/[0.06]"
                        >
                          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-foreground/8 text-foreground/70 group-hover:text-foreground">
                            <ImageIcon className="h-4 w-4" />
                          </span>
                          <span className="min-w-0">
                            <span className="block text-sm font-medium text-foreground">图片创作</span>
                            <span className="block text-[11px] text-muted-foreground">用此图继续出图</span>
                          </span>
                        </button>
                        <button
                          onClick={() => onReuseGeneration(selected, 'video')}
                          className="group flex items-center gap-2.5 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2.5 text-left transition-colors hover:border-white/20 hover:bg-white/[0.06]"
                        >
                          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-foreground/8 text-foreground/70 group-hover:text-foreground">
                            <Video className="h-4 w-4" />
                          </span>
                          <span className="min-w-0">
                            <span className="block text-sm font-medium text-foreground">视频创作</span>
                            <span className="block text-[11px] text-muted-foreground">用此图生成视频</span>
                          </span>
                        </button>
                      </div>
                    </div>
                  )}
                  <div className="flex gap-2">
                    <button
                      onClick={() => openAssetInNewTab(selected.resultUrl)}
                      className="inline-flex h-10 flex-1 items-center justify-center gap-2 rounded-xl bg-foreground text-sm font-medium text-background transition-opacity hover:opacity-90"
                    >
                      <ExternalLink className="h-4 w-4" />
                      打开
                    </button>
                    {onRemoveGeneration && (
                      <button
                        onClick={() => onRemoveGeneration(selected)}
                        disabled={busyGenerationId === selected.id}
                        className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-red-500/30 bg-red-500/10 px-3.5 text-sm font-medium text-red-300 transition-colors hover:bg-red-500/20 disabled:cursor-not-allowed disabled:opacity-70"
                      >
                        {busyGenerationId === selected.id ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Trash2 className="h-4 w-4" />
                        )}
                        删除
                      </button>
                    )}
                  </div>
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
          onClick={onCloseFailed}
          role="dialog"
          aria-modal="true"
          aria-labelledby="error-modal-title"
        >
          <div
            className="bg-card/95 border border-red-500/30 rounded-2xl p-6 w-full max-w-md"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 bg-red-500/20 rounded-xl flex items-center justify-center">
                <AlertCircle className="w-5 h-5 text-red-400" />
              </div>
              <div>
                <h2 id="error-modal-title" className="text-lg font-medium text-foreground">
                  {selectedFailedTask.status === 'cancelled' ? '任务已取消' : '生成失败'}
                </h2>
                <p className="text-xs text-foreground/40">
                  {formatDate(selectedFailedTask.createdAt)}
                </p>
              </div>
            </div>

            <div className="space-y-3">
              <div>
                <p className="text-xs text-foreground/50 mb-1">错误详情</p>
                <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg">
                  <p className="text-sm text-red-300 whitespace-pre-wrap break-words">
                    {selectedFailedTask.errorMessage}
                  </p>
                </div>
              </div>

              {selectedFailedTask.prompt && (
                <div>
                  <p className="text-xs text-foreground/50 mb-1">提示词</p>
                  <p className="text-sm text-foreground/70 break-words">
                    {selectedFailedTask.prompt}
                  </p>
                </div>
              )}

              {selectedFailedTask.model && (
                <div>
                  <p className="text-xs text-foreground/50 mb-1">模型</p>
                  <p className="text-sm text-foreground/70">{selectedFailedTask.model}</p>
                </div>
              )}
            </div>

            <button
              onClick={onCloseFailed}
              className="mt-6 w-full py-2.5 bg-card/60 border border-border/70 text-foreground rounded-xl hover:bg-card/80 transition-colors text-sm font-medium"
              autoFocus
            >
              关闭
            </button>
          </div>
        </div>
      )}
    </>
  );
}
