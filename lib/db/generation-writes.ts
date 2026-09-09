import type { Generation } from '@/types';
import { cache, CacheKeys } from '../cache';
import { generateId } from '../utils';
import { getAdapter } from './connection';
import { ensureDatabase } from './ready';

export async function saveGeneration(
  generation: Omit<Generation, 'id' | 'createdAt' | 'updatedAt'>
): Promise<Generation> {
  await ensureDatabase();
  const db = getAdapter();

  const now = Date.now();
  const gen: Generation = {
    ...generation,
    id: generateId(),
    createdAt: now,
    updatedAt: now,
    balancePrecharged: generation.balancePrecharged ?? false,
    balanceRefunded: generation.balanceRefunded ?? false,
  };

  await db.execute(
    `INSERT INTO generations (id, user_id, type, prompt, params, result_url, cost, balance_precharged, balance_refunded, status, error_message, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      gen.id,
      gen.userId,
      gen.type,
      gen.prompt,
      JSON.stringify(gen.params),
      gen.resultUrl,
      gen.cost,
      gen.balancePrecharged ? 1 : 0,
      gen.balanceRefunded ? 1 : 0,
      gen.status,
      gen.errorMessage || null,
      gen.createdAt,
      gen.updatedAt,
    ]
  );

  cache.delete(CacheKeys.PENDING_COUNT);
  cache.deleteByPrefix(`${CacheKeys.DAILY_USAGE}${gen.userId}:`);
  cache.deleteByPrefix(`${CacheKeys.PENDING_GENERATIONS}${gen.userId}:`);
  if (gen.status !== 'pending' && gen.status !== 'processing') {
    cache.deleteByPrefix(`${CacheKeys.USER_GENERATIONS}${gen.userId}:`);
  }
  return gen;
}
