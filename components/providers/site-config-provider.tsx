'use client';

import { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import type { SiteConfig } from '@/types';
import {
  DEFAULT_CONTACT_EMAIL,
  DEFAULT_COPYRIGHT,
  DEFAULT_POWERED_BY,
  DEFAULT_SITE_DESCRIPTION,
  DEFAULT_SITE_NAME,
  DEFAULT_SITE_SUB_DESCRIPTION,
  DEFAULT_SITE_TAGLINE,
} from '@/lib/site-copy';

// Extended config that includes runtime settings
export interface ExtendedSiteConfig extends SiteConfig {
  defaultBalance: number;
  squareEnabled: boolean;
  gachaEnabled: boolean;
  characterCardEnabled: boolean;
  inviteEnabled: boolean;
  inviteRewardEnabled: boolean;
  inviteeBonusPoints: number;
  inviterBonusPoints: number;
}

const defaultSiteConfig: ExtendedSiteConfig = {
  siteName: DEFAULT_SITE_NAME,
  siteTagline: DEFAULT_SITE_TAGLINE,
  siteDescription: DEFAULT_SITE_DESCRIPTION,
  siteSubDescription: DEFAULT_SITE_SUB_DESCRIPTION,
  contactEmail: DEFAULT_CONTACT_EMAIL,
  copyright: DEFAULT_COPYRIGHT,
  poweredBy: DEFAULT_POWERED_BY,
  defaultBalance: 100,
  squareEnabled: true,
  gachaEnabled: true,
  characterCardEnabled: true,
  inviteEnabled: true,
  inviteRewardEnabled: true,
  inviteeBonusPoints: 100,
  inviterBonusPoints: 50,
};

interface SiteConfigContextType {
  config: ExtendedSiteConfig;
  refreshConfig: () => Promise<void>;
}

const SiteConfigContext = createContext<SiteConfigContextType>({
  config: defaultSiteConfig,
  refreshConfig: async () => {},
});

export function useSiteConfig() {
  const { config } = useContext(SiteConfigContext);
  return config;
}

export function useSiteConfigRefresh() {
  const { refreshConfig } = useContext(SiteConfigContext);
  return refreshConfig;
}

interface SiteConfigProviderProps {
  children: ReactNode;
  initialConfig?: ExtendedSiteConfig;
}

export function SiteConfigProvider({ children, initialConfig }: SiteConfigProviderProps) {
  const [config, setConfig] = useState<ExtendedSiteConfig>(initialConfig || defaultSiteConfig);

  const fetchConfig = useCallback(async () => {
    try {
      const res = await fetch('/api/site-config', { cache: 'no-store' });
      const data = await res.json();
      if (data.success && data.data) {
        setConfig({
          ...data.data,
          defaultBalance: data.data.defaultBalance ?? 100,
          squareEnabled: data.data.squareEnabled ?? true,
          gachaEnabled: data.data.gachaEnabled ?? true,
          characterCardEnabled: data.data.characterCardEnabled ?? true,
          inviteEnabled: data.data.inviteEnabled ?? true,
          inviteRewardEnabled: data.data.inviteRewardEnabled ?? true,
          inviteeBonusPoints: data.data.inviteeBonusPoints ?? 100,
          inviterBonusPoints: data.data.inviterBonusPoints ?? 50,
        });
      }
    } catch (error) {
      console.error('Failed to fetch site config:', error);
    }
  }, []);

  return (
    <SiteConfigContext.Provider value={{ config, refreshConfig: fetchConfig }}>
      {children}
    </SiteConfigContext.Provider>
  );
}
