'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useSession } from 'next-auth/react';
import { Users, Coins, Loader2, Settings, ChevronRight, TrendingUp, Activity, Zap, BarChart3, Ticket, History } from 'lucide-react';
import type { SafeUser, StatsOverview } from '@/types';
import { formatBalance } from '@/lib/utils';
import { toast } from '@/components/ui/toaster';

export default function AdminPage() {
  const { data: session } = useSession();
  const [users, setUsers] = useState<SafeUser[]>([]);
  const [stats, setStats] = useState<StatsOverview | null>(null);
  const [loading, setLoading] = useState(true);

  const isAdmin = session?.user?.role === 'admin';

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [statsRes, usersRes] = await Promise.all([
        fetch('/api/admin/stats?days=7'),
        fetch('/api/admin/users?page=1&limit=5'),
      ]);

      if (statsRes.ok) {
        const data = await statsRes.json();
        setStats(data.data || null);
      } else {
        const data = await statsRes.json().catch(() => ({}));
        toast({ title: '统计加载失败', description: data.error || '无法获取统计数据', variant: 'destructive' });
        setStats({
          totalUsers: 0,
          activeUsers: 0,
          totalChatModels: 0,
          enabledChatModels: 0,
          totalGenerations: 0,
          totalPoints: 0,
          todayUsers: 0,
          todayGenerations: 0,
          dailyStats: [],
          generationTypes: [],
        });
      }

      if (usersRes.ok) {
        const data = await usersRes.json();
        setUsers(data.data || []);
      } else {
        const data = await usersRes.json().catch(() => ({}));
        toast({ title: '用户加载失败', description: data.error || '无法获取用户列表', variant: 'destructive' });
        setUsers([]);
      }
    } catch (err) {
      toast({ title: '加载失败', description: err instanceof Error ? err.message : '无法加载数据', variant: 'destructive' });
      setStats({
        totalUsers: 0,
        activeUsers: 0,
        totalChatModels: 0,
        enabledChatModels: 0,
        totalGenerations: 0,
        totalPoints: 0,
        todayUsers: 0,
        todayGenerations: 0,
        dailyStats: [],
        generationTypes: [],
      });
      setUsers([]);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="w-8 h-8 animate-spin text-foreground/30" />
          <p className="text-sm text-foreground/40">加载数据中...</p>
        </div>
      </div>
    );
  }

  const totalBalance = stats?.totalPoints || 0;
  const activeUsers = stats?.activeUsers || 0;
  const avgBalance = stats && stats.totalUsers > 0 ? Math.round(totalBalance / stats.totalUsers) : 0;

  const statCards = [
    { 
      label: '注册用户', 
      value: stats?.totalUsers || 0, 
      icon: Users, 
      color: 'from-blue-500 to-cyan-500',
      bgColor: 'bg-blue-500/20',
      iconColor: 'text-blue-400'
    },
    { 
      label: '总积分', 
      value: formatBalance(totalBalance), 
      icon: Coins, 
      color: 'from-green-500 to-emerald-500',
      bgColor: 'bg-green-500/20',
      iconColor: 'text-green-400'
    },
    { 
      label: '活跃用户', 
      value: activeUsers, 
      icon: Activity, 
      color: 'from-sky-500 to-sky-500',
      bgColor: 'bg-sky-500/20',
      iconColor: 'text-sky-400'
    },
    { 
      label: '平均积分', 
      value: avgBalance, 
      icon: TrendingUp, 
      color: 'from-orange-500 to-amber-500',
      bgColor: 'bg-orange-500/20',
      iconColor: 'text-orange-400'
    },
  ];

  // Moderator 只能看到有限的快捷入口
  const allQuickLinks = [
    { href: '/admin/users', label: '用户管理', desc: '管理用户账号和权限', icon: Users, color: 'from-blue-500/20 to-cyan-500/20', roles: ['admin', 'moderator'] },
    { href: '/admin/stats', label: '数据统计', desc: '查看生成量和用户增长', icon: BarChart3, color: 'from-sky-500/20 to-sky-500/20', roles: ['admin', 'moderator'] },
    { href: '/admin/redemption', label: '卡密管理', desc: '生成和管理积分卡密', icon: Ticket, color: 'from-green-500/20 to-emerald-500/20', roles: ['admin', 'moderator'] },
    { href: '/admin/generations', label: '生成记录', desc: '管理所有生成历史', icon: History, color: 'from-orange-500/20 to-amber-500/20', roles: ['admin'] },
    { href: '/admin/pricing', label: '积分定价', desc: '配置各服务消耗积分', icon: Coins, color: 'from-emerald-500/20 to-amber-500/20', roles: ['admin'] },
    { href: '/admin/image-channels', label: '图像渠道', desc: '管理图像生成渠道和模型', icon: Settings, color: 'from-cyan-500/20 to-teal-500/20', roles: ['admin'] },
  ];

  const userRole = session?.user?.role || 'user';
  const quickLinks = allQuickLinks.filter(item => item.roles.includes(userRole));

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-light text-foreground">概览</h1>
        <p className="text-foreground/50 mt-1">系统运行状态</p>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {statCards.map((stat, index) => (
          <div 
            key={index}
            className="bg-card/60 backdrop-blur-sm border border-border/70 rounded-2xl p-5 hover:border-border/70 transition-all duration-300"
          >
            <div className="flex items-center gap-4">
              <div className={`w-12 h-12 ${stat.bgColor} rounded-xl flex items-center justify-center`}>
                <stat.icon className={`w-6 h-6 ${stat.iconColor}`} />
              </div>
              <div>
                <p className="text-2xl font-semibold text-foreground">{stat.value}</p>
                <p className="text-sm text-foreground/50">{stat.label}</p>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Quick Links */}
      <div>
        <h2 className="text-lg font-semibold text-foreground mb-4">快捷入口</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {quickLinks.map((item) => (
            <Link key={item.href} href={item.href}>
              <div className="bg-card/60 backdrop-blur-sm border border-border/70 rounded-2xl p-5 hover:border-border/70 hover:bg-card/70 transition-all duration-300 group h-full">
                <div className="flex flex-col h-full">
                  <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${item.color} flex items-center justify-center mb-4`}>
                    <item.icon className="w-6 h-6 text-foreground" />
                  </div>
                  <div className="flex-1">
                    <p className="font-semibold text-foreground mb-1">{item.label}</p>
                    <p className="text-sm text-foreground/50">{item.desc}</p>
                  </div>
                  <div className="flex items-center gap-1 mt-4 text-foreground/40 group-hover:text-foreground/70 transition-colors">
                    <span className="text-sm">进入</span>
                    <ChevronRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                  </div>
                </div>
              </div>
            </Link>
          ))}
        </div>
      </div>

      {/* Recent Users - 仅管理员可见 */}
      {isAdmin && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-foreground">最近注册</h2>
            <Link href="/admin/users" className="text-sm text-foreground/50 hover:text-foreground/80 transition-colors">
              查看全部 →
            </Link>
          </div>
          <div className="bg-card/60 backdrop-blur-sm border border-border/70 rounded-2xl overflow-hidden">
            <div className="overflow-x-auto no-scrollbar">
              <table className="w-full min-w-[640px]">
                <thead>
                  <tr className="border-b border-border/70">
                    <th className="text-left text-sm font-medium text-foreground/50 px-5 py-4">用户</th>
                    <th className="text-left text-sm font-medium text-foreground/50 px-5 py-4">邮箱</th>
                    <th className="text-right text-sm font-medium text-foreground/50 px-5 py-4">积分</th>
                    <th className="text-right text-sm font-medium text-foreground/50 px-5 py-4">状态</th>
                  </tr>
                </thead>
                <tbody>
                  {users.slice(0, 5).map((user) => (
                    <tr key={user.id} className="border-b border-border/70 last:border-0 hover:bg-card/60 transition-colors">
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-full bg-gradient-to-br from-sky-500 to-emerald-500 flex items-center justify-center text-foreground text-sm font-medium">
                            {user.name.charAt(0).toUpperCase()}
                          </div>
                          <span className="text-foreground font-medium">{user.name}</span>
                        </div>
                      </td>
                      <td className="px-5 py-4 text-foreground/60">{user.email}</td>
                      <td className="px-5 py-4 text-right">
                        <span className="text-foreground font-medium">{formatBalance(user.balance)}</span>
                      </td>
                      <td className="px-5 py-4 text-right">
                        {user.disabled ? (
                          <span className="px-2.5 py-1 text-xs rounded-full bg-red-500/20 text-red-400 border border-red-500/30">
                            已禁用
                          </span>
                        ) : (
                          <span className="px-2.5 py-1 text-xs rounded-full bg-green-500/20 text-green-400 border border-green-500/30">
                            正常
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {users.length === 0 && (
              <div className="text-center py-12 text-foreground/40">
                暂无用户数据
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

