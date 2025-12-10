'use client';

import { useState, useEffect } from 'react';
import { User, Eye, Ban, Check, Search, Edit2, Key, Coins, History } from 'lucide-react';
import type { SafeUser, Generation } from '@/types';
import { formatBalance, formatDate, cn } from '@/lib/utils';

export default function UsersPage() {
  const [users, setUsers] = useState<SafeUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedUser, setSelectedUser] = useState<SafeUser | null>(null);
  const [userGenerations, setUserGenerations] = useState<Generation[]>([]);
  const [editMode, setEditMode] = useState<'password' | 'balance' | null>(null);
  const [editValue, setEditValue] = useState('');
  const [search, setSearch] = useState('');

  useEffect(() => {
    loadUsers();
  }, []);

  const loadUsers = async () => {
    try {
      const res = await fetch('/api/admin/users');
      if (res.ok) {
        const data = await res.json();
        setUsers(data.data || []);
      }
    } catch (err) {
      console.error('加载用户失败:', err);
    } finally {
      setLoading(false);
    }
  };

  const selectUser = async (user: SafeUser) => {
    setSelectedUser(user);
    setEditMode(null);
    try {
      const res = await fetch(`/api/admin/users/${user.id}`);
      if (res.ok) {
        const data = await res.json();
        setUserGenerations(data.generations || []);
      }
    } catch (err) {
      console.error('加载用户详情失败:', err);
    }
  };

  const updateUser = async (updates: Record<string, unknown>) => {
    if (!selectedUser) return;
    try {
      const res = await fetch(`/api/admin/users/${selectedUser.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      });
      if (res.ok) {
        const updatedUser = await res.json();
        setSelectedUser({ ...selectedUser, ...updatedUser });
        setUsers(users.map(u => u.id === selectedUser.id ? { ...u, ...updatedUser } : u));
        setEditMode(null);
        setEditValue('');
      }
    } catch (err) {
      console.error('更新失败:', err);
    }
  };

  const toggleDisabled = () => {
    if (!selectedUser) return;
    updateUser({ disabled: !selectedUser.disabled });
  };

  const savePassword = () => {
    if (!editValue.trim() || editValue.length < 6) {
      alert('密码至少 6 个字符');
      return;
    }
    updateUser({ password: editValue });
  };

  const saveBalance = () => {
    const balance = parseInt(editValue);
    if (isNaN(balance) || balance < 0) {
      alert('请输入有效的积分数值');
      return;
    }
    updateUser({ balance });
  };

  const filteredUsers = users.filter(u => 
    u.email.toLowerCase().includes(search.toLowerCase()) ||
    u.name.toLowerCase().includes(search.toLowerCase())
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-2 border-white/20 border-t-white rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-extralight text-white">用户管理</h1>
        <p className="text-white/50 mt-1 font-light">管理用户账号、余额和权限</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* 用户列表 */}
        <div className="lg:col-span-1 space-y-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40" />
            <input
              value={search}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSearch(e.target.value)}
              placeholder="搜索用户..."
              className="w-full pl-10 pr-4 py-2.5 bg-white/5 border border-white/10 rounded-lg text-white placeholder:text-white/30 focus:outline-none focus:border-white/30 text-sm"
            />
          </div>

          <div className="space-y-2 max-h-[600px] overflow-y-auto">
            {filteredUsers.map(user => (
              <div 
                key={user.id}
                className={cn(
                  'p-3 rounded-xl border cursor-pointer transition-all',
                  selectedUser?.id === user.id 
                    ? 'bg-white/10 border-white/30' 
                    : 'bg-white/5 border-white/10 hover:bg-white/10',
                  user.disabled && 'opacity-50'
                )}
                onClick={() => selectUser(user)}
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center">
                    <User className="w-5 h-5 text-white/60" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-white truncate">{user.name}</p>
                    <p className="text-sm text-white/50 truncate">{user.email}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-medium text-white">{formatBalance(user.balance)}</p>
                    {user.disabled && (
                      <span className="text-xs text-red-400">已禁用</span>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* 用户详情 */}
        <div className="lg:col-span-2">
          {selectedUser ? (
            <div className="space-y-4">
              {/* 基本信息 */}
              <div className="bg-white/5 border border-white/10 rounded-xl overflow-hidden">
                <div className="p-4 border-b border-white/10 flex items-center justify-between">
                  <span className="font-medium text-white">用户信息</span>
                  <button
                    onClick={toggleDisabled}
                    className={cn(
                      'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors',
                      selectedUser.disabled 
                        ? 'bg-green-500/20 text-green-400 hover:bg-green-500/30' 
                        : 'bg-red-500/20 text-red-400 hover:bg-red-500/30'
                    )}
                  >
                    {selectedUser.disabled ? (
                      <><Check className="w-4 h-4" /> 启用</>
                    ) : (
                      <><Ban className="w-4 h-4" /> 禁用</>
                    )}
                  </button>
                </div>
                <div className="p-4 grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-xs text-white/40 uppercase tracking-wider mb-1">邮箱</p>
                    <p className="text-white">{selectedUser.email}</p>
                  </div>
                  <div>
                    <p className="text-xs text-white/40 uppercase tracking-wider mb-1">昵称</p>
                    <p className="text-white">{selectedUser.name}</p>
                  </div>
                  <div>
                    <p className="text-xs text-white/40 uppercase tracking-wider mb-1">角色</p>
                    <p className="text-white">{selectedUser.role === 'admin' ? '管理员' : '用户'}</p>
                  </div>
                  <div>
                    <p className="text-xs text-white/40 uppercase tracking-wider mb-1">注册时间</p>
                    <p className="text-white">{formatDate(selectedUser.createdAt)}</p>
                  </div>
                </div>
              </div>

              {/* 修改密码 */}
              <div className="bg-white/5 border border-white/10 rounded-xl overflow-hidden">
                <div className="p-4 border-b border-white/10 flex items-center gap-2">
                  <Key className="w-4 h-4 text-white/60" />
                  <span className="font-medium text-white">修改密码</span>
                </div>
                <div className="p-4">
                  {editMode === 'password' ? (
                    <div className="flex gap-2">
                      <input
                        type="password"
                        value={editValue}
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEditValue(e.target.value)}
                        placeholder="输入新密码（至少6位）"
                        className="flex-1 px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white placeholder:text-white/30 focus:outline-none focus:border-white/30 text-sm"
                      />
                      <button onClick={savePassword} className="px-4 py-2 bg-white text-black rounded-lg text-sm font-medium hover:bg-white/90">保存</button>
                      <button onClick={() => { setEditMode(null); setEditValue(''); }} className="px-4 py-2 bg-white/10 text-white rounded-lg text-sm font-medium hover:bg-white/20">取消</button>
                    </div>
                  ) : (
                    <button onClick={() => { setEditMode('password'); setEditValue(''); }} className="flex items-center gap-2 px-4 py-2 bg-white/10 text-white rounded-lg text-sm font-medium hover:bg-white/20">
                      <Edit2 className="w-4 h-4" />
                      重置密码
                    </button>
                  )}
                </div>
              </div>

              {/* 修改余额 */}
              <div className="bg-white/5 border border-white/10 rounded-xl overflow-hidden">
                <div className="p-4 border-b border-white/10 flex items-center gap-2">
                  <Coins className="w-4 h-4 text-white/60" />
                  <span className="font-medium text-white">积分余额: {formatBalance(selectedUser.balance)}</span>
                </div>
                <div className="p-4">
                  {editMode === 'balance' ? (
                    <div className="flex gap-2">
                      <input
                        type="number"
                        value={editValue}
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEditValue(e.target.value)}
                        placeholder="输入新余额"
                        className="flex-1 px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white placeholder:text-white/30 focus:outline-none focus:border-white/30 text-sm"
                      />
                      <button onClick={saveBalance} className="px-4 py-2 bg-white text-black rounded-lg text-sm font-medium hover:bg-white/90">保存</button>
                      <button onClick={() => { setEditMode(null); setEditValue(''); }} className="px-4 py-2 bg-white/10 text-white rounded-lg text-sm font-medium hover:bg-white/20">取消</button>
                    </div>
                  ) : (
                    <button onClick={() => { setEditMode('balance'); setEditValue(String(selectedUser.balance)); }} className="flex items-center gap-2 px-4 py-2 bg-white/10 text-white rounded-lg text-sm font-medium hover:bg-white/20">
                      <Edit2 className="w-4 h-4" />
                      修改余额
                    </button>
                  )}
                </div>
              </div>

              {/* 生成记录 */}
              <div className="bg-white/5 border border-white/10 rounded-xl overflow-hidden">
                <div className="p-4 border-b border-white/10 flex items-center gap-2">
                  <History className="w-4 h-4 text-white/60" />
                  <span className="font-medium text-white">生成记录 ({userGenerations.length})</span>
                </div>
                <div className="p-4">
                  {userGenerations.length === 0 ? (
                    <p className="text-white/40 text-center py-4">暂无生成记录</p>
                  ) : (
                    <div className="space-y-2 max-h-64 overflow-y-auto">
                      {userGenerations.map(gen => (
                        <div key={gen.id} className="flex items-center justify-between p-3 bg-white/5 border border-white/10 rounded-lg">
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-white truncate">{gen.prompt || '无提示词'}</p>
                            <p className="text-xs text-white/40">
                              {gen.type} · {formatDate(gen.createdAt)} · -{gen.cost} 积分
                            </p>
                          </div>
                          {gen.resultUrl && (
                            <a href={gen.resultUrl} target="_blank" rel="noopener noreferrer" className="p-2 text-white/40 hover:text-white hover:bg-white/10 rounded-lg transition-colors">
                              <Eye className="w-4 h-4" />
                            </a>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div className="bg-white/5 border border-white/10 rounded-xl p-12 text-center">
              <User className="w-12 h-12 mx-auto mb-4 text-white/20" />
              <p className="text-white/40">选择一个用户查看详情</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
