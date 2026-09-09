import type { SystemConfig } from '@/types';
import {
  DEFAULT_CONTACT_EMAIL,
  DEFAULT_COPYRIGHT,
  DEFAULT_POWERED_BY,
  DEFAULT_SITE_DESCRIPTION,
  DEFAULT_SITE_NAME,
  DEFAULT_SITE_SUB_DESCRIPTION,
  DEFAULT_SITE_TAGLINE,
  resolveSiteCopy,
} from '../site-copy';
import { getAdapter } from './connection';
import { CacheKeys, CacheTTL, withCache } from '../cache';
import { ensureDatabase } from './ready';

export type PublicSystemConfig = Pick<
  SystemConfig,
  'registerEnabled' | 'defaultBalance' | 'featureFlags' | 'inviteSettings' | 'siteConfig'
>;

const PUBLIC_SYSTEM_CONFIG_COLUMNS = `
  register_enabled, default_balance,
  square_enabled, gacha_enabled, character_card_enabled,
  invite_enabled, invite_reward_enabled, invite_invitee_bonus, invite_inviter_bonus,
  site_name, site_tagline, site_description, site_sub_description,
  contact_email, site_copyright, site_powered_by
`;

const DEFAULT_PUBLIC_SYSTEM_CONFIG: PublicSystemConfig = {
  registerEnabled: true,
  defaultBalance: 100,
  featureFlags: {
    squareEnabled: true,
    gachaEnabled: true,
    characterCardEnabled: true,
  },
  inviteSettings: {
    enabled: true,
    rewardEnabled: true,
    inviteeBonusPoints: 100,
    inviterBonusPoints: 50,
  },
  siteConfig: {
    siteName: DEFAULT_SITE_NAME,
    siteTagline: DEFAULT_SITE_TAGLINE,
    siteDescription: DEFAULT_SITE_DESCRIPTION,
    siteSubDescription: DEFAULT_SITE_SUB_DESCRIPTION,
    contactEmail: DEFAULT_CONTACT_EMAIL,
    copyright: DEFAULT_COPYRIGHT,
    poweredBy: DEFAULT_POWERED_BY,
  },
};

function mapPublicSystemConfig(row: any): PublicSystemConfig {
  return {
    registerEnabled: Boolean(row.register_enabled),
    defaultBalance: row.default_balance || 100,
    featureFlags: {
      squareEnabled: row.square_enabled !== 0,
      gachaEnabled: row.gacha_enabled !== 0,
      characterCardEnabled: row.character_card_enabled !== 0,
    },
    inviteSettings: {
      enabled: row.invite_enabled !== 0,
      rewardEnabled: row.invite_reward_enabled !== 0,
      inviteeBonusPoints: Number(row.invite_invitee_bonus) || 100,
      inviterBonusPoints: Number(row.invite_inviter_bonus) || 50,
    },
    siteConfig: {
      siteName: resolveSiteCopy(row.site_name, DEFAULT_SITE_NAME),
      siteTagline: resolveSiteCopy(row.site_tagline, DEFAULT_SITE_TAGLINE),
      siteDescription: resolveSiteCopy(row.site_description, DEFAULT_SITE_DESCRIPTION),
      siteSubDescription: resolveSiteCopy(row.site_sub_description, DEFAULT_SITE_SUB_DESCRIPTION),
      contactEmail: resolveSiteCopy(row.contact_email, DEFAULT_CONTACT_EMAIL),
      copyright: resolveSiteCopy(row.site_copyright, DEFAULT_COPYRIGHT),
      poweredBy: resolveSiteCopy(row.site_powered_by, DEFAULT_POWERED_BY),
    },
  };
}

export async function getPublicSystemConfig(): Promise<PublicSystemConfig> {
  return withCache(`${CacheKeys.SYSTEM_CONFIG}:public`, CacheTTL.SYSTEM_CONFIG, async () => {
    await ensureDatabase();
    const db = getAdapter();
    const [rows] = await db.execute(
      `SELECT ${PUBLIC_SYSTEM_CONFIG_COLUMNS} FROM system_config WHERE id = 1`
    );
    const configs = rows as any[];
    if (configs.length === 0) {
      return DEFAULT_PUBLIC_SYSTEM_CONFIG;
    }
    return mapPublicSystemConfig(configs[0]);
  });
}
