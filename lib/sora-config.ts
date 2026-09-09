import { CacheKeys, CacheTTL, withCache } from './cache';
import { getLegacySoraConfig } from './db/system-config-sora';
import { getVideoChannel, getVideoChannels } from './db/video-channel-reads';
import type { VideoChannel } from '@/types';

const DEFAULT_SORA_BASE_URL = 'http://localhost:8000';

export type SoraConfig = {
  apiKey: string;
  baseUrl: string;
  channelId?: string;
  channelType?: VideoChannel['type'] | 'legacy';
};

export type SoraConfigOptions = {
  channelId?: string;
  mode?: 'default' | 'round-robin';
};

let soraChannelCursor = 0;

function isSoraCompatibleChannel(channel: VideoChannel): boolean {
  return (channel.type === 'sora' || channel.type === 'apexerapi') && Boolean(channel.apiKey);
}

function pickRoundRobinChannel(channels: VideoChannel[]): VideoChannel {
  const index = soraChannelCursor % channels.length;
  soraChannelCursor = (soraChannelCursor + 1) % channels.length;
  return channels[index];
}

async function loadSoraConfig(options?: SoraConfigOptions): Promise<SoraConfig> {
  if (options?.channelId) {
    const channel = await getVideoChannel(options.channelId);
    if (channel && isSoraCompatibleChannel(channel)) {
      return {
        apiKey: channel.apiKey,
        baseUrl: channel.baseUrl || DEFAULT_SORA_BASE_URL,
        channelId: channel.id,
        channelType: channel.type,
      };
    }
  }

  const channels = await getVideoChannels(true);
  const soraChannels = channels.filter(isSoraCompatibleChannel);
  if (soraChannels.length > 0) {
    const selected =
      options?.mode === 'round-robin'
        ? pickRoundRobinChannel(soraChannels)
        : soraChannels[0];
    return {
      apiKey: selected.apiKey,
      baseUrl: selected.baseUrl || DEFAULT_SORA_BASE_URL,
      channelId: selected.id,
      channelType: selected.type,
    };
  }

  const config = await getLegacySoraConfig();
  return {
    apiKey: config.soraApiKey || '',
    baseUrl: config.soraBaseUrl || DEFAULT_SORA_BASE_URL,
    channelType: 'legacy',
  };
}

export async function getSoraConfig(options?: SoraConfigOptions): Promise<SoraConfig> {
  if (options?.mode === 'round-robin') {
    return loadSoraConfig(options);
  }

  return withCache(
    `${CacheKeys.VIDEO_CHANNELS}sora:${options?.channelId || 'default'}`,
    CacheTTL.VIDEO_MODELS,
    () => loadSoraConfig(options)
  );
}

// Prefer video channels, then fall back to legacy system_config.
// Round-robin is not cached so each submit still rotates channels.
export function warmupSoraConfig(options?: SoraConfigOptions): Promise<SoraConfig> {
  return getSoraConfig(options);
}
