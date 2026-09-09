import type { Generation } from '@/types';
import { cache, CacheKeys } from '../cache';
import { getAdapter } from './connection';
import { invalidateGenerationLookups } from './generation-cache';
import { ensureDatabase } from './ready';

function invalidateGenerationWriteCaches(
  id: string,
  userId: string | undefined,
  status?: Generation['status']
): void {
  invalidateGenerationLookups([id]);

  const settled =
    status === 'completed' || status === 'failed' || status === 'cancelled';

  if (!userId) {
    cache.delete(CacheKeys.PENDING_COUNT);
    cache.deleteByPrefix(CacheKeys.USER_GENERATIONS);
    cache.deleteByPrefix(CacheKeys.PENDING_GENERATIONS);
    return;
  }

  cache.deleteByPrefix(`${CacheKeys.PENDING_GENERATIONS}${userId}:`);
  if (!settled) {
    return;
  }

  cache.delete(CacheKeys.PENDING_COUNT);
  cache.deleteByPrefix(`${CacheKeys.USER_GENERATIONS}${userId}:`);
  cache.deleteByPrefix(`${CacheKeys.DAILY_USAGE}${userId}:`);
}

export async function updateGeneration(
  id: string,
  updates: Partial<Pick<Generation, 'status' | 'resultUrl' | 'errorMessage' | 'params' | 'balancePrecharged' | 'balanceRefunded'>>,
  userId?: string
): Promise<void> {
  await ensureDatabase();
  const db = getAdapter();

  const fields: string[] = ['updated_at = ?'];
  const values: unknown[] = [Date.now()];

  if (updates.status !== undefined) {
    fields.push('status = ?');
    values.push(updates.status);
  }
  if (updates.resultUrl !== undefined) {
    fields.push('result_url = ?');
    values.push(updates.resultUrl);
  }
  if (updates.params !== undefined) {
    fields.push('params = ?');
    values.push(JSON.stringify(updates.params));
  }
  if (updates.balancePrecharged !== undefined) {
    fields.push('balance_precharged = ?');
    values.push(updates.balancePrecharged ? 1 : 0);
  }
  if (updates.balanceRefunded !== undefined) {
    fields.push('balance_refunded = ?');
    values.push(updates.balanceRefunded ? 1 : 0);
  }
  if (updates.errorMessage !== undefined) {
    fields.push('error_message = ?');
    values.push(updates.errorMessage);
  }

  values.push(id);
  await db.execute(
    `UPDATE generations SET ${fields.join(', ')} WHERE id = ?`,
    values
  );

  if (updates.status !== undefined) {
    invalidateGenerationWriteCaches(id, userId, updates.status);
  } else if (updates.resultUrl !== undefined || updates.params !== undefined) {
    invalidateGenerationLookups([id]);
  }
}

export async function updateGenerationProgress(id: string, progress: number): Promise<void> {
  await ensureDatabase();
  const db = getAdapter();
  const safeProgress = Math.max(0, Math.min(100, Number(progress) || 0));

  await db.execute(
    `UPDATE generations
     SET params = COALESCE(
           JSON_SET(COALESCE(NULLIF(params, ''), '{}'), '$.progress', ?),
           params
         ),
         updated_at = ?
     WHERE id = ?`,
    [safeProgress, Date.now(), id]
  );

  invalidateGenerationLookups([id]);
}

export async function refundGenerationBalance(
  generationId: string,
  userId: string,
  cost: number
): Promise<boolean> {
  await ensureDatabase();
  const db = getAdapter();

  const safeCost = Number(cost);
  const now = Date.now();

  const [markResult] = await db.execute(
    'UPDATE generations SET balance_refunded = 1, updated_at = ? WHERE id = ? AND user_id = ? AND balance_precharged = 1 AND balance_refunded = 0',
    [now, generationId, userId]
  );

  if (!(markResult as any).affectedRows) {
    return false;
  }

  if (!Number.isFinite(safeCost) || safeCost <= 0) {
    return true;
  }

  try {
    const { updateUserBalance } = await import('./user-balance');
    await updateUserBalance(userId, safeCost, 'strict');
    return true;
  } catch (error) {
    await db.execute(
      'UPDATE generations SET balance_refunded = 0, updated_at = ? WHERE id = ? AND user_id = ?',
      [Date.now(), generationId, userId]
    ).catch(() => {});
    throw error;
  }
}
