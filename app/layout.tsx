import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import { Providers } from '@/components/providers';
import { getSystemConfig } from '@/lib/db';
import type { ExtendedSiteConfig } from '@/components/providers/site-config-provider';

// Disable caching to always get fresh config
export const dynamic = 'force-dynamic';

const inter = Inter({ subsets: ['latin'] });

async function getSiteConfig(): Promise<ExtendedSiteConfig> {
  const config = await getSystemConfig();
  return {
    siteName: config.siteConfig?.siteName || 'SANHUB',
    siteTagline: config.siteConfig?.siteTagline || 'Let Imagination Come Alive',
    siteDescription: config.siteConfig?.siteDescription || '「SANHUB」是专为 AI 创作打造的一站式平台',
    siteSubDescription: config.siteConfig?.siteSubDescription || '我们融合了 Sora 视频生成、Gemini 图像创作与多模型 AI 对话。在这里，技术壁垒已然消融，你唯一的使命就是释放纯粹的想象。',
    contactEmail: config.siteConfig?.contactEmail || 'support@sanhub.com',
    copyright: config.siteConfig?.copyright || 'Copyright © 2025 SANHUB',
    poweredBy: config.siteConfig?.poweredBy || 'Powered by OpenAI Sora & Google Gemini',
    defaultBalance: config.defaultBalance ?? 100,
  };
}

export async function generateMetadata(): Promise<Metadata> {
  const siteConfig = await getSiteConfig();
  
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
  const initialSiteConfig = await getSiteConfig();
  
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <body className={inter.className}>
        <Providers initialSiteConfig={initialSiteConfig}>{children}</Providers>
      </body>
    </html>
  );
}
