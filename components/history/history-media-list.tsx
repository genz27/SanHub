'use client';
/* eslint-disable @next/next/no-img-element */

import { memo, useCallback, useEffect, useRef, useState } from 'react';
import {
  Calendar,
  Check,
  Download,
  Image as ImageIcon,
  Play,
  Trash2,
  Video,
} from 'lucide-react';
import type { Generation } from '@/types';
import { formatDate } from '@/lib/utils';
import { isVideoGenerationType } from '@/lib/generation-reference';
import { displayPromptTitle } from '@/lib/region-edit-document';

const MEDIA_ROOT_MARGIN = '600px 0px';

export type HistoryBadge = {
  label: string;
  icon: unknown;
};

export type HistoryPendingTask = {
  id: string;
  prompt: string;
  type: string;
  status: 'pending' | 'processing';
  progress?: number;
  modelId?: string;
  model?: string;
  createdAt: number;
  updatedAt?: number;
};

interface GenerationCardProps {
  gen: Generation;
  badge: HistoryBadge;
  isSelected: boolean;
  selectMode: boolean;
  onSelect: (id: string) => void;
  onView: (gen: Generation) => void;
  onDownload: (url: string, id: string, type: string) => void;
  onDelete: (id: string) => void;
}

const GenerationCard = memo(function GenerationCard({
  gen,
  badge,
  isSelected,
  selectMode,
  onSelect,
  onView,
  onDownload,
  onDelete,
}: GenerationCardProps) {
  const cardRef = useRef<HTMLDivElement>(null);
  const [imageLoaded, setImageLoaded] = useState(false);
  const [hasRequestedMedia, setHasRequestedMedia] = useState(false);
  const shouldLoadMedia = hasRequestedMedia;

  useEffect(() => {
    if (hasRequestedMedia) return;

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
  }, [hasRequestedMedia]);

  const handleClick = useCallback(() => {
    if (selectMode) {
      onSelect(gen.id);
    } else {
      onView(gen);
    }
  }, [selectMode, gen, onSelect, onView]);

  const isVideo = isVideoGenerationType(gen.type);

  return (
    <div
      ref={cardRef}
      className={`w-full flex gap-4 p-4 bg-card/25 hover:bg-card/35 border rounded-2xl transition-all duration-300 relative group cursor-pointer ${
        isSelected
          ? 'border-sky-500 ring-1 ring-sky-500/30 bg-sky-500/5 shadow-[0_0_15px_rgba(14,165,233,0.15)]'
          : 'border-border/50 hover:border-sky-500/25'
      }`}
      onClick={handleClick}
    >
      <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-xl bg-card/50 border border-border/60 flex items-center justify-center shrink-0 relative overflow-hidden select-none">
        <span className="absolute top-1 left-1 z-10 px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-400 text-[9px] font-medium border border-emerald-500/20">
          已完成
        </span>

        {isVideo ? (
          <>
            {shouldLoadMedia ? (
              <img
                src={gen.resultUrl}
                alt=""
                className="w-full h-full object-cover"
                loading="lazy"
              />
            ) : (
              <div className="absolute inset-0 bg-gradient-to-br from-card/70 to-background/80" />
            )}
            <div className="absolute inset-0 bg-black/25 flex items-center justify-center">
              <div className="w-8 h-8 rounded-full bg-white/10 backdrop-blur-sm border border-white/20 flex items-center justify-center shadow-lg">
                <Play className="w-3.5 h-3.5 fill-white text-white translate-x-0.5" />
              </div>
            </div>
          </>
        ) : (
          <>
            {!imageLoaded && (
              <div className="absolute inset-0 bg-card/60 animate-pulse" />
            )}
            {shouldLoadMedia && (
              <img
                src={gen.resultUrl}
                alt={displayPromptTitle(gen.prompt)}
                className={`w-full h-full object-cover transition-opacity duration-300 ${imageLoaded ? 'opacity-100' : 'opacity-0'}`}
                loading="lazy"
                decoding="async"
                onLoad={() => setImageLoaded(true)}
              />
            )}
          </>
        )}

        {selectMode && (
          <div className="absolute inset-0 bg-background/50 flex items-center justify-center z-10">
            <div className={`w-6 h-6 rounded-md flex items-center justify-center border transition-all ${
              isSelected
                ? 'bg-sky-500 border-sky-500 text-white shadow-md'
                : 'bg-card/90 border-border'
            }`}>
              {isSelected && <Check className="w-4 h-4" />}
            </div>
          </div>
        )}
      </div>

      <div className="flex-1 min-w-0 flex flex-col justify-between py-0.5">
        <div>
          <div className="flex items-start justify-between gap-3 mb-1.5">
            <h3 className="text-sm font-medium text-foreground line-clamp-1 flex-1 pr-2">
              {displayPromptTitle(gen.prompt)}
            </h3>
            <span className="text-[10px] text-foreground/45 font-medium px-2 py-0.5 bg-card/30 border border-border/50 rounded-md whitespace-nowrap hidden sm:inline-block">
              {badge.label}
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-2 text-xs text-foreground/50">
            <span className="px-2 py-0.5 bg-card/45 border border-border/60 rounded-md text-[10px] text-foreground/60 flex items-center gap-1 font-medium select-none">
              {isVideo ? <Video className="w-3 h-3 text-sky-400" /> : <ImageIcon className="w-3 h-3 text-emerald-400" />}
              {isVideo ? '视频' : '图像'}
            </span>
            <span className="text-[10px] text-foreground/40 flex items-center gap-1 font-light select-none">
              <Calendar className="w-3 h-3 text-foreground/30" />
              {formatDate(gen.createdAt)}
            </span>
          </div>
        </div>

        {!selectMode && (
          <div className="mt-3 flex items-center justify-end gap-2" onClick={(e) => e.stopPropagation()}>
            <button
              onClick={() => onDownload(gen.resultUrl, gen.id, gen.type)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-card/50 hover:bg-card border border-border hover:border-border/80 text-[11px] font-medium rounded-lg text-foreground/80 hover:text-foreground transition-all shadow-sm"
              title="下载到本地"
            >
              <Download className="w-3 h-3" />
              下载
            </button>
            <button
              onClick={() => onView(gen)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-card/50 hover:bg-card border border-border hover:border-border/80 text-[11px] font-medium rounded-lg text-foreground/80 hover:text-foreground transition-all shadow-sm"
            >
              查看
            </button>
            <button
              onClick={() => onDelete(gen.id)}
              className="inline-flex items-center justify-center p-2 bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 hover:border-red-500/40 text-red-400 hover:text-red-300 rounded-lg transition-all"
              title="删除作品"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </div>

      {!selectMode && (
        <div className="absolute right-4 top-4 opacity-0 group-hover:opacity-100 transition-all hidden sm:block" onClick={(e) => e.stopPropagation()}>
          <button className="p-1.5 hover:bg-card rounded-lg text-foreground/40 hover:text-foreground/80 transition-colors">
            <span className="text-sm font-bold block leading-none">···</span>
          </button>
        </div>
      )}
    </div>
  );
});

function PendingTaskCard({
  task,
  badge,
}: {
  task: HistoryPendingTask;
  badge: HistoryBadge;
}) {
  const progress = task.progress || 0;
  const isVideo = isVideoGenerationType(task.type);
  const remainingMinutes = progress > 0 ? Math.max(1, Math.ceil((100 - progress) / 35)) : 2;

  return (
    <div className="w-full flex flex-col sm:flex-row gap-4 p-4 bg-card/20 border border-sky-500/20 hover:border-sky-500/30 rounded-2xl transition-all duration-300 relative group">
      <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-xl bg-card/50 border border-border/60 flex items-center justify-center shrink-0 relative overflow-hidden select-none">
        <span className="absolute top-1 left-1 z-10 px-2 py-0.5 rounded bg-sky-500/20 text-sky-400 text-[9px] font-medium border border-sky-500/20">
          生成中
        </span>

        <div className="relative w-12 h-12 flex items-center justify-center">
          <svg className="w-full h-full transform -rotate-90">
            <circle cx="24" cy="24" r="18" stroke="currentColor" className="text-border/30" strokeWidth="2.5" fill="transparent" />
            <circle
              cx="24"
              cy="24"
              r="18"
              stroke="currentColor"
              className="text-sky-400 transition-all duration-500"
              strokeWidth="2.5"
              fill="transparent"
              strokeDasharray={2 * Math.PI * 18}
              strokeDashoffset={2 * Math.PI * 18 * (1 - progress / 100)}
            />
          </svg>
          <span className="absolute text-[10px] font-mono font-medium text-sky-300">{progress}%</span>
        </div>
      </div>

      <div className="flex-1 min-w-0 flex flex-col justify-between py-0.5">
        <div>
          <div className="flex items-start justify-between gap-3 mb-1.5">
            <h3 className="text-sm font-medium text-foreground line-clamp-1 flex-1 pr-2">
              {displayPromptTitle(task.prompt)}
            </h3>
            <span className="text-[10px] text-foreground/45 font-medium px-2 py-0.5 bg-card/30 border border-border/50 rounded-md whitespace-nowrap hidden sm:inline-block">
              {badge.label}
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-2 text-xs text-foreground/50">
            <span className="px-2 py-0.5 bg-card/45 border border-border/60 rounded-md text-[10px] text-foreground/60 flex items-center gap-1 font-medium select-none">
              {isVideo ? <Video className="w-3 h-3 text-sky-400" /> : <ImageIcon className="w-3 h-3 text-emerald-400" />}
              {isVideo ? '视频' : '图像'}
            </span>
            <span className="text-[10px] text-foreground/40 flex items-center gap-1 font-light select-none">
              <Calendar className="w-3 h-3 text-foreground/30" />
              {formatDate(task.createdAt)}
            </span>
          </div>
        </div>

        <div className="mt-3 flex items-center gap-3 w-full max-w-sm">
          <div className="flex-1 h-1 bg-card/60 border border-border/40 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-sky-400 to-sky-300 transition-all duration-500 rounded-full"
              style={{ width: `${progress}%` }}
            />
          </div>
          <span className="text-[10px] text-sky-400 font-medium whitespace-nowrap select-none">
            剩余 {remainingMinutes} 分钟
          </span>
        </div>
      </div>
    </div>
  );
}

export function HistoryMediaList({
  tasks,
  generations,
  resolveTaskBadge,
  resolveGenerationBadge,
  selectedIds,
  selectMode,
  onSelect,
  onView,
  onDownload,
  onDelete,
}: {
  tasks: HistoryPendingTask[];
  generations: Generation[];
  resolveTaskBadge: (task: HistoryPendingTask) => HistoryBadge;
  resolveGenerationBadge: (gen: Generation) => HistoryBadge;
  selectedIds: Set<string>;
  selectMode: boolean;
  onSelect: (id: string) => void;
  onView: (gen: Generation) => void;
  onDownload: (url: string, id: string, type: string) => void;
  onDelete: (id: string) => void;
}) {
  return (
    <div className="space-y-3">
      {tasks.map((task) => (
        <PendingTaskCard key={task.id} task={task} badge={resolveTaskBadge(task)} />
      ))}
      {generations.map((gen) => (
        <GenerationCard
          key={gen.id}
          gen={gen}
          badge={resolveGenerationBadge(gen)}
          isSelected={selectedIds.has(gen.id)}
          selectMode={selectMode}
          onSelect={onSelect}
          onView={onView}
          onDownload={onDownload}
          onDelete={onDelete}
        />
      ))}
    </div>
  );
}
