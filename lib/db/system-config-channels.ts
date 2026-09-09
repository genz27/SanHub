import type { SystemConfig } from '@/types';
import { getSystemConfigSlice } from './system-config-slice';

export async function getChannelEnabledConfig(): Promise<SystemConfig['channelEnabled']> {
  return getSystemConfigSlice(
    'channels',
    'channel_sora_enabled, channel_gemini_enabled, channel_zimage_enabled, channel_gitee_enabled',
    (row) => ({
      sora: row?.channel_sora_enabled !== 0,
      gemini: row?.channel_gemini_enabled !== 0,
      zimage: row?.channel_zimage_enabled !== 0,
      gitee: row?.channel_gitee_enabled !== 0,
    })
  );
}
