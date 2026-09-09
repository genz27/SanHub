import { getAdapter } from './connection';
import { CacheKeys, CacheTTL, withCache } from '../cache';
import { ensureDatabase } from './ready';

export async function getSystemConfigSlice<T>(
  sliceKey: string,
  columns: string,
  mapRow: (row: Record<string, any> | null) => T
): Promise<T> {
  return withCache(`${CacheKeys.SYSTEM_CONFIG}:${sliceKey}`, CacheTTL.SYSTEM_CONFIG, async () => {
    await ensureDatabase();
    const db = getAdapter();
    const [rows] = await db.execute(`SELECT ${columns} FROM system_config WHERE id = 1`);
    const configs = rows as any[];
    return mapRow(configs[0] || null);
  });
}
