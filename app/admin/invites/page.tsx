'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  CalendarClock,
  Check,
  Copy,
  Download,
  Loader2,
  Plus,
  Trash2,
  UserPlus,
} from 'lucide-react';
import type { InviteBatchResult, InviteCode } from '@/types';
import { formatDate } from '@/lib/utils';
import { toast } from '@/components/ui/toaster';
import { PaginationControls } from '@/components/admin/pagination';

const INVITE_PAGE_SIZE = 50;
const DAY_IN_MS = 24 * 60 * 60 * 1000;

type InviteListResponse = {
  data?: InviteCode[];
  page?: number;
  total?: number;
};

type InviteCreateResponse = {
  data?: InviteCode[];
  batch?: InviteBatchResult;
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

function getExportableCodes(codes: InviteCode[]): InviteCode[] {
  const unused = codes.filter((code) => !code.usedBy);
  return unused.length > 0 ? unused : codes;
}

function buildExportContent(codes: InviteCode[]): string {
  return codes
    .map((code) => {
      const status = code.usedBy ? 'USED' : code.expiresAt && code.expiresAt < Date.now() ? 'EXPIRED' : 'AVAILABLE';
      return [
        code.code,
        `inviteeBonus=${code.bonusPoints}`,
        `inviterBonus=${code.creatorBonus}`,
        `status=${status}`,
        `expiresAt=${code.expiresAt || '-'}`,
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

export default function InvitesPage() {
  const [codes, setCodes] = useState<InviteCode[]>([]);
  const [latestBatch, setLatestBatch] = useState<InviteBatchResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [fetching, setFetching] = useState(false);
  const [creating, setCreating] = useState(false);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [showUsed, setShowUsed] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const [count, setCount] = useState(10);
  const [bonusPoints, setBonusPoints] = useState(50);
  const [creatorBonus, setCreatorBonus] = useState(20);
  const [expiresInDays, setExpiresInDays] = useState(0);

  const exportableCurrentCodes = useMemo(() => getExportableCodes(codes), [codes]);
  const exportableLatestCodes = useMemo(
    () => getExportableCodes(latestBatch?.codes || []),
    [latestBatch]
  );

  const loadCodes = async (nextPage = 1, reset = false) => {
    try {
      if (reset) {
        setLoading(true);
      } else {
        setFetching(true);
      }

      const params = new URLSearchParams();
      params.set('page', String(nextPage));
      params.set('limit', String(INVITE_PAGE_SIZE));
      params.set('showUsed', String(showUsed));

      const res = await fetch(`/api/admin/invites?${params.toString()}`);
      const data = (await res.json().catch(() => ({}))) as InviteListResponse & { error?: string };
      if (!res.ok) {
        throw new Error(data.error || '无法获取邀请码列表');
      }

      setCodes(data.data || []);
      setPage(data.page || nextPage);
      setTotal(data.total || 0);
    } catch (err) {
      toast({
        title: '加载失败',
        description: err instanceof Error ? err.message : '无法获取邀请码列表',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
      setFetching(false);
    }
  };

  useEffect(() => {
    void loadCodes(1, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showUsed]);

  const resetCreateForm = () => {
    setCount(10);
    setBonusPoints(50);
    setCreatorBonus(20);
    setExpiresInDays(0);
  };

  const handleCreate = async () => {
    try {
      setCreating(true);
      const expiresAt = getExpiryTimestamp(expiresInDays);
      const res = await fetch('/api/admin/invites', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          count,
          bonusPoints,
          creatorBonus,
          expiresAt,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as InviteCreateResponse & { error?: string };
      if (!res.ok) {
        throw new Error(data.error || '无法创建邀请码');
      }

      if (data.batch) {
        setLatestBatch(data.batch);
        toast({
          title: '邀请码已创建',
          description: `已生成 ${data.batch.count} 个邀请码，可直接复制或导出。`,
        });
      } else {
        toast({ title: '邀请码已创建' });
      }

      setShowCreate(false);
      resetCreateForm();
      await loadCodes(1, true);
    } catch (err) {
      toast({
        title: '创建失败',
        description: err instanceof Error ? err.message : '无法创建邀请码',
        variant: 'destructive',
      });
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('确定删除这条邀请码吗？')) return;

    try {
      const res = await fetch('/api/admin/invites', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error((data as { error?: string }).error || '无法删除邀请码');
      }
      toast({ title: '邀请码已删除' });
      const nextPage = codes.length === 1 && page > 1 ? page - 1 : page;
      await loadCodes(nextPage, false);
    } catch (err) {
      toast({
        title: '删除失败',
        description: err instanceof Error ? err.message : '无法删除邀请码',
        variant: 'destructive',
      });
    }
  };

  const copyCode = async (code: string, id: string) => {
    try {
      await navigator.clipboard.writeText(code);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
      toast({ title: '已复制邀请码' });
    } catch (err) {
      toast({
        title: '复制失败',
        description: err instanceof Error ? err.message : '无法复制邀请码',
        variant: 'destructive',
      });
    }
  };

  const copyCodes = async (targetCodes: InviteCode[], emptyMessage: string, successTitle: string) => {
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
        description: err instanceof Error ? err.message : '无法复制邀请码',
        variant: 'destructive',
      });
    }
  };

  const exportCodes = (targetCodes: InviteCode[], prefix: string) => {
    if (targetCodes.length === 0) {
      toast({ title: '没有可导出的邀请码', variant: 'destructive' });
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
          <h1 className="text-3xl font-light text-foreground">邀请码管理</h1>
          <p className="text-foreground/50 mt-1">统一按“最近创建结果 + 当前列表”来管理邀请码，减少发放时的混乱。</p>
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
            onClick={() => copyCodes(exportableCurrentCodes, '当前列表没有可复制内容', '已复制当前列表')}
            className="inline-flex items-center gap-2 px-4 py-2 bg-card/60 border border-border/70 text-foreground rounded-xl hover:bg-card/70 transition-all"
          >
            <Copy className="w-4 h-4" />
            复制当前列表
          </button>
          <button
            onClick={() => exportCodes(exportableCurrentCodes, 'invite-list')}
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
            批量创建邀请码
          </button>
        </div>
      </div>

      {latestBatch && (
        <div className="bg-card/60 border border-border/70 rounded-2xl p-5 space-y-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <p className="text-sm text-foreground/50">最近创建结果</p>
              <h2 className="text-xl font-medium text-foreground mt-1">{latestBatch.count} 个邀请码</h2>
              <div className="flex flex-wrap items-center gap-2 text-sm text-foreground/50 mt-2">
                <span>被邀请人 +{latestBatch.bonusPoints}</span>
                <span>·</span>
                <span>邀请人 +{latestBatch.creatorBonus}</span>
                <span>·</span>
                <span>{formatDate(latestBatch.createdAt)}</span>
                <span>·</span>
                <span>{formatExpiry(latestBatch.expiresAt)}</span>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => copyCodes(exportableLatestCodes, '最近结果没有可复制邀请码', '已复制最近结果')}
                className="inline-flex items-center gap-2 px-4 py-2 bg-card/70 border border-border/70 text-foreground rounded-xl hover:bg-card/80"
              >
                <Copy className="w-4 h-4" />
                复制最近结果
              </button>
              <button
                onClick={() => exportCodes(exportableLatestCodes, 'invite-latest')}
                className="inline-flex items-center gap-2 px-4 py-2 bg-card/70 border border-border/70 text-foreground rounded-xl hover:bg-card/80"
              >
                <Download className="w-4 h-4" />
                导出最近结果
              </button>
            </div>
          </div>
          <p className="text-xs text-foreground/40">
            邀请码目前不落库存储“批次号”，所以“最近创建结果”是当前管理会话里的即时导出面板。
          </p>
        </div>
      )}

      <div className="bg-card/60 border border-border/70 rounded-2xl p-5">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-sky-500/15 flex items-center justify-center">
            <UserPlus className="w-5 h-5 text-sky-300" />
          </div>
          <div>
            <h2 className="text-lg font-medium text-foreground">当前列表</h2>
            <p className="text-sm text-foreground/50">共 {total} 条记录，分页浏览并支持直接复制单条邀请码。</p>
          </div>
        </div>
      </div>

      <div className="bg-card/60 border border-border/70 rounded-2xl overflow-hidden">
        <div className="overflow-x-auto no-scrollbar">
          <table className="w-full min-w-[1120px]">
            <thead>
              <tr className="border-b border-border/70">
                <th className="text-left text-sm font-medium text-foreground/50 px-5 py-4">邀请码</th>
                <th className="text-left text-sm font-medium text-foreground/50 px-5 py-4">奖励配置</th>
                <th className="text-left text-sm font-medium text-foreground/50 px-5 py-4">创建者</th>
                <th className="text-left text-sm font-medium text-foreground/50 px-5 py-4">使用者</th>
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
                    <td className="px-5 py-4 text-sm text-foreground/60">
                      <div>被邀请人 +{code.bonusPoints}</div>
                      <div className="text-xs text-foreground/40 mt-1">邀请人 +{code.creatorBonus}</div>
                    </td>
                    <td className="px-5 py-4">
                      <div>
                        <p className="text-foreground/80 text-sm">{code.creatorName || '-'}</p>
                        <p className="text-xs text-foreground/40">{code.creatorEmail || ''}</p>
                      </div>
                    </td>
                    <td className="px-5 py-4">
                      {code.usedBy ? (
                        <div>
                          <p className="text-foreground/80 text-sm">{code.usedByName || '-'}</p>
                          <p className="text-xs text-foreground/40">{code.usedByEmail || ''}</p>
                        </div>
                      ) : (
                        <span className="text-sm text-foreground/40">尚未使用</span>
                      )}
                    </td>
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
                          title="复制邀请码"
                        >
                          {copiedId === code.id ? <Check className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4" />}
                        </button>
                        {!code.usedBy && !isExpired && (
                          <button
                            onClick={() => handleDelete(code.id)}
                            className="p-2 text-red-400/60 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-all"
                            title="删除邀请码"
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
            <UserPlus className="w-10 h-10 mx-auto mb-3 opacity-30" />
            <p>暂无邀请码</p>
          </div>
        )}
      </div>

      {total > 0 && (
        <PaginationControls
          page={page}
          pageSize={INVITE_PAGE_SIZE}
          total={total}
          onPageChange={(nextPage) => loadCodes(nextPage, false)}
          loading={fetching}
        />
      )}

      {showCreate && (
        <div className="fixed inset-0 bg-background/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-card/95 border border-border/70 rounded-2xl p-6 w-full max-w-md">
            <h2 className="text-xl font-semibold text-foreground mb-4">批量创建邀请码</h2>

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
                <label className="block text-sm text-foreground/60 mb-2">被邀请人奖励积分</label>
                <input
                  type="number"
                  value={bonusPoints}
                  onChange={(e) => setBonusPoints(Math.max(0, Number(e.target.value)))}
                  min={0}
                  className="w-full px-4 py-3 bg-card/60 border border-border/70 rounded-xl text-foreground focus:outline-none focus:border-border/70"
                />
              </div>
              <div>
                <label className="block text-sm text-foreground/60 mb-2">邀请人奖励积分</label>
                <input
                  type="number"
                  value={creatorBonus}
                  onChange={(e) => setCreatorBonus(Math.max(0, Number(e.target.value)))}
                  min={0}
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
            </div>

            <div className="mt-4 rounded-2xl bg-card/60 border border-border/70 p-4 text-sm text-foreground/60 space-y-2">
              <div className="flex items-center gap-2">
                <CalendarClock className="w-4 h-4 text-sky-300" />
                <span>创建后会立即展示最近生成结果，方便直接发放或导出存档。</span>
              </div>
              <p>本次将生成 {count} 个邀请码。</p>
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
                {creating ? <Loader2 className="w-5 h-5 animate-spin mx-auto" /> : '创建并展示结果'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
