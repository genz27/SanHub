'use client';
/* eslint-disable @next/next/no-img-element */

import { useState, useEffect, useRef, useCallback, useMemo, memo, type CSSProperties } from 'react';
import { useSession } from 'next-auth/react';
import {
  Download,
  Trash2,
  Play,
  Video,
  Image as ImageIcon,
  X,
  Check,
  CheckSquare,
  Square,
  Copy,
  User,
  History,
  Maximize2,
  Loader2,
  Edit3,
  ExternalLink,
  Droplets,
  Calendar,
} from 'lucide-react';
import { toast } from '@/components/ui/toaster';
import type { Generation, CharacterCard, SafeImageModel, SafeVideoModel } from '@/types';
import { formatDate } from '@/lib/utils';
import { downloadAsset } from '@/lib/download';
import {
  fetchPendingGenerationTasks,
  isTerminalGenerationStatus,
  mergeGenerationsById,
  pollGenerationTask,
  replaceActiveTasks,
} from '@/lib/generation-client';
import {
  getFriendlyErrorMessage,
} from '@/lib/polling-utils';

// 任务类型
interface Task {
  id: string;
  prompt: string;
  type: string;
  status: 'pending' | 'processing';
  progress?: number; // 0-100
  modelId?: string;
  model?: string;
  createdAt: number;
  updatedAt?: number;
}

type Badge = {
  label: string;
  icon: any;
};

// 纯函数 - 移到组件外部避免重复创建
const isVideoType = (gen: Generation) => gen.type.includes('video');
const isTaskVideoType = (type: string) => type?.includes('video');

const CHARACTER_BADGE: Badge = { label: '角色卡', icon: User };
const FALLBACK_VIDEO_BADGE: Badge = { label: '视频', icon: Video };
const FALLBACK_IMAGE_BADGE: Badge = { label: '图像', icon: ImageIcon };
const HISTORY_PAGE_SIZE = 24;
const HISTORY_RESYNC_INTERVAL_MS = 30_000;
const MEDIA_ROOT_MARGIN = '600px 0px';
const HISTORY_STATUS_FILTER = 'completed';
const CARD_CONTAIN_STYLE: CSSProperties = {
  contentVisibility: 'auto',
  containIntrinsicSize: '240px 135px',
};

type HistoryFilter = 'all' | 'video' | 'image' | 'character';
type HistoryMediaKind = 'all' | 'video' | 'image';

const getHistoryMediaKind = (filter: HistoryFilter): HistoryMediaKind => {
  if (filter === 'video' || filter === 'image') return filter;
  return 'all';
};

const VIDEO_CHANNEL_BADGE_LABELS: Record<string, string> = {
  sora: 'Sora 视频',
  grok2api: 'Grok 视频',
  flow2api: 'Veo 视频',
  'openai-compatible': 'OpenAI 视频',
};

const IMAGE_CHANNEL_BADGE_LABELS: Record<string, string> = {
  sora: 'Sora 图像',
  gemini: 'Gemini 图像',
  gitee: 'Gitee 图像',
  modelscope: 'ModelScope 图像',
  'openai-compatible': 'OpenAI 图像',
  'openai-chat': 'OpenAI 图像',
};

const IMAGE_TYPE_BADGE_LABELS: Record<string, string> = {
  'sora-image': 'Sora 图像',
  'gemini-image': 'Gemini 图像',
  'zimage-image': 'Gitee 图像',
  'gitee-image': 'Gitee 图像',
};

const getVideoBadge = (channelType?: string): Badge => ({
  label: VIDEO_CHANNEL_BADGE_LABELS[channelType || ''] || FALLBACK_VIDEO_BADGE.label,
  icon: Video,
});

const getImageBadge = (channelType?: string, fallbackType?: string): Badge => ({
  label:
    IMAGE_CHANNEL_BADGE_LABELS[channelType || ''] ||
    (fallbackType ? IMAGE_TYPE_BADGE_LABELS[fallbackType] : undefined) ||
    FALLBACK_IMAGE_BADGE.label,
  icon: ImageIcon,
});

const inferVideoBadge = (model?: string): Badge => {
  const lower = (model || '').toLowerCase();
  if (lower.includes('grok')) return getVideoBadge('grok2api');
  if (lower.startsWith('veo_') || lower.includes('veo')) return getVideoBadge('flow2api');
  if (lower.includes('sora')) return getVideoBadge('sora');
  return FALLBACK_VIDEO_BADGE;
};

const inferImageBadge = (type: string, model?: string): Badge => {
  const lower = (model || '').toLowerCase();
  if (lower.includes('gemini')) return getImageBadge('gemini');
  if (lower.includes('sora')) return getImageBadge('sora');
  if (lower.includes('qwen') || lower.includes('flux')) return getImageBadge('modelscope');
  if (lower.includes('z-image') || lower.includes('tongyi') || lower.includes('rmbg') || lower.includes('seedvr')) {
    return getImageBadge('gitee');
  }
  return getImageBadge(undefined, type);
};

// 骨架屏组件
const SkeletonCard = () => (
  <div className="relative aspect-video bg-card/60 rounded-xl overflow-hidden border border-border/70 animate-pulse">
    <div className="absolute inset-0 bg-gradient-to-br from-white/5 to-white/10" />
    <div className="absolute top-2 right-2 w-16 h-5 bg-card/70 rounded-md" />
    <div className="absolute bottom-0 left-0 right-0 p-3 space-y-2">
      <div className="h-3 bg-card/70 rounded w-3/4" />
      <div className="h-2 bg-card/70 rounded w-1/3" />
    </div>
  </div>
);

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
          onClick={() => setExpanded(v => !v)}
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

// Memoized 列表行组件 - 避免不必要的重渲染
interface GenerationCardProps {
  gen: Generation;
  badge: Badge;
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

  const isVideo = isVideoType(gen);

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
      {/* Left Column: Media Thumbnail */}
      <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-xl bg-card/50 border border-border/60 flex items-center justify-center shrink-0 relative overflow-hidden select-none">
        {/* Status Badge */}
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
                alt={gen.prompt}
                className={`w-full h-full object-cover transition-opacity duration-300 ${imageLoaded ? 'opacity-100' : 'opacity-0'}`}
                loading="lazy"
                decoding="async"
                onLoad={() => setImageLoaded(true)}
              />
            )}
          </>
        )}

        {/* Select Mode Checkbox Overlay */}
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

      {/* Center Column: Main text details */}
      <div className="flex-1 min-w-0 flex flex-col justify-between py-0.5">
        <div>
          <div className="flex items-start justify-between gap-3 mb-1.5">
            {/* Prompt Description */}
            <h3 className="text-sm font-medium text-foreground line-clamp-1 flex-1 pr-2">
              {gen.prompt || '无提示词'}
            </h3>
            {/* Top-Right Channel Badge */}
            <span className="text-[10px] text-foreground/45 font-medium px-2 py-0.5 bg-card/30 border border-border/50 rounded-md whitespace-nowrap hidden sm:inline-block">
              {badge.label}
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-2 text-xs text-foreground/50">
            {/* Format Badge */}
            <span className="px-2 py-0.5 bg-card/45 border border-border/60 rounded-md text-[10px] text-foreground/60 flex items-center gap-1 font-medium select-none">
              {isVideo ? <Video className="w-3 h-3 text-sky-400" /> : <ImageIcon className="w-3 h-3 text-emerald-400" />}
              {isVideo ? '视频' : '图像'}
            </span>
            {/* Creation Date */}
            <span className="text-[10px] text-foreground/40 flex items-center gap-1 font-light select-none">
              <Calendar className="w-3 h-3 text-foreground/30" />
              {formatDate(gen.createdAt)}
            </span>
          </div>
        </div>

        {/* Bottom Actions Row - Only visible in normal mode */}
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

      {/* Right Ellipsis Menu Button on Hover */}
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

export default function HistoryPage() {
  const { data: session, update } = useSession();
  const [generations, setGenerations] = useState<Generation[]>([]);
  const [pendingTasks, setPendingTasks] = useState<Task[]>([]);
  const [videoModels, setVideoModels] = useState<SafeVideoModel[]>([]);
  const [imageModels, setImageModels] = useState<SafeImageModel[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Generation | null>(null);
  const [filter, setFilter] = useState<HistoryFilter>('all');
  const [characterCards, setCharacterCards] = useState<CharacterCard[]>([]);
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState('');
  const [sortOrder, setSortOrder] = useState<'latest' | 'oldest'>('latest');
  const [deleting, setDeleting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<'single' | 'batch' | 'all-media' | 'all-characters' | 'all-errors' | null>(null);
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);
  const [unwatermarking, setUnwatermarking] = useState(false);
  const [unwatermarkUrl, setUnwatermarkUrl] = useState<string | null>(null);
  const abortControllersRef = useRef<Map<string, AbortController>>(new Map());
  const loadingRef = useRef(false);
  const lastResyncAtRef = useRef(0);
  const lastLoadedHistoryKindRef = useRef<HistoryMediaKind | null>(null);
  const historyMediaKindRef = useRef<HistoryMediaKind>('all');

  const videoBadgeByModelId = useMemo(
    () =>
      Object.fromEntries(
        videoModels.map((model) => [model.id, getVideoBadge(model.channelType)])
      ) as Record<string, Badge>,
    [videoModels]
  );

  const imageBadgeByModelId = useMemo(
    () =>
      Object.fromEntries(
        imageModels.map((model) => [model.id, getImageBadge(model.channelType)])
      ) as Record<string, Badge>,
    [imageModels]
  );

  const imageBadgeByApiModel = useMemo(
    () =>
      Object.fromEntries(
        imageModels.map((model) => [model.apiModel, getImageBadge(model.channelType)])
      ) as Record<string, Badge>,
    [imageModels]
  );

  const resolveGenerationBadge = useCallback(
    (gen: Generation): Badge => {
      if (gen.type === 'character-card') return CHARACTER_BADGE;

      if (isVideoType(gen)) {
        if (gen.params?.modelId && videoBadgeByModelId[gen.params.modelId]) {
          return videoBadgeByModelId[gen.params.modelId];
        }
        return inferVideoBadge(gen.params?.model);
      }

      if (gen.params?.modelId && imageBadgeByModelId[gen.params.modelId]) {
        return imageBadgeByModelId[gen.params.modelId];
      }
      if (gen.params?.model && imageBadgeByApiModel[gen.params.model]) {
        return imageBadgeByApiModel[gen.params.model];
      }
      return inferImageBadge(gen.type, gen.params?.model);
    },
    [imageBadgeByApiModel, imageBadgeByModelId, videoBadgeByModelId]
  );

  const resolveTaskBadge = useCallback(
    (task: Task): Badge => {
      if (task.type === 'character-card') return CHARACTER_BADGE;

      if (isTaskVideoType(task.type)) {
        if (task.modelId && videoBadgeByModelId[task.modelId]) {
          return videoBadgeByModelId[task.modelId];
        }
        return inferVideoBadge(task.model);
      }

      if (task.modelId && imageBadgeByModelId[task.modelId]) {
        return imageBadgeByModelId[task.modelId];
      }
      if (task.model && imageBadgeByApiModel[task.model]) {
        return imageBadgeByApiModel[task.model];
      }
      return inferImageBadge(task.type, task.model);
    },
    [imageBadgeByApiModel, imageBadgeByModelId, videoBadgeByModelId]
  );

  const historyMediaKind = getHistoryMediaKind(filter);

  useEffect(() => {
    historyMediaKindRef.current = historyMediaKind;
  }, [historyMediaKind]);

  const loadHistory = useCallback(async (
    pageNum: number,
    append = false,
    force = false,
    kindOverride?: HistoryMediaKind
  ) => {
    if (loadingRef.current && !force) return;
    loadingRef.current = true;
    
    if (append) {
      setLoadingMore(true);
    } else {
      setLoading(true);
    }
    
    try {
      // Add cache-busting timestamp to prevent browser caching
      const timestamp = Date.now();
      const requestKind = kindOverride || historyMediaKindRef.current;
      const params = new URLSearchParams({
        page: String(pageNum),
        limit: String(HISTORY_PAGE_SIZE),
        kind: requestKind,
        status: HISTORY_STATUS_FILTER,
        _t: String(timestamp),
      });
      const res = await fetch(`/api/user/history?${params.toString()}`, {
        cache: 'no-store',
      });
      if (res.ok) {
        const data = await res.json();
        const newGenerations = data.data || [];
        const terminalIds = new Set<string>(
          newGenerations
            .filter((generation: Generation) => isTerminalGenerationStatus(generation.status))
            .map((generation: Generation) => generation.id)
        );
        
        if (append) {
          setGenerations((prev) => mergeGenerationsById(prev, newGenerations));
        } else {
          setPage(pageNum);
          setGenerations(mergeGenerationsById([], newGenerations));
        }

        if (terminalIds.size > 0) {
          setPendingTasks((prev) =>
            prev.filter((task) => !terminalIds.has(task.id))
          );
        }
        
        setHasMore(Boolean(data.hasMore ?? newGenerations.length === HISTORY_PAGE_SIZE));
      }
    } catch (err) {
      console.error('Failed to load history:', err);
    } finally {
      loadingRef.current = false;
      setLoading(false);
      setLoadingMore(false);
    }
  }, []);

  const modelCatalogsLoadedRef = useRef(false);

  const loadModelCatalogs = useCallback(async () => {
    if (modelCatalogsLoadedRef.current) return;
    try {
      const [videoRes, imageRes] = await Promise.all([
        fetch('/api/video-models'),
        fetch('/api/image-models'),
      ]);

      if (videoRes.ok) {
        const videoData = await videoRes.json();
        setVideoModels(videoData.data?.models || []);
      }

      if (imageRes.ok) {
        const imageData = await imageRes.json();
        setImageModels(imageData.data?.models || []);
      }
      modelCatalogsLoadedRef.current = true;
    } catch (err) {
      console.error('Failed to load model catalogs:', err);
    }
  }, []);

  // 加载角色卡
  const loadCharacterCards = useCallback(async () => {
    try {
      const res = await fetch('/api/user/character-cards');
      if (res.ok) {
        const data = await res.json();
        setCharacterCards(data.data || []);
      }
    } catch (err) {
      console.error('Failed to load character cards:', err);
    }
  }, []);

  const pollTaskStatus = useCallback(async (task: Task) => {
    // 防止重复轮询
    if (abortControllersRef.current.has(task.id)) return;

    const controller = new AbortController();
    abortControllersRef.current.set(task.id, controller);
    const taskType = isTaskVideoType(task.type) ? 'video' : 'image';

    try {
      await pollGenerationTask({
        taskId: task.id,
        taskPrompt: task.prompt || '',
        taskType,
        signal: controller.signal,
        onProgress: (payload) => {
          const nextStatus =
            payload.status === 'pending' || payload.status === 'processing'
              ? payload.status
              : 'processing';

          setPendingTasks((prev) =>
            prev.map((task) =>
              task.id === payload.id
                ? {
                    ...task,
                    status: nextStatus,
                    progress:
                      typeof payload.progress === 'number'
                        ? payload.progress
                        : task.progress,
                    updatedAt: payload.updatedAt,
                  }
                : task
            )
          );
        },
        onCompleted: async () => {
          setPendingTasks((prev) => prev.filter((pendingTask) => pendingTask.id !== task.id));
          await update();
          await Promise.allSettled([
            loadPendingTasksRef.current(),
            loadHistoryRef.current(1, false, true),
          ]);
        },
        onFailed: async (errorMessage) => {
          console.error('History polling failed:', getFriendlyErrorMessage(errorMessage));
          setPendingTasks((prev) => prev.filter((pendingTask) => pendingTask.id !== task.id));
          await Promise.allSettled([
            loadPendingTasksRef.current(),
            loadHistoryRef.current(1, false, true),
          ]);
        },
        onTimeout: async () => {
          setPendingTasks((prev) => prev.filter((pendingTask) => pendingTask.id !== task.id));
          await Promise.allSettled([
            loadPendingTasksRef.current(),
            loadHistoryRef.current(1, false, true),
          ]);
        },
      });
    } finally {
      abortControllersRef.current.delete(task.id);
    }
  }, [update]);

  const loadPendingTasks = useCallback(async () => {
    try {
      const tasks: Task[] = (await fetchPendingGenerationTasks(50)).map((task) => ({
        id: task.id,
        prompt: task.prompt,
        type: task.type,
        status: task.status as 'pending' | 'processing',
        progress: typeof task.progress === 'number' ? task.progress : 0,
        modelId: task.modelId,
        model: task.model,
        createdAt: task.createdAt,
        updatedAt: task.updatedAt,
      }));

      setPendingTasks((prev) => replaceActiveTasks(prev, tasks));

      tasks.forEach((task) => {
        void pollTaskStatus(task);
      });
    } catch (err) {
      console.error('Failed to load pending tasks:', err);
    }
  }, [pollTaskStatus]);

  // 初始加载 - 只在组件挂载时执行一次
  const initialLoadRef = useRef(false);
  useEffect(() => {
    const abortControllers = abortControllersRef.current;
    if (session?.user?.id && !initialLoadRef.current) {
      initialLoadRef.current = true;
      // Reset page to 1 on initial load
      setPage(1);
      setGenerations([]);
      setHasMore(true);
      lastResyncAtRef.current = Date.now();
      const initialHistoryKind = historyMediaKindRef.current;
      lastLoadedHistoryKindRef.current = initialHistoryKind;
      loadHistory(1, false, true, initialHistoryKind); // force load
      loadModelCatalogs();
      loadPendingTasks();
      let idleCallbackId: number | null = null;
      let timeoutId: ReturnType<typeof setTimeout> | null = null;

      if (typeof window.requestIdleCallback === 'function') {
        idleCallbackId = window.requestIdleCallback(() => {
          void loadCharacterCards();
        }, { timeout: 3000 });
      } else {
        timeoutId = setTimeout(() => {
          void loadCharacterCards();
        }, 1200);
      }

      return () => {
        if (idleCallbackId !== null) {
          window.cancelIdleCallback(idleCallbackId);
        }
        if (timeoutId) {
          clearTimeout(timeoutId);
        }
        abortControllers.forEach(controller => controller.abort());
        abortControllers.clear();
      };
    }

    return () => {
      abortControllers.forEach(controller => controller.abort());
      abortControllers.clear();
    };
  }, [session?.user?.id, loadCharacterCards, loadHistory, loadModelCatalogs, loadPendingTasks]);

  useEffect(() => {
    if (!session?.user?.id || !initialLoadRef.current || filter === 'character') return;
    if (lastLoadedHistoryKindRef.current === historyMediaKind) return;

    lastLoadedHistoryKindRef.current = historyMediaKind;
    setPage(1);
    setGenerations([]);
    setHasMore(true);
    setSelectMode(false);
    setSelectedIds(new Set());
    void loadHistory(1, false, true, historyMediaKind);
  }, [filter, historyMediaKind, loadHistory, session?.user?.id]);

  // 使用 ref 保存 loadHistory 函数避免闭包问题
  const loadHistoryRef = useRef(loadHistory);
  useEffect(() => {
    loadHistoryRef.current = loadHistory;
  }, [loadHistory]);

  const loadPendingTasksRef = useRef(loadPendingTasks);
  useEffect(() => {
    loadPendingTasksRef.current = loadPendingTasks;
  }, [loadPendingTasks]);

  useEffect(() => {
    if (!session?.user?.id || !initialLoadRef.current) return;

    const resync = () => {
      const now = Date.now();
      if (now - lastResyncAtRef.current < HISTORY_RESYNC_INTERVAL_MS) {
        return;
      }

      lastResyncAtRef.current = now;
      void loadPendingTasks();
      void loadHistory(1, false, true);
    };
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        resync();
      }
    };

    window.addEventListener('focus', resync);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      window.removeEventListener('focus', resync);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [loadHistory, loadPendingTasks, session?.user?.id]);

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

  // 去水印功能
  const handleUnwatermark = async (permalink: string) => {
    if (!permalink) {
      toast({
        title: '无法去水印',
        description: '缺少视频分享链接',
        variant: 'destructive',
      });
      return;
    }

    setUnwatermarking(true);
    setUnwatermarkUrl(null);

    try {
      const res = await fetch('/api/sora/unwatermark', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ permalink }),
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.error || '获取无水印链接失败');
      }

      setUnwatermarkUrl(data.data.download_link);
      toast({
        title: '去水印成功',
        description: '已获取无水印下载链接',
      });
    } catch (error) {
      console.error('Unwatermark failed:', error);
      toast({
        title: '去水印失败',
        description: error instanceof Error ? error.message : '请稍后重试',
        variant: 'destructive',
      });
    } finally {
      setUnwatermarking(false);
    }
  };

  // 删除失败记录
  const handleDeleteFailed = async () => {
    setDeleting(true);
    try {
      const res = await fetch('/api/user/history/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'all-errors' }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      toast({ title: '清除成功', description: `已删除 ${data.deletedCount} 条失败记录` });
      setPage(1);
      loadHistory(1);
    } catch (error) {
      toast({
        title: '清除失败',
        description: error instanceof Error ? error.message : '清除失败',
        variant: 'destructive',
      });
    } finally {
      setDeleting(false);
      setShowDeleteConfirm(null);
    }
  };

  // 删除媒体文件
  const handleDeleteMedia = async (action: 'single' | 'batch' | 'all', id?: string) => {
    setDeleting(true);
    try {
      const body: any = { action };
      if (action === 'single' && id) {
        body.id = id;
      } else if (action === 'batch') {
        body.ids = Array.from(selectedIds);
      }

      const res = await fetch('/api/user/history/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      toast({
        title: '删除成功',
        description: `已删除 ${data.deletedCount} 个作品`,
      });

      // 刷新列表
      setSelectedIds(new Set());
      setSelectMode(false);
      setPage(1);
      loadHistory(1);
    } catch (error) {
      toast({
        title: '删除失败',
        description: error instanceof Error ? error.message : '删除失败',
        variant: 'destructive',
      });
    } finally {
      setDeleting(false);
      setShowDeleteConfirm(null);
      setDeleteTargetId(null);
    }
  };

  // 删除角色卡
  const handleDeleteCharacters = async () => {
    setDeleting(true);
    try {
      const res = await fetch('/api/user/character-cards/delete-all', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      toast({
        title: '删除成功',
        description: `已删除 ${data.deletedCount} 个角色卡`,
      });

      // 刷新角色卡列表
      loadCharacterCards();
    } catch (error) {
      toast({
        title: '删除失败',
        description: error instanceof Error ? error.message : '删除失败',
        variant: 'destructive',
      });
    } finally {
      setDeleting(false);
      setShowDeleteConfirm(null);
    }
  };

  // 删除单个角色卡
  const handleDeleteSingleCharacter = async (cardId: string) => {
    setDeleting(true);
    try {
      const res = await fetch('/api/user/character-cards', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cardId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      toast({
        title: '删除成功',
        description: '已删除该角色卡',
      });
      
      loadCharacterCards();
    } catch (error) {
      toast({
        title: '删除失败',
        description: error instanceof Error ? error.message : '删除失败',
        variant: 'destructive',
      });
    } finally {
      setDeleting(false);
    }
  };

  // 切换选择
  const toggleSelect = useCallback((id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  // 全选/取消全选
  const toggleSelectAll = () => {
    if (selectedIds.size === filteredGenerations.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredGenerations.map(g => g.id)));
    }
  };

  
  // 缓存已完成作品的过滤结果
  const completedGenerations = useMemo(() =>
    generations.filter(g =>
      g.resultUrl &&
      g.status !== 'pending' &&
      g.status !== 'processing'
    ),
    [generations]
  );

  // 缓存失败/取消的记录
  const failedGenerations = useMemo(() =>
    generations.filter(g =>
      g.status === 'failed' || g.status === 'cancelled'
    ),
    [generations]
  );

  // 缓存过滤后的作品列表
  const filteredGenerations = useMemo(() => {
    if (filter === 'all') return completedGenerations;
    if (filter === 'video') return completedGenerations.filter(g => isVideoType(g));
    if (filter === 'character') return []; // 角色卡单独显示
    return completedGenerations.filter(g => !isVideoType(g));
  }, [completedGenerations, filter]);

  
  // 缓存已完成的角色卡
  const completedCharacterCards = useMemo(() => 
    characterCards.filter(c => c.status === 'completed'),
    [characterCards]
  );
  
  // 缓存进行中的角色卡任务（processing 状态）
  const processingCharacterCards = useMemo(() => 
    characterCards.filter(c => c.status === 'processing' || c.status === 'pending'),
    [characterCards]
  );
  
  // 缓存过滤后的 pending 任务
  const filteredTasks = useMemo(() => {
    if (filter === 'all') return pendingTasks;
    if (filter === 'video') return pendingTasks.filter(t => isTaskVideoType(t.type));
    return pendingTasks.filter(t => !isTaskVideoType(t.type));
  }, [pendingTasks, filter]);

  // Live search and sort on completed generations
  const searchedGenerations = useMemo(() => {
    let result = [...filteredGenerations];
    
    // Live Search
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (g) =>
          (g.prompt || '').toLowerCase().includes(q) ||
          (g.params?.model || '').toLowerCase().includes(q)
      );
    }
    
    // Live Sort
    result.sort((a, b) => {
      const timeA = a.createdAt || 0;
      const timeB = b.createdAt || 0;
      return sortOrder === 'latest' ? timeB - timeA : timeA - timeB;
    });
    
    return result;
  }, [filteredGenerations, searchQuery, sortOrder]);

  // Live search and sort on completed character cards
  const searchedCharacterCards = useMemo(() => {
    let result = [...completedCharacterCards];
    
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter((c) =>
        (c.characterName || '').toLowerCase().includes(q)
      );
    }
    
    result.sort((a, b) => {
      const timeA = a.createdAt || 0;
      const timeB = b.createdAt || 0;
      return sortOrder === 'latest' ? timeB - timeA : timeA - timeB;
    });
    
    return result;
  }, [completedCharacterCards, searchQuery, sortOrder]);

  // 缓存统计数据
  const stats = useMemo(() => ({
    total: completedGenerations.length,
    pending: pendingTasks.length,
    videos: completedGenerations.filter(g => isVideoType(g)).length,
    images: completedGenerations.filter(g => !isVideoType(g)).length,
    characters: completedCharacterCards.length,
    failed: failedGenerations.length,
  }), [completedGenerations, pendingTasks.length, completedCharacterCards.length, failedGenerations.length]);

  return (
    <>
      <div className="max-w-7xl mx-auto flex flex-col h-[calc(100vh-100px)] pb-20 lg:pb-8">
        {/* Header */}
        <div className="shrink-0 flex flex-col md:flex-row md:items-end md:justify-between gap-3 lg:gap-4 mb-4 select-none">
          <div>
            <h1 className="text-2xl lg:text-3xl font-extralight text-foreground">历史记录</h1>
            <p className="text-foreground/50 text-xs lg:text-sm mt-0.5 font-light">查看和管理您的所有作品</p>
          </div>
        </div>

        {/* Top Horizontal Stats Card */}
        <div className="shrink-0 bg-card/40 border border-border/70 rounded-2xl p-4 flex justify-between items-center w-full mb-6 text-center select-none shadow-sm backdrop-blur-sm">
          <div className="flex-1 min-w-0">
            <p className="text-xl sm:text-2xl font-light text-sky-400">{stats.pending}</p>
            <p className="text-[10px] sm:text-xs text-foreground/45 mt-1 font-light">进行中</p>
          </div>
          <div className="w-px h-6 bg-border/40 shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-xl sm:text-2xl font-light text-foreground">{stats.total}</p>
            <p className="text-[10px] sm:text-xs text-foreground/45 mt-1 font-light">总作品</p>
          </div>
          <div className="w-px h-6 bg-border/40 shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-xl sm:text-2xl font-light text-foreground">{stats.videos}</p>
            <p className="text-[10px] sm:text-xs text-foreground/45 mt-1 font-light">视频</p>
          </div>
          <div className="w-px h-6 bg-border/40 shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-xl sm:text-2xl font-light text-foreground">{stats.images}</p>
            <p className="text-[10px] sm:text-xs text-foreground/45 mt-1 font-light">图像</p>
          </div>
          <div className="w-px h-6 bg-border/40 shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-xl sm:text-2xl font-light text-emerald-400">{stats.characters}</p>
            <p className="text-[10px] sm:text-xs text-foreground/45 mt-1 font-light">角色卡</p>
          </div>
        </div>

        {/* Filter Tabs & Actions */}
        <div className="shrink-0 flex flex-row items-center justify-between gap-3 lg:gap-4 mb-4 select-none">
          <div className="flex items-center gap-1.5 lg:gap-2 overflow-x-auto no-scrollbar -mx-2 px-2">
            {(['all', 'video', 'image', 'character'] as const).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`px-4 py-1.5 rounded-full text-xs font-medium transition-all shrink-0 ${
                  filter === f
                    ? 'bg-foreground text-background shadow-md'
                    : 'bg-card/60 text-foreground/60 hover:bg-card/75 hover:text-foreground'
                }`}
              >
                {f === 'all' ? '全部' : f === 'video' ? '视频' : f === 'image' ? '图像' : '角色卡'}
              </button>
            ))}
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-2">
            {selectMode ? (
              <>
                <button
                  onClick={toggleSelectAll}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-card/60 text-foreground/60 rounded-full text-xs hover:bg-card/70 hover:text-foreground transition-all font-medium border border-border/80"
                >
                  {selectedIds.size === searchedGenerations.length ? (
                    <CheckSquare className="w-3.5 h-3.5 text-sky-400" />
                  ) : (
                    <Square className="w-3.5 h-3.5" />
                  )}
                  {selectedIds.size > 0 ? `已选 ${selectedIds.size}` : '全选'}
                </button>
                <button
                  onClick={() => setShowDeleteConfirm('batch')}
                  disabled={selectedIds.size === 0 || deleting}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-red-500/10 border border-red-500/20 text-red-400 rounded-full text-xs hover:bg-red-500/20 transition-all disabled:opacity-50 font-medium"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  删除选中
                </button>
                <button
                  onClick={() => {
                    setSelectMode(false);
                    setSelectedIds(new Set());
                  }}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-card/60 text-foreground/60 rounded-full text-xs hover:bg-card/70 hover:text-foreground transition-all font-medium border border-border/80"
                >
                  <X className="w-3.5 h-3.5" />
                  取消
                </button>
              </>
            ) : (
              <>
                <button
                  onClick={() => setSelectMode(true)}
                  disabled={searchedGenerations.length === 0 && filter !== 'character'}
                  className="flex items-center gap-1.5 px-4 py-1.5 bg-card/65 text-foreground/75 border border-border/80 hover:border-border rounded-full text-xs hover:text-foreground hover:bg-card transition-all font-medium"
                >
                  <Edit3 className="w-3.5 h-3.5" />
                  管理
                </button>
                <button
                  onClick={() => setShowDeleteConfirm('all-media')}
                  disabled={completedGenerations.length === 0 || deleting}
                  className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 bg-red-500/10 border border-red-500/20 text-red-400 rounded-full text-xs hover:bg-red-500/20 transition-all disabled:opacity-50 font-medium"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  清空媒体
                </button>
              </>
            )}
          </div>
        </div>

        {/* Search & Sort Bar */}
        <div className="shrink-0 flex items-center gap-3 mb-4 w-full">
          <div className="relative flex-1">
            <span className="absolute inset-y-0 left-3 flex items-center pointer-events-none text-foreground/35">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </span>
            <input
              type="text"
              placeholder="搜索作品..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full h-9 pl-9 pr-4 text-xs bg-card/50 border border-border/70 hover:border-border rounded-lg outline-none focus:ring-1 focus:ring-sky-500/30 text-foreground placeholder:text-foreground/30 transition-all"
            />
          </div>
          <div className="w-[110px] shrink-0 select-none">
            <select
              value={sortOrder}
              onChange={(e) => setSortOrder(e.target.value as 'latest' | 'oldest')}
              className="w-full h-9 px-3 text-xs bg-card/50 border border-border/70 hover:border-border rounded-lg outline-none focus:ring-1 focus:ring-sky-500/30 text-foreground/80 cursor-pointer appearance-none transition-all"
              style={{
                backgroundImage: `url("data:image/svg+xml;charset=utf-8,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3E%3Cpath stroke='%23ffffff' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='M6 8l4 4 4-4'/%3E%3C/svg%3E")`,
                backgroundPosition: 'right 0.5rem center',
                backgroundSize: '1.25rem',
                backgroundRepeat: 'no-repeat',
                paddingRight: '1.75rem'
              }}
            >
              <option value="latest" className="bg-card text-foreground">最新创建</option>
              <option value="oldest" className="bg-card text-foreground">最早创建</option>
            </select>
          </div>
        </div>

        {/* Main Content Area */}
        <div className="flex-1 min-h-0 bg-card/25 border border-border/50 rounded-2xl overflow-hidden backdrop-blur-sm flex flex-col shadow-sm">
          <div className="flex-1 min-h-0 overflow-y-auto p-4 sm:p-5">
            {loading ? (
              <div className="space-y-3">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="w-full flex gap-4 p-4 bg-card/20 border border-border/50 rounded-2xl animate-pulse">
                    <div className="w-20 h-20 sm:w-24 sm:h-24 bg-card/60 rounded-xl shrink-0" />
                    <div className="flex-1 min-w-0 space-y-3 py-1">
                      <div className="h-4 bg-card/60 rounded w-1/3" />
                      <div className="h-3 bg-card/60 rounded w-1/4" />
                      <div className="h-2 bg-card/60 rounded w-1/2" />
                    </div>
                  </div>
                ))}
              </div>
            ) : filter === 'character' ? (
              // Character card listing row tile
              searchedCharacterCards.length === 0 && processingCharacterCards.length === 0 ? (
                <div className="h-64 flex flex-col items-center justify-center border border-dashed border-border/60 rounded-xl select-none">
                  <div className="w-16 h-16 bg-gradient-to-br from-emerald-500/10 to-sky-500/10 rounded-2xl flex items-center justify-center mb-4">
                    <User className="w-8 h-8 text-emerald-300/40" />
                  </div>
                  <p className="text-foreground/40 text-sm">暂无角色卡</p>
                  <p className="text-foreground/30 text-xs mt-1">去视频页面生成你的第一个角色卡</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {/* Processing Character Card items */}
                  {processingCharacterCards.map((card) => (
                    <div
                      key={card.id}
                      className="w-full flex gap-4 p-4 bg-card/25 border border-sky-500/20 rounded-2xl relative"
                    >
                      <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-xl bg-card/50 border border-border/60 flex items-center justify-center shrink-0 relative overflow-hidden select-none">
                        <span className="absolute top-1 left-1 z-10 px-2 py-0.5 rounded bg-sky-500/20 text-sky-400 text-[9px] font-medium border border-sky-500/20">
                          生成中
                        </span>
                        {card.avatarUrl ? (
                          <img
                            src={card.avatarUrl}
                            alt=""
                            className="w-full h-full object-cover"
                            loading="lazy"
                          />
                        ) : (
                          <User className="w-10 h-10 text-emerald-300/40" />
                        )}
                        <div className="absolute inset-0 bg-background/60 flex items-center justify-center">
                          <Loader2 className="w-6 h-6 text-foreground animate-spin" />
                        </div>
                      </div>
                      <div className="flex-1 min-w-0 flex flex-col justify-between py-0.5">
                        <div>
                          <div className="flex items-start justify-between gap-3 mb-1.5">
                            <h3 className="text-sm font-medium text-foreground truncate">生成中...</h3>
                            <span className="px-2 py-0.5 text-[10px] rounded-md bg-sky-500/15 text-sky-300 whitespace-nowrap">
                              {card.status === 'processing' ? '生成中' : '等待中'}
                            </span>
                          </div>
                          <p className="text-[10px] text-foreground/40">{formatDate(card.createdAt)}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                  {/* Completed Character Card items */}
                  {searchedCharacterCards.map((card) => (
                    <CharacterCardHistoryItem 
                      key={card.id} 
                      card={card} 
                      onDelete={handleDeleteSingleCharacter}
                    />
                  ))}
                </div>
              )
            ) : searchedGenerations.length === 0 && filteredTasks.length === 0 ? (
              <div className="h-64 flex flex-col items-center justify-center border border-dashed border-border/60 rounded-xl select-none">
                <div className="w-16 h-16 bg-card/60 rounded-2xl flex items-center justify-center mb-4">
                  <ImageIcon className="w-8 h-8 text-foreground/30" />
                </div>
                <p className="text-foreground/40 text-sm">暂无{filter === 'video' ? '视频' : filter === 'image' ? '图像' : ''}作品</p>
                <p className="text-foreground/30 text-xs mt-1">开始创作你的第一个作品</p>
              </div>
            ) : (
              <div className="space-y-3">
                {/* Generating tasks listing (row tile) */}
                {filteredTasks.map((task) => {
                  const badge = resolveTaskBadge(task);
                  const progress = task.progress || 0;
                  const isVideo = isTaskVideoType(task.type);
                  const remainingMinutes = progress > 0 ? Math.max(1, Math.ceil((100 - progress) / 35)) : 2;

                  return (
                    <div
                      key={task.id}
                      className="w-full flex flex-col sm:flex-row gap-4 p-4 bg-card/20 border border-sky-500/20 hover:border-sky-500/30 rounded-2xl transition-all duration-300 relative group"
                    >
                      {/* Left: Thumbnail/Progress Ring Box */}
                      <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-xl bg-card/50 border border-border/60 flex items-center justify-center shrink-0 relative overflow-hidden select-none">
                        <span className="absolute top-1 left-1 z-10 px-2 py-0.5 rounded bg-sky-500/20 text-sky-400 text-[9px] font-medium border border-sky-500/20">
                          生成中
                        </span>
                        
                        {/* Circular Progress Ring */}
                        <div className="relative w-12 h-12 flex items-center justify-center">
                          <svg className="w-full h-full transform -rotate-90">
                            <circle cx="24" cy="24" r="18" stroke="currentColor" className="text-border/30" strokeWidth="2.5" fill="transparent" />
                            <circle cx="24" cy="24" r="18" stroke="currentColor" className="text-sky-400 transition-all duration-500" strokeWidth="2.5" fill="transparent"
                              strokeDasharray={2 * Math.PI * 18}
                              strokeDashoffset={2 * Math.PI * 18 * (1 - progress / 100)}
                            />
                          </svg>
                          <span className="absolute text-[10px] font-mono font-medium text-sky-300">{progress}%</span>
                        </div>
                      </div>

                      {/* Center Metadata details */}
                      <div className="flex-1 min-w-0 flex flex-col justify-between py-0.5">
                        <div>
                          <div className="flex items-start justify-between gap-3 mb-1.5">
                            <h3 className="text-sm font-medium text-foreground line-clamp-1 flex-1 pr-2">
                              {task.prompt || '无提示词'}
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

                        {/* Bottom: progress bar & remaining time */}
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
                })}

                {/* Completed Generations list row */}
                {searchedGenerations.map((gen) => (
                  <GenerationCard
                    key={gen.id}
                    gen={gen}
                    badge={resolveGenerationBadge(gen)}
                    isSelected={selectedIds.has(gen.id)}
                    selectMode={selectMode}
                    onSelect={toggleSelect}
                    onView={setSelected}
                    onDownload={downloadFile}
                    onDelete={(id) => {
                      setDeleteTargetId(id);
                      setShowDeleteConfirm('single');
                    }}
                  />
                ))}
              </div>
            )}
          </div>
          
          {/* 加载更多按钮 */}
          {hasMore && (
            <div className="shrink-0 p-4 border-t border-border/70 flex items-center justify-center">
              <button
                onClick={() => {
                  const nextPage = page + 1;
                  setPage(nextPage);
                  loadHistory(nextPage, true, false, historyMediaKind);
                }}
                disabled={loadingMore}
                className="px-4 py-2 rounded-lg bg-card/60 border border-border/70 text-foreground/70 text-sm hover:text-foreground hover:border-border transition disabled:opacity-50"
              >
                {loadingMore ? (
                  <span className="flex items-center gap-2">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    加载中...
                  </span>
                ) : (
                  '加载更多'
                )}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Lightbox */}
      {selected && (
        <FullscreenViewer
          generation={selected}
          badge={resolveGenerationBadge(selected)}
          isVideo={isVideoType(selected)}
          unwatermarkUrl={unwatermarkUrl}
          unwatermarking={unwatermarking}
          onClose={() => { setSelected(null); setUnwatermarkUrl(null); }}
          onDownload={(url, id, type) => downloadFile(url, id, type)}
          onUnwatermark={(permalink) => handleUnwatermark(permalink)}
        />
      )}

      {/* 删除确认弹窗 */}
      {showDeleteConfirm && (
        <div
          className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setShowDeleteConfirm(null)}
        >
          <div
            className="bg-card/95 border border-border/70 rounded-2xl p-6 max-w-md w-full"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3 mb-4">
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${showDeleteConfirm === 'all-characters' ? 'bg-emerald-500/20' : showDeleteConfirm === 'all-errors' ? 'bg-amber-500/20' : 'bg-red-500/20'}`}>
                {showDeleteConfirm === 'all-characters' ? (
                  <User className="w-5 h-5 text-emerald-300" />
                ) : showDeleteConfirm === 'all-errors' ? (
                  <X className="w-5 h-5 text-amber-300" />
                ) : (
                  <Trash2 className="w-5 h-5 text-red-300" />
                )}
              </div>
              <div>
                <h3 className="text-lg font-medium text-foreground">确认删除</h3>
                <p className="text-sm text-foreground/40">此操作无法撤销</p>
              </div>
            </div>

            <p className="text-foreground/60 mb-6">
              {showDeleteConfirm === 'all-media' && '确定要清空所有已完成的媒体作品吗？进行中的任务不会被删除。'}
              {showDeleteConfirm === 'all-characters' && '确定要清空所有角色卡吗？'}
              {showDeleteConfirm === 'all-errors' && `确定要清空所有 ${failedGenerations.length} 条失败记录吗？`}
              {showDeleteConfirm === 'batch' && `确定要删除选中的 ${selectedIds.size} 个作品吗？`}
              {showDeleteConfirm === 'single' && '确定要删除这个作品吗？'}
            </p>
            
            <div className="flex gap-3">
              <button
                onClick={() => setShowDeleteConfirm(null)}
                disabled={deleting}
                className="flex-1 px-4 py-2.5 bg-card/60 text-foreground border border-border/70 rounded-xl hover:bg-card/70 transition-colors text-sm font-medium disabled:opacity-50"
              >
                取消
              </button>
              <button
                onClick={() => {
                  if (showDeleteConfirm === 'single' && deleteTargetId) {
                    handleDeleteMedia('single', deleteTargetId);
                  } else if (showDeleteConfirm === 'batch') {
                    handleDeleteMedia('batch');
                  } else if (showDeleteConfirm === 'all-media') {
                    handleDeleteMedia('all');
                  } else if (showDeleteConfirm === 'all-characters') {
                    handleDeleteCharacters();
                  } else if (showDeleteConfirm === 'all-errors') {
                    handleDeleteFailed();
                  }
                }}
                disabled={deleting}
                className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl transition-colors text-sm font-medium disabled:opacity-50 ${
                  showDeleteConfirm === 'all-characters' 
                    ? 'bg-emerald-500 text-foreground hover:bg-emerald-600' 
                    : 'bg-red-500 text-foreground hover:bg-red-600'
                }`}
              >
                {deleting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    删除中...
                  </>
                ) : (
                  <>
                    {showDeleteConfirm === 'all-characters' ? <User className="w-4 h-4" /> : <Trash2 className="w-4 h-4" />}
                    确认删除
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// 角色卡历史记录专属行组件
function CharacterCardHistoryItem({ 
  card, 
  onDelete 
}: { 
  card: CharacterCard; 
  onDelete: (id: string) => void; 
}) {
  return (
    <div className="w-full flex gap-4 p-4 bg-gradient-to-br from-emerald-500/5 to-sky-500/5 hover:from-emerald-500/10 hover:to-sky-500/10 border border-emerald-500/20 hover:border-emerald-500/40 rounded-2xl transition-all duration-300 relative group">
      {/* Left: Avatar */}
      <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-xl bg-card/50 border border-border/60 flex items-center justify-center shrink-0 relative overflow-hidden select-none">
        <span className="absolute top-1 left-1 z-10 px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-400 text-[9px] font-medium border border-emerald-500/20">
          已完成
        </span>
        {card.avatarUrl ? (
          <img
            src={card.avatarUrl}
            alt={card.characterName}
            className="w-full h-full object-cover"
            loading="lazy"
          />
        ) : (
          <User className="w-10 h-10 text-emerald-300/45" />
        )}
      </div>

      {/* Center & Right */}
      <div className="flex-1 min-w-0 flex flex-col justify-between py-0.5">
        <div>
          <div className="flex items-start justify-between gap-3 mb-1.5">
            <h3 className="text-sm font-medium text-foreground truncate flex-1">
              @{card.characterName || '未命名角色'}
            </h3>
            <span className="text-[10px] text-foreground/45 font-medium px-2 py-0.5 bg-card/30 border border-border/50 rounded-md whitespace-nowrap">
              角色卡
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-2 text-xs text-foreground/50">
            <span className="px-2 py-0.5 bg-card/45 border border-border/60 rounded-md text-[10px] text-foreground/60 flex items-center gap-1 font-medium select-none">
              <User className="w-3 h-3 text-emerald-400" />
              角色卡
            </span>
            <span className="text-[10px] text-foreground/40 flex items-center gap-1 font-light select-none">
              <Calendar className="w-3 h-3 text-foreground/30" />
              {formatDate(card.createdAt)}
            </span>
          </div>
        </div>

        <div className="mt-3 flex items-center justify-end" onClick={(e) => e.stopPropagation()}>
          <button
            onClick={() => onDelete(card.id)}
            className="inline-flex items-center justify-center p-2 bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 hover:border-red-500/40 text-red-400 hover:text-red-300 rounded-lg transition-all"
            title="删除角色卡"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}

// ========================================
// Fullscreen Viewer
// ========================================
function FullscreenViewer({
  generation,
  badge,
  isVideo,
  unwatermarkUrl,
  unwatermarking,
  onClose,
  onDownload,
  onUnwatermark,
}: {
  generation: Generation;
  badge: Badge;
  isVideo: boolean;
  unwatermarkUrl: string | null;
  unwatermarking: boolean;
  onClose: () => void;
  onDownload: (url: string, id: string, type: string) => void;
  onUnwatermark: (permalink: string) => void;
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

  // 全屏后自动隐藏面板，鼠标移动时显示
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
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !document.fullscreenElement) {
        onClose();
      }
      if ((e.key === 'f' || e.key === 'F') && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
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
      {/* 顶部工具栏 */}
      <div className={`shrink-0 flex items-center justify-end gap-2 p-3 transition-opacity duration-300 ${
        isFullscreen && !showPanel ? 'opacity-0 pointer-events-none' : 'opacity-100'
      }`}>
        <button
          onClick={(e) => { e.stopPropagation(); toggleFullscreen(); }}
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

      {/* Media */}
      <div
        className={`flex-1 min-h-0 flex items-center justify-center transition-all duration-300 ${
          isFullscreen ? 'p-0' : 'p-4 md:p-6'
        }`}
        onClick={(e) => e.stopPropagation()}
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
            alt={gen.prompt}
            className={`max-w-full max-h-full w-auto h-auto ${isFullscreen ? '' : 'rounded-xl border border-border/70'} object-contain`}
            decoding="async"
          />
        )}
      </div>

      {/* 信息面板 */}
      <div
        className={`shrink-0 w-full transition-all duration-300 ${
          isFullscreen
            ? showPanel
              ? 'translate-y-0 opacity-100'
              : 'translate-y-full opacity-0'
            : 'translate-y-0 opacity-100'
        } ${isFullscreen ? 'bg-black/80 backdrop-blur-sm' : 'bg-background/80 backdrop-blur-sm border-t border-border/30'}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="max-w-3xl mx-auto p-3 md:px-8 md:py-3">
          <div className="flex flex-col md:flex-row md:items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <CollapsibleText text={gen.prompt || '无提示词'} collapsedLines={2} />
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
              {gen.type === 'sora-video' && gen.params?.permalink && (
                <a href={gen.params.permalink} target="_blank" rel="noopener noreferrer"
                  className="flex items-center justify-center gap-2 px-4 py-2 bg-card/70 text-foreground border border-border/70 rounded-xl hover:bg-card/80 transition-colors text-xs font-medium">
                  <ExternalLink className="w-3.5 h-3.5" />
                  分享页
                </a>
              )}
              {gen.type === 'sora-video' && (gen.params?.permalink || gen.params?.videoId) && (
                <button
                  onClick={() => {
                    const permalink = gen.params?.permalink ||
                      (gen.params?.videoId ? `https://sora.com/share/${gen.params.videoId}` : '');
                    if (permalink) onUnwatermark(permalink);
                  }}
                  disabled={unwatermarking}
                  className="flex items-center justify-center gap-2 px-4 py-2 bg-sky-500/20 text-sky-300 border border-sky-500/30 rounded-xl hover:bg-sky-500/30 transition-colors text-xs font-medium disabled:opacity-50"
                >
                  {unwatermarking ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Droplets className="w-3.5 h-3.5" />}
                  {unwatermarking ? '处理中...' : '去水印'}
                </button>
              )}
              {unwatermarkUrl && (
                <button
                  onClick={() => onDownload(unwatermarkUrl, gen.id, gen.type)}
                  className="flex items-center justify-center gap-2 px-4 py-2 bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 rounded-xl hover:bg-emerald-500/30 transition-colors text-xs font-medium"
                >
                  <Download className="w-3.5 h-3.5" />
                  无水印
                </button>
              )}
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
