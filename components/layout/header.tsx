'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { signOut } from 'next-auth/react';
import { LogOut, Settings, Menu, X, Video, Image, History, Shield, LayoutGrid, Sparkles } from 'lucide-react';
import type { SafeUser } from '@/types';
import { cn } from '@/lib/utils';
import { useSiteConfig } from '@/components/providers/site-config-provider';

interface HeaderProps {
  user: SafeUser;
}

// 移动端底部导航项
const mobileNavItems = [
  { href: '/square', icon: LayoutGrid, label: '广场' },
  { href: '/image', icon: Image, label: '图像' },
  { href: '/video', icon: Video, label: '视频' },
  { href: '/history', icon: History, label: '历史' },
  { href: '/settings', icon: Settings, label: '设置' },
];

export function Header({ user }: HeaderProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const pathname = usePathname();
  const siteConfig = useSiteConfig();

  const navItems = [
    { href: '/square', icon: LayoutGrid, label: '广场' },
    { href: '/image', icon: Image, label: '图像生成' },
    { href: '/video', icon: Video, label: '视频生成' },
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
      <header className="fixed top-0 left-0 right-0 h-14 bg-card/80 backdrop-blur-xl border-b border-border/50 z-50">
        <div className="h-full px-4 lg:px-6 flex items-center justify-between">
          {/* Left: Menu Button + Logo */}
          <div className="flex items-center gap-3">
            {/* Mobile Menu Button */}
            <button 
              className="lg:hidden p-2 -ml-2 hover:bg-foreground/5 rounded-lg transition-colors active:scale-95"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            >
              {mobileMenuOpen ? <X className="w-5 h-5 text-foreground/70" /> : <Menu className="w-5 h-5 text-foreground/70" />}
            </button>

            {/* Logo */}
            <Link href="/" className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-sky-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-sky-500/20">
                <Sparkles className="w-4 h-4 text-white" />
              </div>
              <span className="font-semibold text-foreground tracking-tight">{siteConfig.siteName}</span>
            </Link>
          </div>

          {/* Right: Admin Badge + Actions */}
          <div className="flex items-center gap-2">
            {/* Admin Badge - Mobile Only */}
            {(user.role === 'admin' || user.role === 'moderator') && (
              <span className="lg:hidden text-[10px] font-bold px-2 py-0.5 rounded bg-sky-500/20 text-sky-400 border border-sky-500/30">
                ADMIN
              </span>
            )}
            
            {/* Desktop Admin Link */}
            {(user.role === 'admin' || user.role === 'moderator') && (
              <Link 
                href="/admin"
                className="hidden lg:flex p-2 hover:bg-foreground/5 rounded-lg transition-colors"
              >
                <Shield className="w-4 h-4 text-foreground/60" />
              </Link>
            )}
            
            {/* Logout - Desktop Only */}
            <button
              className="hidden lg:flex p-2 hover:bg-foreground/5 rounded-lg transition-colors"
              onClick={() => signOut({ callbackUrl: '/login' })}
            >
              <LogOut className="w-4 h-4 text-foreground/60" />
            </button>
          </div>
        </div>
      </header>

      {/* Mobile Sidebar Menu */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div 
            className="fixed inset-0 bg-black/60 backdrop-blur-sm transition-opacity" 
            onClick={() => setMobileMenuOpen(false)} 
          />
          <aside className="fixed top-0 left-0 bottom-0 w-64 bg-card border-r border-border/70 flex flex-col transform transition-transform animate-slideIn">
            {/* Sidebar Header */}
            <div 
              className="flex items-center gap-3 p-6 h-20 border-b border-border/70 cursor-pointer" 
              onClick={() => { setMobileMenuOpen(false); }}
            >
              <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-sky-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-sky-500/20">
                <Sparkles className="w-5 h-5 text-white" />
              </div>
              <div>
                <h1 className="text-lg font-bold tracking-tight text-foreground">{siteConfig.siteName}</h1>
                <p className="text-[10px] text-foreground/40 font-medium tracking-wider">CREATIVE STUDIO</p>
              </div>
            </div>

            {/* Navigation List */}
            <div className="flex-1 overflow-y-auto py-4 px-3 space-y-1">
              {navItems.map((item) => {
                const isActive = pathname === item.href || 
                  (item.href !== '/' && pathname.startsWith(item.href));
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setMobileMenuOpen(false)}
                    className={cn(
                      'flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-200 group border',
                      isActive
                        ? 'bg-sky-500/10 text-sky-400 border-sky-500/20 shadow-[0_0_15px_rgba(14,165,233,0.1)]'
                        : 'text-foreground/50 hover:text-foreground hover:bg-foreground/5 border-transparent'
                    )}
                  >
                    <item.icon className={cn(
                      'w-4 h-4 transition-colors',
                      isActive ? 'text-sky-400' : 'text-foreground/40 group-hover:text-foreground'
                    )} />
                    <span className="text-sm font-medium">{item.label}</span>
                    {isActive && <div className="ml-auto w-1 h-1 rounded-full bg-sky-400 shadow-[0_0_5px_currentColor]" />}
                  </Link>
                );
              })}
              
              {/* Admin Link */}
              {(user.role === 'admin' || user.role === 'moderator') && (
                <>
                  <div className="h-px bg-border/70 my-3" />
                  <Link
                    href="/admin"
                    onClick={() => setMobileMenuOpen(false)}
                    className={cn(
                      'flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-200 group border',
                      pathname.startsWith('/admin')
                        ? 'bg-sky-500/10 text-sky-400 border-sky-500/20'
                        : 'text-foreground/50 hover:text-foreground hover:bg-foreground/5 border-transparent'
                    )}
                  >
                    <Shield className={cn(
                      'w-4 h-4 transition-colors',
                      pathname.startsWith('/admin') ? 'text-sky-400' : 'text-foreground/40 group-hover:text-foreground'
                    )} />
                    <span className="text-sm font-medium">管理面板</span>
                  </Link>
                </>
              )}
            </div>

            {/* Sidebar Footer */}
            <div className="p-4 border-t border-border/70 bg-black/10">
              <button 
                onClick={() => signOut({ callbackUrl: '/login' })}
                className="flex items-center gap-3 px-3 py-2.5 text-foreground/40 hover:text-red-400 hover:bg-red-500/10 rounded-lg w-full transition-all group"
              >
                <LogOut className="w-4 h-4 group-hover:scale-110 transition-transform" />
                <span className="text-sm font-medium">退出登录</span>
              </button>
            </div>
          </aside>
        </div>
      )}

      {/* Mobile Bottom Navigation */}
      <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-50 bg-card/95 backdrop-blur-2xl border-t border-border/50 pb-[env(safe-area-inset-bottom)]">
        <div className="flex justify-around items-center h-16">
          {mobileNavItems.map((item) => {
            const isActive = pathname === item.href || 
              (item.href !== '/' && pathname.startsWith(item.href));
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  'relative flex flex-col items-center justify-center w-full h-full space-y-0.5 transition-colors',
                  isActive ? 'text-sky-400' : 'text-foreground/40'
                )}
              >
                <div className={cn(
                  'p-1.5 rounded-full transition-all',
                  isActive ? 'bg-sky-500/10' : ''
                )}>
                  <item.icon className="w-5 h-5" strokeWidth={isActive ? 2 : 1.5} />
                </div>
                <span className="text-[10px] font-medium">{item.label}</span>
              </Link>
            );
          })}
        </div>
      </nav>
    </>
  );
}
