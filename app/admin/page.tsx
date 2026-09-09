'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useSession } from 'next-auth/react';
import { Users, Coins, TrendingUp, Activity, BarChart3 } from 'lucide-react';
import type { SafeUser, StatsOverview } from '@/types';
import { formatBalance } from '@/lib/utils';
import { toast } from '@/components/ui/toaster';
import { StatCardSkeleton, TableRowSkeleton, Skeleton } from '@/components/ui/skeleton';

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
      <div className="space-y-8">
        <div>
          <Skeleton className="w-24 h-9" />
          <Skeleton className="w-36 h-4 mt-2" />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => <StatCardSkeleton key={i} />)}
        </div>
        <div>
          <Skeleton className="w-24 h-6 mb-4" />
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-36 rounded-2xl" />
            ))}
          </div>
        </div>
        {isAdmin && (
          <div>
            <Skeleton className="w-24 h-6 mb-4" />
            <div className="bg-card/60 border border-border/70 rounded-2xl overflow-hidden">
              <div className="flex items-center gap-4 px-5 py-4 border-b border-border/70">
                <Skeleton className="w-32 h-5" />
                <Skeleton className="w-24 h-5" />
                <Skeleton className="w-16 h-5 ml-auto" />
                <Skeleton className="w-16 h-5" />
              </div>
              <TableRowSkeleton cols={4} rows={5} />
            </div>
          </div>
        )}
      </div>
    );
  }

  const totalBalance = stats?.totalPoints || 0;
  const activeUsers = stats?.activeUsers || 0;
  const avgBalance = stats && stats.totalUsers > 0 ? Math.round(totalBalance / stats.totalUsers) : 0;

  // Compute trends from dailyStats (last element = today, second-to-last = yesterday)
  const dailyStatsArr = stats?.dailyStats || [];
  const last = dailyStatsArr[dailyStatsArr.length - 1];
  const prev = dailyStatsArr.length >= 2 ? dailyStatsArr[dailyStatsArr.length - 2] : null;
  const todayUsersNum = stats?.todayUsers || 0;

  const userTrend = todayUsersNum - (prev?.users || 0);
  const pointsTrend = (last?.points || 0) - (prev?.points || 0);
  const activeTrend = todayUsersNum - (prev?.users || 0);
  const prevAvg = prev && prev.users > 0 ? Math.round(prev.points / prev.users) : 0;
  const avgTrend = prevAvg > 0 ? avgBalance - prevAvg : 0;

  const statCards = [
    {
      label: '注册用户',
      value: stats?.totalUsers || 0,
      icon: Users,
      color: 'from-blue-500 to-cyan-500',
      bgColor: 'bg-blue-500/20',
      iconColor: 'text-blue-400',
      href: '/admin/users' as const,
      trend: userTrend,
    },
    {
      label: '总积分',
      value: formatBalance(totalBalance),
      icon: Coins,
      color: 'from-green-500 to-emerald-500',
      bgColor: 'bg-green-500/20',
      iconColor: 'text-green-400',
      href: '/admin/redemption' as const,
      trend: pointsTrend,
    },
    {
      label: '活跃用户',
      value: activeUsers,
      icon: Activity,
      color: 'from-sky-500 to-sky-500',
      bgColor: 'bg-sky-500/20',
      iconColor: 'text-sky-400',
      href: '/admin/users' as const,
      trend: activeTrend,
    },
    {
      label: '平均积分',
      value: avgBalance,
      icon: TrendingUp,
      color: 'from-orange-500 to-amber-500',
      bgColor: 'bg-orange-500/20',
      iconColor: 'text-orange-400',
      trend: avgTrend,
    },
  ];

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-light text-foreground">概览</h1>
        <p className="text-foreground/50 mt-1">系统运行状态</p>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {statCards.map((stat, index) => {
          const cardContent = (
            <div
              className={`bg-card/60 backdrop-blur-sm border border-border/70 rounded-2xl p-5 hover:border-border/70 transition-all duration-300${stat.href ? ' cursor-pointer hover:scale-[1.02]' : ''}`}
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
              {stat.trend !== undefined && (
                <div className="mt-3 flex items-center gap-1">
                  {stat.trend > 0 ? (
                    <span className="text-xs text-green-400 flex items-center gap-0.5">
                      <TrendingUp className="w-3 h-3" /> +{stat.trend}
                    </span>
                  ) : stat.trend < 0 ? (
                    <span className="text-xs text-red-400 flex items-center gap-0.5">
                      <TrendingUp className="w-3 h-3 rotate-180" /> {stat.trend}
                    </span>
                  ) : (
                    <span className="text-xs text-foreground/30">持平</span>
                  )}
                  <span className="text-xs text-foreground/30">较昨日</span>
                </div>
              )}
            </div>
          );

          return stat.href ? (
            <Link key={index} href={stat.href}>
              {cardContent}
            </Link>
          ) : (
            <div key={index}>
              {cardContent}
            </div>
          );
        })}
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
