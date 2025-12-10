'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Users, Coins, Bot, Loader2, Settings, ChevronRight } from 'lucide-react';
import type { SafeUser } from '@/types';
import { formatBalance } from '@/lib/utils';

export default function AdminPage() {
  const [users, setUsers] = useState<SafeUser[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const res = await fetch('/api/admin/users');
      if (res.ok) {
        const data = await res.json();
        setUsers(data.data || []);
      }
    } catch (err) {
      console.error('Failed to load data:', err);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-white/30" />
      </div>
    );
  }

  const quickLinks = [
    { href: '/admin/users', label: '用户管理', desc: '管理用户账号和权限', icon: Users },
    { href: '/admin/pricing', label: '积分定价', desc: '配置各服务消耗积分', icon: Coins },
    { href: '/admin/api', label: 'API 配置', desc: '管理 API 密钥和接口', icon: Settings },
    // { href: '/admin/models', label: '聊天模型', desc: '配置 AI 聊天模型', icon: Bot },
  ];

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-extralight text-white">概览</h1>
        <p className="text-white/50 mt-1 font-light">系统运行状态</p>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white/5 border border-white/10 rounded-xl p-5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-500/20 rounded-lg flex items-center justify-center">
              <Users className="w-5 h-5 text-blue-400" />
            </div>
            <div>
              <p className="text-2xl font-semibold text-white">{users.length}</p>
              <p className="text-sm text-white/50">注册用户</p>
            </div>
          </div>
        </div>
        <div className="bg-white/5 border border-white/10 rounded-xl p-5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-green-500/20 rounded-lg flex items-center justify-center">
              <Coins className="w-5 h-5 text-green-400" />
            </div>
            <div>
              <p className="text-2xl font-semibold text-white">
                {formatBalance(users.reduce((sum, u) => sum + u.balance, 0))}
              </p>
              <p className="text-sm text-white/50">总积分</p>
            </div>
          </div>
        </div>
        <div className="bg-white/5 border border-white/10 rounded-xl p-5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-purple-500/20 rounded-lg flex items-center justify-center">
              <Users className="w-5 h-5 text-purple-400" />
            </div>
            <div>
              <p className="text-2xl font-semibold text-white">
                {users.filter(u => !u.disabled).length}
              </p>
              <p className="text-sm text-white/50">活跃用户</p>
            </div>
          </div>
        </div>
        <div className="bg-white/5 border border-white/10 rounded-xl p-5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-orange-500/20 rounded-lg flex items-center justify-center">
              <Coins className="w-5 h-5 text-orange-400" />
            </div>
            <div>
              <p className="text-2xl font-semibold text-white">
                {users.length > 0 ? Math.round(users.reduce((sum, u) => sum + u.balance, 0) / users.length) : 0}
              </p>
              <p className="text-sm text-white/50">平均积分</p>
            </div>
          </div>
        </div>
      </div>

      {/* Quick Links */}
      <div>
        <h2 className="text-lg font-medium text-white mb-4">快捷入口</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {quickLinks.map((item) => (
            <Link key={item.href} href={item.href}>
              <div className="bg-white/5 border border-white/10 rounded-xl p-4 hover:bg-white/10 transition-colors group">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-white/10 rounded-lg flex items-center justify-center">
                      <item.icon className="w-5 h-5 text-white" />
                    </div>
                    <div>
                      <p className="font-medium text-white">{item.label}</p>
                      <p className="text-sm text-white/50">{item.desc}</p>
                    </div>
                  </div>
                  <ChevronRight className="w-5 h-5 text-white/30 group-hover:text-white/60 transition-colors" />
                </div>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
