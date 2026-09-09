'use client';

import type { SafeUser } from '@/types';
import { Header } from '@/components/layout/header';
import { Sidebar } from '@/components/layout/sidebar';
import { AnnouncementBanner } from '@/components/ui/announcement';

interface DashboardShellProps {
  user: SafeUser;
  children: React.ReactNode;
}

export function DashboardShell({ user, children }: DashboardShellProps) {
  return (
    <>
      <Header user={user} />
      <div className="flex relative z-10 min-h-screen">
        <Sidebar user={user} />
        <main className="flex-1 min-w-0 lg:ml-56 p-4 lg:p-8 mt-14 pb-24 lg:pb-8">
          <AnnouncementBanner />
          <div className="animate-rise">{children}</div>
        </main>
      </div>
    </>
  );
}
