'use client';
/* eslint-disable @next/next/no-img-element */

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import dynamic from 'next/dynamic';
import { useSession } from 'next-auth/react';
import {
  Trash2,
  Video,
  Image as ImageIcon,
  X,
  CheckSquare,
  Square,
  User,
  History,
  Loader2,
} from 'lucide-react';
import { toast } from '@/components/ui/toaster';
import type { Generation, ChannelType, VideoChannelType } from '@/types';
import {
  isTerminalGenerationStatus,
  mergeGenerationsById,
  replaceActiveTasks,
} from '@/lib/generation-state';
import { getFriendlyErrorMessage } from '@/lib/polling-errors';
import { EmptyState } from '@/components/ui/empty-state';

const ConfirmDialog = dynamic(
  () => import('@/components/ui/confirm-dialog').then((mod) => mod.ConfirmDialog),
  { ssr: false }
);

const FullscreenViewer = dynamic(
  () => import('@/components/history/fullscreen-viewer').then((mod) => mod.FullscreenViewer),
  { ssr: false }
);

const HistoryMediaList = dynamic(
  () => import('@/components/history/history-media-list').then((mod) => mod.HistoryMediaList),
  {
    ssr: false,
    loading: () => (
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
    ),
  }
);

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
const HISTORY_STATUS_FILTER = 'completed';

type HistoryFilter = 'all' | 'video' | 'image';
type HistoryMediaKind = 'all' | 'video' | 'image';

const getHistoryMediaKind = (filter: HistoryFilter): HistoryMediaKind => {
  if (filter === 'video' || filter === 'image') return filter;
  return 'all';
};

const VIDEO_CHANNEL_BADGE_LABELS: Record<string, string> = {
  sora: '视频',
  grok2api: 'Grok 视频',
  flow2api: 'Veo 视频',
  'openai-compatible': 'OpenAI 视频',
};

const IMAGE_CHANNEL_BADGE_LABELS: Record<string, string> = {
  sora: '图像',
  gemini: 'Gemini 图像',
  gitee: 'Gitee 图像',
  modelscope: 'ModelScope 图像',
  'openai-compatible': 'OpenAI 图像',
  'openai-chat': 'OpenAI 图像',
};

const IMAGE_TYPE_BADGE_LABELS: Record<string, string> = {
  'sora-image': '图像',
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

export default function HistoryPage() {
  const { data: session, update } = useSession();
  const [generations, setGenerations] = useState<Generation[]>([]);
  const [pendingTasks, setPendingTasks] = useState<Task[]>([]);
  const [videoModels, setVideoModels] = useState<Array<{ id: string; channelType: VideoChannelType }>>([]);
  const [imageModels, setImageModels] = useState<Array<{ id: string; apiModel: string; channelType: ChannelType }>>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Generation | null>(null);
  const [filter, setFilter] = useState<HistoryFilter>('all');
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState('');
  const [sortOrder, setSortOrder] = useState<'latest' | 'oldest'>('latest');
  const [deleting, setDeleting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<{type: 'single'|'batch'|'all', id?: string} | null>(null);
  const abortControllersRef = useRef<Map<string, AbortController>>(new Map());
  const loadingRef = useRef(false);
  const lastResyncAtRef = useRef(0);
  const pollTaskStatusRef = useRef<(task: Task) => void>(() => {});
  const lastLoadedHistoryKindRef = useRef<HistoryMediaKind | null>(null);
  const historyMediaKindRef = useRef<HistoryMediaKind>('all');
  const videoCatalogLoadedRef = useRef(false);
  const imageCatalogLoadedRef = useRef(false);

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
    kindOverride?: HistoryMediaKind,
    includePending = false
  ) => {
    if (loadingRef.current && !force) return;
    loadingRef.current = true;
    
    if (append) {
      setLoadingMore(true);
    } else {
      setLoading(true);
    }
    
    try {
      const requestKind = kindOverride || historyMediaKindRef.current;
      if (requestKind !== 'image' && !videoCatalogLoadedRef.current) {
        void fetch('/api/video-models?fields=badges')
          .then(async (videoRes) => {
            if (!videoRes.ok) return;
            const videoData = await videoRes.json();
            setVideoModels(videoData.data?.models || []);
            videoCatalogLoadedRef.current = true;
          })
          .catch((err) => console.error('Failed to load video catalog:', err));
      }
      if (requestKind !== 'video' && !imageCatalogLoadedRef.current) {
        void fetch('/api/image-models?fields=badges')
          .then(async (imageRes) => {
            if (!imageRes.ok) return;
            const imageData = await imageRes.json();
            setImageModels(imageData.data?.models || []);
            imageCatalogLoadedRef.current = true;
          })
          .catch((err) => console.error('Failed to load image catalog:', err));
      }
      const params = new URLSearchParams({
        page: String(pageNum),
        limit: String(HISTORY_PAGE_SIZE),
        kind: requestKind,
        status: HISTORY_STATUS_FILTER,
      });
      if (includePending && !append && pageNum === 1) {
        params.set('includePending', 'true');
        params.set('pendingKind', 'all');
        params.set('pendingLimit', '50');
      }
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

        if (Array.isArray(data.pending)) {
          const tasks: Task[] = data.pending.map((task: {
            id: string;
            prompt: string;
            type: string;
            status: string;
            progress?: number;
            modelId?: string;
            model?: string;
            createdAt: number;
            updatedAt?: number;
          }) => ({
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
            void pollTaskStatusRef.current(task);
          });
        } else if (terminalIds.size > 0) {
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

  const pollTaskStatus = useCallback(async (task: Task) => {
    // 防止重复轮询
    if (abortControllersRef.current.has(task.id)) return;

    const controller = new AbortController();
    abortControllersRef.current.set(task.id, controller);
    const taskType = isTaskVideoType(task.type) ? 'video' : 'image';

    try {
      const { pollGenerationTask } = await import('@/lib/generation-poll');
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
          await loadHistoryRef.current(1, false, true, undefined, true);
        },
        onFailed: async (errorMessage) => {
          console.error('History polling failed:', getFriendlyErrorMessage(errorMessage));
          setPendingTasks((prev) => prev.filter((pendingTask) => pendingTask.id !== task.id));
          await loadHistoryRef.current(1, false, true, undefined, true);
        },
        onTimeout: async () => {
          setPendingTasks((prev) => prev.filter((pendingTask) => pendingTask.id !== task.id));
          await loadHistoryRef.current(1, false, true, undefined, true);
        },
      });
    } finally {
      abortControllersRef.current.delete(task.id);
    }
  }, [update]);

  useEffect(() => {
    pollTaskStatusRef.current = pollTaskStatus;
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
      void import('@/components/history/history-media-list');
      void loadHistory(1, false, true, initialHistoryKind, true);

      return () => {
        abortControllers.forEach(controller => controller.abort());
        abortControllers.clear();
      };
    }

    return () => {
      abortControllers.forEach(controller => controller.abort());
      abortControllers.clear();
    };
  }, [session?.user?.id, loadHistory]);

  useEffect(() => {
    if (!session?.user?.id || !initialLoadRef.current) return;
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

  useEffect(() => {
    if (!session?.user?.id || !initialLoadRef.current) return;

    const resync = () => {
      const now = Date.now();
      if (now - lastResyncAtRef.current < HISTORY_RESYNC_INTERVAL_MS) {
        return;
      }

      lastResyncAtRef.current = now;
      void loadHistory(1, false, true, undefined, true);
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
  }, [loadHistory, session?.user?.id]);

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
      const { downloadAsset } = await import('@/lib/download');
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
    return completedGenerations.filter(g => !isVideoType(g));
  }, [completedGenerations, filter]);

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

  // 缓存统计数据
  const stats = useMemo(() => ({
    total: completedGenerations.length,
    pending: pendingTasks.length,
    videos: completedGenerations.filter(g => isVideoType(g)).length,
    images: completedGenerations.filter(g => !isVideoType(g)).length,
    failed: failedGenerations.length,
  }), [completedGenerations, pendingTasks.length, failedGenerations.length]);

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
            <p className="text-xl sm:text-2xl font-medium tracking-tight">{stats.pending}</p>
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
        </div>

        {/* Filter Tabs & Actions */}
        <div className="shrink-0 flex flex-row items-center justify-between gap-3 lg:gap-4 mb-4 select-none">
          <div className="flex items-center gap-1.5 lg:gap-2 overflow-x-auto no-scrollbar -mx-2 px-2">
            {(['all', 'video', 'image'] as const).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`px-4 py-1.5 rounded-full text-xs font-medium transition-all shrink-0 ${
                  filter === f
                    ? 'bg-foreground text-background shadow-md'
                    : 'bg-card/60 text-foreground/60 hover:bg-card/75 hover:text-foreground'
                }`}
              >
                {f === 'all' ? '全部' : f === 'video' ? '视频' : '图像'}
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
                  onClick={() => setShowDeleteConfirm({type: 'batch'})}
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
                  disabled={searchedGenerations.length === 0}
                  className="flex items-center gap-1.5 px-4 py-1.5 bg-card/65 text-foreground/75 border border-border/80 hover:border-border rounded-full text-xs hover:text-foreground hover:bg-card transition-all font-medium"
                >
                  <CheckSquare className="w-3.5 h-3.5" />
                  选择
                </button>
                <button
                  onClick={() => setShowDeleteConfirm({type: 'all'})}
                  disabled={completedGenerations.length === 0 || deleting}
                  className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 bg-red-500/10 border border-red-500/20 text-red-400 rounded-full text-xs hover:bg-red-500/20 transition-all disabled:opacity-50 font-medium"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  一键清理
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
            ) : searchedGenerations.length === 0 && filteredTasks.length === 0 ? (
              <EmptyState icon={<History className="w-16 h-16" />} title="暂无历史记录" description="创作的作品会显示在这里" />
            ) : (
              <HistoryMediaList
                tasks={filteredTasks}
                generations={searchedGenerations}
                resolveTaskBadge={resolveTaskBadge}
                resolveGenerationBadge={resolveGenerationBadge}
                selectedIds={selectedIds}
                selectMode={selectMode}
                onSelect={toggleSelect}
                onView={setSelected}
                onDownload={downloadFile}
                onDelete={(id) => {
                  setShowDeleteConfirm({type: 'single', id});
                }}
              />
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
          onClose={() => setSelected(null)}
          onDownload={(url, id, type) => downloadFile(url, id, type)}
        />
      )}

      {/* 删除确认弹窗 */}
      {showDeleteConfirm && (() => {
        const isErrors = showDeleteConfirm.id === 'errors';

        let title: string;
        let message: string;
        let confirmLabel: string;
        let variant: 'danger' | 'warning' | 'default';

        if (isErrors) {
          title = '确认清空失败记录';
          message = `确定要清空所有 ${failedGenerations.length} 条失败记录吗？`;
          confirmLabel = '确认清空';
          variant = 'warning';
        } else if (showDeleteConfirm.type === 'single') {
          title = '确认删除';
          message = '确定要删除这个作品吗？此操作无法撤销。';
          confirmLabel = '确认删除';
          variant = 'danger';
        } else if (showDeleteConfirm.type === 'batch') {
          title = '确认删除';
          message = `确定要删除选中的 ${selectedIds.size} 个作品吗？`;
          confirmLabel = '确认删除';
          variant = 'danger';
        } else {
          title = '确认清理';
          message = '确定要一键清理所有已完成作品吗？进行中的任务不会被删除。';
          confirmLabel = '确认清理';
          variant = 'danger';
        }

        const handleConfirm = () => {
          if (isErrors) {
            handleDeleteFailed();
          } else if (showDeleteConfirm.type === 'single' && showDeleteConfirm.id) {
            handleDeleteMedia('single', showDeleteConfirm.id);
          } else if (showDeleteConfirm.type === 'batch') {
            handleDeleteMedia('batch');
          } else {
            handleDeleteMedia('all');
          }
        };

        return (
          <ConfirmDialog
            open={true}
            onClose={() => setShowDeleteConfirm(null)}
            onConfirm={handleConfirm}
            title={title}
            message={message}
            confirmLabel={confirmLabel}
            variant={variant}
            loading={deleting}
          />
        );
      })()}
    </>
  );
}
