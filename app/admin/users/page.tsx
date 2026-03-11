'use client';

import { useState, useEffect, useCallback } from 'react';
import { useSession } from 'next-auth/react';
import { User, Ban, Check, Search, Edit2, Key, Coins, Loader2, ShieldAlert } from 'lucide-react';
import type { SafeUser } from '@/types';
import { formatBalance, formatDate, cn } from '@/lib/utils';
import { PaginationControls } from '@/components/admin/pagination';

const USERS_PAGE_SIZE = 20;

export default function UsersPage() {
  const { data: session } = useSession();
  const [users, setUsers] = useState<SafeUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetching, setFetching] = useState(false);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [selectedUser, setSelectedUser] = useState<SafeUser | null>(null);
  const [editMode, setEditMode] = useState<'password' | 'balance' | null>(null);
  const [editValue, setEditValue] = useState('');
  const [search, setSearch] = useState('');

  const isAdmin = session?.user?.role === 'admin';
  const isModerator = session?.user?.role === 'moderator';

  const canEditUser = (targetUser: SafeUser | null) => {
    if (!targetUser) return false;
    if (isAdmin) return true;
    if (isModerator) {
      return targetUser.role !== 'admin' && targetUser.role !== 'moderator';
    }
    return false;
  };

  const loadUsers = useCallback(async (nextPage = 1, reset = false) => {
    try {
      if (reset) {
        setLoading(true);
      } else {
        setFetching(true);
      }

      const params = new URLSearchParams();
      params.set('page', String(nextPage));
      params.set('limit', String(USERS_PAGE_SIZE));
      const term = search.trim();
      if (term) {
        params.set('q', term);
      }

      const res = await fetch(`/api/admin/users?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        const nextUsers = data.data || [];
        setUsers(nextUsers);
        setPage(data.page || nextPage);
        setTotal(data.total || 0);
        setSelectedUser((currentSelected) => {
          if (nextUsers.length === 0) {
            return null;
          }

          const currentId = currentSelected?.id;
          const matchedUser = currentId
            ? nextUsers.find((user: SafeUser) => user.id === currentId)
            : null;

          if (matchedUser) {
            return matchedUser;
          }

          return nextUsers[0];
        });
      }
    } catch (err) {
      console.error('加载用户失败:', err);
    } finally {
      setLoading(false);
      setFetching(false);
    }
  }, [search]);

  useEffect(() => {
    const handle = setTimeout(() => {
      loadUsers(1, true);
    }, 300);
    return () => clearTimeout(handle);
  }, [loadUsers]);

  const selectUser = (user: SafeUser) => {
    setSelectedUser(user);
    setEditMode(null);
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
        setUsers((currentUsers) =>
          currentUsers.map((user) =>
            user.id === selectedUser.id ? { ...user, ...updatedUser } : user
          )
        );
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
    const balance = parseInt(editValue, 10);
    if (Number.isNaN(balance) || balance < 0) {
      alert('请输入有效的积分数值');
      return;
    }
    updateUser({ balance });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="w-8 h-8 animate-spin text-foreground/30" />
          <p className="text-sm text-foreground/40">加载用户数据...</p>
        </div>
      </div>
    );
  }

  const totalPages = Math.max(1, Math.ceil(total / USERS_PAGE_SIZE));
  const currentPageCount = users.length;

  return (
    <div className="space-y-6 h-full flex flex-col">
      <div>
        <h1 className="text-3xl font-light text-foreground">用户管理</h1>
        <p className="text-foreground/50 mt-1">管理用户账号、余额和权限 · 共 {total} 条</p>
      </div>

      <div className="grid grid-cols-1 gap-6 flex-1 min-h-0 lg:grid-cols-[minmax(320px,360px)_minmax(0,1fr)]">
        <div className="min-h-0 flex flex-col overflow-hidden rounded-3xl border border-border/70 bg-card/50 backdrop-blur-sm">
          <div className="border-b border-border/70 p-5 space-y-4">
            <div className="rounded-2xl border border-border/70 bg-card/60 px-4 py-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs uppercase tracking-[0.2em] text-foreground/35">分页浏览</p>
                  <p className="mt-1 text-lg font-semibold text-foreground">第 {page} / {totalPages} 页</p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-medium text-foreground">{currentPageCount} 位用户</p>
                  <p className="text-xs text-foreground/40">当前页 / 共 {total} 位</p>
                </div>
              </div>
            </div>

            <div className="relative flex-shrink-0">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-foreground/40" />
              <input
                value={search}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSearch(e.target.value)}
                placeholder="搜索邮箱或昵称"
                className="w-full pl-11 pr-10 py-3 bg-card/60 backdrop-blur-sm border border-border/70 rounded-xl text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:border-border/70 focus:ring-2 focus:ring-ring/30 transition-all"
              />
              {fetching && (
                <Loader2 className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-foreground/40 animate-spin" />
              )}
            </div>
          </div>

          <div className="flex-1 min-h-0 overflow-y-auto p-3">
            {users.length === 0 ? (
              <div className="h-full min-h-[260px] rounded-2xl border border-dashed border-border/70 bg-card/40 flex flex-col items-center justify-center text-center px-6">
                <div className="w-14 h-14 rounded-2xl bg-card/70 flex items-center justify-center mb-4">
                  <User className="w-7 h-7 text-foreground/30" />
                </div>
                <p className="text-sm font-medium text-foreground/70">没有找到匹配的用户</p>
                <p className="mt-1 text-xs text-foreground/40">试试更短的邮箱、昵称关键词，或切换到上一页继续查看。</p>
              </div>
            ) : (
              <div className="space-y-2">
                {users.map((user) => (
                  <div
                    key={user.id}
                    className={cn(
                      'rounded-2xl border cursor-pointer transition-all duration-200 p-4',
                      selectedUser?.id === user.id
                        ? 'bg-card/80 border-sky-500/30 shadow-lg shadow-sky-500/5'
                        : 'bg-card/60 border-border/70 hover:bg-card/70 hover:border-border/90',
                      user.disabled && 'opacity-60'
                    )}
                    onClick={() => selectUser(user)}
                  >
                    <div className="flex items-start gap-3">
                      <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-sky-500/20 to-emerald-500/20 flex items-center justify-center border border-border/70 shrink-0">
                        <span className="text-foreground font-medium">{user.name.charAt(0).toUpperCase()}</span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="font-medium text-foreground truncate">{user.name}</p>
                          <span
                            className={cn(
                              'px-2 py-0.5 text-[10px] rounded-full border shrink-0',
                              user.role === 'admin'
                                ? 'bg-sky-500/15 text-sky-400 border-sky-500/30'
                                : user.role === 'moderator'
                                  ? 'bg-blue-500/15 text-blue-400 border-blue-500/30'
                                  : 'bg-card/70 text-foreground/50 border-border/70'
                            )}
                          >
                            {user.role === 'admin'
                              ? '管理员'
                              : user.role === 'moderator'
                                ? '小管理员'
                                : '普通用户'}
                          </span>
                        </div>
                        <p className="text-sm text-foreground/40 truncate mt-1">{user.email}</p>
                        <div className="mt-3 flex items-center justify-between gap-3 text-xs text-foreground/45">
                          <span>余额 {formatBalance(user.balance)}</span>
                          <span>{formatDate(user.createdAt)}</span>
                        </div>
                      </div>
                      <div className="flex flex-col items-end gap-2 shrink-0">
                        {selectedUser?.id === user.id && (
                          <span className="w-6 h-6 rounded-full bg-sky-500/15 border border-sky-500/30 flex items-center justify-center">
                            <Check className="w-3.5 h-3.5 text-sky-400" />
                          </span>
                        )}
                        {user.disabled && <span className="text-[10px] text-red-400">已禁用</span>}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {total > 0 && (
            <div className="border-t border-border/70 p-4 bg-card/30">
              <PaginationControls
                page={page}
                pageSize={USERS_PAGE_SIZE}
                total={total}
                onPageChange={(nextPage) => loadUsers(nextPage, false)}
                loading={fetching}
              />
            </div>
          )}
        </div>

        <div className="min-h-0 overflow-hidden rounded-3xl border border-border/70 bg-card/40 backdrop-blur-sm">
          {selectedUser ? (
            <div className="flex h-full min-h-0 flex-col">
              <div className="border-b border-border/70 p-5 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-xs uppercase tracking-[0.2em] text-foreground/35">当前查看</p>
                  <h2 className="mt-1 text-xl font-semibold text-foreground">{selectedUser.name}</h2>
                  <p className="text-sm text-foreground/40">{selectedUser.email}</p>
                </div>
                <div className="text-sm text-foreground/45">详情区域独立滚动，切页后会自动同步到当前页的可见用户。</div>
              </div>

              <div className="flex-1 min-h-0 overflow-y-auto p-5">
                <div className="space-y-4">
                  {!canEditUser(selectedUser) && (
                    <div className="bg-amber-500/10 border border-amber-500/20 rounded-2xl p-4 flex items-center gap-3">
                      <ShieldAlert className="w-5 h-5 text-amber-400 flex-shrink-0" />
                      <p className="text-sm text-amber-400">你没有权限修改此用户（管理员账号）</p>
                    </div>
                  )}

                  <div className="bg-card/60 backdrop-blur-sm border border-border/70 rounded-2xl overflow-hidden">
                    <div className="p-5 border-b border-border/70 flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-blue-500/20 flex items-center justify-center">
                          <User className="w-5 h-5 text-blue-400" />
                        </div>
                        <span className="font-semibold text-foreground">用户信息</span>
                      </div>
                      {canEditUser(selectedUser) && (
                        <button
                          onClick={toggleDisabled}
                          className={cn(
                            'flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all',
                            selectedUser.disabled
                              ? 'bg-green-500/20 text-green-400 hover:bg-green-500/30 border border-green-500/30'
                              : 'bg-red-500/20 text-red-400 hover:bg-red-500/30 border border-red-500/30'
                          )}
                        >
                          {selectedUser.disabled ? (
                            <><Check className="w-4 h-4" /> 启用账号</>
                          ) : (
                            <><Ban className="w-4 h-4" /> 禁用账号</>
                          )}
                        </button>
                      )}
                    </div>
                    <div className="p-5 grid grid-cols-2 gap-5">
                      <div className="space-y-1">
                        <p className="text-xs text-foreground/40 uppercase tracking-wider">邮箱</p>
                        <p className="text-foreground font-medium">{selectedUser.email}</p>
                      </div>
                      <div className="space-y-1">
                        <p className="text-xs text-foreground/40 uppercase tracking-wider">昵称</p>
                        <p className="text-foreground font-medium">{selectedUser.name}</p>
                      </div>
                      <div className="space-y-1">
                        <p className="text-xs text-foreground/40 uppercase tracking-wider">角色</p>
                        <p className="text-foreground font-medium">
                          {selectedUser.role === 'admin' ? (
                            <span className="px-2 py-0.5 text-xs rounded-full bg-sky-500/20 text-sky-400 border border-sky-500/30">超级管理员</span>
                          ) : selectedUser.role === 'moderator' ? (
                            <span className="px-2 py-0.5 text-xs rounded-full bg-blue-500/20 text-blue-400 border border-blue-500/30">小管理员</span>
                          ) : (
                            <span className="px-2 py-0.5 text-xs rounded-full bg-card/70 text-foreground/60 border border-border/70">普通用户</span>
                          )}
                        </p>
                      </div>
                      <div className="space-y-1">
                        <p className="text-xs text-foreground/40 uppercase tracking-wider">注册时间</p>
                        <p className="text-foreground font-medium">{formatDate(selectedUser.createdAt)}</p>
                      </div>
                    </div>
                  </div>

                  {canEditUser(selectedUser) && (
                    <div className="bg-card/60 backdrop-blur-sm border border-border/70 rounded-2xl overflow-hidden">
                      <div className="p-5 border-b border-border/70 flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-orange-500/20 flex items-center justify-center">
                          <Key className="w-5 h-5 text-orange-400" />
                        </div>
                        <span className="font-semibold text-foreground">修改密码</span>
                      </div>
                      <div className="p-5">
                        {editMode === 'password' ? (
                          <div className="flex gap-3">
                            <input
                              type="password"
                              value={editValue}
                              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEditValue(e.target.value)}
                              placeholder="输入新密码（至少 6 位）"
                              className="flex-1 px-4 py-3 bg-card/60 border border-border/70 rounded-xl text-foreground placeholder:text-foreground/30 focus:outline-none focus:border-border/70 transition-all"
                            />
                            <button onClick={savePassword} className="px-5 py-3 bg-foreground text-background rounded-xl text-sm font-medium hover:bg-foreground/90 transition-colors">保存</button>
                            <button onClick={() => { setEditMode(null); setEditValue(''); }} className="px-5 py-3 bg-card/70 text-foreground rounded-xl text-sm font-medium hover:bg-card/80 transition-colors">取消</button>
                          </div>
                        ) : (
                          <button onClick={() => { setEditMode('password'); setEditValue(''); }} className="flex items-center gap-2 px-5 py-3 bg-card/60 border border-border/70 text-foreground rounded-xl text-sm font-medium hover:bg-card/70 transition-all">
                            <Edit2 className="w-4 h-4" />
                            重置密码
                          </button>
                        )}
                      </div>
                    </div>
                  )}

                  {canEditUser(selectedUser) && (
                    <div className="bg-card/60 backdrop-blur-sm border border-border/70 rounded-2xl overflow-hidden">
                      <div className="p-5 border-b border-border/70 flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-green-500/20 flex items-center justify-center">
                          <Coins className="w-5 h-5 text-green-400" />
                        </div>
                        <div>
                          <span className="font-semibold text-foreground">积分余额</span>
                          <p className="text-2xl font-bold text-green-400">{formatBalance(selectedUser.balance)}</p>
                        </div>
                      </div>
                      <div className="p-5">
                        {editMode === 'balance' ? (
                          <div className="flex gap-3">
                            <input
                              type="number"
                              value={editValue}
                              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEditValue(e.target.value)}
                              placeholder="输入新余额"
                              className="flex-1 px-4 py-3 bg-card/60 border border-border/70 rounded-xl text-foreground placeholder:text-foreground/30 focus:outline-none focus:border-border/70 transition-all"
                            />
                            <button onClick={saveBalance} className="px-5 py-3 bg-foreground text-background rounded-xl text-sm font-medium hover:bg-foreground/90 transition-colors">保存</button>
                            <button onClick={() => { setEditMode(null); setEditValue(''); }} className="px-5 py-3 bg-card/70 text-foreground rounded-xl text-sm font-medium hover:bg-card/80 transition-colors">取消</button>
                          </div>
                        ) : (
                          <button onClick={() => { setEditMode('balance'); setEditValue(String(selectedUser.balance)); }} className="flex items-center gap-2 px-5 py-3 bg-card/60 border border-border/70 text-foreground rounded-xl text-sm font-medium hover:bg-card/70 transition-all">
                            <Edit2 className="w-4 h-4" />
                            修改余额
                          </button>
                        )}
                      </div>
                    </div>
                  )}

                  {!canEditUser(selectedUser) && (
                    <div className="bg-card/60 backdrop-blur-sm border border-border/70 rounded-2xl overflow-hidden">
                      <div className="p-5 flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-green-500/20 flex items-center justify-center">
                          <Coins className="w-5 h-5 text-green-400" />
                        </div>
                        <div>
                          <span className="font-semibold text-foreground">积分余额</span>
                          <p className="text-2xl font-bold text-green-400">{formatBalance(selectedUser.balance)}</p>
                        </div>
                      </div>
                    </div>
                  )}

                  {isAdmin && selectedUser.role !== 'admin' && (
                    <div className="bg-card/60 backdrop-blur-sm border border-border/70 rounded-2xl overflow-hidden">
                      <div className="p-5 border-b border-border/70 flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-sky-500/20 flex items-center justify-center">
                          <ShieldAlert className="w-5 h-5 text-sky-400" />
                        </div>
                        <span className="font-semibold text-foreground">用户角色</span>
                      </div>
                      <div className="p-5">
                        <div className="flex gap-3">
                          <button
                            onClick={() => updateUser({ role: 'user' })}
                            className={cn(
                              'flex-1 px-4 py-3 rounded-xl text-sm font-medium transition-all border',
                              selectedUser.role === 'user'
                                ? 'bg-card/70 text-foreground border-border/70'
                                : 'bg-card/60 text-foreground/60 border-border/70 hover:bg-card/70 hover:text-foreground'
                            )}
                          >
                            普通用户
                          </button>
                          <button
                            onClick={() => updateUser({ role: 'moderator' })}
                            className={cn(
                              'flex-1 px-4 py-3 rounded-xl text-sm font-medium transition-all border',
                              selectedUser.role === 'moderator'
                                ? 'bg-blue-500/20 text-blue-400 border-blue-500/30'
                                : 'bg-card/60 text-foreground/60 border-border/70 hover:bg-blue-500/10 hover:text-blue-400'
                            )}
                          >
                            小管理员
                          </button>
                        </div>
                        <p className="text-xs text-foreground/40 mt-3">小管理员可以管理普通用户的积分、密码和禁用状态</p>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div className="h-full min-h-[420px] flex flex-col items-center justify-center text-center px-6">
              <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-card/60 border border-border/70 flex items-center justify-center">
                <User className="w-8 h-8 text-foreground/30" />
              </div>
              <p className="text-foreground/40">当前页没有可展示的用户详情</p>
              <p className="mt-1 text-sm text-foreground/30">搜索结果为空时，左侧列表和详情会一起收敛，避免出现失配状态。</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
