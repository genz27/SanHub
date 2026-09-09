import { redirect } from 'next/navigation';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { WorkspaceEditorFrame } from '@/components/layout/workspace-editor-frame';
import { DashboardBackgroundWrapper } from '@/components/ui/dashboard-background-wrapper';
import { AuthSessionProvider } from '@/components/providers/session-provider';

export default async function EditorLayout({
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
        <WorkspaceEditorFrame>{children}</WorkspaceEditorFrame>
      </AuthSessionProvider>
    </div>
  );
}
