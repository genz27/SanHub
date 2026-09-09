'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useSession } from 'next-auth/react';
import {
  LayoutDashboard,
  Users,
  ArrowLeft,
  Menu,
  X,
  Megaphone,
  Sparkles,
  MessageSquare,
  Globe,
  Image,
  Video,
  BarChart3,
  History,
  Ticket,
  UserPlus,
  Coins
} from 'lucide-react';
import { useState } from 'react';
import { cn } from '@/lib/utils';
import { useSiteConfig } from '@/components/providers/site-config-provider';
import type { UserRole } from '@/types';

interface NavItem {
  href: string;
  label: string;
  icon: typeof LayoutDashboard;
  exact?: boolean;
  roles: UserRole[]; // 哪些角色可以看到这个菜单
}

const navGroups: Array<{ label: string; items: NavItem[] }> = [
  {
    label: '总览',
    items: [
      { href: '/admin', label: '概览', icon: LayoutDashboard, exact: true, roles: ['admin', 'moderator'] },
      { href: '/admin/stats', label: '数据统计', icon: BarChart3, roles: ['admin', 'moderator'] },
    ],
  },
  {
    label: '运营',
    items: [
      { href: '/admin/users', label: '用户管理', icon: Users, roles: ['admin', 'moderator'] },
      { href: '/admin/generations', label: '生成记录', icon: History, roles: ['admin'] },
    ],
  },
  {
    label: '渠道',
    items: [
      { href: '/admin/image-channels', label: '图像渠道', icon: Image, roles: ['admin'] },
      { href: '/admin/video-channels', label: '视频渠道', icon: Video, roles: ['admin'] },
      { href: '/admin/models', label: '聊天模型', icon: MessageSquare, roles: ['admin'] },
    ],
  },
  {
    label: '积分',
    items: [
      { href: '/admin/redemption', label: '卡密管理', icon: Ticket, roles: ['admin', 'moderator'] },
      { href: '/admin/invites', label: '邀请码', icon: UserPlus, roles: ['admin'] },
      { href: '/admin/pricing', label: '积分定价', icon: Coins, roles: ['admin'] },
    ],
  },
  {
    label: '站点',
    items: [
      { href: '/admin/site', label: '网站配置', icon: Globe, roles: ['admin'] },
      { href: '/admin/announcement', label: '公告管理', icon: Megaphone, roles: ['admin'] },
    ],
  },
];

export function AdminSidebar() {
  const pathname = usePathname();
  const { data: session } = useSession();
  const [mobileOpen, setMobileOpen] = useState(false);
  const siteConfig = useSiteConfig();
  
  const userRole = session?.user?.role || 'user';
  const filteredNavGroups = navGroups
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => item.roles.includes(userRole)),
    }))
    .filter((group) => group.items.length > 0);

  const isActive = (href: string, exact?: boolean) => {
    if (exact) return pathname === href;
    return pathname.startsWith(href);
  };

  const NavContent = () => (
    <>
      {/* Logo */}
      <div className="p-5 border-b border-border/70">
        <Link href="/create" className="flex items-center gap-2 text-foreground/60 hover:text-foreground transition-colors text-sm">
          <ArrowLeft className="w-4 h-4" />
          <span>返回首页</span>
        </Link>
        <div className="flex items-center gap-3 mt-4">
          <div className="w-8 h-8 rounded-md bg-foreground text-background flex items-center justify-center">
            <Sparkles className="w-4 h-4" />
          </div>
          <div>
            <h1 className="text-sm font-semibold tracking-tight">管理后台</h1>
            <p className="text-xs text-muted-foreground">{siteConfig.siteName} Admin</p>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 space-y-5 overflow-y-auto p-4">
        {filteredNavGroups.map((group) => (
          <div key={group.label} className="space-y-1">
            <p className="px-3 pb-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              {group.label}
            </p>
            {group.items.map((item) => {
              const active = isActive(item.href, item.exact);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setMobileOpen(false)}
                  className={cn(
                    'flex items-center gap-3 rounded-md px-3 py-2 transition-colors',
                    active
                      ? 'bg-accent text-foreground'
                      : 'text-muted-foreground hover:bg-accent/70 hover:text-foreground'
                  )}
                >
                  <item.icon className={cn('h-4 w-4', active && 'text-foreground')} />
                  <span className="text-sm font-medium">{item.label}</span>
                </Link>
              );
            })}
          </div>
        ))}
      </nav>

      {/* Footer */}
      <div className="p-4 border-t border-border/70">
        <div className="px-4 py-3 rounded-xl bg-card/60 border border-border/70">
          <p className="text-xs text-foreground/50 text-center">v1.0.0</p>
        </div>
      </div>
    </>
  );

  return (
    <>
      {/* Mobile Toggle */}
      <button
        onClick={() => setMobileOpen(!mobileOpen)}
        className="lg:hidden fixed top-4 left-4 z-50 p-2 bg-card rounded-md text-foreground border border-border"
      >
        {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
      </button>

      {/* Mobile Overlay */}
      {mobileOpen && (
        <div
          className="lg:hidden fixed inset-0 bg-background/80 backdrop-blur-sm z-40"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Sidebar - Mobile */}
      <aside
        className={cn(
          'lg:hidden fixed inset-y-0 left-0 z-40 w-72 bg-background border-r border-border flex flex-col transform transition-transform duration-300 ease-out',
          mobileOpen ? 'translate-x-0' : '-translate-x-full'
        )}
      >
        <NavContent />
      </aside>

      {/* Sidebar - Desktop */}
      <aside className="hidden lg:flex w-64 bg-background border-r border-border flex-col sticky top-0 h-screen">
        <NavContent />
      </aside>
    </>
  );
}
