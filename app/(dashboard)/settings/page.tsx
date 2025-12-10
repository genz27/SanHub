'use client';

import { useState } from 'react';
import { useSession, signOut } from 'next-auth/react';
import { User, Key, LogOut, Loader2, Check, Mail, Shield, Coins } from 'lucide-react';
import { toast } from '@/components/ui/toaster';
import { formatBalance } from '@/lib/utils';

export default function SettingsPage() {
  const { data: session } = useSession();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleChangePassword = async () => {
    if (!newPassword || !confirmPassword) {
      toast({ title: '请填写新密码', variant: 'destructive' });
      return;
    }
    if (newPassword !== confirmPassword) {
      toast({ title: '两次密码不一致', variant: 'destructive' });
      return;
    }
    if (newPassword.length < 6) {
      toast({ title: '密码至少 6 个字符', variant: 'destructive' });
      return;
    }

    setLoading(true);
    try {
      const res = await fetch('/api/user/password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword, newPassword }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      toast({ title: '密码修改成功' });
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err) {
      toast({ 
        title: '修改失败', 
        description: err instanceof Error ? err.message : '未知错误',
        variant: 'destructive' 
      });
    } finally {
      setLoading(false);
    }
  };

  if (!session?.user) {
    return null;
  }

  return (
    <div className="max-w-3xl mx-auto space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-extralight text-white">账号设置</h1>
        <p className="text-white/50 mt-1 font-light">管理您的账号信息和安全设置</p>
      </div>

      {/* User Info Card */}
      <div className="bg-white/5 border border-white/10 rounded-2xl overflow-hidden">
        <div className="p-6 border-b border-white/10">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-white/10 rounded-xl flex items-center justify-center">
              <User className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="text-lg font-medium text-white">个人信息</h2>
              <p className="text-sm text-white/40">您的账号基本信息</p>
            </div>
          </div>
        </div>
        <div className="p-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-white/40 text-sm">
                <User className="w-4 h-4" />
                <span>昵称</span>
              </div>
              <p className="text-white text-lg">{session.user.name}</p>
            </div>
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-white/40 text-sm">
                <Mail className="w-4 h-4" />
                <span>邮箱</span>
              </div>
              <p className="text-white text-lg">{session.user.email}</p>
            </div>
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-white/40 text-sm">
                <Shield className="w-4 h-4" />
                <span>角色</span>
              </div>
              <p className="text-white text-lg">
                {session.user.role === 'admin' ? (
                  <span className="inline-flex items-center gap-2">
                    管理员
                    <span className="px-2 py-0.5 bg-white/10 text-white/60 text-xs rounded">Admin</span>
                  </span>
                ) : '普通用户'}
              </p>
            </div>
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-white/40 text-sm">
                <Coins className="w-4 h-4" />
                <span>当前余额</span>
              </div>
              <p className="text-white text-2xl font-light">{formatBalance(session.user.balance)} <span className="text-sm text-white/40">积分</span></p>
            </div>
          </div>
        </div>
      </div>

      {/* Change Password Card */}
      <div className="bg-white/5 border border-white/10 rounded-2xl overflow-hidden">
        <div className="p-6 border-b border-white/10">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-white/10 rounded-xl flex items-center justify-center">
              <Key className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="text-lg font-medium text-white">修改密码</h2>
              <p className="text-sm text-white/40">更新您的登录密码</p>
            </div>
          </div>
        </div>
        <div className="p-6 space-y-5">
          <div className="space-y-2">
            <label className="text-sm text-white/50 uppercase tracking-wider">当前密码</label>
            <input
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              placeholder="输入当前密码"
              className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder:text-white/30 focus:outline-none focus:border-white/30 transition-colors"
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm text-white/50 uppercase tracking-wider">新密码</label>
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="至少 6 个字符"
              className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder:text-white/30 focus:outline-none focus:border-white/30 transition-colors"
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm text-white/50 uppercase tracking-wider">确认新密码</label>
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="再次输入新密码"
              className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder:text-white/30 focus:outline-none focus:border-white/30 transition-colors"
            />
          </div>
          <button
            onClick={handleChangePassword}
            disabled={loading}
            className="flex items-center gap-2 px-6 py-3 bg-white text-black rounded-xl font-medium hover:bg-white/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? (
              <><Loader2 className="w-4 h-4 animate-spin" /> 保存中...</>
            ) : (
              <><Check className="w-4 h-4" /> 保存密码</>
            )}
          </button>
        </div>
      </div>

      {/* Logout Card */}
      <div className="bg-white/5 border border-white/10 rounded-2xl overflow-hidden">
        <div className="p-6 border-b border-white/10">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-red-500/10 rounded-xl flex items-center justify-center">
              <LogOut className="w-5 h-5 text-red-400" />
            </div>
            <div>
              <h2 className="text-lg font-medium text-white">退出登录</h2>
              <p className="text-sm text-white/40">退出当前账号</p>
            </div>
          </div>
        </div>
        <div className="p-6">
          <button 
            onClick={() => signOut({ callbackUrl: '/login' })}
            className="flex items-center gap-2 px-6 py-3 bg-red-500/10 border border-red-500/20 text-red-400 rounded-xl font-medium hover:bg-red-500/20 transition-colors"
          >
            <LogOut className="w-4 h-4" />
            退出登录
          </button>
        </div>
      </div>
    </div>
  );
}
