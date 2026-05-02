import type { Metadata } from 'next';
import './globals.css';
import { Providers } from '@/components/providers';
import { getPublicSiteConfig } from '@/lib/site-config';

// Disable caching to always get fresh config
export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  const siteConfig = await getPublicSiteConfig();
  
  return {
    title: `${siteConfig.siteName} - AI 内容生成平台`,
    description: siteConfig.siteDescription,
    icons: {
      icon: '/favicon.ico',
    },
  };
}

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const initialSiteConfig = await getPublicSiteConfig();
  
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <body className="antialiased">
        <Providers initialSiteConfig={initialSiteConfig}>{children}</Providers>
      </body>
    </html>
  );
}
