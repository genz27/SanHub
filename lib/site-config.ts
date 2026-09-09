import { cache } from 'react';
import { getPublicSystemConfig } from '@/lib/db/system-config-public';
import type { ExtendedSiteConfig } from '@/components/providers/site-config-provider';
import {
  DEFAULT_CONTACT_EMAIL,
  DEFAULT_COPYRIGHT,
  DEFAULT_POWERED_BY,
  DEFAULT_SITE_DESCRIPTION,
  DEFAULT_SITE_NAME,
  DEFAULT_SITE_SUB_DESCRIPTION,
  DEFAULT_SITE_TAGLINE,
  resolveSiteCopy,
} from '@/lib/site-copy';

export const getPublicSiteConfig = cache(async (): Promise<ExtendedSiteConfig> => {
  const config = await getPublicSystemConfig();

  return {
    siteName: resolveSiteCopy(config.siteConfig?.siteName, DEFAULT_SITE_NAME),
    siteTagline: resolveSiteCopy(config.siteConfig?.siteTagline, DEFAULT_SITE_TAGLINE),
    siteDescription: resolveSiteCopy(config.siteConfig?.siteDescription, DEFAULT_SITE_DESCRIPTION),
    siteSubDescription: resolveSiteCopy(
      config.siteConfig?.siteSubDescription,
      DEFAULT_SITE_SUB_DESCRIPTION
    ),
    contactEmail: resolveSiteCopy(config.siteConfig?.contactEmail, DEFAULT_CONTACT_EMAIL),
    copyright: resolveSiteCopy(config.siteConfig?.copyright, DEFAULT_COPYRIGHT),
    poweredBy: resolveSiteCopy(config.siteConfig?.poweredBy, DEFAULT_POWERED_BY),
    defaultBalance: config.defaultBalance ?? 100,
    squareEnabled: config.featureFlags?.squareEnabled ?? true,
    gachaEnabled: config.featureFlags?.gachaEnabled ?? true,
    characterCardEnabled: config.featureFlags?.characterCardEnabled ?? true,
    inviteEnabled: config.inviteSettings?.enabled ?? true,
    inviteRewardEnabled: config.inviteSettings?.rewardEnabled ?? true,
    inviteeBonusPoints: config.inviteSettings?.inviteeBonusPoints ?? 100,
    inviterBonusPoints: config.inviteSettings?.inviterBonusPoints ?? 50,
  };
});
