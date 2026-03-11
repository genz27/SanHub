'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  CalendarClock,
  Check,
  Copy,
  Download,
  FilterX,
  Layers,
  Loader2,
  Plus,
  Ticket,
  Trash2,
} from 'lucide-react';
import type { RedemptionBatchResult, RedemptionBatchSummary, RedemptionCode } from '@/types';
import { formatDate } from '@/lib/utils';
import { toast } from '@/components/ui/toaster';
import { PaginationControls } from '@/components/admin/pagination';

const REDEMPTION_PAGE_SIZE = 50;
const DAY_IN_MS = 24 * 60 * 60 * 1000;

type RedemptionResponse = {
  data?: RedemptionCode[];
  total?: number;
  page?: number;
  recentBatches?: RedemptionBatchSummary[];
};

type RedemptionCreateResponse = {
  data?: RedemptionCode[];
  batch?: RedemptionBatchResult | null;
};

function getExpiryTimestamp(days: number): number | undefined {
  if (days <= 0) return undefined;
  return Date.now() + days * DAY_IN_MS;
}

function formatExpiry(expiresAt?: number): string {
  if (!expiresAt) return '永久有效';
  if (expiresAt < Date.now()) return `已过期 · ${formatDate(expiresAt)}`;
  return formatDate(expiresAt);
}

function getExportableCodes(codes: RedemptionCode[]): RedemptionCode[] {
  const unused = codes.filter((code) => !code.usedBy);
  return unused.length > 0 ? unused : codes;
}

function buildExportContent(codes: RedemptionCode[]): string {
  return codes
    .map((code) => {
      const status = code.usedBy ? 'USED' : code.expiresAt && code.expiresAt < Date.now() ? 'EXPIRED' : 'AVAILABLE';
      return [
        code.code,
        `points=${code.points}`,
        `batch=${code.batchId || '-'}`,
        `status=${status}`,
        `expiresAt=${code.expiresAt || '-'}`,
        `note=${code.note || '-'}`,
      ].join(', ');
    })
    .join('\n');
}

function downloadTextFile(filename: string, content: string) {
  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}

export default function RedemptionPage() {
  const [codes, setCodes] = useState<RedemptionCode[]>([]);
  const [recentBatches, setRecentBatches] = useState<RedemptionBatchSummary[]>([]);
  const [latestBatch, setLatestBatch] = useState<RedemptionBatchResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [fetching, setFetching] = useState(false);
  const [creating, setCreating] = useState(false);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [showUsed, setShowUsed] = useState(false);
  const [activeBatchId, setActiveBatchId] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [deletingBatchId, setDeletingBatchId] = useState<string | null>(null);

  const [count, setCount] = useState(10);
  const [points, setPoints] = useState(100);
  const [note, setNote] = useState('');
  const [expiresInDays, setExpiresInDays] = useState(0);

  const viewLabel = activeBatchId ? `批次 ${activeBatchId.slice(0, 8)}` : '全部卡密';
  const exportableCurrentCodes = useMemo(() => getExportableCodes(codes), [codes]);
  const exportableLatestCodes = useMemo(
    () => getExportableCodes(latestBatch?.codes || []),
    [latestBatch]
  );

  const loadCodes = async (nextPage = 1, reset = false, batchId = activeBatchId) => {
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
      if (batchId) {
        params.set('batchId', batchId);
      }

      const res = await fetch(`/api/admin/redemption?${params.toString()}`);
      const data = (await res.json().catch(() => ({}))) as RedemptionResponse & { error?: string };
      if (!res.ok) {
        throw new Error(data.error || '无法获取卡密列表');
      }

      setCodes(data.data || []);
      setRecentBatches(data.recentBatches || []);
      setPage(data.page || nextPage);
      setTotal(data.total || 0);
    } catch (err) {
      toast({
        title: '加载失败',
        description: err instanceof Error ? err.message : '无法获取卡密列表',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
      setFetching(false);
    }
  };

  useEffect(() => {
    void loadCodes(1, true, activeBatchId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showUsed, activeBatchId]);

  const resetCreateForm = () => {
    setCount(10);
    setPoints(100);
    setNote('');
    setExpiresInDays(0);
  };

  const handleCreate = async () => {
    if (count < 1 || count > 100 || points < 1) return;

    try {
      setCreating(true);
      const expiresAt = getExpiryTimestamp(expiresInDays);
      const res = await fetch('/api/admin/redemption', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          count,
          points,
          note: note.trim() || undefined,
          expiresAt,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as RedemptionCreateResponse & { error?: string };
      if (!res.ok) {
        throw new Error(data.error || '无法生成卡密');
      }

      if (data.batch) {
        setLatestBatch(data.batch);
        setActiveBatchId(data.batch.batchId);
        toast({
          title: '卡密已生成',
          description: `已生成 ${data.batch.count} 个卡密，可直接导出最近批次。`,
        });
      } else {
        toast({ title: '卡密已生成' });
      }

      setShowCreate(false);
      resetCreateForm();
      await loadCodes(1, true, data.batch?.batchId || activeBatchId);
    } catch (err) {
      toast({
        title: '生成失败',
        description: err instanceof Error ? err.message : '无法生成卡密',
        variant: 'destructive',
      });
    } finally {
      setCreating(false);
    }
  };

  const handleDeleteCode = async (id: string) => {
    if (!confirm('确定删除这条卡密吗？')) return;

    try {
      const res = await fetch('/api/admin/redemption', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error((data as { error?: string }).error || '无法删除卡密');
      }
      toast({ title: '卡密已删除' });
      const nextPage = codes.length === 1 && page > 1 ? page - 1 : page;
      await loadCodes(nextPage, false);
    } catch (err) {
      toast({
        title: '删除失败',
        description: err instanceof Error ? err.message : '无法删除卡密',
        variant: 'destructive',
      });
    }
  };

  const handleDeleteBatch = async (batchId: string) => {
    if (!confirm('确定删除这个批次里所有未使用卡密吗？已使用的记录会保留。')) return;

    try {
      setDeletingBatchId(batchId);
      const res = await fetch('/api/admin/redemption', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ batchId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error((data as { error?: string }).error || '无法删除批次');
      }

      const deleted = Number((data as { deleted?: number }).deleted || 0);
      if (activeBatchId === batchId && deleted > 0) {
        setActiveBatchId(null);
      }
      toast({
        title: '批次已清理',
        description: `已删除 ${deleted} 个未使用卡密。`,
      });
      await loadCodes(1, true, activeBatchId === batchId ? null : activeBatchId);
    } catch (err) {
      toast({
        title: '批次删除失败',
        description: err instanceof Error ? err.message : '无法删除批次',
        variant: 'destructive',
      });
    } finally {
      setDeletingBatchId(null);
    }
  };

  const copyCode = async (code: string, id: string) => {
    try {
      await navigator.clipboard.writeText(code);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
      toast({ title: '已复制卡密' });
    } catch (err) {
      toast({
        title: '复制失败',
        description: err instanceof Error ? err.message : '无法复制卡密',
        variant: 'destructive',
      });
    }
  };

  const copyCodes = async (targetCodes: RedemptionCode[], emptyMessage: string, successTitle: string) => {
    if (targetCodes.length === 0) {
      toast({ title: emptyMessage, variant: 'destructive' });
      return;
    }

    try {
      await navigator.clipboard.writeText(targetCodes.map((code) => code.code).join('\n'));
      toast({ title: successTitle, description: `共 ${targetCodes.length} 条` });
    } catch (err) {
      toast({
        title: '复制失败',
        description: err instanceof Error ? err.message : '无法复制卡密',
        variant: 'destructive',
      });
    }
  };

  const exportCodes = (targetCodes: RedemptionCode[], prefix: string) => {
    if (targetCodes.length === 0) {
      toast({ title: '没有可导出的卡密', variant: 'destructive' });
      return;
    }
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    downloadTextFile(`${prefix}-${timestamp}.txt`, buildExportContent(targetCodes));
    toast({ title: '导出已开始', description: `共 ${targetCodes.length} 条` });
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
      <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
        <div>
          <h1 className="text-3xl font-light text-foreground">卡密管理</h1>
          <p className="text-foreground/50 mt-1">按批次生成、查看和导出积分卡密，当前查看：{viewLabel}</p>
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
          {activeBatchId && (
            <button
              onClick={() => setActiveBatchId(null)}
              className="inline-flex items-center gap-2 px-4 py-2 bg-card/60 border border-border/70 text-foreground rounded-xl hover:bg-card/70 transition-all"
            >
              <FilterX className="w-4 h-4" />
              清除批次筛选
            </button>
          )}
          <button
            onClick={() => copyCodes(exportableCurrentCodes, '当前列表没有可复制内容', '已复制当前列表')}
            className="inline-flex items-center gap-2 px-4 py-2 bg-card/60 border border-border/70 text-foreground rounded-xl hover:bg-card/70 transition-all"
          >
            <Copy className="w-4 h-4" />
            复制当前列表
          </button>
          <button
            onClick={() => exportCodes(exportableCurrentCodes, 'redemption-list')}
            className="inline-flex items-center gap-2 px-4 py-2 bg-card/60 border border-border/70 text-foreground rounded-xl hover:bg-card/70 transition-all"
          >
            <Download className="w-4 h-4" />
            导出当前列表
          </button>
          <button
            onClick={() => setShowCreate(true)}
            className="inline-flex items-center gap-2 px-4 py-2 bg-foreground text-background rounded-xl hover:bg-foreground/90 transition-all"
          >
            <Plus className="w-4 h-4" />
            生成卡密
          </button>
        </div>
      </div>

      {latestBatch && (
        <div className="bg-card/60 border border-border/70 rounded-2xl p-5 space-y-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <p className="text-sm text-foreground/50">最近生成结果</p>
              <h2 className="text-xl font-medium text-foreground mt-1">
                {latestBatch.count} 个卡密 · 每个 {latestBatch.points} 积分
              </h2>
              <div className="flex flex-wrap items-center gap-2 text-sm text-foreground/50 mt-2">
                <span>批次号 {latestBatch.batchId.slice(0, 8)}</span>
                <span>·</span>
                <span>{formatDate(latestBatch.createdAt)}</span>
                <span>·</span>
                <span>{formatExpiry(latestBatch.expiresAt)}</span>
                {latestBatch.note && (
                  <>
                    <span>·</span>
                    <span>{latestBatch.note}</span>
                  </>
                )}
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => copyCodes(exportableLatestCodes, '最近批次没有可复制卡密', '已复制最近批次')}
                className="inline-flex items-center gap-2 px-4 py-2 bg-card/70 border border-border/70 text-foreground rounded-xl hover:bg-card/80"
              >
                <Copy className="w-4 h-4" />
                复制最近批次
              </button>
              <button
                onClick={() => exportCodes(exportableLatestCodes, `redemption-batch-${latestBatch.batchId.slice(0, 8)}`)}
                className="inline-flex items-center gap-2 px-4 py-2 bg-card/70 border border-border/70 text-foreground rounded-xl hover:bg-card/80"
              >
                <Download className="w-4 h-4" />
                导出最近批次
              </button>
              <button
                onClick={() => setActiveBatchId(latestBatch.batchId)}
                className="inline-flex items-center gap-2 px-4 py-2 bg-foreground text-background rounded-xl hover:bg-foreground/90"
              >
                <Layers className="w-4 h-4" />
                仅看这一批
              </button>
            </div>
          </div>
          <p className="text-xs text-foreground/40">
            复制和导出默认优先取未使用卡密；如果该结果里全部已使用，则导出完整列表。
          </p>
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-[320px_minmax(0,1fr)] gap-6">
        <div className="bg-card/60 border border-border/70 rounded-2xl p-5 space-y-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-sky-500/15 flex items-center justify-center">
              <Layers className="w-5 h-5 text-sky-300" />
            </div>
            <div>
              <h2 className="text-lg font-medium text-foreground">最近批次</h2>
              <p className="text-sm text-foreground/50">快速查看、筛选或清理未使用卡密</p>
            </div>
          </div>

          {recentBatches.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border/70 p-6 text-sm text-foreground/40 text-center">
              还没有生成批次
            </div>
          ) : (
            <div className="space-y-3 max-h-[520px] overflow-y-auto pr-1">
              {recentBatches.map((batch) => {
                const isActive = activeBatchId === batch.batchId;
                return (
                  <div
                    key={batch.batchId}
                    className={`rounded-2xl border p-4 transition-all ${
                      isActive ? 'border-sky-500/50 bg-sky-500/10' : 'border-border/70 bg-card/50'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-medium text-foreground">批次 {batch.batchId.slice(0, 8)}</p>
                        <p className="text-sm text-foreground/50 mt-1">
                          {batch.count} 个，总计 {batch.points} 积分/个
                        </p>
                      </div>
                      <span className="px-2 py-1 rounded-full text-xs border border-border/70 text-foreground/60">
                        未用 {batch.unusedCount}
                      </span>
                    </div>
                    <div className="mt-3 space-y-1 text-xs text-foreground/45">
                      <p>生成时间：{formatDate(batch.createdAt)}</p>
                      <p>有效期：{formatExpiry(batch.expiresAt)}</p>
                      <p>备注：{batch.note || '无备注'}</p>
                    </div>
                    <div className="mt-4 flex flex-wrap gap-2">
                      <button
                        onClick={() => setActiveBatchId(isActive ? null : batch.batchId)}
                        className="px-3 py-2 rounded-xl bg-card/70 border border-border/70 text-sm text-foreground hover:bg-card/80"
                      >
                        {isActive ? '取消查看' : '查看批次'}
                      </button>
                      <button
                        onClick={() => handleDeleteBatch(batch.batchId)}
                        disabled={batch.unusedCount === 0 || deletingBatchId === batch.batchId}
                        className="px-3 py-2 rounded-xl bg-red-500/10 border border-red-500/20 text-sm text-red-300 hover:bg-red-500/20 disabled:opacity-40"
                      >
                        {deletingBatchId === batch.batchId ? '清理中...' : '删除未使用'}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="space-y-4">
          <div className="bg-card/60 border border-border/70 rounded-2xl p-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-lg font-medium text-foreground">卡密列表</h2>
              <p className="text-sm text-foreground/50">
                {activeBatchId ? `当前仅显示批次 ${activeBatchId.slice(0, 8)} 的记录` : `当前共 ${total} 条记录`}
              </p>
            </div>
            <div className="text-sm text-foreground/45">本页优先展示最新记录，支持分页浏览</div>
          </div>

          <div className="bg-card/60 border border-border/70 rounded-2xl overflow-hidden">
            <div className="overflow-x-auto no-scrollbar">
              <table className="w-full min-w-[1040px]">
                <thead>
                  <tr className="border-b border-border/70">
                    <th className="text-left text-sm font-medium text-foreground/50 px-5 py-4">卡密</th>
                    <th className="text-left text-sm font-medium text-foreground/50 px-5 py-4">批次</th>
                    <th className="text-right text-sm font-medium text-foreground/50 px-5 py-4">积分</th>
                    <th className="text-left text-sm font-medium text-foreground/50 px-5 py-4">备注</th>
                    <th className="text-left text-sm font-medium text-foreground/50 px-5 py-4">有效期</th>
                    <th className="text-center text-sm font-medium text-foreground/50 px-5 py-4">状态</th>
                    <th className="text-left text-sm font-medium text-foreground/50 px-5 py-4">时间</th>
                    <th className="text-right text-sm font-medium text-foreground/50 px-5 py-4">操作</th>
                  </tr>
                </thead>
                <tbody>
                  {codes.map((code) => {
                    const isExpired = Boolean(code.expiresAt && code.expiresAt < Date.now() && !code.usedBy);
                    return (
                      <tr key={code.id} className="border-b border-border/70 hover:bg-card/60 align-top">
                        <td className="px-5 py-4">
                          <code className="font-mono text-foreground bg-card/60 px-2 py-1 rounded">{code.code}</code>
                        </td>
                        <td className="px-5 py-4 text-sm text-foreground/60">{code.batchId ? code.batchId.slice(0, 8) : '-'}</td>
                        <td className="px-5 py-4 text-right text-green-400 font-semibold">+{code.points}</td>
                        <td className="px-5 py-4 text-foreground/60">{code.note || '无备注'}</td>
                        <td className="px-5 py-4 text-sm text-foreground/50">{formatExpiry(code.expiresAt)}</td>
                        <td className="px-5 py-4 text-center">
                          {code.usedBy ? (
                            <span className="px-2 py-1 text-xs rounded-full bg-card/70 text-foreground/50">已使用</span>
                          ) : isExpired ? (
                            <span className="px-2 py-1 text-xs rounded-full bg-amber-500/15 text-amber-300 border border-amber-500/20">已过期</span>
                          ) : (
                            <span className="px-2 py-1 text-xs rounded-full bg-green-500/20 text-green-400 border border-green-500/30">可发放</span>
                          )}
                        </td>
                        <td className="px-5 py-4 text-sm text-foreground/50">
                          <div>{formatDate(code.createdAt)}</div>
                          {code.usedAt && <div className="text-xs text-foreground/35 mt-1">使用于 {formatDate(code.usedAt)}</div>}
                        </td>
                        <td className="px-5 py-4 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <button
                              onClick={() => copyCode(code.code, code.id)}
                              className="p-2 text-foreground/40 hover:text-foreground hover:bg-card/70 rounded-lg transition-all"
                              title="复制卡密"
                            >
                              {copiedId === code.id ? <Check className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4" />}
                            </button>
                            {!code.usedBy && !isExpired && (
                              <button
                                onClick={() => handleDeleteCode(code.id)}
                                className="p-2 text-red-400/60 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-all"
                                title="删除卡密"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {codes.length === 0 && (
              <div className="text-center py-12 text-foreground/40">
                <Ticket className="w-10 h-10 mx-auto mb-3 opacity-30" />
                <p>{activeBatchId ? '这个批次下暂无符合条件的卡密' : '暂无卡密'}</p>
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
      </div>

      {showCreate && (
        <div className="fixed inset-0 bg-background/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-card/95 border border-border/70 rounded-2xl p-6 w-full max-w-md">
            <h2 className="text-xl font-semibold text-foreground mb-4">生成卡密</h2>

            <div className="space-y-4">
              <div>
                <label className="block text-sm text-foreground/60 mb-2">数量（1-100）</label>
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
                <label className="block text-sm text-foreground/60 mb-2">单张积分</label>
                <input
                  type="number"
                  value={points}
                  onChange={(e) => setPoints(Math.max(1, Number(e.target.value)))}
                  min={1}
                  className="w-full px-4 py-3 bg-card/60 border border-border/70 rounded-xl text-foreground focus:outline-none focus:border-border/70"
                />
              </div>
              <div>
                <label className="block text-sm text-foreground/60 mb-2">有效期（天）</label>
                <input
                  type="number"
                  value={expiresInDays}
                  onChange={(e) => setExpiresInDays(Math.max(0, Number(e.target.value) || 0))}
                  min={0}
                  className="w-full px-4 py-3 bg-card/60 border border-border/70 rounded-xl text-foreground focus:outline-none focus:border-border/70"
                />
                <p className="text-xs text-foreground/40 mt-2">填 0 表示永久有效。</p>
              </div>
              <div>
                <label className="block text-sm text-foreground/60 mb-2">批次备注</label>
                <input
                  type="text"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="如：首发活动 / 渠道补偿"
                  className="w-full px-4 py-3 bg-card/60 border border-border/70 rounded-xl text-foreground placeholder:text-foreground/30 focus:outline-none focus:border-border/70"
                />
              </div>
            </div>

            <div className="mt-4 rounded-2xl bg-card/60 border border-border/70 p-4 text-sm text-foreground/60 space-y-2">
              <div className="flex items-center gap-2">
                <CalendarClock className="w-4 h-4 text-sky-300" />
                <span>本次会生成一个独立批次，生成后可直接复制或导出最近批次。</span>
              </div>
              <p>预计生成 {count} 个卡密，每个 {points} 积分。</p>
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
                {creating ? <Loader2 className="w-5 h-5 animate-spin mx-auto" /> : '生成并打开结果'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
