import type { InviteCode } from '@/types';
import { cache, CacheKeys, CacheTTL, withCache } from '../cache';
import { generateId } from '../utils';
import { getAdapter } from './connection';
import { getPublicSystemConfig } from './system-config-public';

function userInviteCodeCacheKey(userId: string): string {
  return `${CacheKeys.INVITE_CODE}${userId}`;
}

export function invalidateUserInviteCode(userId: string): void {
  cache.delete(userInviteCodeCacheKey(userId));
}

let tablesInitialized = false;

async function codesTablesExist(db: ReturnType<typeof getAdapter>): Promise<boolean> {
  try {
    await db.execute('SELECT code FROM invite_codes LIMIT 0');
    await db.execute('SELECT code FROM redemption_codes LIMIT 0');
    return true;
  } catch {
    return false;
  }
}

export async function initializeCodesTables(): Promise<void> {
  if (tablesInitialized) return;

  const db = getAdapter();
  if (await codesTablesExist(db)) {
    tablesInitialized = true;
    return;
  }

  const dbType = process.env.DB_TYPE || 'sqlite';

  if (dbType === 'mysql') {
    await db.execute(`
      CREATE TABLE IF NOT EXISTS invite_codes (
        id VARCHAR(36) PRIMARY KEY,
        code VARCHAR(20) UNIQUE NOT NULL,
        creator_id VARCHAR(36) NOT NULL,
        used_by VARCHAR(36),
        used_at BIGINT,
        bonus_points INT DEFAULT 0,
        creator_bonus INT DEFAULT 0,
        expires_at BIGINT,
        created_at BIGINT NOT NULL,
        INDEX idx_code (code),
        INDEX idx_creator (creator_id)
      )
    `);
  } else {
    await db.execute(`
      CREATE TABLE IF NOT EXISTS invite_codes (
        id TEXT PRIMARY KEY,
        code TEXT UNIQUE NOT NULL,
        creator_id TEXT NOT NULL,
        used_by TEXT,
        used_at INTEGER,
        bonus_points INTEGER DEFAULT 0,
        creator_bonus INTEGER DEFAULT 0,
        expires_at INTEGER,
        created_at INTEGER NOT NULL
      )
    `);
    try { await db.execute('CREATE INDEX IF NOT EXISTS idx_invite_code ON invite_codes(code)'); } catch {}
    try { await db.execute('CREATE INDEX IF NOT EXISTS idx_invite_creator ON invite_codes(creator_id)'); } catch {}
  }

  if (dbType === 'mysql') {
    await db.execute(`
      CREATE TABLE IF NOT EXISTS redemption_codes (
        id VARCHAR(36) PRIMARY KEY,
        code VARCHAR(50) UNIQUE NOT NULL,
        points INT NOT NULL,
        used_by VARCHAR(36),
        used_at BIGINT,
        expires_at BIGINT,
        batch_id VARCHAR(36),
        note TEXT,
        created_at BIGINT NOT NULL,
        INDEX idx_redemption_code (code),
        INDEX idx_redemption_batch (batch_id)
      )
    `);
  } else {
    await db.execute(`
      CREATE TABLE IF NOT EXISTS redemption_codes (
        id TEXT PRIMARY KEY,
        code TEXT UNIQUE NOT NULL,
        points INTEGER NOT NULL,
        used_by TEXT,
        used_at INTEGER,
        expires_at INTEGER,
        batch_id TEXT,
        note TEXT,
        created_at INTEGER NOT NULL
      )
    `);
    try { await db.execute('CREATE INDEX IF NOT EXISTS idx_redeem_code ON redemption_codes(code)'); } catch {}
    try { await db.execute('CREATE INDEX IF NOT EXISTS idx_redeem_batch ON redemption_codes(batch_id)'); } catch {}
  }

  tablesInitialized = true;
}

export function generateInviteCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 8; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

export async function getUserInviteCode(userId: string): Promise<string | null> {
  await initializeCodesTables();
  const db = getAdapter();

  const [rows] = await db.execute(
    'SELECT code FROM invite_codes WHERE creator_id = ? AND used_by IS NULL ORDER BY created_at DESC LIMIT 1',
    [userId]
  );
  const arr = rows as any[];
  return arr.length > 0 ? arr[0].code : null;
}

export async function createUserInviteCode(
  userId: string,
  bonusPoints?: number
): Promise<string> {
  await initializeCodesTables();
  const db = getAdapter();

  const bonus =
    bonusPoints ?? (await getPublicSystemConfig()).inviteSettings.inviteeBonusPoints;

  const id = generateId();
  const code = generateInviteCode();
  const now = Date.now();

  await db.execute(
    'INSERT INTO invite_codes (id, code, creator_id, bonus_points, created_at) VALUES (?, ?, ?, ?, ?)',
    [id, code, userId, bonus, now]
  );

  invalidateUserInviteCode(userId);
  return code;
}

export async function getOrCreateUserInviteCode(
  userId: string,
  bonusPoints?: number
): Promise<string> {
  return withCache(userInviteCodeCacheKey(userId), CacheTTL.INVITE_CODE, async () => {
    await initializeCodesTables();
    const db = getAdapter();

    const [rows] = await db.execute(
      'SELECT code FROM invite_codes WHERE creator_id = ? AND used_by IS NULL ORDER BY created_at DESC LIMIT 1',
      [userId]
    );
    const existing = (rows as any[])[0]?.code;
    if (existing) return existing;

    const bonus =
      bonusPoints ?? (await getPublicSystemConfig()).inviteSettings.inviteeBonusPoints;
    const id = generateId();
    const code = generateInviteCode();
    const now = Date.now();

    await db.execute(
      'INSERT INTO invite_codes (id, code, creator_id, bonus_points, created_at) VALUES (?, ?, ?, ?, ?)',
      [id, code, userId, bonus, now]
    );

    return code;
  });
}

export async function getInviteCodeByCode(code: string): Promise<InviteCode | null> {
  await initializeCodesTables();
  const db = getAdapter();

  const [rows] = await db.execute(
    `SELECT id, code, creator_id, used_by, used_at, bonus_points, creator_bonus, expires_at, created_at
     FROM invite_codes WHERE code = ?`,
    [code]
  );
  const arr = rows as any[];
  if (arr.length === 0) return null;

  const row = arr[0];
  return {
    id: row.id,
    code: row.code,
    creatorId: row.creator_id,
    usedBy: row.used_by || undefined,
    usedAt: row.used_at || undefined,
    bonusPoints: row.bonus_points,
    creatorBonus: row.creator_bonus,
    expiresAt: row.expires_at || undefined,
    createdAt: row.created_at,
  };
}

export async function applyInviteCode(
  code: string,
  userId: string
): Promise<{ success: boolean; error?: string; bonusPoints?: number }> {
  const inviteCode = await getInviteCodeByCode(code);
  if (!inviteCode) {
    return { success: false, error: '邀请码无效' };
  }

  if (inviteCode.usedBy) {
    return { success: false, error: '邀请码已被使用' };
  }

  if (inviteCode.expiresAt && Date.now() > inviteCode.expiresAt) {
    return { success: false, error: '邀请码已过期' };
  }

  if (inviteCode.creatorId === userId) {
    return { success: false, error: '不能使用自己的邀请码' };
  }

  const db = getAdapter();
  const now = Date.now();
  await db.execute(
    'UPDATE invite_codes SET used_by = ?, used_at = ? WHERE id = ? AND used_by IS NULL',
    [userId, now, inviteCode.id]
  );

  const { updateUserBalance } = await import('./user-balance');
  const bonusWrites = [updateUserBalance(userId, inviteCode.bonusPoints, 'clamp')];
  if (inviteCode.creatorBonus > 0) {
    bonusWrites.push(updateUserBalance(inviteCode.creatorId, inviteCode.creatorBonus, 'clamp'));
  }
  await Promise.all(bonusWrites);

  invalidateUserInviteCode(inviteCode.creatorId);
  return { success: true, bonusPoints: inviteCode.bonusPoints };
}
