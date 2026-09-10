'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Copy,
  Download,
  Maximize2,
  X,
} from 'lucide-react';
import { toast } from '@/components/ui/toaster';
import { formatDate } from '@/lib/utils';
import type { Generation } from '@/types';
import { displayPromptTitle } from '@/lib/region-edit-document';
import { GenerationReferenceImages } from '@/components/generator/generation-reference-images';

export type HistoryMediaBadge = {
  label: string;
};

function CollapsibleText({
  text,
  collapsedLines = 3,
}: {
  text: string;
  collapsedLines?: number;
}) {
  const [expanded, setExpanded] = useState(false);

  const collapsedClassName = useMemo(() => {
    if (collapsedLines === 1) return 'line-clamp-1';
    if (collapsedLines === 2) return 'line-clamp-2';
    if (collapsedLines === 4) return 'line-clamp-4';
    if (collapsedLines === 5) return 'line-clamp-5';
    if (collapsedLines === 6) return 'line-clamp-6';
    return 'line-clamp-3';
  }, [collapsedLines]);

  return (
    <div className="min-w-0">
      <div
        className={`text-foreground text-sm leading-relaxed whitespace-pre-wrap break-words min-w-0 ${expanded ? '' : collapsedClassName}`}
      >
        {text}
      </div>
      <div className="mt-2 flex items-center gap-2">
        <button
          onClick={() => setExpanded((value) => !value)}
          className="text-xs text-foreground/50 hover:text-foreground/80 hover:underline underline-offset-4 transition-colors"
          type="button"
        >
          {expanded ? '收起' : '展开'}
        </button>
        <button
          onClick={() => {
            navigator.clipboard.writeText(text);
            toast({ title: '已复制提示词' });
          }}
          className="inline-flex items-center gap-1 text-xs text-foreground/50 hover:text-foreground/80 transition-colors"
          title="复制提示词"
          type="button"
        >
          <Copy className="w-3.5 h-3.5" />
          复制
        </button>
      </div>
    </div>
  );
}

export function FullscreenViewer({
  generation,
  badge,
  isVideo,
  onClose,
  onDownload,
}: {
  generation: Generation;
  badge: HistoryMediaBadge;
  isVideo: boolean;
  onClose: () => void;
  onDownload: (url: string, id: string, type: string) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showPanel, setShowPanel] = useState(true);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout>>();

  const toggleFullscreen = useCallback(async () => {
    if (!containerRef.current) return;
    if (document.fullscreenElement) {
      await document.exitFullscreen();
    } else {
      await containerRef.current.requestFullscreen();
    }
  }, []);

  useEffect(() => {
    const onFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
      setShowPanel(true);
    };
    document.addEventListener('fullscreenchange', onFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', onFullscreenChange);
  }, []);

  useEffect(() => {
    if (!isFullscreen) return;
    const onMouseMove = () => {
      setShowPanel(true);
      clearTimeout(hideTimerRef.current);
      hideTimerRef.current = setTimeout(() => setShowPanel(false), 2500);
    };
    document.addEventListener('mousemove', onMouseMove);
    onMouseMove();
    return () => {
      document.removeEventListener('mousemove', onMouseMove);
      clearTimeout(hideTimerRef.current);
    };
  }, [isFullscreen]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !document.fullscreenElement) {
        onClose();
      }
      if ((event.key === 'f' || event.key === 'F') && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        toggleFullscreen();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onClose, toggleFullscreen]);

  const gen = generation;

  return (
    <div
      ref={containerRef}
      className={`fixed inset-0 z-[60] flex flex-col ${isFullscreen ? 'bg-black' : 'bg-background/95 backdrop-blur-xl'}`}
      onClick={onClose}
    >
      <div className={`shrink-0 flex items-center justify-end gap-2 p-3 transition-opacity duration-300 ${
        isFullscreen && !showPanel ? 'opacity-0 pointer-events-none' : 'opacity-100'
      }`}>
        <button
          onClick={(event) => { event.stopPropagation(); toggleFullscreen(); }}
          className="p-2 text-foreground/50 hover:text-foreground rounded-lg hover:bg-card/70 transition-colors"
          title={isFullscreen ? '退出全屏 (Ctrl+F)' : '全屏查看 (Ctrl+F)'}
        >
          <Maximize2 className="w-4 h-4" />
        </button>
        <button
          onClick={onClose}
          className="p-2 text-foreground/50 hover:text-foreground rounded-lg hover:bg-card/70 transition-colors"
          title="关闭 (Esc)"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <div
        className={`flex-1 min-h-0 flex items-center justify-center transition-all duration-300 ${
          isFullscreen ? 'p-0' : 'p-4 md:p-6'
        }`}
        onClick={(event) => event.stopPropagation()}
      >
        {isVideo ? (
          <video
            src={gen.resultUrl}
            className={`max-w-full max-h-full w-auto h-auto ${isFullscreen ? '' : 'rounded-xl border border-border/70'} object-contain`}
            controls
            autoPlay
            loop
            playsInline
            preload="metadata"
          />
        ) : (
          <img
            src={gen.resultUrl}
            alt={displayPromptTitle(gen.prompt)}
            className={`max-w-full max-h-full w-auto h-auto ${isFullscreen ? '' : 'rounded-xl border border-border/70'} object-contain`}
            decoding="async"
          />
        )}
      </div>

      <div
        className={`shrink-0 w-full transition-all duration-300 ${
          isFullscreen
            ? showPanel
              ? 'translate-y-0 opacity-100'
              : 'translate-y-full opacity-0'
            : 'translate-y-0 opacity-100'
        } ${isFullscreen ? 'bg-black/80 backdrop-blur-sm' : 'bg-background/80 backdrop-blur-sm border-t border-border/30'}`}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="max-w-3xl mx-auto p-3 md:px-8 md:py-3">
          <div className="flex flex-col md:flex-row md:items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <CollapsibleText text={gen.prompt || '无提示词'} collapsedLines={2} />
              <div className="mt-3 max-w-xl">
                <GenerationReferenceImages generation={gen} />
              </div>
              <div className="flex flex-wrap items-center gap-2 mt-2">
                <span className="text-foreground/40 text-xs">{formatDate(gen.createdAt)}</span>
                <span className="text-foreground/30">·</span>
                <span className="text-foreground/40 text-xs">{gen.cost} 积分</span>
                <span className="text-foreground/30">·</span>
                <span className="px-2 py-0.5 bg-card/70 text-foreground/60 text-xs rounded">
                  {badge.label}
                </span>
                {gen.resultUrl && (
                  <button
                    onClick={() => { navigator.clipboard.writeText(gen.resultUrl); toast({ title: '已复制 URL' }); }}
                    className="p-1 text-foreground/40 hover:text-foreground/80 rounded transition-colors"
                    title="复制 URL"
                  >
                    <Copy className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>
            <div className="flex flex-wrap gap-2 shrink-0 w-full md:w-auto">
              <button
                onClick={() => onDownload(gen.resultUrl, gen.id, gen.type)}
                className="flex items-center justify-center gap-2 px-5 py-2 bg-foreground text-background rounded-xl hover:opacity-90 transition-colors text-sm font-medium"
              >
                <Download className="w-3.5 h-3.5" />
                下载
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
