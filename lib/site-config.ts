import { getSystemConfig } from '@/lib/db';
import type { ExtendedSiteConfig } from '@/components/providers/site-config-provider';

export async function getPublicSiteConfig(): Promise<ExtendedSiteConfig> {
  const config = await getSystemConfig();

  return {
    siteName: config.siteConfig?.siteName || 'SANHUB',
    siteTagline: config.siteConfig?.siteTagline || 'Let Imagination Come Alive',
    siteDescription: config.siteConfig?.siteDescription || '「SANHUB」是专为 AI 创作打造的一站式平台',
    siteSubDescription:
      config.siteConfig?.siteSubDescription ||
      '我们融合了 Sora 视频生成、Gemini 图像创作与多模型 AI 对话。在这里，技术壁垒已然消融，你唯一的使命就是释放纯粹的想象。',
    contactEmail: config.siteConfig?.contactEmail || 'support@sanhub.com',
    copyright: config.siteConfig?.copyright || 'Copyright © 2025 SANHUB',
    poweredBy: config.siteConfig?.poweredBy || 'Powered by OpenAI Sora & Google Gemini',
    defaultBalance: config.defaultBalance ?? 100,
    squareEnabled: config.featureFlags?.squareEnabled ?? true,
    gachaEnabled: config.featureFlags?.gachaEnabled ?? true,
    characterCardEnabled: config.featureFlags?.characterCardEnabled ?? true,
    inviteEnabled: config.inviteSettings?.enabled ?? true,
    inviteRewardEnabled: config.inviteSettings?.rewardEnabled ?? true,
    inviteeBonusPoints: config.inviteSettings?.inviteeBonusPoints ?? 100,
    inviterBonusPoints: config.inviteSettings?.inviterBonusPoints ?? 50,
  };
}
