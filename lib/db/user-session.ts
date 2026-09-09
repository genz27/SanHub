import type { User } from '@/types';
import { getAdapter } from './connection';
import { CacheKeys, CacheTTL, withCache } from '../cache';
import { ensureDatabase } from './ready';

export async function getUserById(id: string): Promise<User | null> {
  return withCache(`${CacheKeys.USER}${id}`, CacheTTL.USER, async () => {
    await ensureDatabase();
    const db = getAdapter();

    const [rows] = await db.execute(
      'SELECT id, name, role, balance, disabled FROM users WHERE id = ?',
      [id]
    );

    const users = rows as any[];
    if (users.length === 0) return null;

    const row = users[0];
    return {
      id: row.id,
      email: '',
      password: '',
      name: row.name,
      role: row.role,
      balance: row.balance,
      disabled: Boolean(row.disabled),
      createdAt: 0,
      updatedAt: 0,
    };
  });
}
