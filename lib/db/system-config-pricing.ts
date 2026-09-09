import type { SystemConfig } from '@/types';
import { getSystemConfigSlice } from './system-config-slice';

export async function getPricingConfig(): Promise<SystemConfig['pricing']> {
  return getSystemConfigSlice(
    'pricing',
    'pricing_sora_video_10s, pricing_sora_video_15s, pricing_sora_video_25s, pricing_sora_image, pricing_gemini_nano, pricing_gemini_pro, pricing_zimage_image, pricing_gitee_image',
    (row) => ({
      soraVideo10s: row?.pricing_sora_video_10s || 100,
      soraVideo15s: row?.pricing_sora_video_15s || 150,
      soraVideo25s: row?.pricing_sora_video_25s || 200,
      soraImage: row?.pricing_sora_image || 50,
      geminiNano: row?.pricing_gemini_nano || 10,
      geminiPro: row?.pricing_gemini_pro || 30,
      zimageImage: row?.pricing_zimage_image || 30,
      giteeImage: row?.pricing_gitee_image || 30,
    })
  );
}
