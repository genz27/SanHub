import type { Generation } from '@/types';
import { getAdapter } from './connection';
import { ensureDatabase } from './ready';

export async function getUserIdsWithRecentSoraVideos(sinceMs: number): Promise<string[]> {
  await ensureDatabase();
  const db = getAdapter();

  const [rows] = await db.execute(
    `SELECT DISTINCT user_id FROM generations
     WHERE type = 'sora-video'
     AND (created_at >= ? OR status IN ('pending', 'processing'))`,
    [sinceMs]
  );

  return (rows as any[]).map((row) => String(row.user_id));
}

export async function getRecentSoraVideoGenerationsByUser(
  userId: string,
  limit = 20
): Promise<Generation[]> {
  await ensureDatabase();
  const db = getAdapter();
  const safeLimit = Math.max(Number(limit) || 20, 1);

  const [rows] = await db.execute(
    `SELECT id, user_id, type, status, created_at, updated_at
     FROM generations
     WHERE user_id = ? AND type = 'sora-video'
     ORDER BY created_at DESC LIMIT ${safeLimit}`,
    [userId]
  );

  return (rows as any[]).map((row) => ({
    id: row.id,
    userId: row.user_id,
    type: row.type,
    prompt: '',
    params: {},
    resultUrl: '',
    cost: 0,
    status: row.status || 'completed',
    createdAt: Number(row.created_at),
    updatedAt: Number(row.updated_at || row.created_at),
  }));
}

export async function getRecentSoraVideoGenerations(limit = 20): Promise<Generation[]> {
  await ensureDatabase();
  const db = getAdapter();
  const safeLimit = Math.max(Number(limit) || 20, 1);

  const [rows] = await db.execute(
    `SELECT id, user_id, type, status, created_at, updated_at
     FROM generations
     WHERE type = 'sora-video'
     ORDER BY created_at DESC LIMIT ${safeLimit}`
  );

  return (rows as any[]).map((row) => ({
    id: row.id,
    userId: row.user_id,
    type: row.type,
    prompt: '',
    params: {},
    resultUrl: '',
    cost: 0,
    status: row.status || 'completed',
    createdAt: Number(row.created_at),
    updatedAt: Number(row.updated_at || row.created_at),
  }));
}
