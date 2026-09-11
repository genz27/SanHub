import { cache, CacheKeys } from '../cache';
import { getAdapter } from './connection';
import { invalidateGenerationLookups } from './generation-cache';
import { ensureDatabase } from './ready';

export async function deleteGeneration(id: string, userId: string): Promise<boolean> {
  await ensureDatabase();
  const db = getAdapter();

  const [result] = await db.execute(
    'DELETE FROM generations WHERE id = ? AND user_id = ?',
    [id, userId]
  );

  if ((result as any).affectedRows > 0) {
    const { deleteGenerationReferenceAssets } = await import('./generation-reference-assets');
    await deleteGenerationReferenceAssets([id]).catch(() => {});
    cache.delete(CacheKeys.PENDING_COUNT);
    cache.deleteByPrefix(`${CacheKeys.DAILY_USAGE}${userId}:`);
    cache.deleteByPrefix(`${CacheKeys.USER_GENERATIONS}${userId}:`);
    cache.deleteByPrefix(`${CacheKeys.PENDING_GENERATIONS}${userId}:`);
    invalidateGenerationLookups([id]);
  }

  return (result as any).affectedRows > 0;
}

export async function deleteGenerations(ids: string[], userId: string): Promise<number> {
  if (ids.length === 0) return 0;

  await ensureDatabase();
  const db = getAdapter();

  const placeholders = ids.map(() => '?').join(',');
  const [result] = await db.execute(
    `DELETE FROM generations WHERE id IN (${placeholders}) AND user_id = ?`,
    [...ids, userId]
  );

  const deleted = (result as any).affectedRows || 0;
  if (deleted > 0) {
    const { deleteGenerationReferenceAssets } = await import('./generation-reference-assets');
    await deleteGenerationReferenceAssets(ids).catch(() => {});
    cache.delete(CacheKeys.PENDING_COUNT);
    cache.deleteByPrefix(`${CacheKeys.DAILY_USAGE}${userId}:`);
    cache.deleteByPrefix(`${CacheKeys.USER_GENERATIONS}${userId}:`);
    cache.deleteByPrefix(`${CacheKeys.PENDING_GENERATIONS}${userId}:`);
    invalidateGenerationLookups(ids);
  }
  return deleted;
}

export async function deleteAllUserGenerations(userId: string): Promise<number> {
  await ensureDatabase();
  const db = getAdapter();

  const [result] = await db.execute(
    `DELETE FROM generations WHERE user_id = ? AND status NOT IN ('pending', 'processing')`,
    [userId]
  );

  const deleted = (result as any).affectedRows || 0;
  if (deleted > 0) {
    cache.delete(CacheKeys.PENDING_COUNT);
    cache.deleteByPrefix(`${CacheKeys.DAILY_USAGE}${userId}:`);
    cache.deleteByPrefix(`${CacheKeys.USER_GENERATIONS}${userId}:`);
    invalidateGenerationLookups();
  }
  return deleted;
}

export async function deleteAllFailedGenerations(userId: string): Promise<number> {
  await ensureDatabase();
  const db = getAdapter();

  const [result] = await db.execute(
    `DELETE FROM generations WHERE user_id = ? AND status IN ('failed', 'cancelled')`,
    [userId]
  );

  const deleted = (result as any).affectedRows || 0;
  if (deleted > 0) {
    cache.delete(CacheKeys.PENDING_COUNT);
    cache.deleteByPrefix(`${CacheKeys.DAILY_USAGE}${userId}:`);
    cache.deleteByPrefix(`${CacheKeys.USER_GENERATIONS}${userId}:`);
    invalidateGenerationLookups();
  }
  return deleted;
}
