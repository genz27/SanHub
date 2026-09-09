'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  CalendarClock,
  Check,
  Copy,
  Download,
  FilterX,
  Loader2,
  Plus,
  Ticket,
  Trash2,
} from 'lucide-react';
import type { RedemptionBatchResult, RedemptionBatchSummary, RedemptionCode } from '@/types';
import { formatDate } from '@/lib/utils';
import { toast } from '@/components/ui/toaster';
import { PaginationControls } from '@/components/admin/pagination';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Modal } from '@/components/ui/modal';
import {
  AdminEmpty,
  AdminGhostButton,
  AdminHeader,
  AdminPanel,
  AdminPill,
  AdminPrimaryButton,
  AdminTable,
  AdminTd,
  AdminTh,
} from '@/components/admin/admin-chrome';

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
  const [pendingDeleteCodeId, setPendingDeleteCodeId] = useState<string | null>(null);
  const [pendingDeleteBatchId, setPendingDeleteBatchId] = useState<string | null>(null);

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
      <div className="space-y-6">
        <AdminHeader title="卡密管理" description="按批次生成、查看和导出积分卡密" />
        <div className="flex h-48 items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <AdminHeader
        title="卡密管理"
        description={`当前查看：${viewLabel} · ${total} 条`}
        actions={
          <>
            <label className="inline-flex h-9 items-center gap-2 text-sm text-muted-foreground">
              <input
                type="checkbox"
                checked={showUsed}
                onChange={(event) => setShowUsed(event.target.checked)}
                className="rounded border-border"
              />
              显示已使用
            </label>
            <AdminGhostButton onClick={() => void copyCodes(exportableCurrentCodes, '当前列表没有可复制内容', '已复制当前列表')}>
              <Copy className="h-3.5 w-3.5" />
              复制列表
            </AdminGhostButton>
            <AdminGhostButton onClick={() => exportCodes(exportableCurrentCodes, 'redemption-list')}>
              <Download className="h-3.5 w-3.5" />
              导出
            </AdminGhostButton>
            <AdminPrimaryButton onClick={() => setShowCreate(true)}>
              <Plus className="h-4 w-4" />
              生成卡密
            </AdminPrimaryButton>
          </>
        }
      />

      {latestBatch && (
        <div className="flex flex-col gap-3 rounded-md border border-border bg-card px-3 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0 text-sm">
            <p className="font-medium text-foreground">
              最近批次 {latestBatch.batchId.slice(0, 8)} · {latestBatch.count} 张 · 每张 {latestBatch.points} 积分
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {formatDate(latestBatch.createdAt)} · {formatExpiry(latestBatch.expiresAt)}
              {latestBatch.note ? ` · ${latestBatch.note}` : ''}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <AdminGhostButton onClick={() => void copyCodes(exportableLatestCodes, '最近批次没有可复制卡密', '已复制最近批次')}>
              <Copy className="h-3.5 w-3.5" />
              复制
            </AdminGhostButton>
            <AdminGhostButton onClick={() => exportCodes(exportableLatestCodes, `redemption-batch-${latestBatch.batchId.slice(0, 8)}`)}>
              <Download className="h-3.5 w-3.5" />
              导出
            </AdminGhostButton>
            <AdminGhostButton onClick={() => setActiveBatchId(latestBatch.batchId)}>
              仅看这一批
            </AdminGhostButton>
          </div>
        </div>
      )}

      {recentBatches.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setActiveBatchId(null)}
            className={`inline-flex h-8 items-center rounded-md border px-2.5 text-xs ${
              !activeBatchId
                ? 'border-foreground bg-foreground text-background'
                : 'border-border text-muted-foreground hover:bg-accent'
            }`}
          >
            全部
          </button>
          {recentBatches.map((batch) => {
            const isActive = activeBatchId === batch.batchId;
            return (
              <div key={batch.batchId} className="inline-flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setActiveBatchId(isActive ? null : batch.batchId)}
                  className={`inline-flex h-8 items-center rounded-md border px-2.5 text-xs ${
                    isActive
                      ? 'border-foreground bg-foreground text-background'
                      : 'border-border text-muted-foreground hover:bg-accent'
                  }`}
                >
                  {batch.batchId.slice(0, 8)} · 未用 {batch.unusedCount}
                </button>
                <button
                  type="button"
                  title="删除未使用卡密"
                  disabled={batch.unusedCount === 0 || deletingBatchId === batch.batchId}
                  onClick={() => setPendingDeleteBatchId(batch.batchId)}
                  className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-border text-muted-foreground hover:bg-red-500/10 hover:text-red-400 disabled:opacity-40"
                >
                  {deletingBatchId === batch.batchId ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Trash2 className="h-3.5 w-3.5" />
                  )}
                </button>
              </div>
            );
          })}
          {activeBatchId && (
            <AdminGhostButton onClick={() => setActiveBatchId(null)}>
              <FilterX className="h-3.5 w-3.5" />
              清除筛选
            </AdminGhostButton>
          )}
        </div>
      )}

      <AdminPanel>
        {codes.length === 0 ? (
          <AdminEmpty
            icon={<Ticket className="h-8 w-8" />}
            title={activeBatchId ? '这个批次下暂无符合条件的卡密' : '暂无卡密'}
            description="生成一批卡密后会显示在这里。"
          />
        ) : (
          <AdminTable minWidth="1040px">
            <thead>
              <tr>
                <AdminTh>卡密</AdminTh>
                <AdminTh>批次</AdminTh>
                <AdminTh align="right">积分</AdminTh>
                <AdminTh>备注</AdminTh>
                <AdminTh>有效期</AdminTh>
                <AdminTh>状态</AdminTh>
                <AdminTh>时间</AdminTh>
                <AdminTh align="right">操作</AdminTh>
              </tr>
            </thead>
            <tbody>
              {codes.map((code) => {
                const isExpired = Boolean(code.expiresAt && code.expiresAt < Date.now() && !code.usedBy);
                return (
                  <tr key={code.id} className="hover:bg-accent/50">
                    <AdminTd>
                      <code className="rounded border border-border bg-background px-1.5 py-0.5 font-mono text-xs">
                        {code.code}
                      </code>
                    </AdminTd>
                    <AdminTd>
                      <span className="text-muted-foreground">{code.batchId ? code.batchId.slice(0, 8) : '-'}</span>
                    </AdminTd>
                    <AdminTd align="right">+{code.points}</AdminTd>
                    <AdminTd>
                      <span className="text-muted-foreground">{code.note || '-'}</span>
                    </AdminTd>
                    <AdminTd>
                      <span className="text-muted-foreground">{formatExpiry(code.expiresAt)}</span>
                    </AdminTd>
                    <AdminTd>
                      {code.usedBy ? (
                        <AdminPill>已使用</AdminPill>
                      ) : isExpired ? (
                        <AdminPill tone="warning">已过期</AdminPill>
                      ) : (
                        <AdminPill tone="success">可发放</AdminPill>
                      )}
                    </AdminTd>
                    <AdminTd>
                      <div className="text-muted-foreground">
                        <div>{formatDate(code.createdAt)}</div>
                        {code.usedAt && (
                          <div className="mt-0.5 text-[11px]">使用于 {formatDate(code.usedAt)}</div>
                        )}
                      </div>
                    </AdminTd>
                    <AdminTd align="right">
                      <div className="flex justify-end gap-2">
                        <AdminGhostButton onClick={() => void copyCode(code.code, code.id)}>
                          {copiedId === code.id ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                        </AdminGhostButton>
                        {!code.usedBy && !isExpired && (
                          <AdminGhostButton danger onClick={() => setPendingDeleteCodeId(code.id)}>
                            <Trash2 className="h-3.5 w-3.5" />
                          </AdminGhostButton>
                        )}
                      </div>
                    </AdminTd>
                  </tr>
                );
              })}
            </tbody>
          </AdminTable>
        )}
      </AdminPanel>

      {total > 0 && (
        <PaginationControls
          page={page}
          pageSize={REDEMPTION_PAGE_SIZE}
          total={total}
          onPageChange={(nextPage) => void loadCodes(nextPage, false)}
          loading={fetching}
        />
      )}

      <Modal
        open={showCreate}
        onClose={() => setShowCreate(false)}
        title="生成卡密"
        size="md"
      >
        <div className="space-y-4">
          <div>
            <label className="mb-1.5 block text-xs text-muted-foreground">数量（1-100）</label>
            <input
              type="number"
              value={count}
              onChange={(event) => setCount(Math.min(100, Math.max(1, Number(event.target.value))))}
              min={1}
              max={100}
              className="h-9 w-full rounded-md border border-border bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring/30"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-xs text-muted-foreground">单张积分</label>
            <input
              type="number"
              value={points}
              onChange={(event) => setPoints(Math.max(1, Number(event.target.value)))}
              min={1}
              className="h-9 w-full rounded-md border border-border bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring/30"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-xs text-muted-foreground">有效期（天）</label>
            <input
              type="number"
              value={expiresInDays}
              onChange={(event) => setExpiresInDays(Math.max(0, Number(event.target.value) || 0))}
              min={0}
              className="h-9 w-full rounded-md border border-border bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring/30"
            />
            <p className="mt-1.5 text-xs text-muted-foreground">填 0 表示永久有效。</p>
          </div>
          <div>
            <label className="mb-1.5 block text-xs text-muted-foreground">批次备注</label>
            <input
              type="text"
              value={note}
              onChange={(event) => setNote(event.target.value)}
              placeholder="如：首发活动 / 渠道补偿"
              className="h-9 w-full rounded-md border border-border bg-background px-3 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring/30"
            />
          </div>
          <div className="flex items-start gap-2 rounded-md border border-border bg-background px-3 py-2 text-xs text-muted-foreground">
            <CalendarClock className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            本次会生成一个独立批次。预计 {count} 张，每张 {points} 积分。
          </div>
          <div className="flex justify-end gap-2">
            <AdminGhostButton onClick={() => setShowCreate(false)}>取消</AdminGhostButton>
            <AdminPrimaryButton disabled={creating} onClick={() => void handleCreate()}>
              {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : '生成'}
            </AdminPrimaryButton>
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        open={pendingDeleteCodeId !== null}
        onClose={() => setPendingDeleteCodeId(null)}
        onConfirm={() => {
          const id = pendingDeleteCodeId!;
          setPendingDeleteCodeId(null);
          void handleDeleteCode(id);
        }}
        title="删除卡密"
        message="确定删除这条卡密吗？"
      />
      <ConfirmDialog
        open={pendingDeleteBatchId !== null}
        onClose={() => setPendingDeleteBatchId(null)}
        onConfirm={() => {
          const batchId = pendingDeleteBatchId!;
          setPendingDeleteBatchId(null);
          void handleDeleteBatch(batchId);
        }}
        title="删除批次"
        message="确定删除这个批次里所有未使用卡密吗？已使用的记录会保留。"
      />
    </div>
  );
}
