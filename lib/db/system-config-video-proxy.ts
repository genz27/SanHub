import type { SystemConfig } from '@/types';
import { getSystemConfigSlice } from './system-config-slice';

export type VideoProxyConfig = Pick<SystemConfig, 'videoProxyEnabled' | 'videoProxyBaseUrl'>;

export async function getVideoProxyConfig(): Promise<VideoProxyConfig> {
  return getSystemConfigSlice(
    'video-proxy',
    'video_proxy_enabled, video_proxy_base_url',
    (row) => ({
      videoProxyEnabled: Boolean(row?.video_proxy_enabled),
      videoProxyBaseUrl: row?.video_proxy_base_url || '',
    })
  );
}
