import { invalidateUserCache } from '../cache';
import { getAdapter } from './connection';
import { ensureDatabase } from './ready';

export type BalanceUpdateMode = 'strict' | 'clamp';

export async function updateUserBalance(
  id: string,
  delta: number,
  mode: BalanceUpdateMode = 'strict'
): Promise<number> {
  await ensureDatabase();
  const db = getAdapter();

  const safeDelta = Number(delta);
  if (!Number.isFinite(safeDelta)) {
    throw new Error('Invalid balance delta');
  }

  const now = Date.now();
  if (mode === 'clamp') {
    const [result] = await db.execute(
      'UPDATE users SET balance = CASE WHEN balance + ? < 0 THEN 0 ELSE balance + ? END, updated_at = ? WHERE id = ?',
      [safeDelta, safeDelta, now, id]
    );
    if (!(result as any).affectedRows) {
      throw new Error('User not found');
    }
    invalidateUserCache(id);
    return readUserBalance(id);
  }

  const [result] = await db.execute(
    'UPDATE users SET balance = balance + ?, updated_at = ? WHERE id = ? AND balance + ? >= 0',
    [safeDelta, now, id, safeDelta]
  );

  if (!(result as any).affectedRows) {
    const [rows] = await db.execute('SELECT id FROM users WHERE id = ?', [id]);
    if ((rows as any[]).length === 0) throw new Error('User not found');
    throw new Error('Insufficient balance');
  }

  invalidateUserCache(id);
  return readUserBalance(id);
}

async function readUserBalance(id: string): Promise<number> {
  const db = getAdapter();
  const [rows] = await db.execute('SELECT balance FROM users WHERE id = ?', [id]);
  const balance = Number((rows as any[])[0]?.balance);
  if (!Number.isFinite(balance)) {
    throw new Error('User not found');
  }
  return balance;
}
