import type { SystemConfig } from '@/types';
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
    siteName: 'SANHUB',
    siteTagline: 'Let Imagination Come Alive',
    siteDescription: '「SANHUB」是专为 AI 创作打造的一站式平台',
    siteSubDescription: '我们融合了 Sora 视频生成、Gemini 图像创作与多模型 AI 对话。在这里，技术壁垒已然消融，你唯一的使命就是释放纯粹的想象。',
    contactEmail: 'support@sanhub.com',
    copyright: 'Copyright © 2025 SANHUB',
    poweredBy: 'Powered by OpenAI Sora & Google Gemini',
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
      siteName: row.site_name || DEFAULT_PUBLIC_SYSTEM_CONFIG.siteConfig.siteName,
      siteTagline: row.site_tagline || DEFAULT_PUBLIC_SYSTEM_CONFIG.siteConfig.siteTagline,
      siteDescription: row.site_description || DEFAULT_PUBLIC_SYSTEM_CONFIG.siteConfig.siteDescription,
      siteSubDescription: row.site_sub_description || DEFAULT_PUBLIC_SYSTEM_CONFIG.siteConfig.siteSubDescription,
      contactEmail: row.contact_email || DEFAULT_PUBLIC_SYSTEM_CONFIG.siteConfig.contactEmail,
      copyright: row.site_copyright || DEFAULT_PUBLIC_SYSTEM_CONFIG.siteConfig.copyright,
      poweredBy: row.site_powered_by || DEFAULT_PUBLIC_SYSTEM_CONFIG.siteConfig.poweredBy,
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
