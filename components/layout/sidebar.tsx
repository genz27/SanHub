'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { 
  Video, 
  History, 
  Settings,
  Shield,
  Image,
  User,
  LayoutGrid,
  Workflow,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { SafeUser } from '@/types';
import { useSiteConfig } from '@/components/providers/site-config-provider';

interface SidebarProps {
  user: SafeUser;
}

type GenerationStatus = 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled';

interface VideoTaskStatus {
  id: string;
  status: GenerationStatus;
  createdAt: number;
  updatedAt: number;
  durationMs?: number;
  elapsedMs?: number;
}

const STATUS_POLL_MS = 5_000;
const VIDEO_POLL_MS = 5_000;
const VIDEO_DISPLAY_LIMIT = 3;

const statusLabelMap: Record<GenerationStatus, string> = {
  pending: '排队中',
  processing: '生成中',
  completed: '已完成',
  failed: '失败',
  cancelled: '已取消',
};

const statusColorMap: Record<GenerationStatus, string> = {
  pending: 'bg-amber-400',
  processing: 'bg-sky-400',
  completed: 'bg-emerald-400',
  failed: 'bg-rose-400',
  cancelled: 'bg-zinc-400',
};

function formatDuration(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const parts: string[] = [];

  if (hours > 0) parts.push(`${hours}小时`);
  if (minutes > 0 || hours > 0) parts.push(`${minutes}分钟`);
  parts.push(`${seconds}秒`);
  return parts.join(' ');
}

function formatRelativeTime(timestamp: number | null): string {
  if (!timestamp) return '未更新';
  const deltaMs = Date.now() - timestamp;
  if (deltaMs < 60_000) return '刚刚';
  if (deltaMs < 60 * 60_000) return `${Math.floor(deltaMs / 60_000)}分钟前`;
  if (deltaMs < 24 * 60 * 60_000) return `${Math.floor(deltaMs / (60 * 60_000))}小时前`;
  return `${Math.floor(deltaMs / (24 * 60 * 60_000))}天前`;
}

const navItems = [
  { href: '/image', icon: Image, label: '图像生成', description: 'Gemini / Z-Image', badge: 'AI', isAI: true },
  { href: '/video', icon: Video, label: '视频生成', description: 'Sora / Remix / 分镜', badge: 'AI', isAI: true },
  { href: '/workspace', icon: Workflow, label: '工作空间', description: '节点工作流', badge: 'BETA', isAI: true },
  { href: '/video/character-card', icon: User, label: '角色卡生成', description: '从视频提取角色', badge: 'NEW', isAI: true },
  { href: '/square', icon: LayoutGrid, label: '广场', description: '探索社区创作', badge: 'HOT', isAI: false },
  { href: '/history', icon: History, label: '历史', description: '作品记录', badge: null, isAI: false },
  { href: '/settings', icon: Settings, label: '设置', description: '账号管理', badge: null, isAI: false },
];

const adminItems = [
  { href: '/admin', icon: Shield, label: '控制台', description: '系统管理' },
];

export function Sidebar({ user }: SidebarProps) {
  const pathname = usePathname();
  const siteConfig = useSiteConfig();
  const [pendingCount, setPendingCount] = useState<number | null>(null);
  const [pendingUpdatedAt, setPendingUpdatedAt] = useState<number | null>(null);
  const [videoTasks, setVideoTasks] = useState<VideoTaskStatus[]>([]);
  const [videoUpdatedAt, setVideoUpdatedAt] = useState<number | null>(null);

  const fetchPendingTasks = useCallback(async () => {
    try {
      const res = await fetch('/api/status/pending', { cache: 'no-store' });
      if (!res.ok) return;
      const data = await res.json();
      const count = Number(data?.data?.count);
      setPendingCount(Number.isFinite(count) ? count : 0);
      setPendingUpdatedAt(Date.now());
    } catch (error) {
      console.error('[Status Panel] Failed to fetch pending tasks:', error);
    }
  }, []);

  const fetchVideoTasks = useCallback(async () => {
    try {
      const res = await fetch('/api/status/video', { cache: 'no-store' });
      if (!res.ok) return;
      const data = await res.json();
      const payload = data?.data;
      const rows = Array.isArray(payload?.tasks) ? payload.tasks : [];
      const mapped = rows.map((item: VideoTaskStatus) => ({
        id: String(item.id),
        status: item.status,
        createdAt: Number(item.createdAt) || 0,
        updatedAt: Number(item.updatedAt) || Number(item.createdAt) || 0,
        durationMs: typeof item.durationMs === 'number' ? item.durationMs : undefined,
        elapsedMs: typeof item.elapsedMs === 'number' ? item.elapsedMs : undefined,
      }));

      setVideoTasks(mapped.slice(0, VIDEO_DISPLAY_LIMIT));
      setVideoUpdatedAt(typeof payload?.updatedAt === 'number' ? payload.updatedAt : Date.now());
    } catch (error) {
      console.error('[Status Panel] Failed to fetch video tasks:', error);
    }
  }, []);

  useEffect(() => {
    void fetchPendingTasks();
    const interval = setInterval(fetchPendingTasks, STATUS_POLL_MS);
    return () => clearInterval(interval);
  }, [fetchPendingTasks]);

  useEffect(() => {
    void fetchVideoTasks();
    const interval = setInterval(fetchVideoTasks, VIDEO_POLL_MS);
    return () => clearInterval(interval);
  }, [fetchVideoTasks]);

  return (
    <>
    <aside className="fixed left-0 top-14 bottom-0 w-56 bg-card/70 backdrop-blur-xl border-r border-border/70 hidden lg:flex flex-col">
      {/* Navigation */}
      <nav className="flex-1 px-3 py-2 space-y-1 overflow-y-auto">
        <p className="text-[10px] font-medium text-foreground/40 uppercase tracking-[0.2em] px-3 py-2">
          创作工具
        </p>
        {navItems.map((item) => {
          const isActive = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'group flex items-center gap-3 px-3 py-3 rounded-xl transition-all duration-200 border border-transparent',
                isActive
                  ? 'bg-accent/80 text-foreground border-border/70'
                  : 'hover:bg-card/70 text-foreground/70'
              )}
            >
              <div className={cn(
                'w-8 h-8 rounded-lg flex items-center justify-center transition-colors',
                isActive ? 'bg-foreground/5' : 'bg-card/60 group-hover:bg-card/80'
              )}>
                <item.icon className={cn('w-3.5 h-3.5', isActive ? 'text-foreground' : 'text-foreground/60')} />
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <p className={cn(
                    'text-sm font-medium',
                    isActive ? 'text-foreground' : 'text-foreground/80'
                  )}>{item.label}</p>
                  {item.badge && (
                    <span className={cn(
                      'text-[10px] px-1.5 py-0.5 rounded border border-border/60',
                      isActive ? 'bg-foreground/10 text-foreground/70' : 'bg-card/60 text-foreground/50'
                    )}>{item.badge}</span>
                  )}
                </div>
              </div>
            </Link>
          );
        })}
      </nav>

      {/* Admin Navigation */}
      {user.role === 'admin' && (
        <div className="px-3 py-4 border-t border-border/70">
          <p className="text-[10px] font-medium text-foreground/40 uppercase tracking-[0.2em] px-3 py-2">
            管理
          </p>
          {adminItems.map((item) => {
            const isActive = pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  'group flex items-center gap-3 px-3 py-3 rounded-xl transition-all duration-200 border border-transparent',
                  isActive
                    ? 'bg-accent/80 text-foreground border-border/70'
                    : 'hover:bg-card/70 text-foreground/70'
                )}
              >
                <div className={cn(
                  'w-8 h-8 rounded-lg flex items-center justify-center transition-colors',
                  isActive ? 'bg-foreground/5' : 'bg-card/60 group-hover:bg-card/80'
                )}>
                  <item.icon className={cn('w-3.5 h-3.5', isActive ? 'text-foreground' : 'text-foreground/60')} />
                </div>
                <div>
                  <p className={cn(
                    'text-sm font-medium',
                    isActive ? 'text-foreground' : 'text-foreground/80'
                  )}>{item.label}</p>
                </div>
              </Link>
            );
          })}
        </div>
      )}

      {/* Status Panel */}
      <div className="px-3 py-4 border-t border-border/70">
        <p className="text-[10px] font-medium text-foreground/40 uppercase tracking-[0.2em] px-3 py-2">
          状态面板
        </p>
        <div className="space-y-3">
          <div className="rounded-xl border border-border/70 bg-card/60 p-3">
            <div className="flex items-center justify-between">
              <span className="text-xs text-foreground/60">进行中任务</span>
              <span className="text-sm font-semibold text-foreground">
                {pendingCount ?? '--'}
              </span>
            </div>
            <p className="mt-1 text-[10px] text-foreground/40">
              更新于 {formatRelativeTime(pendingUpdatedAt)}
            </p>
          </div>
          <div className="rounded-xl border border-border/70 bg-card/60 p-3">
            <div className="flex items-center justify-between">
              <span className="text-xs text-foreground/60">Sora 视频</span>
              <span className="text-[10px] text-foreground/40">
                更新于 {formatRelativeTime(videoUpdatedAt)}
              </span>
            </div>
            <div className="mt-2 space-y-2">
              {videoTasks.length === 0 ? (
                <p className="text-[10px] text-foreground/40">暂无任务</p>
              ) : (
                videoTasks.map((task) => {
                  const statusLabel = statusLabelMap[task.status] ?? '未知';
                  const statusColor = statusColorMap[task.status] ?? 'bg-zinc-400';
                  const durationMs = typeof task.durationMs === 'number' ? task.durationMs : task.elapsedMs;
                  return (
                    <div key={task.id} className="flex items-center justify-between text-[11px] text-foreground/70">
                      <div className="flex items-center gap-2">
                        <span className={cn('h-1.5 w-1.5 rounded-full', statusColor)} />
                        <span className="text-[10px] uppercase tracking-wide">{statusLabel}</span>
                      </div>
                      <span className="text-foreground/50">
                        {typeof durationMs === 'number' ? formatDuration(durationMs) : '--'}
                      </span>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="p-4 border-t border-border/70">
        <div className="flex items-center justify-center gap-3">
          <p className="text-[10px] text-foreground/40">{siteConfig.siteName} © {new Date().getFullYear()}</p>
          <a 
            href="https://github.com/genz27/sanhub" 
            target="_blank" 
            rel="noopener noreferrer"
            className="text-foreground/40 hover:text-foreground/70 transition-colors"
            title="GitHub"
          >
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
              <path fillRule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" clipRule="evenodd" />
            </svg>
          </a>
        </div>
      </div>
    </aside>
    </>
  );
}
