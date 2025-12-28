'use client';

import { useState, useEffect } from 'react';
import { Ticket, Plus, Trash2, Copy, Loader2, Check } from 'lucide-react';
import type { RedemptionCode } from '@/types';
import { formatDate, cn } from '@/lib/utils';

export default function RedemptionPage() {
  const [codes, setCodes] = useState<RedemptionCode[]>([]);
  const [loading, setLoading] = useState(true);
  const [showUsed, setShowUsed] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Create form
  const [count, setCount] = useState(10);
  const [points, setPoints] = useState(100);
  const [note, setNote] = useState('');

  useEffect(() => {
    loadCodes();
  }, [showUsed]);

  const loadCodes = async () => {
    try {
      setLoading(true);
      const res = await fetch(`/api/admin/redemption?showUsed=${showUsed}`);
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
    if (count < 1 || count > 100 || points < 1) return;

    try {
      setCreating(true);
      const res = await fetch('/api/admin/redemption', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ count, points, note: note || undefined }),
      });
      if (res.ok) {
        const data = await res.json();
        setCodes(prev => [...data.data, ...prev]);
        setShowCreate(false);
        setNote('');
      }
    } catch (err) {
      console.error('Create failed:', err);
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

  const copyAllCodes = async () => {
    const unusedCodes = codes.filter(c => !c.usedBy).map(c => c.code).join('\n');
    await navigator.clipboard.writeText(unusedCodes);
    alert(`已复制 ${codes.filter(c => !c.usedBy).length} 个未使用的卡密`);
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
          <h1 className="text-3xl font-light text-white">卡密管理</h1>
          <p className="text-white/50 mt-1">生成和管理积分兑换卡密</p>
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
            onClick={copyAllCodes}
            className="px-4 py-2 bg-white/5 border border-white/10 text-white rounded-xl hover:bg-white/10 transition-all"
          >
            复制全部
          </button>
          <button
            onClick={() => setShowCreate(true)}
            className="flex items-center gap-2 px-4 py-2 bg-white text-black rounded-xl hover:bg-white/90 transition-all"
          >
            <Plus className="w-4 h-4" />
            生成卡密
          </button>
        </div>
      </div>

      {/* Create Modal */}
      {showCreate && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-zinc-900 border border-white/10 rounded-2xl p-6 w-full max-w-md">
            <h2 className="text-xl font-semibold text-white mb-4">生成卡密</h2>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm text-white/60 mb-2">数量 (1-100)</label>
                <input
                  type="number"
                  value={count}
                  onChange={(e) => setCount(Math.min(100, Math.max(1, Number(e.target.value))))}
                  min={1}
                  max={100}
                  className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white focus:outline-none focus:border-white/20"
                />
              </div>
              <div>
                <label className="block text-sm text-white/60 mb-2">积分数量</label>
                <input
                  type="number"
                  value={points}
                  onChange={(e) => setPoints(Math.max(1, Number(e.target.value)))}
                  min={1}
                  className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white focus:outline-none focus:border-white/20"
                />
              </div>
              <div>
                <label className="block text-sm text-white/60 mb-2">备注 (可选)</label>
                <input
                  type="text"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="如：活动赠送"
                  className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder:text-white/30 focus:outline-none focus:border-white/20"
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
                {creating ? <Loader2 className="w-5 h-5 animate-spin mx-auto" /> : '生成'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Codes Table */}
      <div className="bg-white/[0.03] border border-white/10 rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-white/10">
                <th className="text-left text-sm font-medium text-white/50 px-5 py-4">卡密</th>
                <th className="text-right text-sm font-medium text-white/50 px-5 py-4">积分</th>
                <th className="text-left text-sm font-medium text-white/50 px-5 py-4">备注</th>
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
                  <td className="px-5 py-4 text-right text-green-400 font-semibold">
                    +{code.points}
                  </td>
                  <td className="px-5 py-4 text-white/50">{code.note || '-'}</td>
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
            <Ticket className="w-10 h-10 mx-auto mb-3 opacity-30" />
            <p>暂无卡密</p>
          </div>
        )}
      </div>
    </div>
  );
}
