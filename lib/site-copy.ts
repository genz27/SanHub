export const DEFAULT_SITE_NAME = 'SANHUB';
export const DEFAULT_SITE_TAGLINE = 'Let Imagination Come Alive';
export const DEFAULT_SITE_DESCRIPTION = '「SANHUB」是专为 AI 创作打造的一站式平台';
export const DEFAULT_SITE_SUB_DESCRIPTION =
  '图像、视频、角色卡与工作流一体的 AI 创作平台。默认深色界面，按渠道接入模型。';
export const DEFAULT_CONTACT_EMAIL = 'support@sanhub.com';
export const DEFAULT_COPYRIGHT = 'Copyright © 2026 SANHUB';
export const DEFAULT_POWERED_BY = 'Powered by SanHub';

const LEGACY_SITE_COPY = new Set([
  '我们融合了 Sora 视频生成、Gemini 图像创作与多模型 AI 对话。在这里，技术壁垒已然消融，你唯一的使命就是释放纯粹的想象。',
  'Powered by OpenAI Sora & Google Gemini',
]);

export function resolveSiteCopy(value: string | undefined | null, fallback: string): string {
  const trimmed = typeof value === 'string' ? value.trim() : '';
  if (!trimmed || LEGACY_SITE_COPY.has(trimmed)) return fallback;
  return trimmed;
}
