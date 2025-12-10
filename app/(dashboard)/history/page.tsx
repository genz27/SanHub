'use client';

import { useState, useEffect, useRef, useCallback, useMemo, memo } from 'react';
import { useSession } from 'next-auth/react';
import { History, Download, Maximize2, X, Loader2, Play, Image, Video, Palette, Trash2, Check, Square, CheckSquare, Edit3, Copy, User } from 'lucide-react';
import { toast } from '@/components/ui/toaster';
import type { Generation, CharacterCard } from '@/types';
import { formatDate, truncate } from '@/lib/utils';

// 任务类型
interface Task {
  id: string;
  prompt: string;
  type: string;
  status: 'pending' | 'processing';
  createdAt: number;
}

// 纯函数 - 移到组件外部避免重复创建
const isVideoType = (gen: Generation) => gen.type.includes('video');
const isTaskVideoType = (type: string) => type?.includes('video');

const TYPE_BADGE_MAP: Record<string, { label: string; icon: any }> = {
  'sora-video': { label: 'Sora 视频', icon: Video },
  'sora-image': { label: 'Sora 图像', icon: Image },
  'gemini-image': { label: 'Gemini', icon: Palette },
  'zimage-image': { label: 'Z-Image', icon: Image },
  'gitee-image': { label: 'Gitee', icon: Image },
  'character-card': { label: '角色卡', icon: User },
};

const getTypeBadge = (type: string) => TYPE_BADGE_MAP[type] || { label: type, icon: Palette };

// 骨架屏组件
const SkeletonCard = () => (
  <div className="relative aspect-video bg-white/5 rounded-xl overflow-hidden border border-white/10 animate-pulse">
    <div className="absolute inset-0 bg-gradient-to-br from-white/5 to-white/10" />
    <div className="absolute top-2 right-2 w-16 h-5 bg-white/10 rounded-md" />
    <div className="absolute bottom-0 left-0 right-0 p-3 space-y-2">
      <div className="h-3 bg-white/10 rounded w-3/4" />
      <div className="h-2 bg-white/10 rounded w-1/3" />
    </div>
  </div>
);

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
  const badge = getTypeBadge(gen.type);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [imageLoaded, setImageLoaded] = useState(false);
  
  const handleClick = useCallback(() => {
    if (selectMode) {
      onSelect(gen.id);
    } else {
      onView(gen);
    }
  }, [selectMode, gen.id, gen, onSelect, onView]);
  
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
      className={`group relative aspect-video bg-white/5 rounded-xl overflow-hidden cursor-pointer border transition-all ${
        isSelected 
          ? 'border-blue-500 ring-2 ring-blue-500/50' 
          : 'border-white/10 hover:border-white/30'
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
            preload="none"
            onMouseEnter={handleMouseEnter}
            onMouseLeave={handleMouseLeave}
          />
          <div className="absolute top-2 left-2 px-2 py-1 bg-black/50 backdrop-blur-sm rounded-md flex items-center gap-1">
            <Play className="w-3 h-3 text-white" />
            <span className="text-[10px] text-white">VIDEO</span>
          </div>
        </>
      ) : (
        <>
          {!imageLoaded && (
            <div className="absolute inset-0 bg-white/5 animate-pulse" />
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
              ? 'bg-blue-500' 
              : 'bg-black/50 backdrop-blur-sm border border-white/30'
          }`}>
            {isSelected && <Check className="w-4 h-4 text-white" />}
          </div>
        </div>
      )}
      
      {!selectMode && (
        <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-all flex items-center justify-center">
          <div className="w-12 h-12 bg-white/20 backdrop-blur-sm rounded-full flex items-center justify-center">
            <Maximize2 className="w-5 h-5 text-white" />
          </div>
        </div>
      )}
      <div className="absolute top-2 right-2">
        <span className="px-2 py-1 bg-black/50 backdrop-blur-sm text-white text-[10px] rounded-md flex items-center gap-1">
          <badge.icon className="w-3 h-3" />
          {badge.label}
        </span>
      </div>
      <div className="absolute bottom-0 left-0 right-0 p-3 bg-gradient-to-t from-black/80 via-black/40 to-transparent">
        <p className="text-xs text-white/80 truncate">{gen.prompt || '无提示词'}</p>
        <p className="text-[10px] text-white/40 mt-1">{formatDate(gen.createdAt)}</p>
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
  const abortControllersRef = useRef<Map<string, AbortController>>(new Map());
  const loadMoreRef = useRef<HTMLDivElement>(null);
  const loadingRef = useRef(false);
  const pageSize = 50;

  const loadHistory = useCallback(async (pageNum: number, append = false) => {
    if (loadingRef.current) return;
    loadingRef.current = true;
    
    if (append) {
      setLoadingMore(true);
    } else {
      setLoading(true);
    }
    
    try {
      const res = await fetch(`/api/user/history?page=${pageNum}&limit=${pageSize}`);
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

  // 初始加载 - 只在组件挂载时执行一次
  const initialLoadRef = useRef(false);
  useEffect(() => {
    if (session?.user && !initialLoadRef.current) {
      initialLoadRef.current = true;
      loadHistory(1);
      loadPendingTasks();
      loadCharacterCards();
    }

    return () => {
      abortControllersRef.current.forEach(controller => controller.abort());
      abortControllersRef.current.clear();
    };
  }, [session?.user?.id, loadHistory]);

  // 使用 ref 存储最新状态，避免 observer 回调中的闭包问题
  const stateRef = useRef({ page, hasMore, loading, loadingMore });
  useEffect(() => {
    stateRef.current = { page, hasMore, loading, loadingMore };
  }, [page, hasMore, loading, loadingMore]);

  // 使用 ref 保存 loadHistory 函数避免 observer 重建
  const loadHistoryRef = useRef(loadHistory);
  useEffect(() => {
    loadHistoryRef.current = loadHistory;
  }, [loadHistory]);

  // 无限滚动 - 只创建一次 observer，不依赖 loadHistory
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        const { page: currentPage, hasMore: canLoadMore, loading: isLoading, loadingMore: isLoadingMore } = stateRef.current;
        if (entries[0].isIntersecting && canLoadMore && !isLoading && !isLoadingMore) {
          const nextPage = currentPage + 1;
          setPage(nextPage);
          loadHistoryRef.current(nextPage, true);
        }
      },
      { threshold: 0.1 }
    );

    if (loadMoreRef.current) {
      observer.observe(loadMoreRef.current);
    }

    return () => observer.disconnect();
  }, []);

  const loadPendingTasks = async () => {
    try {
      const res = await fetch('/api/user/tasks');
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
  };

  const pollTaskStatus = useCallback(async (taskId: string) => {
    // 防止重复轮询
    if (abortControllersRef.current.has(taskId)) return;

    const controller = new AbortController();
    abortControllersRef.current.set(taskId, controller);

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

        const status = data.data.status;

        if (status === 'completed' || status === 'failed' || status === 'cancelled') {
          // 任务结束，清理状态
          setPendingTasks(prev => prev.filter(t => t.id !== taskId));
          abortControllersRef.current.delete(taskId);
          if (status === 'completed') {
            await update();
            // 使用 ref 调用避免闭包问题
            loadHistoryRef.current(1);
          }
        } else {
          // 更新任务状态
          setPendingTasks(prev => prev.map(t => 
            t.id === taskId ? { ...t, status: status as 'pending' | 'processing' } : t
          ));
          // 继续轮询
          setTimeout(poll, 5000);
        }
      } catch (err) {
        if ((err as Error).name !== 'AbortError') {
          abortControllersRef.current.delete(taskId);
        }
      }
    };

    await poll();
  }, [update]);

  const downloadFile = (url: string, id: string, type: string) => {
    const link = document.createElement('a');
    link.href = url;
    link.download = `sanhub-${id}.${type.includes('video') ? 'mp4' : 'png'}`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
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
      <div className="max-w-7xl mx-auto space-y-8">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
          <div>
            <h1 className="text-3xl font-extralight text-white">创作历史</h1>
            <p className="text-white/50 mt-1 font-light">查看和管理您的所有作品</p>
          </div>
          
          {/* Stats */}
          <div className="flex items-center gap-6">
            {stats.pending > 0 && (
              <>
                <div className="text-center">
                  <p className="text-2xl font-light text-blue-400">{stats.pending}</p>
                  <p className="text-xs text-white/40">进行中</p>
                </div>
                <div className="w-px h-8 bg-white/10" />
              </>
            )}
            <div className="text-center">
              <p className="text-2xl font-light text-white">{stats.total}</p>
              <p className="text-xs text-white/40">总作品</p>
            </div>
            <div className="w-px h-8 bg-white/10" />
            <div className="text-center">
              <p className="text-2xl font-light text-white">{stats.videos}</p>
              <p className="text-xs text-white/40">视频</p>
            </div>
            <div className="w-px h-8 bg-white/10" />
            <div className="text-center">
              <p className="text-2xl font-light text-white">{stats.images}</p>
              <p className="text-xs text-white/40">图像</p>
            </div>
            <div className="w-px h-8 bg-white/10" />
            <div className="text-center">
              <p className="text-2xl font-light text-pink-400">{stats.characters}</p>
              <p className="text-xs text-white/40">角色卡</p>
            </div>
          </div>
        </div>

        {/* Filter Tabs & Actions */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-center gap-2">
            {(['all', 'video', 'image', 'character'] as const).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`px-4 py-2 rounded-lg text-sm transition-all ${
                  filter === f
                    ? 'bg-white text-black'
                    : 'bg-white/5 text-white/60 hover:bg-white/10 hover:text-white'
                }`}
              >
                {f === 'all' ? '全部' : f === 'video' ? '视频' : f === 'image' ? '图像' : '角色卡'}
              </button>
            ))}
          </div>

          {/* 操作按钮 */}
          <div className="flex items-center gap-2">
            {selectMode ? (
              <>
                <button
                  onClick={toggleSelectAll}
                  className="flex items-center gap-2 px-3 py-2 bg-white/5 text-white/60 rounded-lg text-sm hover:bg-white/10 hover:text-white transition-all"
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
                  className="flex items-center gap-2 px-3 py-2 bg-red-500/20 text-red-400 rounded-lg text-sm hover:bg-red-500/30 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Trash2 className="w-4 h-4" />
                  删除选中
                </button>
                <button
                  onClick={() => {
                    setSelectMode(false);
                    setSelectedIds(new Set());
                  }}
                  className="flex items-center gap-2 px-3 py-2 bg-white/5 text-white/60 rounded-lg text-sm hover:bg-white/10 hover:text-white transition-all"
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
                  className="flex items-center gap-2 px-3 py-2 bg-white/5 text-white/60 rounded-lg text-sm hover:bg-white/10 hover:text-white transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Edit3 className="w-4 h-4" />
                  管理
                </button>
                <button
                  onClick={() => setShowDeleteConfirm('all-media')}
                  disabled={completedGenerations.length === 0 || deleting}
                  className="flex items-center gap-2 px-3 py-2 bg-red-500/20 text-red-400 rounded-lg text-sm hover:bg-red-500/30 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Trash2 className="w-4 h-4" />
                  清空媒体
                </button>
                <button
                  onClick={() => setShowDeleteConfirm('all-characters')}
                  disabled={completedCharacterCards.length === 0 || deleting}
                  className="flex items-center gap-2 px-3 py-2 bg-pink-500/20 text-pink-400 rounded-lg text-sm hover:bg-pink-500/30 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <User className="w-4 h-4" />
                  清空角色卡
                </button>
              </>
            )}
          </div>
        </div>

        {/* Content */}
        <div className="bg-white/5 border border-white/10 rounded-2xl overflow-hidden backdrop-blur-sm">
          <div className={`p-6 border-b border-white/10 ${filter === 'character' ? 'bg-gradient-to-r from-pink-500/5 to-purple-500/5' : 'bg-gradient-to-r from-blue-500/5 to-purple-500/5'}`}>
            <div className="flex items-center gap-3">
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${filter === 'character' ? 'bg-gradient-to-br from-pink-500/30 to-purple-500/30' : 'bg-gradient-to-br from-blue-500/30 to-purple-500/30'}`}>
                {filter === 'character' ? <User className="w-5 h-5 text-pink-400" /> : <History className="w-5 h-5 text-blue-400" />}
              </div>
              <div>
                <h2 className="text-lg font-medium text-white">{filter === 'character' ? '角色卡库' : '作品库'}</h2>
                <p className="text-sm text-white/40">{filter === 'character' ? `${completedCharacterCards.length} 个角色` : `${filteredGenerations.length} 个作品`}</p>
              </div>
            </div>
          </div>

          <div className="p-6">
            {loading ? (
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                {Array.from({ length: 8 }).map((_, i) => (
                  <SkeletonCard key={i} />
                ))}
              </div>
            ) : filter === 'character' ? (
              // 角色卡专属显示
              completedCharacterCards.length === 0 && processingCharacterCards.length === 0 ? (
                <div className="h-64 flex flex-col items-center justify-center border border-dashed border-white/20 rounded-xl">
                  <div className="w-16 h-16 bg-gradient-to-br from-pink-500/10 to-purple-500/10 rounded-2xl flex items-center justify-center mb-4">
                    <User className="w-8 h-8 text-pink-400/50" />
                  </div>
                  <p className="text-white/40">暂无角色卡</p>
                  <p className="text-white/20 text-sm mt-1">去视频页面生成你的第一个角色卡</p>
                </div>
              ) : (
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                  {/* 进行中的角色卡任务 */}
                  {processingCharacterCards.map((card) => (
                    <div
                      key={card.id}
                      className="bg-white/5 border border-blue-500/30 rounded-xl overflow-hidden"
                    >
                      <div className="aspect-square bg-gradient-to-br from-pink-500/10 to-purple-500/10 flex items-center justify-center relative">
                        {card.avatarUrl ? (
                          <img
                            src={card.avatarUrl}
                            alt="生成中..."
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <User className="w-16 h-16 text-white/20" />
                        )}
                        <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                          <Loader2 className="w-8 h-8 text-white animate-spin" />
                        </div>
                      </div>
                      <div className="p-3 space-y-2">
                        <div className="flex items-center justify-between">
                          <h3 className="text-sm font-medium text-white truncate">生成中...</h3>
                          <span className="px-2 py-0.5 text-[10px] rounded-md bg-blue-500/20 text-blue-400">
                            {card.status === 'processing' ? '生成中' : '等待中'}
                          </span>
                        </div>
                        <p className="text-[10px] text-white/40">{formatDate(card.createdAt)}</p>
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
              <div className="h-64 flex flex-col items-center justify-center border border-dashed border-white/20 rounded-xl">
                <div className="w-16 h-16 bg-white/5 rounded-2xl flex items-center justify-center mb-4">
                  <Image className="w-8 h-8 text-white/20" />
                </div>
                <p className="text-white/40">暂无{filter === 'video' ? '视频' : filter === 'image' ? '图像' : ''}作品</p>
                <p className="text-white/20 text-sm mt-1">开始创作你的第一个作品</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                {/* Pending 任务 */}
                {filteredTasks.map((task) => {
                  const badge = getTypeBadge(task.type);
                  return (
                    <div
                      key={task.id}
                      className="group relative aspect-video bg-white/5 rounded-xl overflow-hidden border border-blue-500/30"
                    >
                      {/* 加载动画 */}
                      <div className="absolute inset-0 flex flex-col items-center justify-center bg-gradient-to-br from-blue-500/10 to-purple-500/10">
                        <Loader2 className="w-8 h-8 text-white/60 animate-spin mb-2" />
                        <p className="text-xs text-white/60">
                          {task.status === 'processing' ? '生成中...' : '排队中...'}
                        </p>
                      </div>
                      {/* 类型标签 */}
                      <div className="absolute top-2 left-2 px-2 py-1 bg-blue-500/50 backdrop-blur-sm rounded-md flex items-center gap-1">
                        {isTaskVideoType(task.type) ? (
                          <Play className="w-3 h-3 text-white" />
                        ) : (
                          <Image className="w-3 h-3 text-white" />
                        )}
                        <span className="text-[10px] text-white">
                          {task.status === 'processing' ? '生成中' : '排队中'}
                        </span>
                      </div>
                      <div className="absolute top-2 right-2">
                        <span className="px-2 py-1 bg-black/50 backdrop-blur-sm text-white text-[10px] rounded-md flex items-center gap-1">
                          <badge.icon className="w-3 h-3" />
                          {badge.label}
                        </span>
                      </div>
                      <div className="absolute bottom-0 left-0 right-0 p-3 bg-gradient-to-t from-black/80 via-black/40 to-transparent">
                        <p className="text-xs text-white/80 truncate">{task.prompt || '无提示词'}</p>
                        <p className="text-[10px] text-white/40 mt-1">{formatDate(task.createdAt)}</p>
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
            )}
          </div>
          
          {/* 加载更多触发器 - 始终渲染以确保无限滚动工作 */}
          <div ref={loadMoreRef} className="h-10 flex items-center justify-center pb-4">
            {loadingMore && (
              <Loader2 className="w-5 h-5 animate-spin text-white/30" />
            )}
            {!hasMore && generations.length > 0 && !loading && (
              <p className="text-white/30 text-sm">已加载全部作品</p>
            )}
          </div>
        </div>
      </div>

      {/* Lightbox */}
      {selected && (
        <div
          className="fixed inset-0 z-50 bg-black/95 backdrop-blur-xl flex items-center justify-center p-4 md:p-8"
          onClick={() => setSelected(null)}
        >
          <div className="w-full h-full flex flex-col items-center justify-center" onClick={(e) => e.stopPropagation()}>
            <div className="w-full max-w-[90vw] max-h-[70vh] md:max-h-[75vh] flex items-center justify-center">
              {isVideoType(selected) ? (
                <video
                  src={selected.resultUrl}
                  className="max-w-full max-h-[70vh] md:max-h-[75vh] w-auto h-auto rounded-xl border border-white/10"
                  controls
                  autoPlay
                  loop
                />
              ) : (
                <img
                  src={selected.resultUrl}
                  alt={selected.prompt}
                  className="max-w-full max-h-[70vh] md:max-h-[75vh] w-auto h-auto rounded-xl border border-white/10 object-contain"
                />
              )}
            </div>

            <div className="w-full max-w-3xl mt-4 md:mt-6 px-2">
              <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-start gap-2">
                    <p className="text-white text-sm leading-relaxed truncate md:whitespace-normal flex-1">{truncate(selected.prompt || '无提示词', 150)}</p>
                    {selected.prompt && (
                      <button
                        onClick={() => {
                          navigator.clipboard.writeText(selected.prompt);
                          toast({ title: '已复制提示词' });
                        }}
                        className="shrink-0 p-1.5 text-white/40 hover:text-white/80 hover:bg-white/10 rounded-lg transition-colors"
                        title="复制提示词"
                      >
                        <Copy className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-2 md:gap-3 mt-2">
                    <span className="text-white/40 text-xs">{formatDate(selected.createdAt)}</span>
                    <span className="text-white/20 hidden md:inline">·</span>
                    <span className="text-white/40 text-xs">{selected.cost} 积分</span>
                    <span className="text-white/20 hidden md:inline">·</span>
                    <span className="px-2 py-0.5 bg-white/10 text-white/60 text-xs rounded">
                      {getTypeBadge(selected.type).label}
                    </span>
                  </div>
                </div>
                <div className="flex gap-2 shrink-0 w-full md:w-auto">
                  <button
                    onClick={() => downloadFile(selected.resultUrl, selected.id, selected.type)}
                    className="flex-1 md:flex-initial flex items-center justify-center gap-2 px-5 py-2.5 bg-white text-black rounded-xl hover:bg-white/90 transition-colors text-sm font-medium"
                  >
                    <Download className="w-4 h-4" />
                    下载
                  </button>
                  <button
                    onClick={() => setSelected(null)}
                    className="flex items-center justify-center gap-2 px-5 py-2.5 bg-white/10 text-white border border-white/20 rounded-xl hover:bg-white/20 transition-colors text-sm font-medium"
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
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setShowDeleteConfirm(null)}
        >
          <div
            className="bg-zinc-900 border border-white/10 rounded-2xl p-6 max-w-md w-full"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3 mb-4">
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${showDeleteConfirm === 'all-characters' ? 'bg-pink-500/20' : 'bg-red-500/20'}`}>
                {showDeleteConfirm === 'all-characters' ? (
                  <User className="w-5 h-5 text-pink-400" />
                ) : (
                  <Trash2 className="w-5 h-5 text-red-400" />
                )}
              </div>
              <div>
                <h3 className="text-lg font-medium text-white">确认删除</h3>
                <p className="text-sm text-white/40">此操作无法撤销</p>
              </div>
            </div>
            
            <p className="text-white/60 mb-6">
              {showDeleteConfirm === 'all-media' && '确定要清空所有已完成的媒体作品吗？进行中的任务不会被删除。'}
              {showDeleteConfirm === 'all-characters' && '确定要清空所有角色卡吗？'}
              {showDeleteConfirm === 'batch' && `确定要删除选中的 ${selectedIds.size} 个作品吗？`}
              {showDeleteConfirm === 'single' && '确定要删除这个作品吗？'}
            </p>
            
            <div className="flex gap-3">
              <button
                onClick={() => setShowDeleteConfirm(null)}
                disabled={deleting}
                className="flex-1 px-4 py-2.5 bg-white/5 text-white border border-white/10 rounded-xl hover:bg-white/10 transition-colors text-sm font-medium disabled:opacity-50"
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
                    ? 'bg-pink-500 text-white hover:bg-pink-600' 
                    : 'bg-red-500 text-white hover:bg-red-600'
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
    <div className="group relative bg-gradient-to-br from-pink-500/5 to-purple-500/5 rounded-xl overflow-hidden border border-pink-500/20 hover:border-pink-500/40 transition-all">
      {/* 头像区域 - 正方形 */}
      <div className="aspect-square bg-gradient-to-br from-pink-500/10 to-purple-500/10 flex items-center justify-center">
        {card.avatarUrl ? (
          <img
            src={card.avatarUrl}
            alt={card.characterName}
            className="w-full h-full object-cover"
          />
        ) : (
          <User className="w-16 h-16 text-pink-400/30" />
        )}
      </div>

      {/* 角色卡标识 */}
      <div className="absolute top-2 right-2">
        <span className="px-2 py-1 bg-gradient-to-r from-pink-500/80 to-purple-500/80 backdrop-blur-sm text-white text-[10px] rounded-md flex items-center gap-1">
          <User className="w-3 h-3" />
          角色卡
        </span>
      </div>

      {/* 信息区域 */}
      <div className="p-3 bg-gradient-to-t from-black/60 to-transparent absolute bottom-0 left-0 right-0">
        <h3 className="text-sm font-medium text-white truncate">
          {card.characterName || '未命名角色'}
        </h3>
        <p className="text-[10px] text-white/50 mt-1">{formatDate(card.createdAt)}</p>
      </div>

      {/* Hover 效果 */}
      <div className="absolute inset-0 bg-gradient-to-br from-pink-500/20 to-purple-500/20 opacity-0 group-hover:opacity-100 transition-all flex items-center justify-center">
        <div className="w-12 h-12 bg-white/20 backdrop-blur-sm rounded-full flex items-center justify-center">
          <User className="w-5 h-5 text-white" />
        </div>
      </div>
    </div>
  );
}
