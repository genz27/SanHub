import { getServerSession } from 'next-auth';
import { NextResponse } from 'next/server';
import { authOptions } from '@/lib/auth';

/**
 * NextAuth session user with guaranteed id, role, balance.
 */
export interface AuthedUser {
  id: string;
  role: 'user' | 'admin' | 'moderator';
  balance: number;
  name?: string;
  email?: string;
  disabled?: boolean;
}

type AuthResult =
  | { ok: true; user: AuthedUser }
  | { ok: false; response: NextResponse };

/**
 * Require a logged-in user. Returns 401 if unauthenticated.
 */
export async function requireAuth(): Promise<AuthResult> {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return { ok: false, response: NextResponse.json({ error: '请先登录' }, { status: 401 }) };
  }
  return { ok: true, user: session.user as AuthedUser };
}

/**
 * Require admin role. Returns 403 if not admin.
 */
export async function requireAdmin(): Promise<AuthResult> {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return { ok: false, response: NextResponse.json({ error: '请先登录' }, { status: 401 }) };
  }
  if (session.user.role !== 'admin') {
    return { ok: false, response: NextResponse.json({ error: '无权限' }, { status: 403 }) };
  }
  return { ok: true, user: session.user as AuthedUser };
}

/**
 * Require admin or moderator role. Returns 403 otherwise.
 */
export async function requireModeratorOrAdmin(): Promise<AuthResult> {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return { ok: false, response: NextResponse.json({ error: '请先登录' }, { status: 401 }) };
  }
  if (session.user.role !== 'admin' && session.user.role !== 'moderator') {
    return { ok: false, response: NextResponse.json({ error: '无权限' }, { status: 403 }) };
  }
  return { ok: true, user: session.user as AuthedUser };
}

/**
 * Get the authed session user without any access guard.
 * Returns null when not logged in — caller handles the null.
 */
export async function getOptionalUser(): Promise<AuthedUser | null> {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return null;
  return session.user as AuthedUser;
}
