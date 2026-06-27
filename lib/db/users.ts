import type { User, SafeUser } from '@/types';
import { getAdapter } from './connection';
import { initializeDatabase } from './schema';
import { getSystemConfig } from './system-config';
import { generateId } from '../utils';
import bcrypt from 'bcryptjs';

// ========================================
// 用户操作
// ========================================

export async function createUser(
  email: string,
  password: string,
  name: string,
  role: 'user' | 'admin' = 'user',
  balance?: number
): Promise<User> {
  await initializeDatabase();
  const db = getAdapter();

  // 检查邮箱是否已存在
  const [existing] = await db.execute(
    'SELECT id FROM users WHERE email = ?',
    [email]
  );
  if ((existing as unknown[]).length > 0) {
    throw new Error('该邮箱已被注册');
  }

  const config = await getSystemConfig();
  const hashedPassword = await bcrypt.hash(password, 10);
  const now = Date.now();

  const user: User = {
    id: generateId(),
    email,
    password: hashedPassword,
    name,
    role,
    balance: balance ?? config.defaultBalance,
    disabled: false,
    createdAt: now,
    updatedAt: now,
  };

  await db.execute(
    `INSERT INTO users (id, email, password, name, role, balance, disabled, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [user.id, user.email, user.password, user.name, user.role, user.balance, user.disabled, user.createdAt, user.updatedAt]
  );

  return user;
}

export async function getUserById(id: string): Promise<User | null> {
  await initializeDatabase();
  const db = getAdapter();

  const [rows] = await db.execute(
    'SELECT * FROM users WHERE id = ?',
    [id]
  );

  const users = rows as any[];
  if (users.length === 0) return null;

  const row = users[0];
  return {
    id: row.id,
    email: row.email,
    password: row.password,
    name: row.name,
    role: row.role,
    balance: row.balance,
    disabled: Boolean(row.disabled),
    createdAt: Number(row.created_at),
    updatedAt: Number(row.updated_at),
  };
}

export async function getUserByEmail(email: string): Promise<User | null> {
  await initializeDatabase();
  const db = getAdapter();

  const [rows] = await db.execute(
    'SELECT * FROM users WHERE email = ?',
    [email]
  );

  const users = rows as any[];
  if (users.length === 0) return null;

  const row = users[0];
  return {
    id: row.id,
    email: row.email,
    password: row.password,
    name: row.name,
    role: row.role,
    balance: row.balance,
    disabled: Boolean(row.disabled),
    createdAt: Number(row.created_at),
    updatedAt: Number(row.updated_at),
  };
}

export async function verifyPassword(
  email: string,
  password: string
): Promise<User | null> {
  const user = await getUserByEmail(email);
  if (!user) return null;

  // Disabled users cannot login - throw explicit error
  if (user.disabled) {
    throw new Error('账号已被禁用，请联系管理员');
  }

  const valid = await bcrypt.compare(password, user.password);
  if (!valid) return null;

  return user;
}

export async function updateUser(
  id: string,
  updates: Partial<Omit<User, 'id' | 'email' | 'createdAt'>>
): Promise<User | null> {
  await initializeDatabase();
  const db = getAdapter();

  const user = await getUserById(id);
  if (!user) return null;

  const fields: string[] = [];
  const values: unknown[] = [];

  if (updates.name !== undefined) {
    fields.push('name = ?');
    values.push(updates.name);
  }
  if (updates.password !== undefined) {
    fields.push('password = ?');
    values.push(await bcrypt.hash(updates.password, 10));
  }
  if (updates.role !== undefined) {
    fields.push('role = ?');
    values.push(updates.role);
  }
  if (updates.balance !== undefined) {
    fields.push('balance = ?');
    values.push(updates.balance);
  }
  if (updates.disabled !== undefined) {
    fields.push('disabled = ?');
    values.push(updates.disabled);
  }

  if (fields.length === 0) return user;

  fields.push('updated_at = ?');
  values.push(Date.now());
  values.push(id);

  await db.execute(
    `UPDATE users SET ${fields.join(', ')} WHERE id = ?`,
    values
  );

  return getUserById(id);
}

export type BalanceUpdateMode = 'strict' | 'clamp';

export async function updateUserBalance(
  id: string,
  delta: number,
  mode: BalanceUpdateMode = 'strict'
): Promise<number> {
  await initializeDatabase();
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
    const user = await getUserById(id);
    if (!user) throw new Error('User not found');
    return user.balance;
  }

  const [result] = await db.execute(
    'UPDATE users SET balance = balance + ?, updated_at = ? WHERE id = ? AND balance + ? >= 0',
    [safeDelta, now, id, safeDelta]
  );

  if (!(result as any).affectedRows) {
    const user = await getUserById(id);
    if (!user) throw new Error('User not found');
    throw new Error('Insufficient balance');
  }

  const user = await getUserById(id);
  if (!user) throw new Error('User not found');
  return user.balance;
}

export async function getAllUsers(options: {
  limit?: number;
  offset?: number;
  search?: string;
} = {}): Promise<SafeUser[]> {
  await initializeDatabase();
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
  await initializeDatabase();
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
  await initializeDatabase();
  const db = getAdapter();

  const [result] = await db.execute('DELETE FROM users WHERE id = ?', [id]);
  return (result as any).affectedRows > 0;
}
