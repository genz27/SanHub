import { getSoraConfig } from './sora-config';
import { fetchWithRetry, soraUndiciFetch } from './sora-http';

export interface FeedRequest {
  limit?: number;
  cut?: 'nf2_latest' | 'nf2_top';
  cursor?: string;
}

export interface FeedItem {
  id: string;
  text: string;
  permalink: string;
  preview_image_url: string;
  posted_at: string;
  like_count: number;
  view_count: number;
  remix_count: number;
  attachment: {
    kind: string;
    url: string;
    downloadable_url: string;
    width: number;
    height: number;
    n_frames?: number;
    duration_seconds?: number;
  };
  author: {
    user_id: string;
    username: string;
    display_name: string;
    profile_picture_url: string;
  };
}

export interface FeedResponse {
  success: boolean;
  cut: string;
  count: number;
  cursor: string;
  items: FeedItem[];
}

export interface ProfileResponse {
  success: boolean;
  profile: {
    user_id: string;
    username: string;
    display_name: string;
    profile_picture_url: string;
    follower_count: number;
  };
}

export interface UserFeedRequest {
  user_id: string;
  limit?: number;
  cursor?: string;
}

export interface CharacterSearchRequest {
  username: string;
  intent?: 'users' | 'cameo';
  limit?: number;
}

export interface CharacterSearchResponse {
  success: boolean;
  query: string;
  count: number;
  results: Array<{
    user_id: string;
    username: string;
    display_name: string;
    profile_picture_url: string;
    can_cameo: boolean;
    token: string;
  }>;
}

async function requireSoraBase(): Promise<{ apiKey: string; baseUrl: string }> {
  const { apiKey, baseUrl } = await getSoraConfig();
  if (!apiKey) {
    throw new Error('Sora API Key 未配置');
  }
  if (!baseUrl) {
    throw new Error('Sora Base URL 未配置');
  }
  return { apiKey, baseUrl: baseUrl.replace(/\/$/, '') };
}

export async function getFeed(request: FeedRequest = {}): Promise<FeedResponse> {
  const { apiKey, baseUrl } = await requireSoraBase();
  const params = new URLSearchParams();
  if (request.limit) params.append('limit', String(request.limit));
  if (request.cut) params.append('cut', request.cut);
  if (request.cursor) params.append('cursor', request.cursor);

  const apiUrl = `${baseUrl}/v1/feed?${params.toString()}`;
  const response = await fetchWithRetry(soraUndiciFetch, apiUrl, () => ({
    method: 'GET',
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
  }));

  const data = await response.json() as { error?: { message?: string } };
  if (!response.ok) {
    throw new Error(data?.error?.message || 'Feed 获取失败');
  }
  return data as FeedResponse;
}

export async function getProfile(username: string): Promise<ProfileResponse> {
  const { apiKey, baseUrl } = await requireSoraBase();
  const apiUrl = `${baseUrl}/v1/profiles/${encodeURIComponent(username)}`;
  const response = await fetchWithRetry(soraUndiciFetch, apiUrl, () => ({
    method: 'GET',
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
  }));

  const data = await response.json() as { error?: { message?: string } };
  if (!response.ok) {
    throw new Error(data?.error?.message || '用户资料获取失败');
  }
  return data as ProfileResponse;
}

export async function getUserFeed(request: UserFeedRequest): Promise<FeedResponse> {
  const { apiKey, baseUrl } = await requireSoraBase();
  const params = new URLSearchParams();
  if (request.limit) params.append('limit', String(request.limit));
  if (request.cursor) params.append('cursor', request.cursor);

  const apiUrl = `${baseUrl}/v1/users/${encodeURIComponent(request.user_id)}/feed?${params.toString()}`;
  const response = await fetchWithRetry(soraUndiciFetch, apiUrl, () => ({
    method: 'GET',
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
  }));

  const data = await response.json() as { error?: { message?: string } };
  if (!response.ok) {
    throw new Error(data?.error?.message || '用户内容获取失败');
  }
  return data as FeedResponse;
}

export async function searchCharacters(request: CharacterSearchRequest): Promise<CharacterSearchResponse> {
  const { apiKey, baseUrl } = await requireSoraBase();
  const params = new URLSearchParams();
  params.append('username', request.username);
  if (request.intent) params.append('intent', request.intent);
  if (request.limit) params.append('limit', String(request.limit));

  const apiUrl = `${baseUrl}/v1/characters/search?${params.toString()}`;
  const response = await fetchWithRetry(soraUndiciFetch, apiUrl, () => ({
    method: 'GET',
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
  }));

  const data = await response.json() as { error?: { message?: string } };
  if (!response.ok) {
    throw new Error(data?.error?.message || '角色搜索失败');
  }
  return data as CharacterSearchResponse;
}
