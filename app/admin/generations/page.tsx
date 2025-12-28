'use client';

import { useState, useEffect, useCallback } from 'react';
import { History, Trash2, Search, Loader2, Eye } from 'lucide-react';
import { formatDate, cn } from '@/lib/utils';

interface GenerationRecord {
  id: string;
  userId: string;
  userEmail: string;
  userName: string;
  type: string;
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
  { value: 'gitee-image', label: 'Gitee 图像' },
];

const STATUS_OPTIONS = [
  { value: '', label: '全部状态' },
  { value: 'completed', label: '已完成' },
  { value: 'pending', label: '等待中' },
  { value: 'processing', label: '处理中' },
  { value: 'failed', label: '失败' },
];

export default function GenerationsPage() {
  const [records, setRecords] = useState<GenerationRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  const loadRecords = useCallback(async (nextPage = 1, append = false) => {
    try {
      if (!append) setLoading(true);

      const params = new URLSearchParams();
      params.set('page', String(nextPage));
      params.set('limit', '50');
      if (typeFilter) params.set('type', typeFilter);
      if (statusFilter) params.set('status', statusFilter);

      const res = await fetch(`/api/admin/generations?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setRecords(prev => append ? [...prev, ...data.data] : data.data);
        setPage(data.page);
        setHasMore(data.hasMore);
        setTotal(data.total);
      }
    } catch (err) {
      console.error('Load generations failed:', err);
    } finally {
      setLoading(false);
    }
  }, [typeFilter, statusFilter]);

  useEffect(() => {
    loadRecords(1, false);
  }, [loadRecords]);

  const handleDelete = async (id: string) => {
    if (!confirm('确定删除此记录？')) return;
    
    try {
      const res = await fetch('/api/admin/generations', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      });
      if (res.ok) {
        setRecords(prev => prev.filter(r => r.id !== id));
        setTotal(prev => prev - 1);
      }
    } catch (err) {
      console.error('Delete failed:', err);
    }
  };

  const filteredRecords = search
    ? records.filter(r => 
        r.userEmail?.toLowerCase().includes(search.toLowerCase()) ||
        r.userName?.toLowerCase().includes(search.toLowerCase()) ||
        r.prompt?.toLowerCase().includes(search.toLowerCase())
      )
    : records;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-white/30" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-light text-white">生成记录</h1>
        <p className="text-white/50 mt-1">管理所有用户的生成历史 · 共 {total} 条</p>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="搜索用户或提示词..."
            className="w-full pl-11 pr-4 py-3 bg-white/[0.03] border border-white/10 rounded-xl text-white placeholder:text-white/30 focus:outline-none focus:border-white/20"
          />
        </div>
        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
          className="px-4 py-3 bg-white/[0.03] border border-white/10 rounded-xl text-white focus:outline-none focus:border-white/20"
        >
          {TYPE_OPTIONS.map(opt => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="px-4 py-3 bg-white/[0.03] border border-white/10 rounded-xl text-white focus:outline-none focus:border-white/20"
        >
          {STATUS_OPTIONS.map(opt => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
      </div>

      {/* Records Table */}
      <div className="bg-white/[0.03] border border-white/10 rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-white/10">
                <th className="text-left text-sm font-medium text-white/50 px-5 py-4">用户</th>
                <th className="text-left text-sm font-medium text-white/50 px-5 py-4">类型</th>
                <th className="text-left text-sm font-medium text-white/50 px-5 py-4 max-w-xs">提示词</th>
                <th className="text-center text-sm font-medium text-white/50 px-5 py-4">状态</th>
                <th className="text-right text-sm font-medium text-white/50 px-5 py-4">积分</th>
                <th className="text-right text-sm font-medium text-white/50 px-5 py-4">时间</th>
                <th className="text-right text-sm font-medium text-white/50 px-5 py-4">操作</th>
              </tr>
            </thead>
            <tbody>
              {filteredRecords.map((record) => (
                <tr key={record.id} className="border-b border-white/5 hover:bg-white/[0.02]">
                  <td className="px-5 py-4">
                    <div>
                      <p className="text-white font-medium">{record.userName || '-'}</p>
                      <p className="text-xs text-white/40">{record.userEmail}</p>
                    </div>
                  </td>
                  <td className="px-5 py-4">
                    <span className="px-2 py-1 text-xs rounded-full bg-white/10 text-white/70">
                      {record.type}
                    </span>
                  </td>
                  <td className="px-5 py-4 max-w-xs">
                    <p className="text-white/70 truncate" title={record.prompt}>
                      {record.prompt || '-'}
                    </p>
                  </td>
                  <td className="px-5 py-4 text-center">
                    <StatusBadge status={record.status} />
                  </td>
                  <td className="px-5 py-4 text-right text-red-400">-{record.cost}</td>
                  <td className="px-5 py-4 text-right text-white/50 text-sm">
                    {formatDate(record.createdAt)}
                  </td>
                  <td className="px-5 py-4 text-right">
                    <div className="flex items-center justify-end gap-2">
                      {record.resultUrl && (
                        <a
                          href={record.resultUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="p-2 text-white/40 hover:text-white hover:bg-white/10 rounded-lg transition-all"
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

        {filteredRecords.length === 0 && (
          <div className="text-center py-12 text-white/40">
            <History className="w-10 h-10 mx-auto mb-3 opacity-30" />
            <p>暂无记录</p>
          </div>
        )}
      </div>

      {hasMore && (
        <button
          onClick={() => loadRecords(page + 1, true)}
          className="w-full py-3 bg-white/[0.03] border border-white/10 text-white/60 rounded-xl hover:bg-white/[0.06] transition-all"
        >
          加载更多
        </button>
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
  };
  const labels: Record<string, string> = {
    completed: '完成',
    pending: '等待',
    processing: '处理中',
    failed: '失败',
  };

  return (
    <span className={cn('px-2 py-1 text-xs rounded-full border', styles[status] || styles.completed)}>
      {labels[status] || status}
    </span>
  );
}
