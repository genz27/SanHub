'use client';

import { useCallback, useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { Ban, Check, Key, Loader2, ShieldAlert, User } from 'lucide-react';
import type { SafeUser, StatsOverview, UserRole } from '@/types';
import { formatBalance, formatDate } from '@/lib/utils';
import { PaginationControls } from '@/components/admin/pagination';
import {
  AdminEmpty,
  AdminGhostButton,
  AdminHeader,
  AdminPanel,
  AdminPill,
  AdminSearchInput,
  AdminTable,
  AdminTd,
  AdminTh,
  AdminToolbar,
} from '@/components/admin/admin-chrome';
import { Modal } from '@/components/ui/modal';
import { toast } from '@/components/ui/toaster';

const USERS_PAGE_SIZE = 20;

function roleLabel(role: UserRole): string {
  if (role === 'admin') return '管理员';
  if (role === 'moderator') return '小管理员';
  return '普通用户';
}

function roleTone(role: UserRole): 'info' | 'neutral' {
  return role === 'user' ? 'neutral' : 'info';
}

export default function UsersPage() {
  const { data: session } = useSession();
  const [users, setUsers] = useState<SafeUser[]>([]);
  const [stats, setStats] = useState<StatsOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [fetching, setFetching] = useState(false);
  const [saving, setSaving] = useState(false);
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
      if (term) params.set('q', term);

      const res = await fetch(`/api/admin/users?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        const nextUsers: SafeUser[] = data.data || [];
        setUsers(nextUsers);
        setPage(data.page || nextPage);
        setTotal(data.total || 0);
        setSelectedUser((currentSelected) => {
          if (!currentSelected) return null;
          return nextUsers.find((user) => user.id === currentSelected.id) || null;
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
      void loadUsers(1, true);
    }, 300);
    return () => clearTimeout(handle);
  }, [loadUsers]);

  useEffect(() => {
    fetch('/api/admin/stats?days=2')
      .then((res) => res.ok && res.json())
      .then((data) => data?.data && setStats(data.data))
      .catch(() => {});
  }, []);

  const updateUser = async (updates: Record<string, unknown>) => {
    if (!selectedUser) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/users/${selectedUser.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(payload.error || '更新失败');
      }
      setSelectedUser({ ...selectedUser, ...payload });
      setUsers((currentUsers) =>
        currentUsers.map((user) =>
          user.id === selectedUser.id ? { ...user, ...payload } : user
        )
      );
      setEditMode(null);
      setEditValue('');
      toast({ title: '已保存' });
    } catch (err) {
      toast({
        title: '更新失败',
        description: err instanceof Error ? err.message : '无法更新用户',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  const savePassword = () => {
    if (!editValue.trim() || editValue.length < 6) {
      toast({ title: '密码至少 6 个字符', variant: 'destructive' });
      return;
    }
    void updateUser({ password: editValue });
  };

  const saveBalance = () => {
    const balance = parseInt(editValue, 10);
    if (Number.isNaN(balance) || balance < 0) {
      toast({ title: '请输入有效的积分数值', variant: 'destructive' });
      return;
    }
    void updateUser({ balance });
  };

  const closeDrawer = () => {
    setSelectedUser(null);
    setEditMode(null);
    setEditValue('');
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <AdminHeader title="用户管理" description="管理用户账号、余额和权限" />
        <div className="flex h-48 items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <AdminHeader
        title="用户管理"
        description={
          stats ? (
            <span>
              {stats.totalUsers} 用户 · {stats.activeUsers} 活跃 · 今日新增 {stats.todayUsers}
            </span>
          ) : (
            <span>共 {total} 条</span>
          )
        }
      />

      <AdminToolbar>
        <AdminSearchInput
          value={search}
          onChange={setSearch}
          placeholder="搜索邮箱或昵称"
          trailing={fetching ? <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" /> : null}
        />
      </AdminToolbar>

      <AdminPanel>
        {users.length === 0 ? (
          <AdminEmpty
            icon={<User className="h-8 w-8" />}
            title="没有找到匹配的用户"
            description="试试更短的邮箱或昵称关键词。"
          />
        ) : (
          <AdminTable>
            <thead>
              <tr>
                <AdminTh>用户</AdminTh>
                <AdminTh>角色</AdminTh>
                <AdminTh align="right">积分</AdminTh>
                <AdminTh>状态</AdminTh>
                <AdminTh>注册时间</AdminTh>
                <AdminTh align="right">操作</AdminTh>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => (
                <tr
                  key={user.id}
                  className="cursor-pointer hover:bg-accent/50"
                  onClick={() => {
                    setSelectedUser(user);
                    setEditMode(null);
                    setEditValue('');
                  }}
                >
                  <AdminTd>
                    <div className="min-w-0">
                      <p className="truncate font-medium text-foreground">{user.name}</p>
                      <p className="truncate text-xs text-muted-foreground">{user.email}</p>
                    </div>
                  </AdminTd>
                  <AdminTd>
                    <AdminPill tone={roleTone(user.role)}>{roleLabel(user.role)}</AdminPill>
                  </AdminTd>
                  <AdminTd align="right">{formatBalance(user.balance)}</AdminTd>
                  <AdminTd>
                    <AdminPill tone={user.disabled ? 'danger' : 'success'}>
                      {user.disabled ? '已禁用' : '正常'}
                    </AdminPill>
                  </AdminTd>
                  <AdminTd>
                    <span className="text-muted-foreground">{formatDate(user.createdAt)}</span>
                  </AdminTd>
                  <AdminTd align="right">
                    <AdminGhostButton
                      onClick={() => {
                        setSelectedUser(user);
                        setEditMode(null);
                        setEditValue('');
                      }}
                    >
                      管理
                    </AdminGhostButton>
                  </AdminTd>
                </tr>
              ))}
            </tbody>
          </AdminTable>
        )}
      </AdminPanel>

      {total > 0 && (
        <PaginationControls
          page={page}
          pageSize={USERS_PAGE_SIZE}
          total={total}
          onPageChange={(nextPage) => void loadUsers(nextPage, false)}
          loading={fetching}
        />
      )}

      <Modal
        open={selectedUser !== null}
        onClose={closeDrawer}
        title={selectedUser ? selectedUser.name : '用户'}
        size="md"
      >
        {selectedUser && (
          <div className="space-y-5">
            <div>
              <p className="text-sm text-muted-foreground">{selectedUser.email}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                注册于 {formatDate(selectedUser.createdAt)}
              </p>
            </div>

            {!canEditUser(selectedUser) && (
              <div className="flex items-start gap-2 rounded-md border border-amber-500/20 bg-amber-500/10 px-3 py-2 text-sm text-amber-400">
                <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
                你没有权限修改此用户
              </div>
            )}

            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <p className="text-xs text-muted-foreground">角色</p>
                <p className="mt-1">{roleLabel(selectedUser.role)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">积分</p>
                <p className="mt-1">{formatBalance(selectedUser.balance)}</p>
              </div>
            </div>

            {canEditUser(selectedUser) && (
              <div className="space-y-3 border-t border-border pt-4">
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => void updateUser({ disabled: !selectedUser.disabled })}
                  className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border px-2.5 text-xs hover:bg-accent"
                >
                  {selectedUser.disabled ? <Check className="h-3.5 w-3.5" /> : <Ban className="h-3.5 w-3.5" />}
                  {selectedUser.disabled ? '启用账号' : '禁用账号'}
                </button>

                <div className="space-y-2">
                  <p className="text-xs text-muted-foreground">重置密码</p>
                  {editMode === 'password' ? (
                    <div className="flex gap-2">
                      <input
                        type="password"
                        value={editValue}
                        onChange={(event) => setEditValue(event.target.value)}
                        placeholder="至少 6 位"
                        className="h-9 flex-1 rounded-md border border-border bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring/30"
                      />
                      <button
                        type="button"
                        disabled={saving}
                        onClick={savePassword}
                        className="h-9 rounded-md bg-foreground px-3 text-sm text-background"
                      >
                        保存
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setEditMode(null);
                          setEditValue('');
                        }}
                        className="h-9 rounded-md border border-border px-3 text-sm"
                      >
                        取消
                      </button>
                    </div>
                  ) : (
                    <AdminGhostButton onClick={() => { setEditMode('password'); setEditValue(''); }}>
                      <Key className="h-3.5 w-3.5" />
                      重置密码
                    </AdminGhostButton>
                  )}
                </div>

                <div className="space-y-2">
                  <p className="text-xs text-muted-foreground">修改余额</p>
                  {editMode === 'balance' ? (
                    <div className="flex gap-2">
                      <input
                        type="number"
                        value={editValue}
                        onChange={(event) => setEditValue(event.target.value)}
                        className="h-9 flex-1 rounded-md border border-border bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring/30"
                      />
                      <button
                        type="button"
                        disabled={saving}
                        onClick={saveBalance}
                        className="h-9 rounded-md bg-foreground px-3 text-sm text-background"
                      >
                        保存
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setEditMode(null);
                          setEditValue('');
                        }}
                        className="h-9 rounded-md border border-border px-3 text-sm"
                      >
                        取消
                      </button>
                    </div>
                  ) : (
                    <AdminGhostButton
                      onClick={() => {
                        setEditMode('balance');
                        setEditValue(String(selectedUser.balance));
                      }}
                    >
                      修改余额
                    </AdminGhostButton>
                  )}
                </div>
              </div>
            )}

            {isAdmin && selectedUser.role !== 'admin' && (
              <div className="space-y-2 border-t border-border pt-4">
                <p className="text-xs text-muted-foreground">用户角色</p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled={saving}
                    onClick={() => void updateUser({ role: 'user' })}
                    className={`h-8 flex-1 rounded-md border px-2 text-xs ${
                      selectedUser.role === 'user'
                        ? 'border-foreground bg-foreground text-background'
                        : 'border-border text-muted-foreground hover:bg-accent'
                    }`}
                  >
                    普通用户
                  </button>
                  <button
                    type="button"
                    disabled={saving}
                    onClick={() => void updateUser({ role: 'moderator' })}
                    className={`h-8 flex-1 rounded-md border px-2 text-xs ${
                      selectedUser.role === 'moderator'
                        ? 'border-foreground bg-foreground text-background'
                        : 'border-border text-muted-foreground hover:bg-accent'
                    }`}
                  >
                    小管理员
                  </button>
                </div>
                <p className="text-xs text-muted-foreground">
                  小管理员可以管理普通用户的积分、密码和禁用状态。
                </p>
              </div>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}
