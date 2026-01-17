'use client';

import { useState, useEffect } from 'react';
import { UserPlus, Plus, Trash2, Copy, Loader2, Check } from 'lucide-react';
import type { InviteCode } from '@/types';
import { formatDate } from '@/lib/utils';
import { toast } from '@/components/ui/toaster';
import { PaginationControls } from '@/components/admin/pagination';

const INVITE_PAGE_SIZE = 50;

export default function InvitesPage() {
  const [codes, setCodes] = useState<InviteCode[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetching, setFetching] = useState(false);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [showUsed, setShowUsed] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const [bonusPoints, setBonusPoints] = useState(50);
  const [creatorBonus, setCreatorBonus] = useState(20);

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
      params.set('limit', String(INVITE_PAGE_SIZE));
      params.set('showUsed', String(showUsed));

      const res = await fetch(`/api/admin/invites?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setCodes(data.data || []);
        setPage(data.page || nextPage);
        setTotal(data.total || 0);
      } else {
        const data = await res.json().catch(() => ({}));
        toast({ title: '加载失败', description: data.error || '无法获取邀请码列表', variant: 'destructive' });
      }
    } catch (err) {
      toast({ title: '加载失败', description: err instanceof Error ? err.message : '无法获取邀请码列表', variant: 'destructive' });
    } finally {
      setLoading(false);
      setFetching(false);
    }
  };

  const handleCreate = async () => {
    try {
      setCreating(true);
      const res = await fetch('/api/admin/invites', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bonusPoints, creatorBonus }),
      });
      if (res.ok) {
        await res.json();
        toast({ title: '邀请码已创建' });
        setShowCreate(false);
        loadCodes(1, true);
      } else {
        const data = await res.json().catch(() => ({}));
        toast({ title: '创建失败', description: data.error || '无法创建邀请码', variant: 'destructive' });
      }
    } catch (err) {
      toast({ title: '创建失败', description: err instanceof Error ? err.message : '无法创建邀请码', variant: 'destructive' });
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('确定删除此邀请码？')) return;

    try {
      const res = await fetch('/api/admin/invites', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      });
      if (res.ok) {
        toast({ title: '邀请码已删除' });
        const nextPage = codes.length === 1 && page > 1 ? page - 1 : page;
        loadCodes(nextPage, false);
      } else {
        const data = await res.json().catch(() => ({}));
        toast({ title: '删除失败', description: data.error || '无法删除邀请码', variant: 'destructive' });
      }
    } catch (err) {
      toast({ title: '删除失败', description: err instanceof Error ? err.message : '无法删除邀请码', variant: 'destructive' });
    }
  };

  const copyCode = async (code: string, id: string) => {
    try {
      await navigator.clipboard.writeText(code);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
      toast({ title: '已复制邀请码' });
    } catch (err) {
      toast({ title: '复制失败', description: err instanceof Error ? err.message : '无法复制邀请码', variant: 'destructive' });
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
          <h1 className="text-3xl font-light text-foreground">邀请码管理</h1>
          <p className="text-foreground/50 mt-1">创建和管理用户邀请码 · 共 {total} 条</p>
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
            onClick={() => setShowCreate(true)}
            className="flex items-center gap-2 px-4 py-2 bg-foreground text-background rounded-xl hover:bg-foreground/90 transition-all"
          >
            <Plus className="w-4 h-4" />
            创建邀请码
          </button>
        </div>
      </div>

      {showCreate && (
        <div className="fixed inset-0 bg-background/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-card/95 border border-border/70 rounded-2xl p-6 w-full max-w-md">
            <h2 className="text-xl font-semibold text-foreground mb-4">创建邀请码</h2>
            
            <div className="space-y-4">
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
                {creating ? <Loader2 className="w-5 h-5 animate-spin mx-auto" /> : '创建'}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="bg-card/60 border border-border/70 rounded-2xl overflow-hidden">
        <div className="overflow-x-auto no-scrollbar">
          <table className="w-full min-w-[980px]">
            <thead>
              <tr className="border-b border-border/70">
                <th className="text-left text-sm font-medium text-foreground/50 px-5 py-4">邀请码</th>
                <th className="text-left text-sm font-medium text-foreground/50 px-5 py-4">创建者</th>
                <th className="text-left text-sm font-medium text-foreground/50 px-5 py-4">使用者</th>
                <th className="text-right text-sm font-medium text-foreground/50 px-5 py-4">被邀请人奖励</th>
                <th className="text-right text-sm font-medium text-foreground/50 px-5 py-4">邀请人奖励</th>
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
                      <span className="text-sm text-foreground/40">未使用</span>
                    )}
                  </td>
                  <td className="px-5 py-4 text-right text-green-400">+{code.bonusPoints}</td>
                  <td className="px-5 py-4 text-right text-blue-400">+{code.creatorBonus}</td>
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
    </div>
  );
}

