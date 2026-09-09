import type { SystemConfig } from '@/types';
import { getSystemConfigSlice } from './system-config-slice';

export type RateLimitConfigSlice = SystemConfig['rateLimit'];

export async function getRateLimitConfig(): Promise<RateLimitConfigSlice> {
  return getSystemConfigSlice(
    'rate-limit',
    'rate_limit_image_max_requests, rate_limit_image_window_seconds, rate_limit_video_max_requests, rate_limit_video_window_seconds',
    (row) => ({
      imageMaxRequests: Number(row?.rate_limit_image_max_requests) || 30,
      imageWindowSeconds: Number(row?.rate_limit_image_window_seconds) || 60,
      videoMaxRequests: Number(row?.rate_limit_video_max_requests) || 30,
      videoWindowSeconds: Number(row?.rate_limit_video_window_seconds) || 60,
    })
  );
}
