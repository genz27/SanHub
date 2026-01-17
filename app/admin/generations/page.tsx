'use client';

import { useState, useEffect, useCallback } from 'react';
import { History, Trash2, Search, Loader2, Eye } from 'lucide-react';
import { formatDate, cn } from '@/lib/utils';
import { IMAGE_MODELS } from '@/lib/model-config';
import { toast } from '@/components/ui/toaster';
import { PaginationControls } from '@/components/admin/pagination';

const GENERATIONS_PAGE_SIZE = 50;

interface GenerationRecord {
  id: string;
  userId: string;
  userEmail: string;
  userName: string;
  type: string;
  params?: { model?: string };
  prompt: string;
  resultUrl: string;
  cost: number;
  status: string;
  createdAt: number;
}

const TYPE_OPTIONS = [
  { value: '', label: '全部类型' },
  { value: 'sora-video', label: '视频' },
  { value: 'sora-image', label: 'Sora 图像' },
  { value: 'gemini-image', label: 'Gemini 图像' },
  { value: 'zimage-image', label: 'Z-Image 图像' },
  { value: 'gitee-image', label: 'Gitee 图像' },
];

const STATUS_OPTIONS = [
  { value: '', label: '全部状态' },
  { value: 'completed', label: '已完成' },
  { value: 'pending', label: '等待中' },
  { value: 'processing', label: '处理中' },
  { value: 'failed', label: '失败' },
  { value: 'cancelled', label: '已取消' },
];

const IMAGE_MODEL_LABELS = new Map(
  IMAGE_MODELS.map((model) => [model.apiModel, model.name])
);

const TYPE_LABELS: Record<string, string> = {
  'sora-video': '视频',
  'sora-image': 'Sora 图像',
  'gemini-image': 'Gemini 图像',
  'zimage-image': 'Z-Image 图像',
  'gitee-image': 'Gitee 图像',
};

function getRecordTypeLabel(record: GenerationRecord): string {
  if (
    record.type === 'gemini-image' ||
    record.type === 'zimage-image' ||
    record.type === 'gitee-image'
  ) {
    const modelLabel = record.params?.model
      ? IMAGE_MODEL_LABELS.get(record.params.model)
      : undefined;
    if (modelLabel) return modelLabel;
  }

  return TYPE_LABELS[record.type] || record.type;
}

export default function GenerationsPage() {
  const [records, setRecords] = useState<GenerationRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetching, setFetching] = useState(false);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  const loadRecords = useCallback(async (nextPage = 1, reset = false) => {
    try {
      if (reset) {
        setLoading(true);
      } else {
        setFetching(true);
      }

      const params = new URLSearchParams();
      params.set('page', String(nextPage));
      params.set('limit', String(GENERATIONS_PAGE_SIZE));
      if (typeFilter) params.set('type', typeFilter);
      if (statusFilter) params.set('status', statusFilter);
      if (search.trim()) params.set('q', search.trim());

      const res = await fetch(`/api/admin/generations?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setRecords(data.data || []);
        setPage(data.page || nextPage);
        setTotal(data.total || 0);
      } else {
        const data = await res.json().catch(() => ({}));
        toast({ title: '加载失败', description: data.error || '无法获取生成记录', variant: 'destructive' });
      }
    } catch (err) {
      toast({ title: '加载失败', description: err instanceof Error ? err.message : '无法获取生成记录', variant: 'destructive' });
    } finally {
      setLoading(false);
      setFetching(false);
    }
  }, [search, statusFilter, typeFilter]);

  useEffect(() => {
    const handle = setTimeout(() => {
      loadRecords(1, true);
    }, 300);
    return () => clearTimeout(handle);
  }, [loadRecords, search, statusFilter, typeFilter]);

  const handleDelete = async (id: string) => {
    if (!confirm('确定删除此记录？')) return;
    
    try {
      const res = await fetch('/api/admin/generations', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      });
      if (res.ok) {
        toast({ title: '记录已删除' });
        const nextPage = records.length === 1 && page > 1 ? page - 1 : page;
        loadRecords(nextPage, false);
      } else {
        const data = await res.json().catch(() => ({}));
        toast({ title: '删除失败', description: data.error || '无法删除记录', variant: 'destructive' });
      }
    } catch (err) {
      toast({ title: '删除失败', description: err instanceof Error ? err.message : '无法删除记录', variant: 'destructive' });
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-foreground/30" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-light text-foreground">生成记录</h1>
        <p className="text-foreground/50 mt-1">管理所有用户的生成历史 · 共 {total} 条</p>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-foreground/40" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="搜索用户或提示词..."
            className="w-full pl-11 pr-4 py-3 bg-card/60 border border-border/70 rounded-xl text-foreground placeholder:text-foreground/30 focus:outline-none focus:border-border/70"
          />
        </div>
        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
          className="px-4 py-3 bg-card/60 border border-border/70 rounded-xl text-foreground focus:outline-none focus:border-border/70"
        >
          {TYPE_OPTIONS.map(opt => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="px-4 py-3 bg-card/60 border border-border/70 rounded-xl text-foreground focus:outline-none focus:border-border/70"
        >
          {STATUS_OPTIONS.map(opt => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
      </div>

      {/* Records Table */}
      <div className="bg-card/60 border border-border/70 rounded-2xl overflow-hidden">
        <div className="overflow-x-auto no-scrollbar">
          <table className="w-full min-w-[760px]">
            <thead>
              <tr className="border-b border-border/70">
                <th className="text-left text-sm font-medium text-foreground/50 px-5 py-4">用户</th>
                <th className="text-left text-sm font-medium text-foreground/50 px-5 py-4">类型</th>
                <th className="text-left text-sm font-medium text-foreground/50 px-5 py-4 max-w-xs">提示词</th>
                <th className="text-center text-sm font-medium text-foreground/50 px-5 py-4">状态</th>
                <th className="text-right text-sm font-medium text-foreground/50 px-5 py-4">积分</th>
                <th className="text-right text-sm font-medium text-foreground/50 px-5 py-4">时间</th>
                <th className="text-right text-sm font-medium text-foreground/50 px-5 py-4">操作</th>
              </tr>
            </thead>
            <tbody>
              {records.map((record) => (
                <tr key={record.id} className="border-b border-border/70 hover:bg-card/60">
                  <td className="px-5 py-4">
                    <div>
                      <p className="text-foreground font-medium">{record.userName || '-'}</p>
                      <p className="text-xs text-foreground/40">{record.userEmail}</p>
                    </div>
                  </td>
                  <td className="px-5 py-4">
                    <span className="px-2 py-1 text-xs rounded-full bg-card/70 text-foreground/70">
                      {getRecordTypeLabel(record)}
                    </span>
                  </td>
                  <td className="px-5 py-4 max-w-xs">
                    <p className="text-foreground/70 truncate" title={record.prompt}>
                      {record.prompt || '-'}
                    </p>
                  </td>
                  <td className="px-5 py-4 text-center">
                    <StatusBadge status={record.status} />
                  </td>
                  <td className="px-5 py-4 text-right text-red-400">-{record.cost}</td>
                  <td className="px-5 py-4 text-right text-foreground/50 text-sm">
                    {formatDate(record.createdAt)}
                  </td>
                  <td className="px-5 py-4 text-right">
                    <div className="flex items-center justify-end gap-2">
                      {record.resultUrl && (
                        <a
                          href={record.resultUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="p-2 text-foreground/40 hover:text-foreground hover:bg-card/70 rounded-lg transition-all"
                        >
                          <Eye className="w-4 h-4" />
                        </a>
                      )}
                      <button
                        onClick={() => handleDelete(record.id)}
                        className="p-2 text-red-400/60 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-all"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {records.length === 0 && (
          <div className="text-center py-12 text-foreground/40">
            <History className="w-10 h-10 mx-auto mb-3 opacity-30" />
            <p>暂无记录</p>
          </div>
        )}
      </div>

      {total > 0 && (
        <PaginationControls
          page={page}
          pageSize={GENERATIONS_PAGE_SIZE}
          total={total}
          onPageChange={(nextPage) => loadRecords(nextPage, false)}
          loading={fetching}
        />
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    completed: 'bg-green-500/20 text-green-400 border-green-500/30',
    pending: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
    processing: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
    failed: 'bg-red-500/20 text-red-400 border-red-500/30',
    cancelled: 'bg-card/70 text-foreground/50 border-border/70',
  };
  const labels: Record<string, string> = {
    completed: '完成',
    pending: '等待',
    processing: '处理中',
    failed: '失败',
    cancelled: '取消',
  };

  return (
    <span className={cn('px-2 py-1 text-xs rounded-full border', styles[status] || styles.completed)}>
      {labels[status] || status}
    </span>
  );
}

