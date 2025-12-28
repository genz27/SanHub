'use client';

import { useState, useEffect } from 'react';
import { UserPlus, Plus, Trash2, Copy, Loader2, Check } from 'lucide-react';
import type { InviteCode } from '@/types';
import { formatDate } from '@/lib/utils';

export default function InvitesPage() {
  const [codes, setCodes] = useState<InviteCode[]>([]);
  const [loading, setLoading] = useState(true);
  const [showUsed, setShowUsed] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const [bonusPoints, setBonusPoints] = useState(50);
  const [creatorBonus, setCreatorBonus] = useState(20);

  useEffect(() => {
    loadCodes();
  }, [showUsed]);

  const loadCodes = async () => {
    try {
      setLoading(true);
      const res = await fetch(`/api/admin/invites?showUsed=${showUsed}`);
      if (res.ok) {
        const data = await res.json();
        setCodes(data.data || []);
      }
    } catch (err) {
      console.error('Load codes failed:', err);
    } finally {
      setLoading(false);
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
        const data = await res.json();
        setCodes(prev => [data.data, ...prev]);
        setShowCreate(false);
      }
    } catch (err) {
      console.error('Create failed:', err);
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
        setCodes(prev => prev.filter(c => c.id !== id));
      }
    } catch (err) {
      console.error('Delete failed:', err);
    }
  };

  const copyCode = async (code: string, id: string) => {
    await navigator.clipboard.writeText(code);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-white/30" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-light text-white">邀请码管理</h1>
          <p className="text-white/50 mt-1">创建和管理用户邀请码</p>
        </div>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 text-sm text-white/60">
            <input
              type="checkbox"
              checked={showUsed}
              onChange={(e) => setShowUsed(e.target.checked)}
              className="rounded border-white/20"
            />
            显示已使用
          </label>
          <button
            onClick={() => setShowCreate(true)}
            className="flex items-center gap-2 px-4 py-2 bg-white text-black rounded-xl hover:bg-white/90 transition-all"
          >
            <Plus className="w-4 h-4" />
            创建邀请码
          </button>
        </div>
      </div>

      {showCreate && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-zinc-900 border border-white/10 rounded-2xl p-6 w-full max-w-md">
            <h2 className="text-xl font-semibold text-white mb-4">创建邀请码</h2>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm text-white/60 mb-2">被邀请人奖励积分</label>
                <input
                  type="number"
                  value={bonusPoints}
                  onChange={(e) => setBonusPoints(Math.max(0, Number(e.target.value)))}
                  min={0}
                  className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white focus:outline-none focus:border-white/20"
                />
              </div>
              <div>
                <label className="block text-sm text-white/60 mb-2">邀请人奖励积分</label>
                <input
                  type="number"
                  value={creatorBonus}
                  onChange={(e) => setCreatorBonus(Math.max(0, Number(e.target.value)))}
                  min={0}
                  className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white focus:outline-none focus:border-white/20"
                />
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={() => setShowCreate(false)}
                className="flex-1 py-3 bg-white/5 border border-white/10 text-white rounded-xl hover:bg-white/10 transition-all"
              >
                取消
              </button>
              <button
                onClick={handleCreate}
                disabled={creating}
                className="flex-1 py-3 bg-white text-black rounded-xl hover:bg-white/90 disabled:opacity-50 transition-all"
              >
                {creating ? <Loader2 className="w-5 h-5 animate-spin mx-auto" /> : '创建'}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="bg-white/[0.03] border border-white/10 rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-white/10">
                <th className="text-left text-sm font-medium text-white/50 px-5 py-4">邀请码</th>
                <th className="text-right text-sm font-medium text-white/50 px-5 py-4">被邀请人奖励</th>
                <th className="text-right text-sm font-medium text-white/50 px-5 py-4">邀请人奖励</th>
                <th className="text-center text-sm font-medium text-white/50 px-5 py-4">状态</th>
                <th className="text-right text-sm font-medium text-white/50 px-5 py-4">创建时间</th>
                <th className="text-right text-sm font-medium text-white/50 px-5 py-4">操作</th>
              </tr>
            </thead>
            <tbody>
              {codes.map((code) => (
                <tr key={code.id} className="border-b border-white/5 hover:bg-white/[0.02]">
                  <td className="px-5 py-4">
                    <code className="font-mono text-white bg-white/5 px-2 py-1 rounded">
                      {code.code}
                    </code>
                  </td>
                  <td className="px-5 py-4 text-right text-green-400">+{code.bonusPoints}</td>
                  <td className="px-5 py-4 text-right text-blue-400">+{code.creatorBonus}</td>
                  <td className="px-5 py-4 text-center">
                    {code.usedBy ? (
                      <span className="px-2 py-1 text-xs rounded-full bg-white/10 text-white/50">
                        已使用
                      </span>
                    ) : (
                      <span className="px-2 py-1 text-xs rounded-full bg-green-500/20 text-green-400 border border-green-500/30">
                        可用
                      </span>
                    )}
                  </td>
                  <td className="px-5 py-4 text-right text-white/50 text-sm">
                    {formatDate(code.createdAt)}
                  </td>
                  <td className="px-5 py-4 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        onClick={() => copyCode(code.code, code.id)}
                        className="p-2 text-white/40 hover:text-white hover:bg-white/10 rounded-lg transition-all"
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
          <div className="text-center py-12 text-white/40">
            <UserPlus className="w-10 h-10 mx-auto mb-3 opacity-30" />
            <p>暂无邀请码</p>
          </div>
        )}
      </div>
    </div>
  );
}
