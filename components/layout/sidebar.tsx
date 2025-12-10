'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { 
  Video, 
  History, 
  Settings,
  Shield,
  Image,
  User,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { SafeUser } from '@/types';

interface SidebarProps {
  user: SafeUser;
}

const navItems = [
  { href: '/image', icon: Image, label: '图像生成', description: 'Gemini / Z-Image', badge: 'AI', isAI: true },
  { href: '/video', icon: Video, label: '视频生成', description: 'Sora / Remix / 分镜', badge: 'AI', isAI: true },
  // { href: '/video/character-card', icon: User, label: '角色卡生成', description: '从视频提取角色', badge: 'NEW', isAI: true },
  // { href: '/chat', icon: MessageSquare, label: 'Chat', description: '智能对话助手', badge: 'AI', isAI: true },
  { href: '/history', icon: History, label: '历史', description: '作品记录', badge: null, isAI: false },
  { href: '/settings', icon: Settings, label: '设置', description: '账号管理', badge: null, isAI: false },
];

const adminItems = [
  { href: '/admin', icon: Shield, label: '控制台', description: '系统管理' },
];

export function Sidebar({ user }: SidebarProps) {
  const pathname = usePathname();

  return (
    <aside className="fixed left-0 top-16 bottom-0 w-72 bg-black border-r border-white/10 hidden lg:flex flex-col">
      {/* Navigation */}
      <nav className="flex-1 px-3 py-2 space-y-1 overflow-y-auto">
        <p className="text-[10px] font-medium text-white/30 uppercase tracking-[0.2em] px-3 py-2">
          创作工具
        </p>
        {navItems.map((item) => {
          const isActive = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'group flex items-center gap-3 px-3 py-3 rounded-xl transition-all duration-200',
                isActive
                  ? 'bg-white text-black'
                  : 'hover:bg-white/5'
              )}
            >
              <div className={cn(
                'w-9 h-9 rounded-lg flex items-center justify-center transition-colors',
                isActive ? 'bg-black/10' : 'bg-white/5 group-hover:bg-white/10'
              )}>
                <item.icon className={cn('w-4 h-4', isActive ? 'text-black' : 'text-white/60')} />
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <p className={cn(
                    'text-sm font-medium',
                    isActive ? 'text-black' : 'text-white/80'
                  )}>{item.label}</p>
                  {item.badge && (
                    <span className={cn(
                      'text-[10px] px-1.5 py-0.5 rounded',
                      isActive ? 'bg-black/10 text-black/60' : 'bg-white/10 text-white/40'
                    )}>{item.badge}</span>
                  )}
                </div>
                <p className={cn(
                  'text-xs',
                  isActive ? 'text-black/50' : 'text-white/30'
                )}>
                  {item.description}
                </p>
              </div>
            </Link>
          );
        })}
      </nav>

      {/* Admin Navigation */}
      {user.role === 'admin' && (
        <div className="px-3 py-4 border-t border-white/10">
          <p className="text-[10px] font-medium text-white/30 uppercase tracking-[0.2em] px-3 py-2">
            管理
          </p>
          {adminItems.map((item) => {
            const isActive = pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  'group flex items-center gap-3 px-3 py-3 rounded-xl transition-all duration-200',
                  isActive
                    ? 'bg-white text-black'
                    : 'hover:bg-white/5'
                )}
              >
                <div className={cn(
                  'w-9 h-9 rounded-lg flex items-center justify-center transition-colors',
                  isActive ? 'bg-black/10' : 'bg-white/5 group-hover:bg-white/10'
                )}>
                  <item.icon className={cn('w-4 h-4', isActive ? 'text-black' : 'text-white/60')} />
                </div>
                <div>
                  <p className={cn(
                    'text-sm font-medium',
                    isActive ? 'text-black' : 'text-white/80'
                  )}>{item.label}</p>
                  <p className={cn(
                    'text-xs',
                    isActive ? 'text-black/50' : 'text-white/30'
                  )}>
                    {item.description}
                  </p>
                </div>
              </Link>
            );
          })}
        </div>
      )}

      {/* Footer */}
      <div className="p-4 border-t border-white/10">
        <div className="flex items-center justify-center gap-3">
          <p className="text-[10px] text-white/20">SANHUB © 2025</p>
          <a 
            href="https://github.com/genz27/sanhub" 
            target="_blank" 
            rel="noopener noreferrer"
            className="text-white/20 hover:text-white/50 transition-colors"
            title="GitHub"
          >
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
              <path fillRule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" clipRule="evenodd" />
            </svg>
          </a>
        </div>
      </div>
    </aside>
  );
}
