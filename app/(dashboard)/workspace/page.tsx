'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowUpDown, Check, Edit2, Loader2, Plus, Search, Trash2, X } from 'lucide-react';
import { toast } from '@/components/ui/toaster';
import { cn, formatDate } from '@/lib/utils';
import type { WorkspaceSummary } from '@/types';

type SortKey = 'updated' | 'created';
type SortOrder = 'asc' | 'desc';

const RENDER_INITIAL = 12;
const RENDER_BATCH = 12;

export default function WorkspaceListPage() {
  const router = useRouter();
  const [items, setItems] = useState<WorkspaceSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<SortKey>('updated');
  const [order, setOrder] = useState<SortOrder>('desc');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const [visibleCount, setVisibleCount] = useState(RENDER_INITIAL);
  const renderMoreRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const timer = setTimeout(() => setSearch(searchInput.trim()), 300);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const fetchWorkspaces = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (search) params.set('search', search);
      params.set('sort', sort);
      params.set('order', order);
      const res = await fetch(`/api/workspaces?${params.toString()}`);
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || '获取工作空间失败');
      }
      setItems(data.data || []);
    } catch (error) {
      toast({
        title: '加载失败',
        description: error instanceof Error ? error.message : '获取工作空间失败',
      });
    } finally {
      setLoading(false);
    }
  }, [order, search, sort]);

  useEffect(() => {
    fetchWorkspaces();
  }, [fetchWorkspaces]);

  useEffect(() => {
    setVisibleCount(RENDER_INITIAL);
  }, [search, sort, order]);

  useEffect(() => {
    setVisibleCount((prev) => {
      if (items.length === 0) return 0;
      if (prev === 0) return Math.min(RENDER_INITIAL, items.length);
      return Math.min(prev, items.length);
    });
  }, [items.length]);

  const visibleItems = useMemo(() => items.slice(0, visibleCount), [items, visibleCount]);
  const hasHiddenItems = visibleCount < items.length;

  useEffect(() => {
    if (!hasHiddenItems) return;
    const target = renderMoreRef.current;
    if (!target) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries[0].isIntersecting) return;
        setVisibleCount((prev) => Math.min(prev + RENDER_BATCH, items.length));
      },
      { rootMargin: '200px' }
    );
    observer.observe(target);
    return () => observer.disconnect();
  }, [hasHiddenItems, items.length]);

  const handleRenderMore = () => {
    setVisibleCount((prev) => Math.min(prev + RENDER_BATCH, items.length));
  };

  const handleCreate = async () => {
    try {
      const res = await fetch('/api/workspaces', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: '未命名工作空间' }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || '创建失败');
      }
      router.push(`/workspace/${data.data.id}`);
    } catch (error) {
      toast({
        title: '创建失败',
        description: error instanceof Error ? error.message : '创建工作空间失败',
      });
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('确定要删除这个工作空间吗？')) return;
    try {
      const res = await fetch(`/api/workspaces/${id}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || '删除失败');
      }
      setItems((prev) => prev.filter((item) => item.id !== id));
    } catch (error) {
      toast({
        title: '删除失败',
        description: error instanceof Error ? error.message : '删除工作空间失败',
      });
    }
  };

  const handleRename = async (id: string) => {
    const name = editingName.trim();
    if (!name) {
      toast({ title: '名称不能为空' });
      return;
    }
    try {
      const res = await fetch(`/api/workspaces/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || '重命名失败');
      }
      setItems((prev) =>
        prev.map((item) => (item.id === id ? { ...item, name, updatedAt: Date.now() } : item))
      );
      setEditingId(null);
      setEditingName('');
    } catch (error) {
      toast({
        title: '重命名失败',
        description: error instanceof Error ? error.message : '重命名失败',
      });
    }
  };

  const sortedLabel = useMemo(() => (sort === 'updated' ? '按最近更新' : '按创建时间'), [sort]);

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-extralight text-foreground">工作空间</h1>
          <p className="text-foreground/50 mt-1 font-light">创建可视化工作流并管理节点</p>
        </div>
        <button
          onClick={handleCreate}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-foreground text-background font-medium hover:bg-foreground/90 transition"
        >
          <Plus className="w-4 h-4" />
          新建工作空间
        </button>
      </div>

      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-foreground/30 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="搜索工作空间"
            className="w-full pl-9 pr-3 py-2.5 rounded-lg bg-card/60 border border-border/70 text-foreground placeholder:text-foreground/30 focus:outline-none focus:border-border"
          />
        </div>
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as SortKey)}
            className="w-full sm:w-auto px-3 py-2.5 rounded-lg bg-card/60 border border-border/70 text-foreground text-sm focus:outline-none focus:border-border"
          >
            <option value="updated">按最近更新</option>
            <option value="created">按创建时间</option>
          </select>
          <button
            onClick={() => setOrder((prev) => (prev === 'asc' ? 'desc' : 'asc'))}
            className="w-full sm:w-auto px-3 py-2.5 rounded-lg bg-card/60 border border-border/70 text-foreground/70 hover:text-foreground hover:border-border transition"
            title={`排序：${sortedLabel}`}
          >
            <ArrowUpDown className="w-4 h-4" />
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12 text-foreground/50">
          <Loader2 className="w-5 h-5 animate-spin mr-2" />
          加载中...
        </div>
      ) : items.length === 0 ? (
        <div className="text-center py-16 bg-card/60 border border-border/70 rounded-2xl">
          <p className="text-foreground/70">暂无工作空间</p>
          <p className="text-foreground/30 text-sm mt-1">点击“新建工作空间”开始创建</p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {visibleItems.map((item) => (
              <div
                key={item.id}
                className="bg-card/60 border border-border/70 rounded-2xl p-4 hover:border-border/70 transition"
              >
                <div className="flex items-start justify-between gap-3">
                  {editingId === item.id ? (
                    <div className="flex-1">
                      <input
                        value={editingName}
                        onChange={(e) => setEditingName(e.target.value)}
                        className="w-full px-3 py-2 rounded-lg bg-card/70 border border-border/70 text-foreground focus:outline-none focus:border-border"
                      />
                      <div className="flex items-center gap-2 mt-2">
                        <button
                          onClick={() => handleRename(item.id)}
                          className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded bg-foreground text-background hover:bg-foreground/90"
                        >
                          <Check className="w-3 h-3" />
                          保存
                        </button>
                        <button
                          onClick={() => {
                            setEditingId(null);
                            setEditingName('');
                          }}
                          className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded bg-card/70 text-foreground/60 hover:text-foreground"
                        >
                          <X className="w-3 h-3" />
                          取消
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex-1">
                      <button
                        onClick={() => router.push(`/workspace/${item.id}`)}
                        className="text-left"
                      >
                        <h3 className="text-foreground text-lg font-medium">{item.name}</h3>
                        <p className="text-foreground/40 text-xs mt-1">
                          最近更新：{formatDate(item.updatedAt)}
                        </p>
                      </button>
                    </div>
                  )}
                  {editingId !== item.id && (
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => {
                          setEditingId(item.id);
                          setEditingName(item.name);
                        }}
                        className="p-2 rounded-lg hover:bg-card/70 text-foreground/50 hover:text-foreground transition"
                        title="重命名"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleDelete(item.id)}
                        className={cn(
                          'p-2 rounded-lg hover:bg-red-500/10 text-foreground/50 hover:text-red-400 transition'
                        )}
                        title="删除"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
          {hasHiddenItems && (
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
        </>
      )}
    </div>
  );
}

