import type { SystemConfig } from '@/types';
import { getSystemConfigSlice } from './system-config-slice';

export async function getDailyLimitConfig(): Promise<SystemConfig['dailyLimit']> {
  return getSystemConfigSlice(
    'daily-limit',
    'daily_limit_image, daily_limit_video, daily_limit_character_card',
    (row) => ({
      imageLimit: row?.daily_limit_image || 0,
      videoLimit: row?.daily_limit_video || 0,
      characterCardLimit: row?.daily_limit_character_card || 0,
    })
  );
}
