import type { InviteBatchResult, InviteCode, RedemptionBatchSummary, RedemptionCode, StatsOverview, DailyStats } from '@/types';
import { generateId } from '../utils';
import { getAdapter } from './connection';
import { getSystemConfig } from './system-config';

// ========================================
// Table initialization
// ========================================

let tablesInitialized = false;

export async function initializeCodesTables(): Promise<void> {
  if (tablesInitialized) return;

  const db = getAdapter();
  const dbType = process.env.DB_TYPE || 'sqlite';

  // Invite codes table
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

  // Redemption codes table
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

// ========================================
// Invite code functions
// ========================================

function generateInviteCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 8; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

function generateRedemptionCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 16; i++) {
    if (i > 0 && i % 4 === 0) code += '-';
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

// Get user's own invite code (for sharing)
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

// Create invite code for user (if not exists)
export async function createUserInviteCode(userId: string): Promise<string> {
  await initializeCodesTables();
  const db = getAdapter();

  const config = await getSystemConfig();
  const bonus = config.inviteSettings.inviteeBonusPoints;

  const id = generateId();
  const code = generateInviteCode();
  const now = Date.now();

  await db.execute(
    'INSERT INTO invite_codes (id, code, creator_id, bonus_points, created_at) VALUES (?, ?, ?, ?, ?)',
    [id, code, userId, bonus, now]
  );

  return code;
}

// Create invite code (admin)
export async function createInviteCode(
  creatorId: string,
  bonusPoints: number = 100,
  creatorBonus: number = 50,
  expiresAt?: number
): Promise<InviteCode> {
  await initializeCodesTables();
  const db = getAdapter();

  const id = generateId();
  const code = generateInviteCode();
  const now = Date.now();

  await db.execute(
    `INSERT INTO invite_codes (id, code, creator_id, bonus_points, creator_bonus, expires_at, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [id, code, creatorId, bonusPoints, creatorBonus, expiresAt ?? null, now]
  );

  return {
    id,
    code,
    creatorId,
    bonusPoints,
    creatorBonus,
    expiresAt,
    createdAt: now,
  };
}

// Batch create invite codes
export async function createInviteBatch(
  creatorId: string,
  count: number,
  bonusPoints: number = 100,
  creatorBonus: number = 50,
  expiresAt?: number
): Promise<InviteBatchResult> {
  const codes: InviteCode[] = [];
  const now = Date.now();

  for (let i = 0; i < count; i++) {
    const code = await createInviteCode(creatorId, bonusPoints, creatorBonus, expiresAt);
    codes.push(code);
  }

  return { createdAt: now, count, bonusPoints, creatorBonus, expiresAt, codes };
}

// Lookup invite code by code string
export async function getInviteCodeByCode(code: string): Promise<InviteCode | null> {
  await initializeCodesTables();
  const db = getAdapter();

  const [rows] = await db.execute(
    `SELECT ic.*, u.email as creator_email, u.name as creator_name
     FROM invite_codes ic LEFT JOIN users u ON ic.creator_id = u.id
     WHERE ic.code = ?`,
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
    creatorEmail: row.creator_email,
    creatorName: row.creator_name,
  };
}

// Apply an invite code
export async function applyInviteCode(code: string, userId: string): Promise<{ success: boolean; error?: string; bonusPoints?: number }> {
  await initializeCodesTables();
  const db = getAdapter();

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

  // Mark as used
  const now = Date.now();
  await db.execute(
    'UPDATE invite_codes SET used_by = ?, used_at = ? WHERE id = ? AND used_by IS NULL',
    [userId, now, inviteCode.id]
  );

  // Give invitee bonus
  const { updateUserBalance } = await import('./users');
  await updateUserBalance(userId, inviteCode.bonusPoints, 'clamp');

  // Give inviter bonus
  if (inviteCode.creatorBonus > 0) {
    await updateUserBalance(inviteCode.creatorId, inviteCode.creatorBonus, 'clamp');
  }

  return { success: true, bonusPoints: inviteCode.bonusPoints };
}

// Sync unused invite code bonuses
export async function syncUnusedInviteCodeBonuses(
  bonusPoints: number,
  creatorBonus: number
): Promise<number> {
  await initializeCodesTables();
  const db = getAdapter();

  const [result] = await db.execute(
    'UPDATE invite_codes SET bonus_points = ?, creator_bonus = ? WHERE used_by IS NULL',
    [Math.max(0, bonusPoints), Math.max(0, creatorBonus)]
  );

  return (result as any).affectedRows ?? (result as any).changes ?? 0;
}

// Get invite codes (admin)
export async function getInviteCodes(options: {
  creatorId?: string;
  showUsed?: boolean;
  limit?: number;
  offset?: number;
} = {}): Promise<(InviteCode & { creatorEmail?: string; creatorName?: string; usedByEmail?: string; usedByName?: string })[]> {
  await initializeCodesTables();
  const db = getAdapter();

  const conditions: string[] = [];
  const params: unknown[] = [];

  if (options.creatorId) {
    conditions.push('ic.creator_id = ?');
    params.push(options.creatorId);
  }
  if (!options.showUsed) {
    conditions.push('ic.used_by IS NULL');
  }

  const where = conditions.length > 0 ? 'WHERE ' + conditions.join(' AND ') : '';
  const limit = options.limit ?? 50;
  const offset = options.offset ?? 0;

  const [rows] = await db.execute(
    `SELECT ic.*, creator.email as creator_email, creator.name as creator_name,
            used.email as used_by_email, used.name as used_by_name
     FROM invite_codes ic
     LEFT JOIN users creator ON ic.creator_id = creator.id
     LEFT JOIN users used ON ic.used_by = used.id
     ${where}
     ORDER BY ic.created_at DESC
     LIMIT ? OFFSET ?`,
    [...params, limit, offset]
  );

  return (rows as any[]).map((row) => ({
    id: row.id,
    code: row.code,
    creatorId: row.creator_id,
    usedBy: row.used_by || undefined,
    usedAt: row.used_at || undefined,
    bonusPoints: row.bonus_points,
    creatorBonus: row.creator_bonus,
    expiresAt: row.expires_at || undefined,
    createdAt: row.created_at,
    creatorEmail: row.creator_email,
    creatorName: row.creator_name,
    usedByEmail: row.used_by_email,
    usedByName: row.used_by_name,
  }));
}

// Get invite codes count
export async function getInviteCodesCount(options: { creatorId?: string; showUsed?: boolean } = {}): Promise<number> {
  await initializeCodesTables();
  const db = getAdapter();

  const conditions: string[] = [];
  const params: unknown[] = [];

  if (options.creatorId) {
    conditions.push('creator_id = ?');
    params.push(options.creatorId);
  }
  if (!options.showUsed) {
    conditions.push('used_by IS NULL');
  }

  const where = conditions.length > 0 ? 'WHERE ' + conditions.join(' AND ') : '';
  const [rows] = await db.execute(`SELECT COUNT(1) as count FROM invite_codes ${where}`, params);
  return Number((rows as any[])[0]?.count || 0);
}

// Delete invite code
export async function deleteInviteCode(id: string): Promise<boolean> {
  await initializeCodesTables();
  const db = getAdapter();
  const [result] = await db.execute('DELETE FROM invite_codes WHERE id = ?', [id]);
  return (result as any).affectedRows > 0;
}

// ========================================
// Redemption code functions
// ========================================

// Create redemption codes (admin)
export async function createRedemptionCodes(
  count: number,
  points: number,
  options: { expiresAt?: number; note?: string } = {}
): Promise<RedemptionCode[]> {
  await initializeCodesTables();
  const db = getAdapter();

  const batchId = generateId();
  const now = Date.now();
  const codes: RedemptionCode[] = [];

  for (let i = 0; i < count; i++) {
    // Retry up to 5 times per code in case of collision
    for (let attempt = 0; attempt < 5; attempt++) {
      const code: RedemptionCode = {
        id: generateId(),
        code: generateRedemptionCode(),
        points,
        batchId,
        note: options.note,
        expiresAt: options.expiresAt,
        createdAt: now,
      };

      try {
        await db.execute(
          `INSERT INTO redemption_codes (id, code, points, batch_id, note, expires_at, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [code.id, code.code, code.points, code.batchId, code.note || null, code.expiresAt || null, code.createdAt]
        );
        codes.push(code);
        break;
      } catch (err: any) {
        if (err?.code === 'ER_DUP_ENTRY' || err?.code === 'SQLITE_CONSTRAINT') {
          if (attempt === 4) throw new Error('Failed to generate unique redemption code');
          continue;
        }
        throw err;
      }
    }
  }

  return codes;
}

// Lookup redemption code
export async function getRedemptionCodeByCode(code: string): Promise<RedemptionCode | null> {
  await initializeCodesTables();
  const db = getAdapter();

  const [rows] = await db.execute('SELECT * FROM redemption_codes WHERE code = ?', [code]);
  const arr = rows as any[];
  if (arr.length === 0) return null;

  const row = arr[0];
  return {
    id: row.id,
    code: row.code,
    points: row.points,
    usedBy: row.used_by || undefined,
    usedAt: row.used_at || undefined,
    expiresAt: row.expires_at || undefined,
    batchId: row.batch_id || undefined,
    note: row.note || undefined,
    createdAt: row.created_at,
  };
}

// Redeem a code
export async function redeemCode(code: string, userId: string): Promise<{ success: boolean; error?: string; points?: number }> {
  await initializeCodesTables();
  const db = getAdapter();

  const redemptionCode = await getRedemptionCodeByCode(code);
  if (!redemptionCode) {
    return { success: false, error: '兑换码无效' };
  }

  if (redemptionCode.usedBy) {
    return { success: false, error: '兑换码已被使用' };
  }

  if (redemptionCode.expiresAt && Date.now() > redemptionCode.expiresAt) {
    return { success: false, error: '兑换码已过期' };
  }

  const now = Date.now();
  await db.execute(
    'UPDATE redemption_codes SET used_by = ?, used_at = ? WHERE id = ? AND used_by IS NULL',
    [userId, now, redemptionCode.id]
  );

  const { updateUserBalance } = await import('./users');
  await updateUserBalance(userId, redemptionCode.points, 'clamp');

  return { success: true, points: redemptionCode.points };
}

// Get redemption codes (admin)
export async function getRedemptionCodes(options: {
  batchId?: string;
  showUsed?: boolean;
  limit?: number;
  offset?: number;
} = {}): Promise<RedemptionCode[]> {
  await initializeCodesTables();
  const db = getAdapter();

  const conditions: string[] = [];
  const params: unknown[] = [];

  if (options.batchId) {
    conditions.push('batch_id = ?');
    params.push(options.batchId);
  }
  if (!options.showUsed) {
    conditions.push('used_by IS NULL');
  }

  const where = conditions.length > 0 ? 'WHERE ' + conditions.join(' AND ') : '';
  const limit = options.limit ?? 50;
  const offset = options.offset ?? 0;

  const [rows] = await db.execute(
    `SELECT * FROM redemption_codes ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`,
    [...params, limit, offset]
  );

  return (rows as any[]).map((row) => ({
    id: row.id,
    code: row.code,
    points: row.points,
    usedBy: row.used_by || undefined,
    usedAt: row.used_at || undefined,
    expiresAt: row.expires_at || undefined,
    batchId: row.batch_id || undefined,
    note: row.note || undefined,
    createdAt: row.created_at,
  }));
}

// Get redemption codes count
export async function getRedemptionCodesCount(options: { batchId?: string; showUsed?: boolean } = {}): Promise<number> {
  await initializeCodesTables();
  const db = getAdapter();

  const conditions: string[] = [];
  const params: unknown[] = [];

  if (options.batchId) {
    conditions.push('batch_id = ?');
    params.push(options.batchId);
  }
  if (!options.showUsed) {
    conditions.push('used_by IS NULL');
  }

  const where = conditions.length > 0 ? 'WHERE ' + conditions.join(' AND ') : '';
  const [rows] = await db.execute(`SELECT COUNT(1) as count FROM redemption_codes ${where}`, params);
  return Number((rows as any[])[0]?.count || 0);
}

// Get recent redemption batches
export async function getRecentRedemptionBatches(limit = 8): Promise<RedemptionBatchSummary[]> {
  await initializeCodesTables();
  const db = getAdapter();

  const [rows] = await db.execute(
    `SELECT batch_id, COUNT(1) as count, SUM(CASE WHEN used_by IS NOT NULL THEN 1 ELSE 0 END) as used_count,
            MAX(points) as points, MAX(created_at) as created_at, MAX(expires_at) as expires_at,
            MAX(note) as note
     FROM redemption_codes
     WHERE batch_id IS NOT NULL
     GROUP BY batch_id
     ORDER BY created_at DESC
     LIMIT ?`,
    [limit]
  );

  return (rows as any[]).map((row) => ({
    batchId: row.batch_id,
    count: row.count,
    usedCount: row.used_count,
    unusedCount: row.count - row.used_count,
    points: row.points,
    note: row.note || undefined,
    expiresAt: row.expires_at || undefined,
    createdAt: row.created_at,
  }));
}

// Delete redemption code
export async function deleteRedemptionCode(id: string): Promise<boolean> {
  await initializeCodesTables();
  const db = getAdapter();
  const [result] = await db.execute('DELETE FROM redemption_codes WHERE id = ?', [id]);
  return (result as any).affectedRows > 0;
}

// Delete redemption codes by batch
export async function deleteRedemptionCodesByBatch(batchId: string): Promise<number> {
  await initializeCodesTables();
  const db = getAdapter();
  const [result] = await db.execute('DELETE FROM redemption_codes WHERE batch_id = ?', [batchId]);
  return (result as any).affectedRows || 0;
}

// ========================================
// Statistics
// ========================================

export async function getStatsOverview(days = 30): Promise<StatsOverview> {
  await initializeCodesTables();
  const db = getAdapter();
  const dbType = process.env.DB_TYPE || 'sqlite';

  const now = new Date();
  const todayUTC = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const startDate = todayUTC - (days - 1) * 24 * 60 * 60 * 1000;

  const [userRows] = await db.execute('SELECT COUNT(1) as count FROM users');
  const totalUsers = Number((userRows as any[])[0]?.count || 0);

  const [activeRows] = await db.execute('SELECT COUNT(1) as count FROM users WHERE disabled = 0');
  const activeUsers = Number((activeRows as any[])[0]?.count || 0);

  const [chatModelRows] = await db.execute('SELECT COUNT(1) as count FROM chat_models');
  const totalChatModels = Number((chatModelRows as any[])[0]?.count || 0);

  const [chatEnabledRows] = await db.execute('SELECT COUNT(1) as count FROM chat_models WHERE enabled = 1');
  const enabledChatModels = Number((chatEnabledRows as any[])[0]?.count || 0);

  const [genRows] = await db.execute('SELECT COUNT(1) as count FROM generations');
  const totalGenerations = Number((genRows as any[])[0]?.count || 0);

  const [pointsRows] = await db.execute('SELECT SUM(balance) as total FROM users');
  const totalPoints = Number((pointsRows as any[])[0]?.total || 0);

  const [todayUserRows] = await db.execute('SELECT COUNT(1) as count FROM users WHERE created_at >= ?', [todayUTC]);
  const todayUsers = Number((todayUserRows as any[])[0]?.count || 0);

  const [todayGenRows] = await db.execute('SELECT COUNT(1) as count FROM generations WHERE created_at >= ?', [todayUTC]);
  const todayGenerations = Number((todayGenRows as any[])[0]?.count || 0);

  const dailyStats: DailyStats[] = [];
  for (let i = 0; i < days; i++) {
    const dayStart = startDate + i * 24 * 60 * 60 * 1000;
    const dayEnd = dayStart + 24 * 60 * 60 * 1000;

    const [dayGenRows] = await db.execute(
      'SELECT COUNT(1) as count FROM generations WHERE created_at >= ? AND created_at < ?',
      [dayStart, dayEnd]
    );
    const [dayUserRows] = await db.execute(
      'SELECT COUNT(1) as count FROM users WHERE created_at >= ? AND created_at < ?',
      [dayStart, dayEnd]
    );
    const [dayPointRows] = await db.execute(
      'SELECT COALESCE(SUM(balance), 0) as total FROM users WHERE created_at >= ? AND created_at < ?',
      [dayStart, dayEnd]
    );

    const date = new Date(dayStart);
    const dateStr = `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;

    dailyStats.push({
      date: dateStr,
      generations: Number((dayGenRows as any[])[0]?.count || 0),
      users: Number((dayUserRows as any[])[0]?.count || 0),
      points: Number((dayPointRows as any[])[0]?.total || 0),
    });
  }

  const generationTypes: { type: string; count: number }[] = [];
  const validTypes = ['sora-video', 'sora-image', 'gemini-image', 'zimage-image', 'gitee-image'];
  for (const type of validTypes) {
    const [rows] = await db.execute('SELECT COUNT(1) as count FROM generations WHERE type = ?', [type]);
    const count = Number((rows as any[])[0]?.count || 0);
    if (count > 0 || type === 'sora-video') {
      generationTypes.push({ type, count });
    }
  }

  return {
    totalUsers,
    activeUsers,
    totalChatModels,
    enabledChatModels,
    totalGenerations,
    totalPoints,
    todayUsers,
    todayGenerations,
    dailyStats,
    generationTypes,
  };
}

// Re-exported from generations.ts where they belong
export { getAllGenerations, adminDeleteGeneration, type GenerationDisplayRow } from './generations';
