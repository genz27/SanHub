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
      <header className="fixed top-0 left-0 right-0 h-14 bg-background border-b border-border z-50">
        <div className="h-full px-4 lg:px-6 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2.5">
            <div className="w-6 h-6 rounded-md bg-foreground text-background flex items-center justify-center text-[11px] font-semibold">
              {siteConfig.siteName.slice(0, 1)}
            </div>
            <span className="text-sm font-medium tracking-tight">{siteConfig.siteName}</span>
          </Link>

          <div className="flex items-center gap-1">
            {isAdmin && (
              <Link
                href="/admin"
                className={cn(
                  'flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors',
                  pathname.startsWith('/admin')
                    ? 'bg-accent text-foreground'
                    : 'text-muted-foreground hover:text-foreground hover:bg-accent'
                )}
              >
                <Shield className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">管理</span>
              </Link>
            )}

            <button
              className="hidden lg:flex p-2 hover:bg-accent rounded-md transition-colors"
              onClick={() => signOut({ callbackUrl: '/login' })}
              title="退出登录"
            >
              <LogOut className="w-4 h-4 text-muted-foreground" />
            </button>
          </div>
        </div>
      </header>

      <div className="lg:hidden fixed bottom-4 left-0 right-0 z-50 px-4 flex justify-center">
        <nav className="w-full max-w-sm bg-card border border-border rounded-lg px-2 py-1.5 flex justify-around items-center">
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
                  'flex flex-col items-center justify-center py-1.5 px-3 rounded-md flex-1 min-w-0',
                  isActive ? 'text-foreground bg-accent' : 'text-muted-foreground hover:text-foreground'
                )}
              >
                <item.icon className="w-4 h-4 mb-0.5" strokeWidth={isActive ? 2.2 : 1.6} />
                <span className="text-[10px] font-medium">{item.label}</span>
              </Link>
            );
          })}
        </nav>
      </div>
    </>
  );
}
