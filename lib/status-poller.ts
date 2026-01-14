import { cache } from './cache';
import {
  getRecentSoraVideoGenerations,
  getRecentSoraVideoGenerationsByUser,
  getUserIdsWithRecentSoraVideos,
} from './db';
import type { Generation } from '@/types';

export type VideoStatusTask = {
  id: string;
  status: Generation['status'];
  createdAt: number;
  updatedAt: number;
  durationMs?: number;
  elapsedMs?: number;
};

export type VideoStatusSnapshot = {
  updatedAt: number;
  tasks: VideoStatusTask[];
};

const VIDEO_STATUS_CACHE_PREFIX = 'status:video:';
const VIDEO_STATUS_CACHE_SITE_KEY = `${VIDEO_STATUS_CACHE_PREFIX}site`;
const VIDEO_STATUS_TTL_SECONDS = 10 * 60;
const POLL_INTERVAL_MS = 5 * 60 * 1000;
const LOOKBACK_MS = 7 * 24 * 60 * 60 * 1000;
const TASK_LIMIT = 20;
const DISPLAY_LIMIT = 3;

const globalForStatusPoller = globalThis as typeof globalThis & {
  __videoStatusPollerStarted?: boolean;
};

function getCacheKey(userId: string): string {
  return `${VIDEO_STATUS_CACHE_PREFIX}${userId}`;
}

function buildTaskSnapshot(generation: Generation, now: number): VideoStatusTask {
  const createdAt = Number(generation.createdAt) || 0;
  const updatedAt = Number(generation.updatedAt) || createdAt;
  const status = generation.status || 'pending';
  const isTerminal = status === 'completed' || status === 'failed' || status === 'cancelled';
  const durationMs = isTerminal ? Math.max(0, updatedAt - createdAt) : undefined;
  const elapsedMs = !isTerminal ? Math.max(0, now - createdAt) : undefined;

  return {
    id: generation.id,
    status,
    createdAt,
    updatedAt,
    durationMs,
    elapsedMs,
  };
}

export async function buildVideoStatusSnapshotForUser(
  userId: string,
  now = Date.now()
): Promise<VideoStatusSnapshot> {
  const generations = await getRecentSoraVideoGenerationsByUser(userId, TASK_LIMIT);
  const tasks = generations
    .map((generation) => buildTaskSnapshot(generation, now))
    .slice(0, DISPLAY_LIMIT);

  return {
    updatedAt: now,
    tasks,
  };
}

export async function buildVideoStatusSnapshotForSite(
  now = Date.now()
): Promise<VideoStatusSnapshot> {
  const generations = await getRecentSoraVideoGenerations(TASK_LIMIT);
  const tasks = generations
    .map((generation) => buildTaskSnapshot(generation, now))
    .slice(0, DISPLAY_LIMIT);

  return {
    updatedAt: now,
    tasks,
  };
}

export function getCachedVideoStatus(userId: string): VideoStatusSnapshot | null {
  return cache.get<VideoStatusSnapshot>(getCacheKey(userId));
}

export function setCachedVideoStatus(userId: string, snapshot: VideoStatusSnapshot): void {
  cache.set(getCacheKey(userId), snapshot, VIDEO_STATUS_TTL_SECONDS);
}

export function getCachedSiteVideoStatus(): VideoStatusSnapshot | null {
  return cache.get<VideoStatusSnapshot>(VIDEO_STATUS_CACHE_SITE_KEY);
}

export function setCachedSiteVideoStatus(snapshot: VideoStatusSnapshot): void {
  cache.set(VIDEO_STATUS_CACHE_SITE_KEY, snapshot, VIDEO_STATUS_TTL_SECONDS);
}

async function refreshAllVideoStatusSnapshots(): Promise<void> {
  const now = Date.now();
  const userIds = await getUserIdsWithRecentSoraVideos(now - LOOKBACK_MS);

  try {
    const snapshot = await buildVideoStatusSnapshotForSite(now);
    setCachedSiteVideoStatus(snapshot);
  } catch (error) {
    console.error('[Status Poller] Failed to refresh site status:', error);
  }

  await Promise.all(
    userIds.map(async (userId) => {
      try {
        const snapshot = await buildVideoStatusSnapshotForUser(userId, now);
        setCachedVideoStatus(userId, snapshot);
      } catch (error) {
        console.error(`[Status Poller] Failed to refresh status for user ${userId}:`, error);
      }
    })
  );
}

export function startVideoStatusPoller(): void {
  if (globalForStatusPoller.__videoStatusPollerStarted) return;
  globalForStatusPoller.__videoStatusPollerStarted = true;

  void refreshAllVideoStatusSnapshots().catch((error) => {
    console.error('[Status Poller] Initial refresh failed:', error);
  });

  setInterval(() => {
    void refreshAllVideoStatusSnapshots().catch((error) => {
      console.error('[Status Poller] Refresh failed:', error);
    });
  }, POLL_INTERVAL_MS);
}
