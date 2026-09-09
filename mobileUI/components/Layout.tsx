import React, { useState } from 'react';
import { useLocation, Link, useNavigate } from 'react-router-dom';
import { 
  Image, Video, Users, Settings, History, 
  Menu, X, Sparkles, Box, BarChart2, DollarSign,
  LogOut, Layers, LayoutGrid, key, Terminal,
  CreditCard, Megaphone, Settings2, Shield, Gift,
  FileCode, Database, Cpu
} from 'lucide-react';
import { NavItem, UserRole } from '../types';
import { LogOut as LogOutIcon } from 'lucide-react';

// Navigation Config strictly matching the request
const USER_NAV: NavItem[] = [
  { label: '广场', path: '/square', icon: LayoutGrid },
  { label: '图像', path: '/image', icon: Image },
  { label: '视频', path: '/video', icon: Video },
  { label: '历史', path: '/history', icon: History },
  { label: '设置', path: '/settings', icon: Settings },
];

const ADMIN_NAV: NavItem[] = [
  { label: '控制台', path: '/admin', icon: Box },
  { label: '用户管理', path: '/admin/users', icon: Users },
  { label: '生成记录', path: '/admin/generations', icon: Layers },
  { label: '图像渠道', path: '/admin/image-channels', icon: Image },
  { label: '视频渠道', path: '/admin/video-channels', icon: Video },
  { label: '模型管理', path: '/admin/models', icon: Cpu },
  { label: '定价管理', path: '/admin/pricing', icon: DollarSign },
  { label: '兑换码', path: '/admin/redemption', icon: Gift },
  { label: '邀请码', path: '/admin/invites', icon: FileCode },
  { label: '公告管理', path: '/admin/announcement', icon: Megaphone },
  { label: '站点设置', path: '/admin/site', icon: Settings2 },
  { label: '数据统计', path: '/admin/stats', icon: BarChart2 },
  { label: '视频渠道', path: '/admin/video-channels', icon: Terminal },
];

interface LayoutProps {
  children: React.ReactNode;
  role: UserRole;
  onLogout: () => void;
}

export const Layout: React.FC<LayoutProps> = ({ children, role, onLogout }) => {
  const [isSidebarOpen, setSidebarOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();

  const navItems = role === UserRole.ADMIN ? ADMIN_NAV : USER_NAV;

  // Logic to determine active state (handling sub-routes)
  const isActive = (path: string) => {
    if (path === '/admin' && location.pathname === '/admin') return true;
    if (path !== '/admin' && location.pathname.startsWith(path)) return true;
    if (path === '/image' && location.pathname === '/image') return true;
    if (path === '/video' && location.pathname.startsWith('/video')) return true;
    if (path === '/square' && location.pathname === '/square') return true;
    if (path === '/history' && location.pathname === '/history') return true;
    if (path === '/settings' && location.pathname === '/settings') return true;
    return false;
  };

  return (
    <div className="flex min-h-screen relative overflow-hidden bg-[hsl(var(--background))]">
      {/* Desktop/Mobile Sidebar (Drawer) */}
      <aside className={`fixed inset-y-0 left-0 z-50 w-64 bg-[hsl(var(--card))] border-r border-white/5 transform transition-transform duration-300 ${
        isSidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'
      } flex flex-col`}>
        
        {/* Sidebar Header */}
        <div className="flex items-center gap-3 p-6 h-20 border-b border-white/5 cursor-pointer" onClick={() => navigate('/')}>
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-sky-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-sky-500/20">
            <Sparkles className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-lg font-bold tracking-tight text-white">SanHub AI</h1>
            <p className="text-[10px] text-white/40 font-medium tracking-wider">CREATIVE STUDIO</p>
          </div>
        </div>

        {/* Navigation List */}
        <div className="flex-1 overflow-y-auto py-4 px-3 space-y-1 scrollbar-thin scrollbar-thumb-white/10 hover:scrollbar-thumb-white/20">
          {navItems.map((item) => {
            const active = isActive(item.path);
            return (
              <Link
                key={item.path}
                to={item.path}
                onClick={() => setSidebarOpen(false)} // Close on mobile click
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-200 group ${
                  active 
                    ? 'bg-sky-500/10 text-sky-400 border border-sky-500/20 shadow-[0_0_15px_rgba(14,165,233,0.1)]' 
                    : 'text-white/50 hover:text-white hover:bg-white/5 border border-transparent'
                }`}
              >
                <item.icon className={`w-4 h-4 transition-colors ${active ? 'text-sky-400' : 'text-white/40 group-hover:text-white'}`} />
                <span className="text-sm font-medium">{item.label}</span>
                {active && <div className="ml-auto w-1 h-1 rounded-full bg-sky-400 shadow-[0_0_5px_currentColor]" />}
              </Link>
            );
          })}
        </div>

        {/* Sidebar Footer */}
        <div className="p-4 border-t border-white/5 bg-black/10">
          <button 
            onClick={onLogout}
            className="flex items-center gap-3 px-3 py-2.5 text-white/40 hover:text-red-400 hover:bg-red-500/10 rounded-lg w-full transition-all group"
          >
            <LogOutIcon className="w-4 h-4 group-hover:scale-110 transition-transform" />
            <span className="text-sm font-medium">退出登录</span>
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col min-h-screen md:pl-64 transition-all duration-300">
        
        {/* Mobile Header */}
        <header className="md:hidden h-16 flex items-center justify-between px-4 sticky top-0 z-40 bg-[hsl(var(--background)/0.8)] backdrop-blur-xl border-b border-white/5">
          <div className="flex items-center gap-3">
             <button 
              onClick={() => setSidebarOpen(!isSidebarOpen)} 
              className="p-2 -ml-2 text-white/70 hover:bg-white/5 rounded-full active:scale-95 transition-all"
            >
              {isSidebarOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
            <span className="font-semibold text-white tracking-tight">SanHub</span>
          </div>
          {role === UserRole.ADMIN && (
             <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-sky-500/20 text-sky-400 border border-sky-500/30">ADMIN</span>
          )}
        </header>
        
        {/* Page Container */}
        <div className="flex-1 p-4 pb-24 md:p-8 md:pb-8 overflow-y-auto animate-rise">
          <div className="max-w-7xl mx-auto h-full">
            {children}
          </div>
        </div>
      </main>

      {/* User Mobile Bottom Nav (Only for Users) */}
      {role === UserRole.USER && (
        <div className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-[hsl(var(--card)/0.95)] backdrop-blur-2xl border-t border-white/10 pb-[env(safe-area-inset-bottom)]">
          <div className="flex justify-around items-center h-16">
            {USER_NAV.map((item) => {
               const active = isActive(item.path);
               return (
                <Link 
                  key={item.path} 
                  to={item.path}
                  className={`relative flex flex-col items-center justify-center w-full h-full space-y-1 transition-colors ${
                    active ? 'text-sky-400' : 'text-white/40'
                  }`}
                >
                  <div className={`p-1 rounded-full transition-all ${active ? 'bg-sky-500/10' : ''}`}>
                    <item.icon className={`w-5 h-5 ${active ? 'fill-current' : ''}`} />
                  </div>
                  <span className="text-[10px] font-medium scale-90">{item.label}</span>
                </Link>
               )
            })}
          </div>
        </div>
      )}

      {/* Overlay */}
      {isSidebarOpen && (
        <div 
          className="fixed inset-0 bg-black/60 z-40 md:hidden backdrop-blur-sm transition-opacity"
          onClick={() => setSidebarOpen(false)}
        />
      )}
    </div>
  );
};
