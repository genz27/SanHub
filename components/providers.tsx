'use client';

import { Toaster } from '@/components/ui/toaster';
import { SiteConfigProvider, type ExtendedSiteConfig } from '@/components/providers/site-config-provider';

interface ProvidersProps {
  children: React.ReactNode;
  initialSiteConfig?: ExtendedSiteConfig;
}

export function Providers({ children, initialSiteConfig }: ProvidersProps) {
  return (
    <SiteConfigProvider initialConfig={initialSiteConfig}>
      {children}
      <Toaster />
    </SiteConfigProvider>
  );
}
