'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { signOut } from 'next-auth/react';
import { LogOut, Settings, Menu, X, Video, Image, History, Shield, MessageSquare, Workflow } from 'lucide-react';
import type { SafeUser } from '@/types';
import { cn } from '@/lib/utils';
import { useSiteConfig } from '@/components/providers/site-config-provider';

interface HeaderProps {
  user: SafeUser;
}

export function Header({ user }: HeaderProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const pathname = usePathname();
  const siteConfig = useSiteConfig();

  const navItems = [
    { href: '/image', icon: Image, label: '图像生成' },
    { href: '/video', icon: Video, label: '视频生成' },
    { href: '/workspace', icon: Workflow, label: '工作空间' },
    // { href: '/chat', icon: MessageSquare, label: 'Chat' },
    { href: '/history', icon: History, label: '历史' },
    { href: '/settings', icon: Settings, label: '设置' },
  ];

  useEffect(() => {
    document.body.style.overflow = mobileMenuOpen ? 'hidden' : '';
    return () => {
      document.body.style.overflow = '';
    };
  }, [mobileMenuOpen]);

  return (
    <>
      <header className="fixed top-0 left-0 right-0 h-14 bg-card/70 backdrop-blur-xl border-b border-border/70 shadow-[0_1px_0_rgba(255,255,255,0.04)] z-50">
        <div className="h-full px-4 lg:px-6 flex items-center justify-between">
          {/* Mobile Menu Button */}
          <button 
            className="lg:hidden p-2 hover:bg-foreground/5 rounded-lg transition-colors"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          >
            {mobileMenuOpen ? <X className="w-5 h-5 text-foreground/80" /> : <Menu className="w-5 h-5 text-foreground/80" />}
          </button>

          {/* Logo */}
          <Link href="/" className="flex items-center gap-3">
            <div className="w-8 h-8 border border-border/70 bg-card/70 rounded-lg flex items-center justify-center">
              <span className="text-sm font-light text-foreground/80">{siteConfig.siteName.charAt(0)}</span>
            </div>
            <span className="font-light text-lg tracking-wider text-foreground/90 hidden sm:block">{siteConfig.siteName}</span>
          </Link>

          {/* User Info */}
          <div className="flex items-center gap-3">
            {/* User Menu */}
            <div className="flex items-center gap-1">
              {(user.role === 'admin' || user.role === 'moderator') && (
                <Link 
                  href="/admin"
                  className="p-2 hover:bg-foreground/5 rounded-lg transition-colors"
                >
                  <Shield className="w-4 h-4 text-foreground/60" />
                </Link>
              )}
              <button
                className="p-2 hover:bg-foreground/5 rounded-lg transition-colors"
                onClick={() => signOut({ callbackUrl: '/login' })}
              >
                <LogOut className="w-4 h-4 text-foreground/60" />
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Mobile Menu */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="fixed inset-0 bg-background/80 backdrop-blur-sm" onClick={() => setMobileMenuOpen(false)} />
          <nav className="fixed top-14 left-0 bottom-0 w-72 bg-card/95 border-r border-border/70 p-4 space-y-2">
            {navItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setMobileMenuOpen(false)}
                className={cn(
                  'flex items-center gap-3 px-4 py-3 rounded-xl transition-all border border-transparent',
                  pathname === item.href 
                    ? 'bg-accent/80 text-foreground border-border/70' 
                    : 'text-foreground/70 hover:bg-card/70 hover:text-foreground'
                )}
              >
                <item.icon className="w-5 h-5" />
                <span className="text-sm">{item.label}</span>
              </Link>
            ))}
            {(user.role === 'admin' || user.role === 'moderator') && (
              <Link
                href="/admin"
                onClick={() => setMobileMenuOpen(false)}
                className={cn(
                  'flex items-center gap-3 px-4 py-3 rounded-xl transition-all border border-transparent',
                  pathname === '/admin' 
                    ? 'bg-accent/80 text-foreground border-border/70' 
                    : 'text-foreground/70 hover:bg-card/70 hover:text-foreground'
                )}
              >
                <Shield className="w-5 h-5" />
                <span className="text-sm">管理面板</span>
              </Link>
            )}
          </nav>
        </div>
      )}
    </>
  );
}
