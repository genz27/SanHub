'use client';

import { useState, useEffect } from 'react';
import { useSession, signOut } from 'next-auth/react';
import { User, Key, LogOut, Loader2, Check, Mail, Shield, Coins, Gift, UserPlus, Copy, Ticket } from 'lucide-react';
import { toast } from '@/components/ui/toaster';
import { formatBalance } from '@/lib/utils';
import { useSiteConfig } from '@/components/providers/site-config-provider';

export default function SettingsPage() {
  const { data: session, update: updateSession } = useSession();
  const siteConfig = useSiteConfig();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  
  // Redemption code
  const [redeemCode, setRedeemCode] = useState('');
  const [redeemLoading, setRedeemLoading] = useState(false);
  
  // Invite code
  const [inviteCode, setInviteCode] = useState('');
  const [inviteLoading, setInviteLoading] = useState(false);
  const [myInviteCode, setMyInviteCode] = useState<string | null>(null);
  const [inviteCodeLoading, setInviteCodeLoading] = useState(false);

  useEffect(() => {
    if (!siteConfig.inviteEnabled) {
      setMyInviteCode(null);
      return;
    }

    loadMyInviteCode();
  }, [siteConfig.inviteEnabled]);

  const loadMyInviteCode = async () => {
    try {
      setInviteCodeLoading(true);
      const res = await fetch('/api/user/invite-code');
      if (res.ok) {
        const data = await res.json();
        setMyInviteCode(data.code || null);
      }
    } catch {
      // ignore
    } finally {
      setInviteCodeLoading(false);
    }
  };

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

  const handleRedeemCode = async () => {
    if (!redeemCode.trim()) {
      toast({ title: '请输入兑换码', variant: 'destructive' });
      return;
    }

    setRedeemLoading(true);
    try {
      const res = await fetch('/api/redeem', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: redeemCode.trim() }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      toast({ title: '兑换成功', description: `获得 ${formatBalance(data.points)} 积分` });
      setRedeemCode('');
      updateSession();
    } catch (err) {
      toast({ 
        title: '兑换失败', 
        description: err instanceof Error ? err.message : '未知错误',
        variant: 'destructive' 
      });
    } finally {
      setRedeemLoading(false);
    }
  };

  const handleUseInviteCode = async () => {
    if (!inviteCode.trim()) {
      toast({ title: '请输入邀请码', variant: 'destructive' });
      return;
    }

    setInviteLoading(true);
    try {
      const res = await fetch('/api/invite/use', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: inviteCode.trim() }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      toast({
        title: '使用成功',
        description:
          data.message ||
          (data.bonusPoints
            ? `获得 ${formatBalance(data.bonusPoints)} 积分`
            : '邀请码已绑定'),
      });
      setInviteCode('');
      updateSession();
    } catch (err) {
      toast({ 
        title: '使用失败', 
        description: err instanceof Error ? err.message : '未知错误',
        variant: 'destructive' 
      });
    } finally {
      setInviteLoading(false);
    }
  };

  const copyInviteCode = () => {
    if (myInviteCode) {
      navigator.clipboard.writeText(myInviteCode);
      toast({ title: '已复制邀请码' });
    }
  };

  if (!session?.user) {
    return null;
  }

  return (
    <div className="max-w-3xl mx-auto space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-light text-foreground">账号设置</h1>
        <p className="text-foreground/50 mt-1 font-light">管理您的账号信息和安全设置</p>
      </div>

      {/* User Info Card */}
      <div className="surface overflow-hidden">
        <div className="p-6 border-b border-border/70">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-card/60 border border-border/70 rounded-xl flex items-center justify-center">
              <User className="w-5 h-5 text-foreground" />
            </div>
            <div>
              <h2 className="text-lg font-medium text-foreground">个人信息</h2>
              <p className="text-sm text-foreground/40">您的账号基本信息</p>
            </div>
          </div>
        </div>
        <div className="p-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-foreground/40 text-sm">
                <User className="w-4 h-4" />
                <span>昵称</span>
              </div>
              <p className="text-foreground text-lg">{session.user.name}</p>
            </div>
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-foreground/40 text-sm">
                <Mail className="w-4 h-4" />
                <span>邮箱</span>
              </div>
              <p className="text-foreground text-lg">{session.user.email}</p>
            </div>
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-foreground/40 text-sm">
                <Shield className="w-4 h-4" />
                <span>角色</span>
              </div>
              <p className="text-foreground text-lg">
                {session.user.role === 'admin' ? (
                  <span className="inline-flex items-center gap-2">
                    管理员
                    <span className="px-2 py-0.5 bg-card/70 text-foreground/60 text-xs rounded border border-border/60">Admin</span>
                  </span>
                ) : '普通用户'}
              </p>
            </div>
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-foreground/40 text-sm">
                <Coins className="w-4 h-4" />
                <span>当前余额</span>
              </div>
              <p className="text-foreground text-2xl font-light">{formatBalance(session.user.balance)} <span className="text-sm text-foreground/40">积分</span></p>
            </div>
          </div>
        </div>
      </div>

      {/* Redeem Code Card */}
      <div className="surface overflow-hidden">
        <div className="p-6 border-b border-border/70">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-emerald-500/15 rounded-xl flex items-center justify-center border border-emerald-500/30">
              <Gift className="w-5 h-5 text-emerald-300" />
            </div>
            <div>
              <h2 className="text-lg font-medium text-foreground">积分兑换</h2>
              <p className="text-sm text-foreground/40">使用兑换码获取积分</p>
            </div>
          </div>
        </div>
        <div className="p-6 space-y-4">
          <div className="flex gap-3">
            <input
              type="text"
              value={redeemCode}
              onChange={(e) => setRedeemCode(e.target.value.toUpperCase())}
              placeholder="输入兑换码"
              className="flex-1 px-4 py-3 bg-input/70 border border-border/70 rounded-xl text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:border-border focus:ring-2 focus:ring-ring/30 transition-colors uppercase tracking-wider"
            />
            <button
              onClick={handleRedeemCode}
              disabled={redeemLoading}
              className="flex items-center gap-2 px-6 py-3 bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 rounded-xl font-medium hover:bg-emerald-500/25 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {redeemLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Ticket className="w-4 h-4" />}
              兑换
            </button>
          </div>
        </div>
      </div>

      {/* Invite Code Card */}
      {siteConfig.inviteEnabled && (
      <div className="surface overflow-hidden">
        <div className="p-6 border-b border-border/70">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-sky-500/15 rounded-xl flex items-center justify-center border border-sky-500/30">
              <UserPlus className="w-5 h-5 text-sky-300" />
            </div>
            <div>
              <h2 className="text-lg font-medium text-foreground">邀请码</h2>
              <p className="text-sm text-foreground/40">
                {siteConfig.inviteRewardEnabled
                  ? `邀请好友可获得积分奖励，当前奖励：被邀请人 ${formatBalance(siteConfig.inviteeBonusPoints)}，邀请人 ${formatBalance(siteConfig.inviterBonusPoints)}`
                  : '可绑定邀请关系，当前不发放积分奖励'}
              </p>
            </div>
          </div>
        </div>
        <div className="p-6 space-y-6">
          {/* My invite code */}
          <div className="space-y-2">
            <label className="text-sm text-foreground/50 uppercase tracking-wider">我的邀请码</label>
            <div className="flex gap-3">
              <div className="flex-1 px-4 py-3 bg-card/60 border border-border/70 rounded-xl text-foreground font-mono tracking-wider flex items-center">
                {inviteCodeLoading ? (
                  <Loader2 className="w-4 h-4 animate-spin text-foreground/40" />
                ) : myInviteCode ? (
                  myInviteCode
                ) : (
                  <span className="text-foreground/40">暂无邀请码</span>
                )}
              </div>
              {myInviteCode && (
                <button
                  onClick={copyInviteCode}
                  className="flex items-center gap-2 px-4 py-3 bg-card/60 border border-border/70 text-foreground/60 rounded-xl hover:bg-card/80 hover:text-foreground transition-colors"
                >
                  <Copy className="w-4 h-4" />
                </button>
              )}
            </div>
            <p className="text-xs text-foreground/40">
              {siteConfig.inviteRewardEnabled
                ? `分享给好友后，双方将分别获得 ${formatBalance(siteConfig.inviterBonusPoints)} / ${formatBalance(siteConfig.inviteeBonusPoints)} 积分`
                : '分享邀请码可建立邀请关系，但不会发放积分奖励'}
            </p>
          </div>
          
          {/* Use invite code */}
          <div className="space-y-2">
            <label className="text-sm text-foreground/50 uppercase tracking-wider">使用邀请码</label>
            <div className="flex gap-3">
              <input
                type="text"
                value={inviteCode}
                onChange={(e) => setInviteCode(e.target.value.toUpperCase())}
                placeholder="输入他人的邀请码"
                className="flex-1 px-4 py-3 bg-input/70 border border-border/70 rounded-xl text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:border-border focus:ring-2 focus:ring-ring/30 transition-colors uppercase tracking-wider"
              />
              <button
                onClick={handleUseInviteCode}
                disabled={inviteLoading}
                className="flex items-center gap-2 px-6 py-3 bg-sky-500/15 border border-sky-500/30 text-sky-300 rounded-xl font-medium hover:bg-sky-500/25 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {inviteLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                使用
              </button>
            </div>
          </div>
        </div>
      </div>
      )}

      {/* Change Password Card */}
      <div className="surface overflow-hidden">
        <div className="p-6 border-b border-border/70">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-card/60 border border-border/70 rounded-xl flex items-center justify-center">
              <Key className="w-5 h-5 text-foreground" />
            </div>
            <div>
              <h2 className="text-lg font-medium text-foreground">修改密码</h2>
              <p className="text-sm text-foreground/40">更新您的登录密码</p>
            </div>
          </div>
        </div>
        <div className="p-6 space-y-5">
          <div className="space-y-2">
            <label className="text-sm text-foreground/50 uppercase tracking-wider">当前密码</label>
            <input
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              placeholder="输入当前密码"
              className="w-full px-4 py-3 bg-input/70 border border-border/70 rounded-xl text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:border-border focus:ring-2 focus:ring-ring/30 transition-colors"
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm text-foreground/50 uppercase tracking-wider">新密码</label>
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="至少 6 个字符"
              className="w-full px-4 py-3 bg-input/70 border border-border/70 rounded-xl text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:border-border focus:ring-2 focus:ring-ring/30 transition-colors"
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm text-foreground/50 uppercase tracking-wider">确认新密码</label>
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="再次输入新密码"
              className="w-full px-4 py-3 bg-input/70 border border-border/70 rounded-xl text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:border-border focus:ring-2 focus:ring-ring/30 transition-colors"
            />
          </div>
          <button
            onClick={handleChangePassword}
            disabled={loading}
            className="flex items-center gap-2 px-6 py-3 bg-foreground text-background rounded-xl font-medium hover:opacity-90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
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
      <div className="surface overflow-hidden">
        <div className="p-6 border-b border-border/70">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-red-500/10 rounded-xl flex items-center justify-center border border-red-500/30">
              <LogOut className="w-5 h-5 text-red-300" />
            </div>
            <div>
              <h2 className="text-lg font-medium text-foreground">退出登录</h2>
              <p className="text-sm text-foreground/40">退出当前账号</p>
            </div>
          </div>
        </div>
        <div className="p-6">
          <button 
            onClick={() => signOut({ callbackUrl: '/login' })}
            className="flex items-center gap-2 px-6 py-3 bg-red-500/10 border border-red-500/30 text-red-300 rounded-xl font-medium hover:bg-red-500/20 transition-colors"
          >
            <LogOut className="w-4 h-4" />
            退出登录
          </button>
        </div>
      </div>
    </div>
  );
}
