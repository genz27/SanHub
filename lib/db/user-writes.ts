import type { User } from '@/types';
import { invalidateUserCache } from '../cache';
import { generateId } from '../utils';
import { getAdapter } from './connection';
import { ensureDatabase } from './ready';
import { hashPassword } from './user-credentials';
import { getUserById } from './user-session';

export async function createUser(
  email: string,
  password: string,
  name: string,
  role: 'user' | 'admin' = 'user',
  balance?: number
): Promise<User> {
  await ensureDatabase();
  const db = getAdapter();

  const [existing] = await db.execute(
    'SELECT id FROM users WHERE email = ?',
    [email]
  );
  if ((existing as unknown[]).length > 0) {
    throw new Error('该邮箱已被注册');
  }

  const hashedPasswordPromise = hashPassword(password);
  let resolvedBalance = balance;
  if (resolvedBalance === undefined) {
    const { getPublicSystemConfig } = await import('./system-config-public');
    resolvedBalance = (await getPublicSystemConfig()).defaultBalance;
  }
  const hashedPassword = await hashedPasswordPromise;
  const now = Date.now();

  const user: User = {
    id: generateId(),
    email,
    password: hashedPassword,
    name,
    role,
    balance: resolvedBalance,
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

export async function updateUser(
  id: string,
  updates: Partial<Omit<User, 'id' | 'email' | 'createdAt'>>
): Promise<User | null> {
  await ensureDatabase();
  const db = getAdapter();

  const fields: string[] = [];
  const values: unknown[] = [];

  if (updates.name !== undefined) {
    fields.push('name = ?');
    values.push(updates.name);
  }
  if (updates.password !== undefined) {
    fields.push('password = ?');
    values.push(await hashPassword(updates.password));
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

  if (fields.length === 0) return getUserById(id);

  fields.push('updated_at = ?');
  values.push(Date.now());
  values.push(id);

  const [result] = await db.execute(
    `UPDATE users SET ${fields.join(', ')} WHERE id = ?`,
    values
  );
  if (!(result as any).affectedRows) return null;

  invalidateUserCache(id);
  return getUserById(id);
}
