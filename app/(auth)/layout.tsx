import { AuthSessionProvider } from '@/components/providers/session-provider';

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <AuthSessionProvider>{children}</AuthSessionProvider>;
}
