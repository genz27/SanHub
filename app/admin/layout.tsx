import { redirect } from 'next/navigation';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { AdminSidebar } from '@/components/admin/sidebar';
import { DashboardBackgroundWrapper } from '@/components/ui/dashboard-background-wrapper';

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getServerSession(authOptions);

  if (!session) {
    redirect('/login');
  }

  // admin 和 moderator 都可以访问后台
  if (session.user.role !== 'admin' && session.user.role !== 'moderator') {
    redirect('/');
  }

  return (
    <div className="min-h-screen bg-black relative overflow-hidden">
      <DashboardBackgroundWrapper />
      <div className="flex relative z-10 min-h-screen">
        <AdminSidebar />
        <main className="flex-1 p-6 lg:p-8 overflow-auto">
          <div className="h-full">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
