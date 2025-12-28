'use client';

import { useState } from 'react';
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

  return (
    <>
      <header className="fixed top-0 left-0 right-0 h-16 bg-black/90 backdrop-blur-xl border-b border-white/10 z-50">
        <div className="h-full px-4 lg:px-6 flex items-center justify-between">
          {/* Mobile Menu Button */}
          <button 
            className="lg:hidden p-2 hover:bg-white/10 rounded-lg transition-colors"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          >
            {mobileMenuOpen ? <X className="w-5 h-5 text-white" /> : <Menu className="w-5 h-5 text-white" />}
          </button>

          {/* Logo */}
          <Link href="/" className="flex items-center gap-3">
            <div className="w-8 h-8 border border-white/30 rounded-lg flex items-center justify-center">
              <span className="text-sm font-light text-white">{siteConfig.siteName.charAt(0)}</span>
            </div>
            <span className="font-light text-lg tracking-wider text-white hidden sm:block">{siteConfig.siteName}</span>
          </Link>

          {/* User Info */}
          <div className="flex items-center gap-3">
            {/* User Menu */}
            <div className="flex items-center gap-1">
              {(user.role === 'admin' || user.role === 'moderator') && (
                <Link 
                  href="/admin"
                  className="p-2 hover:bg-white/10 rounded-lg transition-colors"
                >
                  <Shield className="w-4 h-4 text-white/60" />
                </Link>
              )}
              <button
                className="p-2 hover:bg-white/10 rounded-lg transition-colors"
                onClick={() => signOut({ callbackUrl: '/login' })}
              >
                <LogOut className="w-4 h-4 text-white/60" />
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Mobile Menu */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="fixed inset-0 bg-black/80 backdrop-blur-sm" onClick={() => setMobileMenuOpen(false)} />
          <nav className="fixed top-16 left-0 bottom-0 w-72 bg-black border-r border-white/10 p-4 space-y-2">
            {navItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setMobileMenuOpen(false)}
                className={cn(
                  'flex items-center gap-3 px-4 py-3 rounded-xl transition-all',
                  pathname === item.href 
                    ? 'bg-white text-black' 
                    : 'text-white/70 hover:bg-white/5 hover:text-white'
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
                  'flex items-center gap-3 px-4 py-3 rounded-xl transition-all',
                  pathname === '/admin' 
                    ? 'bg-white text-black' 
                    : 'text-white/70 hover:bg-white/5 hover:text-white'
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
