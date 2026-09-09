import type { User } from '@/types';
import { getAdapter } from './connection';
import { ensureDatabase } from './ready';

export async function hashPassword(password: string): Promise<string> {
  const bcrypt = (await import('bcryptjs')).default;
  return bcrypt.hash(password, 10);
}

export async function getUserByEmail(email: string): Promise<User | null> {
  await ensureDatabase();
  const db = getAdapter();

  const [rows] = await db.execute(
    'SELECT id, email, password, name, role, balance, disabled FROM users WHERE email = ?',
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
    createdAt: 0,
    updatedAt: 0,
  };
}

export async function verifyPassword(
  email: string,
  password: string
): Promise<User | null> {
  const bcryptPromise = import('bcryptjs');
  const user = await getUserByEmail(email);
  if (!user) return null;

  if (user.disabled) {
    throw new Error('账号已被禁用，请联系管理员');
  }

  const bcrypt = (await bcryptPromise).default;
  const valid = await bcrypt.compare(password, user.password);
  if (!valid) return null;

  return user;
}
