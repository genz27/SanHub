'use client';

import { useState, useEffect } from 'react';
import { Ticket, Plus, Trash2, Copy, Loader2, Check } from 'lucide-react';
import type { RedemptionCode } from '@/types';
import { formatDate } from '@/lib/utils';
import { toast } from '@/components/ui/toaster';
import { PaginationControls } from '@/components/admin/pagination';

const REDEMPTION_PAGE_SIZE = 50;

export default function RedemptionPage() {
  const [codes, setCodes] = useState<RedemptionCode[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetching, setFetching] = useState(false);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [showUsed, setShowUsed] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Create form
  const [count, setCount] = useState(10);
  const [points, setPoints] = useState(100);
  const [note, setNote] = useState('');

  useEffect(() => {
    loadCodes(1, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showUsed]);

  const loadCodes = async (nextPage = 1, reset = false) => {
    try {
      if (reset) {
        setLoading(true);
      } else {
        setFetching(true);
      }

      const params = new URLSearchParams();
      params.set('page', String(nextPage));
      params.set('limit', String(REDEMPTION_PAGE_SIZE));
      params.set('showUsed', String(showUsed));

      const res = await fetch(`/api/admin/redemption?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setCodes(data.data || []);
        setPage(data.page || nextPage);
        setTotal(data.total || 0);
      } else {
        const data = await res.json().catch(() => ({}));
        toast({ title: '加载失败', description: data.error || '无法获取卡密列表', variant: 'destructive' });
      }
    } catch (err) {
      toast({ title: '加载失败', description: err instanceof Error ? err.message : '无法获取卡密列表', variant: 'destructive' });
    } finally {
      setLoading(false);
      setFetching(false);
    }
  };

  const handleCreate = async () => {
    if (count < 1 || count > 100 || points < 1) return;

    try {
      setCreating(true);
      const res = await fetch('/api/admin/redemption', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ count, points, note: note || undefined }),
      });
      if (res.ok) {
        await res.json();
        toast({ title: '卡密已生成' });
        setPage(1);
        loadCodes(1, true);
        setShowCreate(false);
        setNote('');
      } else {
        const data = await res.json().catch(() => ({}));
        toast({ title: '生成失败', description: data.error || '无法生成卡密', variant: 'destructive' });
      }
    } catch (err) {
      toast({ title: '生成失败', description: err instanceof Error ? err.message : '无法生成卡密', variant: 'destructive' });
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('确定删除此卡密？')) return;

    try {
      const res = await fetch('/api/admin/redemption', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      });
      if (res.ok) {
        toast({ title: '卡密已删除' });
        const nextPage = codes.length === 1 && page > 1 ? page - 1 : page;
        loadCodes(nextPage, false);
      } else {
        const data = await res.json().catch(() => ({}));
        toast({ title: '删除失败', description: data.error || '无法删除卡密', variant: 'destructive' });
      }
    } catch (err) {
      toast({ title: '删除失败', description: err instanceof Error ? err.message : '无法删除卡密', variant: 'destructive' });
    }
  };

  const copyCode = async (code: string, id: string) => {
    try {
      await navigator.clipboard.writeText(code);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
      toast({ title: '已复制卡密' });
    } catch (err) {
      toast({ title: '复制失败', description: err instanceof Error ? err.message : '无法复制卡密', variant: 'destructive' });
    }
  };

  const copyAllCodes = async () => {
    const unused = codes.filter(c => !c.usedBy);
    const unusedCodes = unused.map(c => c.code).join('\n');
    if (!unusedCodes) {
      toast({ title: '没有可复制的卡密', variant: 'destructive' });
      return;
    }
    try {
      await navigator.clipboard.writeText(unusedCodes);
      toast({ title: `已复制 ${unused.length} 个未使用卡密` });
    } catch (err) {
      toast({ title: '复制失败', description: err instanceof Error ? err.message : '无法复制卡密', variant: 'destructive' });
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
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-light text-foreground">卡密管理</h1>
          <p className="text-foreground/50 mt-1">生成和管理积分兑换卡密 · 共 {total} 条</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 text-sm text-foreground/60">
            <input
              type="checkbox"
              checked={showUsed}
              onChange={(e) => setShowUsed(e.target.checked)}
              className="rounded border-border/70"
            />
            显示已使用
          </label>
          <button
            onClick={copyAllCodes}
            className="px-4 py-2 bg-card/60 border border-border/70 text-foreground rounded-xl hover:bg-card/70 transition-all"
          >
            复制本页
          </button>
          <button
            onClick={() => setShowCreate(true)}
            className="flex items-center gap-2 px-4 py-2 bg-foreground text-background rounded-xl hover:bg-foreground/90 transition-all"
          >
            <Plus className="w-4 h-4" />
            生成卡密
          </button>
        </div>
      </div>

      {/* Create Modal */}
      {showCreate && (
        <div className="fixed inset-0 bg-background/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-card/95 border border-border/70 rounded-2xl p-6 w-full max-w-md">
            <h2 className="text-xl font-semibold text-foreground mb-4">生成卡密</h2>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm text-foreground/60 mb-2">数量 (1-100)</label>
                <input
                  type="number"
                  value={count}
                  onChange={(e) => setCount(Math.min(100, Math.max(1, Number(e.target.value))))}
                  min={1}
                  max={100}
                  className="w-full px-4 py-3 bg-card/60 border border-border/70 rounded-xl text-foreground focus:outline-none focus:border-border/70"
                />
              </div>
              <div>
                <label className="block text-sm text-foreground/60 mb-2">积分数量</label>
                <input
                  type="number"
                  value={points}
                  onChange={(e) => setPoints(Math.max(1, Number(e.target.value)))}
                  min={1}
                  className="w-full px-4 py-3 bg-card/60 border border-border/70 rounded-xl text-foreground focus:outline-none focus:border-border/70"
                />
              </div>
              <div>
                <label className="block text-sm text-foreground/60 mb-2">备注 (可选)</label>
                <input
                  type="text"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="如：活动赠送"
                  className="w-full px-4 py-3 bg-card/60 border border-border/70 rounded-xl text-foreground placeholder:text-foreground/30 focus:outline-none focus:border-border/70"
                />
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={() => setShowCreate(false)}
                className="flex-1 py-3 bg-card/60 border border-border/70 text-foreground rounded-xl hover:bg-card/70 transition-all"
              >
                取消
              </button>
              <button
                onClick={handleCreate}
                disabled={creating}
                className="flex-1 py-3 bg-foreground text-background rounded-xl hover:bg-foreground/90 disabled:opacity-50 transition-all"
              >
                {creating ? <Loader2 className="w-5 h-5 animate-spin mx-auto" /> : '生成'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Codes Table */}
      <div className="bg-card/60 border border-border/70 rounded-2xl overflow-hidden">
        <div className="overflow-x-auto no-scrollbar">
          <table className="w-full min-w-[760px]">
            <thead>
              <tr className="border-b border-border/70">
                <th className="text-left text-sm font-medium text-foreground/50 px-5 py-4">卡密</th>
                <th className="text-right text-sm font-medium text-foreground/50 px-5 py-4">积分</th>
                <th className="text-left text-sm font-medium text-foreground/50 px-5 py-4">备注</th>
                <th className="text-center text-sm font-medium text-foreground/50 px-5 py-4">状态</th>
                <th className="text-right text-sm font-medium text-foreground/50 px-5 py-4">创建时间</th>
                <th className="text-right text-sm font-medium text-foreground/50 px-5 py-4">操作</th>
              </tr>
            </thead>
            <tbody>
              {codes.map((code) => (
                <tr key={code.id} className="border-b border-border/70 hover:bg-card/60">
                  <td className="px-5 py-4">
                    <code className="font-mono text-foreground bg-card/60 px-2 py-1 rounded">
                      {code.code}
                    </code>
                  </td>
                  <td className="px-5 py-4 text-right text-green-400 font-semibold">
                    +{code.points}
                  </td>
                  <td className="px-5 py-4 text-foreground/50">{code.note || '-'}</td>
                  <td className="px-5 py-4 text-center">
                    {code.usedBy ? (
                      <span className="px-2 py-1 text-xs rounded-full bg-card/70 text-foreground/50">
                        已使用
                      </span>
                    ) : (
                      <span className="px-2 py-1 text-xs rounded-full bg-green-500/20 text-green-400 border border-green-500/30">
                        可用
                      </span>
                    )}
                  </td>
                  <td className="px-5 py-4 text-right text-foreground/50 text-sm">
                    {formatDate(code.createdAt)}
                  </td>
                  <td className="px-5 py-4 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        onClick={() => copyCode(code.code, code.id)}
                        className="p-2 text-foreground/40 hover:text-foreground hover:bg-card/70 rounded-lg transition-all"
                      >
                        {copiedId === code.id ? (
                          <Check className="w-4 h-4 text-green-400" />
                        ) : (
                          <Copy className="w-4 h-4" />
                        )}
                      </button>
                      {!code.usedBy && (
                        <button
                          onClick={() => handleDelete(code.id)}
                          className="p-2 text-red-400/60 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-all"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {codes.length === 0 && (
          <div className="text-center py-12 text-foreground/40">
            <Ticket className="w-10 h-10 mx-auto mb-3 opacity-30" />
            <p>暂无卡密</p>
          </div>
        )}
      </div>

      {total > 0 && (
        <PaginationControls
          page={page}
          pageSize={REDEMPTION_PAGE_SIZE}
          total={total}
          onPageChange={(nextPage) => loadCodes(nextPage, false)}
          loading={fetching}
        />
      )}
    </div>
  );
}

