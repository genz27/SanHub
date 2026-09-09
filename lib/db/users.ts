import type { User, SafeUser } from '@/types';
import { getAdapter } from './connection';
import { invalidateUserCache } from '../cache';
import { ensureDatabase } from './ready';

export async function getUserAdminRecord(id: string): Promise<User | null> {
  await ensureDatabase();
  const db = getAdapter();

  const [rows] = await db.execute(
    'SELECT id, email, name, role, balance, disabled, created_at FROM users WHERE id = ?',
    [id]
  );

  const users = rows as any[];
  if (users.length === 0) return null;

  const row = users[0];
  return {
    id: row.id,
    email: row.email,
    password: '',
    name: row.name,
    role: row.role,
    balance: row.balance,
    disabled: Boolean(row.disabled),
    createdAt: Number(row.created_at),
    updatedAt: 0,
  };
}

export async function getAllUsers(options: {
  limit?: number;
  offset?: number;
  search?: string;
} = {}): Promise<SafeUser[]> {
  await ensureDatabase();
  const db = getAdapter();
  const limit = Math.max(Number(options.limit) || 200, 1);
  const offset = Math.max(Number(options.offset) || 0, 0);
  const search = options.search?.trim();

  let sql = 'SELECT id, email, name, role, balance, disabled, created_at FROM users';
  const params: unknown[] = [];

  if (search) {
    sql += ' WHERE email LIKE ? OR name LIKE ?';
    const term = `%${search}%`;
    params.push(term, term);
  }

  sql += ` ORDER BY created_at DESC LIMIT ${limit} OFFSET ${offset}`;

  const [rows] = await db.execute(sql, params);

  return (rows as any[]).map((row) => ({
    id: row.id,
    email: row.email,
    name: row.name,
    role: row.role,
    balance: row.balance,
    disabled: Boolean(row.disabled),
    createdAt: Number(row.created_at),
  }));
}

export async function getUsersCount(search?: string): Promise<number> {
  await ensureDatabase();
  const db = getAdapter();
  const term = search?.trim();

  let sql = 'SELECT COUNT(1) as count FROM users';
  const params: unknown[] = [];

  if (term) {
    sql += ' WHERE email LIKE ? OR name LIKE ?';
    const like = `%${term}%`;
    params.push(like, like);
  }

  const [rows] = await db.execute(sql, params);
  const row = (rows as any[])[0];
  return Number(row?.count || 0);
}

export async function deleteUser(id: string): Promise<boolean> {
  await ensureDatabase();
  const db = getAdapter();

  const [result] = await db.execute('DELETE FROM users WHERE id = ?', [id]);
  invalidateUserCache(id);
  return (result as any).affectedRows > 0;
}
