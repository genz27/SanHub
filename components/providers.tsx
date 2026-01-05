'use client';

import { SessionProvider } from 'next-auth/react';
import { Toaster } from '@/components/ui/toaster';
import { SiteConfigProvider, ExtendedSiteConfig } from '@/components/providers/site-config-provider';

interface ProvidersProps {
  children: React.ReactNode;
  initialSiteConfig?: ExtendedSiteConfig;
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
