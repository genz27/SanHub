import { redirect } from 'next/navigation';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { DashboardShell } from '@/components/layout/dashboard-shell';
import { DashboardBackgroundWrapper } from '@/components/ui/dashboard-background-wrapper';
import { AuthSessionProvider } from '@/components/providers/session-provider';

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getServerSession(authOptions);

  if (!session) {
    redirect('/login');
  }

  return (
    <div className="min-h-screen relative overflow-hidden">
      <DashboardBackgroundWrapper />
      <AuthSessionProvider>
        <DashboardShell user={session.user}>{children}</DashboardShell>
      </AuthSessionProvider>
    </div>
  );
}
