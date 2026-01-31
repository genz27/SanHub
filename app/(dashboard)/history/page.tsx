'use client';
/* eslint-disable @next/next/no-img-element */

import { useState, useEffect, useRef, useCallback, useMemo, memo } from 'react';
import { useSession } from 'next-auth/react';
import {
  Download,
  Trash2,
  Search,
  Filter,
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
  Palette,
  ChevronDown,
  Loader2,
  AlertCircle,
  Edit3,
  ExternalLink,
  Droplets,
} from 'lucide-react';
import { toast } from '@/components/ui/toaster';
import type { Generation, CharacterCard } from '@/types';
import { formatDate, truncate } from '@/lib/utils';
import { downloadAsset } from '@/lib/download';
import { IMAGE_MODELS } from '@/lib/model-config';

// 任务类型
interface Task {
  id: string;
  prompt: string;
  type: string;
  status: 'pending' | 'processing';
  progress?: number; // 0-100
  createdAt: number;
}

// 纯函数 - 移到组件外部避免重复创建
const isVideoType = (gen: Generation) => gen.type.includes('video');
const isTaskVideoType = (type: string) => type?.includes('video');

const TYPE_BADGE_MAP: Record<string, { label: string; icon: any }> = {
  'sora-video': { label: 'Sora 视频', icon: Video },
  'sora-image': { label: 'Sora 图像', icon: ImageIcon },
  'gemini-image': { label: 'Gemini', icon: Palette },
  'zimage-image': { label: 'Z-Image', icon: ImageIcon },
  'gitee-image': { label: 'Gitee', icon: ImageIcon },
  'character-card': { label: '角色卡', icon: User },
};

const IMAGE_MODEL_LABELS = new Map(
  IMAGE_MODELS.map((model) => [model.apiModel, model.name])
);

const getTypeBadge = (type: string) => TYPE_BADGE_MAP[type] || { label: type, icon: Palette };
const getGenerationBadge = (gen: Generation) => {
  if (gen.type === 'gemini-image' || gen.type === 'zimage-image' || gen.type === 'gitee-image') {
    const modelLabel = gen.params?.model ? IMAGE_MODEL_LABELS.get(gen.params.model) : undefined;
    if (modelLabel) {
      return { label: modelLabel, icon: ImageIcon };
    }
  }
  return getTypeBadge(gen.type);
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

// Memoized 卡片组件 - 避免不必要的重渲染
interface GenerationCardProps {
  gen: Generation;
  isSelected: boolean;
  selectMode: boolean;
  onSelect: (id: string) => void;
  onView: (gen: Generation) => void;
}

const GenerationCard = memo(function GenerationCard({
  gen,
  isSelected,
  selectMode,
  onSelect,
  onView,
}: GenerationCardProps) {
  const badge = getGenerationBadge(gen);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [imageLoaded, setImageLoaded] = useState(false);
  
  const handleClick = useCallback(() => {
    if (selectMode) {
      onSelect(gen.id);
    } else {
      onView(gen);
    }
  }, [selectMode, gen, onSelect, onView]);
  
  const handleMouseEnter = useCallback(() => {
    if (!selectMode && videoRef.current) {
      videoRef.current.play().catch(() => {});
    }
  }, [selectMode]);
  
  const handleMouseLeave = useCallback(() => {
    if (videoRef.current) {
      videoRef.current.pause();
      videoRef.current.currentTime = 0;
    }
  }, []);

  return (
    <div
      className={`group relative aspect-video bg-card/60 rounded-xl overflow-hidden cursor-pointer border transition-all ${
        isSelected 
          ? 'border-sky-500 ring-2 ring-sky-500/40' 
          : 'border-border/70 hover:border-border'
      }`}
      onClick={handleClick}
    >
      {isVideoType(gen) ? (
        <>
          <video
            ref={videoRef}
            src={gen.resultUrl}
            className="w-full h-full object-cover"
            muted
            loop
            preload="metadata"
            onMouseEnter={handleMouseEnter}
            onMouseLeave={handleMouseLeave}
          />
          <div className="absolute top-2 left-2 px-2 py-1 bg-background/60 backdrop-blur-sm rounded-md flex items-center gap-1">
            <Play className="w-3 h-3 text-foreground" />
            <span className="text-[10px] text-foreground">VIDEO</span>
          </div>
        </>
      ) : (
        <>
          {!imageLoaded && (
            <div className="absolute inset-0 bg-card/60 animate-pulse" />
          )}
          <img
            src={gen.resultUrl}
            alt={gen.prompt}
            className={`w-full h-full object-cover transition-opacity duration-300 ${imageLoaded ? 'opacity-100' : 'opacity-0'}`}
            loading="lazy"
            decoding="async"
            onLoad={() => setImageLoaded(true)}
          />
        </>
      )}
      
      {/* 选择模式下的复选框 */}
      {selectMode && (
        <div className="absolute top-2 left-2 z-10">
          <div className={`w-6 h-6 rounded-md flex items-center justify-center transition-all ${
            isSelected 
              ? 'bg-sky-500' 
              : 'bg-background/60 backdrop-blur-sm border border-border'
          }`}>
            {isSelected && <Check className="w-4 h-4 text-foreground" />}
          </div>
        </div>
      )}
      
      {!selectMode && (
        <div className="absolute inset-0 bg-background/70 opacity-0 group-hover:opacity-100 transition-all flex items-center justify-center">
          <div className="w-12 h-12 bg-card/70 border border-border/70 backdrop-blur-sm rounded-full flex items-center justify-center">
            <Maximize2 className="w-5 h-5 text-foreground" />
          </div>
        </div>
      )}
      <div className="absolute top-2 right-2">
        <span className="px-2 py-1 bg-background/60 backdrop-blur-sm text-foreground text-[10px] rounded-md flex items-center gap-1">
          <badge.icon className="w-3 h-3" />
          {badge.label}
        </span>
      </div>
      <div className="absolute bottom-0 left-0 right-0 p-3 bg-gradient-to-t from-background/80 via-background/30 to-transparent">
        <p className="text-xs text-foreground/80 truncate">{gen.prompt || '无提示词'}</p>
        <p className="text-[10px] text-foreground/40 mt-1">{formatDate(gen.createdAt)}</p>
      </div>
    </div>
  );
});

export default function HistoryPage() {
  const { data: session, update } = useSession();
  const [generations, setGenerations] = useState<Generation[]>([]);
  const [pendingTasks, setPendingTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Generation | null>(null);
  const [filter, setFilter] = useState<'all' | 'video' | 'image' | 'character'>('all');
  const [characterCards, setCharacterCards] = useState<CharacterCard[]>([]);
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [deleting, setDeleting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<'single' | 'batch' | 'all-media' | 'all-characters' | null>(null);
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);
  const [unwatermarking, setUnwatermarking] = useState(false);
  const [unwatermarkUrl, setUnwatermarkUrl] = useState<string | null>(null);
  const abortControllersRef = useRef<Map<string, AbortController>>(new Map());
  const loadingRef = useRef(false);
  const pageSize = 50;

  const loadHistory = useCallback(async (pageNum: number, append = false, force = false) => {
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
      const res = await fetch(`/api/user/history?page=${pageNum}&limit=${pageSize}&_t=${timestamp}`, {
        cache: 'no-store',
      });
      if (res.ok) {
        const data = await res.json();
        const newGenerations = data.data || [];
        
        if (append) {
          setGenerations(prev => [...prev, ...newGenerations]);
        } else {
          setGenerations(newGenerations);
        }
        
        setHasMore(newGenerations.length === pageSize);
      }
    } catch (err) {
      console.error('Failed to load history:', err);
    } finally {
      loadingRef.current = false;
      setLoading(false);
      setLoadingMore(false);
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

  const pollTaskStatus = useCallback(async (taskId: string) => {
    // 防止重复轮询
    if (abortControllersRef.current.has(taskId)) return;

    const controller = new AbortController();
    abortControllersRef.current.set(taskId, controller);

    const maxConsecutiveErrors = 5;
    let consecutiveErrors = 0;

    const poll = async () => {
      if (controller.signal.aborted) return;

      try {
        const res = await fetch(`/api/generate/status/${taskId}`, {
          signal: controller.signal,
        });
        const data = await res.json();

        if (!res.ok) {
          // 请求失败时移除控制器，允许稍后重试
          abortControllersRef.current.delete(taskId);
          return;
        }

        // Reset error counter on success
        consecutiveErrors = 0;
        const status = data.data.status;

        if (status === 'completed' || status === 'failed' || status === 'cancelled') {
          // 任务结束，清理状态
          setPendingTasks(prev => prev.filter(t => t.id !== taskId));
          abortControllersRef.current.delete(taskId);
          if (status === 'completed') {
            await update();
            // 强制刷新列表，忽略 loading 状态
            loadHistoryRef.current(1, false, true);
          }
        } else {
          // 更新任务状态和进度
          setPendingTasks(prev => prev.map(t => 
            t.id === taskId ? { 
              ...t, 
              status: status as 'pending' | 'processing',
              progress: typeof data.data.progress === 'number' ? data.data.progress : t.progress,
            } : t
          ));
          // 继续轮询
          setTimeout(poll, 5000);
        }
      } catch (err) {
        if ((err as Error).name === 'AbortError') return;
        consecutiveErrors++;
        const errMsg = (err as Error).message || '网络错误';
        // Retry on transient network errors
        const isTransientError =
          errMsg.includes('socket') ||
          errMsg.includes('Socket') ||
          errMsg.includes('ECONNRESET') ||
          errMsg.includes('ETIMEDOUT') ||
          errMsg.includes('network') ||
          errMsg.includes('fetch');
        if (isTransientError && consecutiveErrors < maxConsecutiveErrors) {
          console.warn(`[Poll] Transient error (${consecutiveErrors}/${maxConsecutiveErrors}), retrying...`, errMsg);
          const delay = Math.min(5000 * Math.pow(2, consecutiveErrors - 1), 60000);
          setTimeout(poll, delay);
          return;
        }
        abortControllersRef.current.delete(taskId);
      }
    };

    await poll();
  }, [update]);

  const loadPendingTasks = useCallback(async () => {
    try {
      const res = await fetch('/api/user/tasks?limit=200');
      if (res.ok) {
        const data = await res.json();
        const tasks: Task[] = (data.data || []).map((t: any) => ({
          id: t.id,
          prompt: t.prompt,
          type: t.type,
          status: t.status,
          createdAt: t.createdAt,
        }));
        
        if (tasks.length > 0) {
          setPendingTasks(tasks);
          tasks.forEach(task => pollTaskStatus(task.id));
        }
      }
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
      loadHistory(1, false, true); // force load
      loadPendingTasks();
      loadCharacterCards();
    }

    return () => {
      abortControllers.forEach(controller => controller.abort());
      abortControllers.clear();
    };
  }, [session?.user?.id, loadHistory, loadPendingTasks, loadCharacterCards]);

  // 使用 ref 保存 loadHistory 函数避免闭包问题
  const loadHistoryRef = useRef(loadHistory);
  useEffect(() => {
    loadHistoryRef.current = loadHistory;
  }, [loadHistory]);

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

  // 切换选择
  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  // 全选/取消全选
  const toggleSelectAll = () => {
    if (selectedIds.size === filteredGenerations.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredGenerations.map(g => g.id)));
    }
  };

  
  // 使用 useMemo 缓存计算结果，避免每次渲染重复计算
  const pendingTaskIds = useMemo(() => new Set(pendingTasks.map(t => t.id)), [pendingTasks]);
  
  // 缓存已完成作品的过滤结果
  const completedGenerations = useMemo(() => 
    generations.filter(g => 
      g.resultUrl && 
      g.status !== 'pending' && 
      g.status !== 'processing' &&
      !pendingTaskIds.has(g.id)
    ), 
    [generations, pendingTaskIds]
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

  // 缓存统计数据
  const stats = useMemo(() => ({
    total: completedGenerations.length,
    pending: pendingTasks.length,
    videos: completedGenerations.filter(g => isVideoType(g)).length,
    images: completedGenerations.filter(g => !isVideoType(g)).length,
    characters: completedCharacterCards.length,
  }), [completedGenerations, pendingTasks.length, completedCharacterCards.length]);

  return (
    <>
      <div className="max-w-7xl mx-auto flex flex-col h-[calc(100vh-100px)] pb-20 lg:pb-8">
        {/* Header */}
        <div className="shrink-0 flex flex-col md:flex-row md:items-end md:justify-between gap-3 lg:gap-4 mb-4">
          <div>
            <h1 className="text-2xl lg:text-3xl font-extralight text-foreground">创作历史</h1>
            <p className="text-foreground/50 text-sm lg:text-base mt-0.5 font-light">查看和管理您的所有作品</p>
          </div>
          
          {/* Stats - 移动端简化显示 */}
          <div className="flex items-center gap-3 lg:gap-6 overflow-x-auto no-scrollbar -mx-2 px-2 lg:mx-0 lg:px-0">
            {stats.pending > 0 && (
              <>
                <div className="text-center min-w-[56px] lg:min-w-[72px] shrink-0">
                  <p className="text-xl lg:text-2xl font-light text-sky-300">{stats.pending}</p>
                  <p className="text-[10px] lg:text-xs text-foreground/40">进行中</p>
                </div>
                <div className="hidden lg:block w-px h-8 bg-card/70" />
              </>
            )}
            <div className="text-center min-w-[56px] lg:min-w-[72px] shrink-0">
              <p className="text-xl lg:text-2xl font-light text-foreground">{stats.total}</p>
              <p className="text-[10px] lg:text-xs text-foreground/40">总作品</p>
            </div>
            <div className="hidden lg:block w-px h-8 bg-card/70" />
            <div className="text-center min-w-[56px] lg:min-w-[72px] shrink-0">
              <p className="text-xl lg:text-2xl font-light text-foreground">{stats.videos}</p>
              <p className="text-[10px] lg:text-xs text-foreground/40">视频</p>
            </div>
            <div className="hidden lg:block w-px h-8 bg-card/70" />
            <div className="text-center min-w-[56px] lg:min-w-[72px] shrink-0">
              <p className="text-xl lg:text-2xl font-light text-foreground">{stats.images}</p>
              <p className="text-[10px] lg:text-xs text-foreground/40">图像</p>
            </div>
            <div className="hidden lg:block w-px h-8 bg-card/70" />
            <div className="text-center min-w-[56px] lg:min-w-[72px] shrink-0">
              <p className="text-xl lg:text-2xl font-light text-emerald-300">{stats.characters}</p>
              <p className="text-[10px] lg:text-xs text-foreground/40">角色卡</p>
            </div>
          </div>
        </div>

        {/* Filter Tabs & Actions */}
        <div className="shrink-0 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 lg:gap-4 mb-4">
          <div className="flex items-center gap-1.5 lg:gap-2 overflow-x-auto no-scrollbar -mx-2 px-2">
            {(['all', 'video', 'image', 'character'] as const).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`px-3 lg:px-4 py-1.5 lg:py-2 rounded-lg text-xs lg:text-sm transition-all shrink-0 ${
                  filter === f
                    ? 'bg-foreground text-background'
                    : 'bg-card/60 text-foreground/60 hover:bg-card/70 hover:text-foreground'
                }`}
              >
                {f === 'all' ? '全部' : f === 'video' ? '视频' : f === 'image' ? '图像' : '角色卡'}
              </button>
            ))}
          </div>

          {/* 操作按钮 */}
          <div className="flex flex-wrap items-center gap-2">
            {selectMode ? (
              <>
                <button
                  onClick={toggleSelectAll}
                  className="flex items-center gap-2 px-3 py-2 w-full sm:w-auto bg-card/60 text-foreground/60 rounded-lg text-sm hover:bg-card/70 hover:text-foreground transition-all"
                >
                  {selectedIds.size === filteredGenerations.length ? (
                    <CheckSquare className="w-4 h-4" />
                  ) : (
                    <Square className="w-4 h-4" />
                  )}
                  {selectedIds.size > 0 ? `已选 ${selectedIds.size}` : '全选'}
                </button>
                <button
                  onClick={() => setShowDeleteConfirm('batch')}
                  disabled={selectedIds.size === 0 || deleting}
                  className="flex items-center gap-2 px-3 py-2 w-full sm:w-auto bg-red-500/20 text-red-400 rounded-lg text-sm hover:bg-red-500/30 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Trash2 className="w-4 h-4" />
                  删除选中
                </button>
                <button
                  onClick={() => {
                    setSelectMode(false);
                    setSelectedIds(new Set());
                  }}
                  className="flex items-center gap-2 px-3 py-2 w-full sm:w-auto bg-card/60 text-foreground/60 rounded-lg text-sm hover:bg-card/70 hover:text-foreground transition-all"
                >
                  <X className="w-4 h-4" />
                  取消
                </button>
              </>
            ) : (
              <>
                <button
                  onClick={() => setSelectMode(true)}
                  disabled={filteredGenerations.length === 0 && filter !== 'character'}
                  className="flex items-center gap-2 px-3 py-2 w-full sm:w-auto bg-card/60 text-foreground/60 rounded-lg text-sm hover:bg-card/70 hover:text-foreground transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Edit3 className="w-4 h-4" />
                  管理
                </button>
                <button
                  onClick={() => setShowDeleteConfirm('all-media')}
                  disabled={completedGenerations.length === 0 || deleting}
                  className="flex items-center gap-2 px-3 py-2 w-full sm:w-auto bg-red-500/20 text-red-400 rounded-lg text-sm hover:bg-red-500/30 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Trash2 className="w-4 h-4" />
                  清空媒体
                </button>
                <button
                  onClick={() => setShowDeleteConfirm('all-characters')}
                  disabled={completedCharacterCards.length === 0 || deleting}
                  className="flex items-center gap-2 px-3 py-2 w-full sm:w-auto bg-emerald-500/15 text-emerald-300 rounded-lg text-sm hover:bg-emerald-500/25 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <User className="w-4 h-4" />
                  清空角色卡
                </button>
              </>
            )}
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 min-h-0 bg-card/60 border border-border/70 rounded-2xl overflow-hidden backdrop-blur-sm flex flex-col">
          <div className={`shrink-0 p-4 sm:p-6 border-b border-border/70 ${filter === 'character' ? 'bg-gradient-to-r from-emerald-500/10 to-sky-500/10' : 'bg-gradient-to-r from-sky-500/10 to-emerald-500/10'}`}>
            <div className="flex items-center gap-3">
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${filter === 'character' ? 'bg-gradient-to-br from-emerald-500/25 to-sky-500/25' : 'bg-gradient-to-br from-sky-500/25 to-emerald-500/25'}`}>
                {filter === 'character' ? <User className="w-5 h-5 text-emerald-300" /> : <History className="w-5 h-5 text-sky-300" />}
              </div>
              <div>
                <h2 className="text-lg font-medium text-foreground">{filter === 'character' ? '角色卡库' : '作品库'}</h2>
                <p className="text-sm text-foreground/40">{filter === 'character' ? `${completedCharacterCards.length} 个角色` : `${filteredGenerations.length} 个作品`}</p>
              </div>
            </div>
          </div>

          <div className="flex-1 min-h-0 overflow-y-auto p-4 sm:p-6">
            {loading ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                {Array.from({ length: 8 }).map((_, i) => (
                  <SkeletonCard key={i} />
                ))}
              </div>
            ) : filter === 'character' ? (
              // 角色卡专属显示
              completedCharacterCards.length === 0 && processingCharacterCards.length === 0 ? (
                <div className="h-64 flex flex-col items-center justify-center border border-dashed border-border/70 rounded-xl">
                  <div className="w-16 h-16 bg-gradient-to-br from-emerald-500/10 to-sky-500/10 rounded-2xl flex items-center justify-center mb-4">
                    <User className="w-8 h-8 text-emerald-300/50" />
                  </div>
                  <p className="text-foreground/40">暂无角色卡</p>
                  <p className="text-foreground/30 text-sm mt-1">去视频页面生成你的第一个角色卡</p>
                </div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
                  {/* 进行中的角色卡任务 */}
                  {processingCharacterCards.map((card) => (
                    <div
                      key={card.id}
                      className="bg-card/60 border border-sky-500/30 rounded-xl overflow-hidden"
                    >
                      <div className="aspect-square bg-gradient-to-br from-emerald-500/10 to-sky-500/10 flex items-center justify-center relative">
                        {card.avatarUrl ? (
                          <img
                            src={card.avatarUrl}
                            alt="生成中..."
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <User className="w-16 h-16 text-foreground/30" />
                        )}
                        <div className="absolute inset-0 bg-background/60 flex items-center justify-center">
                          <Loader2 className="w-8 h-8 text-foreground animate-spin" />
                        </div>
                      </div>
                      <div className="p-3 space-y-2">
                        <div className="flex items-center justify-between">
                          <h3 className="text-sm font-medium text-foreground truncate">生成中...</h3>
                          <span className="px-2 py-0.5 text-[10px] rounded-md bg-sky-500/15 text-sky-300">
                            {card.status === 'processing' ? '生成中' : '等待中'}
                          </span>
                        </div>
                        <p className="text-[10px] text-foreground/40">{formatDate(card.createdAt)}</p>
                      </div>
                    </div>
                  ))}
                  {/* 已完成的角色卡 */}
                  {completedCharacterCards.map((card) => (
                    <CharacterCardHistoryItem key={card.id} card={card} />
                  ))}
                </div>
              )
            ) : filteredGenerations.length === 0 && filteredTasks.length === 0 ? (
              <div className="h-64 flex flex-col items-center justify-center border border-dashed border-border/70 rounded-xl">
                <div className="w-16 h-16 bg-card/60 rounded-2xl flex items-center justify-center mb-4">
                  <ImageIcon className="w-8 h-8 text-foreground/30" />
                </div>
                <p className="text-foreground/40">暂无{filter === 'video' ? '视频' : filter === 'image' ? '图像' : ''}作品</p>
                <p className="text-foreground/30 text-sm mt-1">开始创作你的第一个作品</p>
              </div>
            ) : (
              <>
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                  {/* Pending 任务 */}
                  {filteredTasks.map((task) => {
                    const badge = getTypeBadge(task.type);
                    return (
                      <div
                        key={task.id}
                        className="group relative aspect-video bg-card/60 rounded-xl overflow-hidden border border-sky-500/30"
                      >
                        {/* 加载动画 */}
                        <div className="absolute inset-0 flex flex-col items-center justify-center bg-gradient-to-br from-sky-500/10 to-emerald-500/10">
                          <Loader2 className="w-8 h-8 text-foreground/60 animate-spin mb-2" />
                          <p className="text-xs text-foreground/60">
                            {task.status === 'processing' ? '生成中...' : '排队中...'}
                          </p>
                          {/* 进度显示 */}
                          {typeof task.progress === 'number' && task.progress > 0 && (
                            <div className="mt-2 w-24">
                              <div className="h-1.5 bg-card/70 rounded-full overflow-hidden">
                                <div 
                                  className="h-full bg-gradient-to-r from-sky-500 to-emerald-500 transition-all duration-300"
                                  style={{ width: `${task.progress}%` }}
                                />
                              </div>
                              <p className="text-[10px] text-foreground/50 text-center mt-1">{task.progress}%</p>
                            </div>
                          )}
                        </div>
                        {/* 类型标签 */}
                        <div className="absolute top-2 left-2 px-2 py-1 bg-sky-500/40 backdrop-blur-sm rounded-md flex items-center gap-1">
                          {isTaskVideoType(task.type) ? (
                            <Play className="w-3 h-3 text-foreground" />
                          ) : (
                            <ImageIcon className="w-3 h-3 text-foreground" />
                          )}
                          <span className="text-[10px] text-foreground">
                            {task.status === 'processing' ? '生成中' : '排队中'}
                          </span>
                        </div>
                        <div className="absolute top-2 right-2">
                          <span className="px-2 py-1 bg-background/60 backdrop-blur-sm text-foreground text-[10px] rounded-md flex items-center gap-1">
                            <badge.icon className="w-3 h-3" />
                            {badge.label}
                          </span>
                        </div>
                        <div className="absolute bottom-0 left-0 right-0 p-3 bg-gradient-to-t from-background/80 via-background/30 to-transparent">
                          <p className="text-xs text-foreground/80 truncate">{task.prompt || '无提示词'}</p>
                          <p className="text-[10px] text-foreground/40 mt-1">{formatDate(task.createdAt)}</p>
                        </div>
                      </div>
                    );
                  })}
                  
                  {/* 已完成的作品 - 使用 memo 优化的卡片组件 */}
                  {filteredGenerations.map((gen) => (
                    <GenerationCard
                      key={gen.id}
                      gen={gen}
                      isSelected={selectedIds.has(gen.id)}
                      selectMode={selectMode}
                      onSelect={toggleSelect}
                      onView={setSelected}
                    />
                  ))}
                </div>
              </>
            )}
          </div>
          
          {/* 加载更多按钮 */}
          {hasMore && (
            <div className="shrink-0 p-4 border-t border-border/70 flex items-center justify-center">
              <button
                onClick={() => {
                  const nextPage = page + 1;
                  setPage(nextPage);
                  loadHistory(nextPage, true);
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
        <div
          className="fixed inset-0 z-[60] bg-background/95 backdrop-blur-xl flex flex-col"
          onClick={() => setSelected(null)}
        >
          {/* Media container - takes remaining space above info panel */}
          <div className="flex-1 min-h-0 flex items-center justify-center p-4 md:p-6" onClick={(e) => e.stopPropagation()}>
            {isVideoType(selected) ? (
              <video
                src={selected.resultUrl}
                className="max-w-full max-h-full w-auto h-auto rounded-xl border border-border/70"
                controls
                autoPlay
                loop
              />
            ) : (
              <img
                src={selected.resultUrl}
                alt={selected.prompt}
                className="max-w-full max-h-full w-auto h-auto rounded-xl border border-border/70 object-contain"
              />
            )}
          </div>

          {/* Info panel - fixed at bottom */}
          <div className="shrink-0 w-full bg-background/80 backdrop-blur-sm border-t border-border/30 p-4 md:px-8 md:py-4" onClick={(e) => e.stopPropagation()}>
            <div className="max-w-3xl mx-auto">
              <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-start gap-2">
                    <div className="flex-1 min-w-0">
                      {selected.prompt ? (
                        <CollapsibleText text={selected.prompt} collapsedLines={2} />
                      ) : (
                        <p className="text-foreground text-sm leading-relaxed">无提示词</p>
                      )}
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 md:gap-3 mt-2">
                    <span className="text-foreground/40 text-xs">{formatDate(selected.createdAt)}</span>
                    <span className="text-foreground/30">·</span>
                    <span className="text-foreground/40 text-xs">{selected.cost} 积分</span>
                    <span className="text-foreground/30">·</span>
                    <span className="px-2 py-0.5 bg-card/70 text-foreground/60 text-xs rounded">
                      {getGenerationBadge(selected).label}
                    </span>
                    {selected.resultUrl && (
                      <button
                        onClick={() => {
                          navigator.clipboard.writeText(selected.resultUrl);
                          toast({ title: '已复制 URL' });
                        }}
                        className="p-1 text-foreground/40 hover:text-foreground/80 rounded transition-colors"
                        title="复制 URL"
                      >
                        <Copy className="w-3.5 h-3.5" />
                      </button>
                    )}
                    {/* 调试信息: 显示 videoId 和 permalink 状态 */}
                    {selected.type === 'sora-video' && process.env.NODE_ENV === 'development' && (
                      <span className="text-[10px] text-foreground/30">
                        {selected.params?.permalink ? '✓ permalink' : selected.params?.videoId ? '✓ videoId' : '✗ 无ID'}
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex flex-wrap gap-2 shrink-0 w-full md:w-auto">
                  {/* 显示 permalink 链接 - 仅 Sora 视频且有 permalink */}
                  {selected.type === 'sora-video' && selected.params?.permalink && (
                    <a
                      href={selected.params.permalink}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center justify-center gap-2 px-4 py-2.5 bg-card/70 text-foreground border border-border/70 rounded-xl hover:bg-card/80 transition-colors text-sm font-medium"
                      title="查看 Sora 分享页"
                    >
                      <ExternalLink className="w-4 h-4" />
                      分享页
                    </a>
                  )}
                  
                  {/* 去水印按钮 - 仅 Sora 视频,优先使用 permalink,否则尝试从 videoId 构建 */}
                  {selected.type === 'sora-video' && (selected.params?.permalink || selected.params?.videoId) && (
                    <button
                      onClick={() => {
                        // 优先使用 permalink,如果没有则尝试从 videoId 构建
                        const permalink = selected.params?.permalink || 
                          (selected.params?.videoId ? `https://sora.com/share/${selected.params.videoId}` : '');
                        if (permalink) {
                          handleUnwatermark(permalink);
                        } else {
                          toast({
                            title: '无法去水印',
                            description: '缺少视频分享链接和视频ID',
                            variant: 'destructive',
                          });
                        }
                      }}
                      disabled={unwatermarking}
                      className="flex items-center justify-center gap-2 px-4 py-2.5 bg-sky-500/20 text-sky-300 border border-sky-500/30 rounded-xl hover:bg-sky-500/30 transition-colors text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                      title={selected.params?.permalink ? '重新获取无水印下载链接' : '尝试通过视频ID获取无水印链接'}
                    >
                      {unwatermarking ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Droplets className="w-4 h-4" />
                      )}
                      {unwatermarking ? '处理中...' : '去水印'}
                    </button>
                  )}
                  
                  {/* 下载无水印链接 */}
                  {unwatermarkUrl && (
                    <button
                      onClick={() => downloadFile(unwatermarkUrl, selected.id, selected.type)}
                      className="flex items-center justify-center gap-2 px-4 py-2.5 bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 rounded-xl hover:bg-emerald-500/30 transition-colors text-sm font-medium"
                      title="下载无水印视频"
                    >
                      <Download className="w-4 h-4" />
                      无水印下载
                    </button>
                  )}
                  
                  <button
                    onClick={() => downloadFile(selected.resultUrl, selected.id, selected.type)}
                    className="flex-1 md:flex-initial flex items-center justify-center gap-2 px-5 py-2.5 bg-foreground text-background rounded-xl hover:opacity-90 transition-colors text-sm font-medium"
                  >
                    <Download className="w-4 h-4" />
                    下载
                  </button>
                  <button
                    onClick={() => {
                      setSelected(null);
                      setUnwatermarkUrl(null);
                    }}
                    className="flex items-center justify-center gap-2 px-5 py-2.5 bg-card/70 text-foreground border border-border/70 rounded-xl hover:bg-card/80 transition-colors text-sm font-medium"
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
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${showDeleteConfirm === 'all-characters' ? 'bg-emerald-500/20' : 'bg-red-500/20'}`}>
                {showDeleteConfirm === 'all-characters' ? (
                  <User className="w-5 h-5 text-emerald-300" />
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

// 角色卡历史记录专属卡片组件
function CharacterCardHistoryItem({ card }: { card: CharacterCard }) {
  return (
    <div className="group relative bg-gradient-to-br from-emerald-500/5 to-sky-500/5 rounded-xl overflow-hidden border border-emerald-500/20 hover:border-emerald-500/40 transition-all">
      {/* 头像区域 - 正方形 */}
      <div className="aspect-square bg-gradient-to-br from-emerald-500/10 to-sky-500/10 flex items-center justify-center">
        {card.avatarUrl ? (
          <img
            src={card.avatarUrl}
            alt={card.characterName}
            className="w-full h-full object-cover"
          />
        ) : (
          <User className="w-16 h-16 text-emerald-300/30" />
        )}
      </div>

      {/* 角色卡标识 */}
      <div className="absolute top-2 right-2">
        <span className="px-2 py-1 bg-gradient-to-r from-emerald-500/80 to-sky-500/80 backdrop-blur-sm text-foreground text-[10px] rounded-md flex items-center gap-1">
          <User className="w-3 h-3" />
          角色卡
        </span>
      </div>

      {/* 信息区域 */}
      <div className="p-3 bg-gradient-to-t from-background/60 to-transparent absolute bottom-0 left-0 right-0">
        <h3 className="text-sm font-medium text-foreground truncate">
          {card.characterName || '未命名角色'}
        </h3>
        <p className="text-[10px] text-foreground/50 mt-1">{formatDate(card.createdAt)}</p>
      </div>

      {/* Hover 效果 */}
      <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/20 to-sky-500/20 opacity-0 group-hover:opacity-100 transition-all flex items-center justify-center">
        <div className="w-12 h-12 bg-card/70 backdrop-blur-sm rounded-full flex items-center justify-center">
          <User className="w-5 h-5 text-foreground" />
        </div>
      </div>
    </div>
  );
}

