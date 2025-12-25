'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { 
  LayoutDashboard, 
  Users, 
  Coins, 
  Settings, 
  Key,
  ArrowLeft,
  Menu,
  X,
  Megaphone,
  Sparkles,
  MessageSquare,
  Globe
} from 'lucide-react';
import { useState } from 'react';
import { cn } from '@/lib/utils';
import type { UserRole } from '@/types';

interface NavItem {
  href: string;
  label: string;
  icon: typeof LayoutDashboard;
  exact?: boolean;
  roles: UserRole[]; // 哪些角色可以看到这个菜单
}

const navItems: NavItem[] = [
  { href: '/admin', label: '概览', icon: LayoutDashboard, exact: true, roles: ['admin', 'moderator'] },
  { href: '/admin/users', label: '用户管理', icon: Users, roles: ['admin', 'moderator'] },
  { href: '/admin/pricing', label: '积分定价', icon: Coins, roles: ['admin'] },
  { href: '/admin/api', label: 'API 配置', icon: Settings, roles: ['admin'] },
  { href: '/admin/models', label: '聊天模型', icon: MessageSquare, roles: ['admin'] },
  { href: '/admin/tokens', label: 'SORA Tokens', icon: Key, roles: ['admin'] },
  { href: '/admin/announcement', label: '公告管理', icon: Megaphone, roles: ['admin'] },
  { href: '/admin/site', label: '网站配置', icon: Globe, roles: ['admin'] },
];

export function AdminSidebar() {
  const pathname = usePathname();
  const { data: session } = useSession();
  const [mobileOpen, setMobileOpen] = useState(false);
  
  const userRole = session?.user?.role || 'user';
  const filteredNavItems = navItems.filter(item => item.roles.includes(userRole));

  const isActive = (href: string, exact?: boolean) => {
    if (exact) return pathname === href;
    return pathname.startsWith(href);
  };

  const NavContent = () => (
    <>
      {/* Logo */}
      <div className="p-5 border-b border-white/10">
        <Link href="/image" className="flex items-center gap-2 text-white/60 hover:text-white transition-colors text-sm">
          <ArrowLeft className="w-4 h-4" />
          <span>返回首页</span>
        </Link>
        <div className="flex items-center gap-3 mt-4">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-500 to-fuchsia-500 flex items-center justify-center">
            <Sparkles className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-lg font-semibold text-white">管理后台</h1>
            <p className="text-xs text-white/40">SanHub Admin</p>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-4 space-y-1.5">
        {filteredNavItems.map((item) => {
          const active = isActive(item.href, item.exact);
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setMobileOpen(false)}
              className={cn(
                'flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200',
                active
                  ? 'bg-gradient-to-r from-violet-500/20 to-fuchsia-500/20 text-white border border-white/10'
                  : 'text-white/60 hover:bg-white/5 hover:text-white'
              )}
            >
              <item.icon className={cn('w-5 h-5', active && 'text-violet-400')} />
              <span className="font-medium">{item.label}</span>
              {active && (
                <div className="ml-auto w-1.5 h-1.5 rounded-full bg-violet-400" />
              )}
            </Link>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="p-4 border-t border-white/10">
        <div className="px-4 py-3 rounded-xl bg-white/5 border border-white/10">
          <p className="text-xs text-white/40 text-center">v1.0.0</p>
        </div>
      </div>
    </>
  );

  return (
    <>
      {/* Mobile Toggle */}
      <button
        onClick={() => setMobileOpen(!mobileOpen)}
        className="lg:hidden fixed top-4 left-4 z-50 p-2.5 bg-white/10 backdrop-blur-sm rounded-xl text-white border border-white/10"
      >
        {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
      </button>

      {/* Mobile Overlay */}
      {mobileOpen && (
        <div
          className="lg:hidden fixed inset-0 bg-black/60 backdrop-blur-sm z-40"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Sidebar - Mobile */}
      <aside
        className={cn(
          'lg:hidden fixed inset-y-0 left-0 z-40 w-72 bg-black/90 backdrop-blur-xl border-r border-white/10 flex flex-col transform transition-transform duration-300 ease-out',
          mobileOpen ? 'translate-x-0' : '-translate-x-full'
        )}
      >
        <NavContent />
      </aside>

      {/* Sidebar - Desktop */}
      <aside className="hidden lg:flex w-72 bg-black/40 backdrop-blur-xl border-r border-white/10 flex-col sticky top-0 h-screen">
        <NavContent />
      </aside>
    </>
  );
}
