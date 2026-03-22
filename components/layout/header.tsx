'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { signOut } from 'next-auth/react';
import { LogOut, History, Shield, LayoutGrid, Sparkles, User } from 'lucide-react';
import type { SafeUser } from '@/types';
import { cn } from '@/lib/utils';
import { useSiteConfig } from '@/components/providers/site-config-provider';

interface HeaderProps {
  user: SafeUser;
}

// 移动端底部导航项
const mobileNavItems = [
  { href: '/square', icon: LayoutGrid, label: '广场' },
  { href: '/create', icon: Sparkles, label: '创作' },
  { href: '/history', icon: History, label: '历史' },
  { href: '/settings', icon: User, label: '我的' },
];

export function Header({ user }: HeaderProps) {
  const pathname = usePathname();
  const siteConfig = useSiteConfig();
  const isAdmin = user.role === 'admin' || user.role === 'moderator';
  const visibleMobileNavItems = mobileNavItems.filter(
    (item) => item.href !== '/square' || siteConfig.squareEnabled
  );

  return (
    <>
      {/* Top Header */}
      <header className="fixed top-0 left-0 right-0 h-14 bg-card/80 backdrop-blur-xl border-b border-border/50 z-50">
        <div className="h-full px-4 lg:px-6 flex items-center justify-between">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-sky-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-sky-500/20">
              <Sparkles className="w-4 h-4 text-white" />
            </div>
            <span className="font-semibold text-foreground tracking-tight">{siteConfig.siteName}</span>
          </Link>

          {/* Right Actions */}
          <div className="flex items-center gap-2">
            {/* Admin Link */}
            {isAdmin && (
              <Link 
                href="/admin"
                className={cn(
                  'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors',
                  pathname.startsWith('/admin')
                    ? 'bg-sky-500/20 text-sky-400 border border-sky-500/30'
                    : 'text-foreground/60 hover:bg-foreground/5'
                )}
              >
                <Shield className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">管理</span>
              </Link>
            )}
            
            {/* Logout - Desktop Only */}
            <button
              className="hidden lg:flex p-2 hover:bg-foreground/5 rounded-lg transition-colors"
              onClick={() => signOut({ callbackUrl: '/login' })}
              title="退出登录"
            >
              <LogOut className="w-4 h-4 text-foreground/60" />
            </button>
          </div>
        </div>
      </header>

      {/* Mobile Bottom Tab Navigation */}
      <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-50 bg-card/95 backdrop-blur-2xl border-t border-border/50 pb-[env(safe-area-inset-bottom)]">
        <div className="flex justify-around items-center h-14">
          {visibleMobileNavItems.map((item) => {
            const isCreateEntry = item.href === '/create';
            const isActive = isCreateEntry
              ? pathname === '/create' || pathname === '/image' || pathname === '/video'
              : pathname === item.href || (item.href !== '/' && pathname.startsWith(item.href));
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  'flex flex-col items-center justify-center flex-1 h-full py-1 transition-colors active:scale-95',
                  isActive ? 'text-sky-400' : 'text-foreground/40'
                )}
              >
                <item.icon className="w-5 h-5 mb-0.5" strokeWidth={isActive ? 2 : 1.5} />
                <span className="text-[10px] font-medium">{item.label}</span>
              </Link>
            );
          })}
        </div>
      </nav>
    </>
  );
}
