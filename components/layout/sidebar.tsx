'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  History,
  Settings,
  Shield,
  User,
  LayoutGrid,
  Sparkles,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { SafeUser } from '@/types';
import { useSiteConfig } from '@/components/providers/site-config-provider';

interface SidebarProps {
  user: SafeUser;
}

const STATUS_POLL_MS = 15_000;

function formatRelativeTime(timestamp: number | null): string {
  if (!timestamp) return '未更新';
  const deltaMs = Date.now() - timestamp;
  if (deltaMs < 60_000) return '刚刚';
  if (deltaMs < 60 * 60_000) return `${Math.floor(deltaMs / 60_000)}分钟前`;
  if (deltaMs < 24 * 60 * 60_000) return `${Math.floor(deltaMs / (60 * 60_000))}小时前`;
  return `${Math.floor(deltaMs / (24 * 60 * 60_000))}天前`;
}

const navItems = [
  { href: '/create', icon: Sparkles, label: '创作' },
  { href: '/video/character-card', icon: User, label: '角色卡' },
  { href: '/square', icon: LayoutGrid, label: '广场' },
  { href: '/history', icon: History, label: '历史' },
  { href: '/settings', icon: Settings, label: '设置' },
];

const adminItems = [
  { href: '/admin', icon: Shield, label: '控制台' },
];

export function Sidebar({ user }: SidebarProps) {
  const pathname = usePathname();
  const siteConfig = useSiteConfig();
  const [pendingCount, setPendingCount] = useState<number | null>(null);
  const [pendingUpdatedAt, setPendingUpdatedAt] = useState<number | null>(null);
  const pendingUpdatedAtRef = useRef<number | null>(null);
  const visibleNavItems = navItems.filter(
    (item) =>
      (item.href !== '/square' || siteConfig.squareEnabled) &&
      (item.href !== '/video/character-card' || siteConfig.characterCardEnabled)
  );

  const fetchPendingTasks = useCallback(async () => {
    try {
      const res = await fetch('/api/status/pending');
      if (!res.ok) return;
      const data = await res.json();
      const count = Number(data?.data?.count);
      setPendingCount(Number.isFinite(count) ? count : 0);
      const updatedAt = Date.now();
      pendingUpdatedAtRef.current = updatedAt;
      setPendingUpdatedAt(updatedAt);
    } catch (error) {
      console.error('[Status Panel] Failed to fetch pending tasks:', error);
    }
  }, []);

  useEffect(() => {
    const poll = () => {
      if (typeof document !== 'undefined' && document.hidden) return;
      void fetchPendingTasks();
    };

    poll();
    const interval = setInterval(poll, STATUS_POLL_MS);
    const onVisibility = () => {
      if (document.hidden) return;
      const lastUpdatedAt = pendingUpdatedAtRef.current;
      if (lastUpdatedAt !== null && Date.now() - lastUpdatedAt < STATUS_POLL_MS) {
        return;
      }
      void fetchPendingTasks();
    };
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [fetchPendingTasks]);

  return (
    <aside className="fixed left-0 top-14 bottom-0 w-56 bg-background border-r border-border hidden lg:flex flex-col">
      <nav className="flex-1 px-3 py-3 space-y-0.5 overflow-y-auto">
        <p className="text-[11px] font-medium text-muted-foreground px-2 py-2">
          创作
        </p>
        {visibleNavItems.map((item) => {
          const isCreateEntry = item.href === '/create';
          const isActive = isCreateEntry
            ? pathname === '/create' || pathname === '/image' || pathname === '/video'
            : pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'flex items-center gap-2.5 px-2 py-2 rounded-md text-sm transition-colors',
                isActive
                  ? 'bg-accent text-foreground'
                  : 'text-muted-foreground hover:text-foreground hover:bg-accent/70'
              )}
            >
              <item.icon className="w-4 h-4" />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>

      {user.role === 'admin' && (
        <div className="px-3 py-3 border-t border-border">
          <p className="text-[11px] font-medium text-muted-foreground px-2 py-2">
            管理
          </p>
          {adminItems.map((item) => {
            const isActive = pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  'flex items-center gap-2.5 px-2 py-2 rounded-md text-sm transition-colors',
                  isActive
                    ? 'bg-accent text-foreground'
                    : 'text-muted-foreground hover:text-foreground hover:bg-accent/70'
                )}
              >
                <item.icon className="w-4 h-4" />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </div>
      )}

      <div className="px-3 py-3 border-t border-border">
        <div className="rounded-md border border-border bg-card px-3 py-2.5">
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">进行中</span>
            <span className="text-sm font-medium">{pendingCount ?? '--'}</span>
          </div>
          <p className="mt-1 text-[11px] text-muted-foreground">
            更新于 {formatRelativeTime(pendingUpdatedAt)}
          </p>
        </div>
      </div>

      <div className="p-3 border-t border-border">
        <div className="flex items-center justify-center gap-3">
          <p className="text-[11px] text-muted-foreground">
            {siteConfig.siteName} © {new Date().getFullYear()}
          </p>
          <a
            href="https://github.com/genz27/sanhub"
            target="_blank"
            rel="noopener noreferrer"
            className="text-muted-foreground hover:text-foreground"
            title="GitHub"
          >
            <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
              <path fillRule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" clipRule="evenodd" />
            </svg>
          </a>
        </div>
      </div>
    </aside>
  );
}
