'use client';

import { SessionProvider } from 'next-auth/react';
import { Toaster } from '@/components/ui/toaster';
import { SiteConfigProvider } from '@/components/providers/site-config-provider';
import type { SiteConfig } from '@/types';

interface ProvidersProps {
  children: React.ReactNode;
  initialSiteConfig?: SiteConfig;
}

export function Providers({ children, initialSiteConfig }: ProvidersProps) {
  return (
    <SessionProvider>
      <SiteConfigProvider initialConfig={initialSiteConfig}>
        {children}
        <Toaster />
      </SiteConfigProvider>
    </SessionProvider>
  );
}
