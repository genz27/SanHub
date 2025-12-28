import type { InviteCode, RedemptionCode, StatsOverview, DailyStats } from '@/types';
import { generateId } from './utils';
import { createDatabaseAdapter, type DatabaseAdapter } from './db-adapter';

// ========================================
// Database adapter
// ========================================

let adapter: DatabaseAdapter | null = null;

function getAdapter(): DatabaseAdapter {
  if (!adapter) {
    adapter = createDatabaseAdapter();
  }
  return adapter;
}

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
        code VARCHAR(32) UNIQUE NOT NULL,
        points INT NOT NULL,
        used_by VARCHAR(36),
        used_at BIGINT,
        expires_at BIGINT,
        batch_id VARCHAR(36),
        note VARCHAR(200),
        created_at BIGINT NOT NULL,
        INDEX idx_redeem_code (code),
        INDEX idx_batch (batch_id)
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

export async function createInviteCode(
  creatorId: string,
  bonusPoints = 0,
  creatorBonus = 0,
  expiresAt?: number
): Promise<InviteCode> {
  await initializeCodesTables();
  const db = getAdapter();

  // Retry up to 5 times in case of code collision
  for (let attempt = 0; attempt < 5; attempt++) {
    const invite: InviteCode = {
      id: generateId(),
      code: generateInviteCode(),
      creatorId,
      bonusPoints,
      creatorBonus,
      expiresAt,
      createdAt: Date.now(),
    };

    try {
      await db.execute(
        `INSERT INTO invite_codes (id, code, creator_id, bonus_points, creator_bonus, expires_at, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [invite.id, invite.code, invite.creatorId, invite.bonusPoints, invite.creatorBonus, invite.expiresAt || null, invite.createdAt]
      );
      return invite;
    } catch (err: any) {
      // If duplicate key error, retry with new code
      if (err?.code === 'ER_DUP_ENTRY' || err?.code === 'SQLITE_CONSTRAINT') {
        continue;
      }
      throw err;
    }
  }
  
  throw new Error('Failed to generate unique invite code');
}

export async function getInviteCodeByCode(code: string): Promise<InviteCode | null> {
  await initializeCodesTables();
  const db = getAdapter();

  const [rows] = await db.execute('SELECT * FROM invite_codes WHERE code = ?', [code.toUpperCase()]);
  const codes = rows as any[];
  if (codes.length === 0) return null;

  const row = codes[0];
  return {
    id: row.id,
    code: row.code,
    creatorId: row.creator_id,
    usedBy: row.used_by || undefined,
    usedAt: row.used_at ? Number(row.used_at) : undefined,
    bonusPoints: row.bonus_points || 0,
    creatorBonus: row.creator_bonus || 0,
    expiresAt: row.expires_at ? Number(row.expires_at) : undefined,
    createdAt: Number(row.created_at),
  };
}

export async function applyInviteCode(code: string, userId: string): Promise<{ success: boolean; error?: string; bonusPoints?: number }> {
  await initializeCodesTables();
  const db = getAdapter();

  const invite = await getInviteCodeByCode(code);
  if (!invite) return { success: false, error: '邀请码不存在' };
  if (invite.usedBy) return { success: false, error: '邀请码已被使用' };
  if (invite.expiresAt && invite.expiresAt < Date.now()) return { success: false, error: '邀请码已过期' };
  if (invite.creatorId === userId) return { success: false, error: '不能使用自己的邀请码' };

  const now = Date.now();
  
  // Use atomic update with WHERE condition to prevent race condition
  const [result] = await db.execute(
    'UPDATE invite_codes SET used_by = ?, used_at = ? WHERE id = ? AND used_by IS NULL',
    [userId, now, invite.id]
  );
  
  const affected = (result as any).affectedRows ?? (result as any).changes ?? 0;
  if (affected === 0) {
    return { success: false, error: '邀请码已被使用' };
  }

  // Update user balance (bonus points)
  if (invite.bonusPoints > 0) {
    await db.execute(
      'UPDATE users SET balance = balance + ?, updated_at = ? WHERE id = ?',
      [invite.bonusPoints, now, userId]
    );
  }

  // Update creator balance (creator bonus)
  if (invite.creatorBonus > 0) {
    await db.execute(
      'UPDATE users SET balance = balance + ?, updated_at = ? WHERE id = ?',
      [invite.creatorBonus, now, invite.creatorId]
    );
  }

  return { success: true, bonusPoints: invite.bonusPoints };
}

export async function getInviteCodes(options: {
  creatorId?: string;
  limit?: number;
  offset?: number;
  showUsed?: boolean;
} = {}): Promise<InviteCode[]> {
  await initializeCodesTables();
  const db = getAdapter();

  const limit = Math.max(Number(options.limit) || 50, 1);
  const offset = Math.max(Number(options.offset) || 0, 0);

  let sql = 'SELECT * FROM invite_codes WHERE 1=1';
  const params: unknown[] = [];

  if (options.creatorId) {
    sql += ' AND creator_id = ?';
    params.push(options.creatorId);
  }
  if (!options.showUsed) {
    sql += ' AND used_by IS NULL';
  }

  sql += ` ORDER BY created_at DESC LIMIT ${limit} OFFSET ${offset}`;

  const [rows] = await db.execute(sql, params);

  return (rows as any[]).map(row => ({
    id: row.id,
    code: row.code,
    creatorId: row.creator_id,
    usedBy: row.used_by || undefined,
    usedAt: row.used_at ? Number(row.used_at) : undefined,
    bonusPoints: row.bonus_points || 0,
    creatorBonus: row.creator_bonus || 0,
    expiresAt: row.expires_at ? Number(row.expires_at) : undefined,
    createdAt: Number(row.created_at),
  }));
}

export async function deleteInviteCode(id: string): Promise<boolean> {
  await initializeCodesTables();
  const db = getAdapter();

  const [result] = await db.execute('DELETE FROM invite_codes WHERE id = ?', [id]);
  const affected = (result as any).affectedRows ?? (result as any).changes ?? 0;
  return affected > 0;
}


// ========================================
// Redemption code functions
// ========================================

function generateRedemptionCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 16; i++) {
    if (i > 0 && i % 4 === 0) code += '-';
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

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

export async function getRedemptionCodeByCode(code: string): Promise<RedemptionCode | null> {
  await initializeCodesTables();
  const db = getAdapter();

  const normalizedCode = code.toUpperCase().replace(/[^A-Z0-9]/g, '');
  const formattedCode = normalizedCode.match(/.{1,4}/g)?.join('-') || normalizedCode;

  const [rows] = await db.execute('SELECT * FROM redemption_codes WHERE code = ?', [formattedCode]);
  const codes = rows as any[];
  if (codes.length === 0) return null;

  const row = codes[0];
  return {
    id: row.id,
    code: row.code,
    points: row.points,
    usedBy: row.used_by || undefined,
    usedAt: row.used_at ? Number(row.used_at) : undefined,
    expiresAt: row.expires_at ? Number(row.expires_at) : undefined,
    batchId: row.batch_id || undefined,
    note: row.note || undefined,
    createdAt: Number(row.created_at),
  };
}

export async function redeemCode(code: string, userId: string): Promise<{ success: boolean; error?: string; points?: number }> {
  await initializeCodesTables();
  const db = getAdapter();

  const redemption = await getRedemptionCodeByCode(code);
  if (!redemption) return { success: false, error: '卡密不存在' };
  if (redemption.usedBy) return { success: false, error: '卡密已被使用' };
  if (redemption.expiresAt && redemption.expiresAt < Date.now()) return { success: false, error: '卡密已过期' };

  const now = Date.now();
  
  // Use atomic update with WHERE condition to prevent race condition
  const [result] = await db.execute(
    'UPDATE redemption_codes SET used_by = ?, used_at = ? WHERE id = ? AND used_by IS NULL',
    [userId, now, redemption.id]
  );
  
  const affected = (result as any).affectedRows ?? (result as any).changes ?? 0;
  if (affected === 0) {
    return { success: false, error: '卡密已被使用' };
  }

  await db.execute(
    'UPDATE users SET balance = balance + ?, updated_at = ? WHERE id = ?',
    [redemption.points, now, userId]
  );

  return { success: true, points: redemption.points };
}

export async function getRedemptionCodes(options: {
  batchId?: string;
  limit?: number;
  offset?: number;
  showUsed?: boolean;
} = {}): Promise<RedemptionCode[]> {
  await initializeCodesTables();
  const db = getAdapter();

  const limit = Math.max(Number(options.limit) || 50, 1);
  const offset = Math.max(Number(options.offset) || 0, 0);

  let sql = 'SELECT * FROM redemption_codes WHERE 1=1';
  const params: unknown[] = [];

  if (options.batchId) {
    sql += ' AND batch_id = ?';
    params.push(options.batchId);
  }
  if (!options.showUsed) {
    sql += ' AND used_by IS NULL';
  }

  sql += ` ORDER BY created_at DESC LIMIT ${limit} OFFSET ${offset}`;

  const [rows] = await db.execute(sql, params);

  return (rows as any[]).map(row => ({
    id: row.id,
    code: row.code,
    points: row.points,
    usedBy: row.used_by || undefined,
    usedAt: row.used_at ? Number(row.used_at) : undefined,
    expiresAt: row.expires_at ? Number(row.expires_at) : undefined,
    batchId: row.batch_id || undefined,
    note: row.note || undefined,
    createdAt: Number(row.created_at),
  }));
}

export async function getRedemptionCodesCount(options: { batchId?: string; showUsed?: boolean } = {}): Promise<number> {
  await initializeCodesTables();
  const db = getAdapter();

  let sql = 'SELECT COUNT(1) as count FROM redemption_codes WHERE 1=1';
  const params: unknown[] = [];

  if (options.batchId) {
    sql += ' AND batch_id = ?';
    params.push(options.batchId);
  }
  if (!options.showUsed) {
    sql += ' AND used_by IS NULL';
  }

  const [rows] = await db.execute(sql, params);
  return Number((rows as any[])[0]?.count || 0);
}

export async function deleteRedemptionCode(id: string): Promise<boolean> {
  await initializeCodesTables();
  const db = getAdapter();

  const [result] = await db.execute('DELETE FROM redemption_codes WHERE id = ?', [id]);
  const affected = (result as any).affectedRows ?? (result as any).changes ?? 0;
  return affected > 0;
}

export async function deleteRedemptionCodesByBatch(batchId: string): Promise<number> {
  await initializeCodesTables();
  const db = getAdapter();

  const [result] = await db.execute('DELETE FROM redemption_codes WHERE batch_id = ? AND used_by IS NULL', [batchId]);
  return (result as any).affectedRows ?? (result as any).changes ?? 0;
}

// ========================================
// Statistics functions
// ========================================

export async function getStatsOverview(days = 30): Promise<StatsOverview> {
  await initializeCodesTables();
  const db = getAdapter();
  const dbType = process.env.DB_TYPE || 'sqlite';

  // Use UTC for consistency
  const now = new Date();
  const todayUTC = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const startDate = todayUTC - (days - 1) * 24 * 60 * 60 * 1000;

  // Total counts
  const [userRows] = await db.execute('SELECT COUNT(1) as count FROM users');
  const totalUsers = Number((userRows as any[])[0]?.count || 0);

  const [genRows] = await db.execute('SELECT COUNT(1) as count FROM generations');
  const totalGenerations = Number((genRows as any[])[0]?.count || 0);

  const [pointsRows] = await db.execute('SELECT SUM(balance) as total FROM users');
  const totalPoints = Number((pointsRows as any[])[0]?.total || 0);

  // Today counts
  const [todayUserRows] = await db.execute('SELECT COUNT(1) as count FROM users WHERE created_at >= ?', [todayUTC]);
  const todayUsers = Number((todayUserRows as any[])[0]?.count || 0);

  const [todayGenRows] = await db.execute('SELECT COUNT(1) as count FROM generations WHERE created_at >= ?', [todayUTC]);
  const todayGenerations = Number((todayGenRows as any[])[0]?.count || 0);

  // Daily stats - use aggregation query instead of per-day queries
  const dailyStats: DailyStats[] = [];
  
  // Initialize all days with zero values
  const dayMap = new Map<string, DailyStats>();
  for (let i = 0; i < days; i++) {
    const dayStart = startDate + i * 24 * 60 * 60 * 1000;
    const dateStr = new Date(dayStart).toISOString().split('T')[0];
    dayMap.set(dateStr, { date: dateStr, generations: 0, users: 0, points: 0 });
  }

  // Aggregate generations by day - ensure consistent YYYY-MM-DD string format
  const dateExpr = dbType === 'mysql' 
    ? "DATE_FORMAT(FROM_UNIXTIME(created_at / 1000), '%Y-%m-%d')"
    : "strftime('%Y-%m-%d', created_at / 1000, 'unixepoch')";
  
  const [genByDay] = await db.execute(
    `SELECT ${dateExpr} as day, COUNT(1) as count, SUM(cost) as points 
     FROM generations 
     WHERE created_at >= ? 
     GROUP BY day`,
    [startDate]
  );
  for (const row of genByDay as any[]) {
    // Handle both string and Date object formats
    let dayKey: string;
    if (row.day instanceof Date) {
      dayKey = row.day.toISOString().split('T')[0];
    } else {
      dayKey = String(row.day);
    }
    const stat = dayMap.get(dayKey);
    if (stat) {
      stat.generations = Number(row.count || 0);
      stat.points = Number(row.points || 0);
    }
  }

  // Aggregate users by day
  const [usersByDay] = await db.execute(
    `SELECT ${dateExpr} as day, COUNT(1) as count 
     FROM users 
     WHERE created_at >= ? 
     GROUP BY day`,
    [startDate]
  );
  for (const row of usersByDay as any[]) {
    // Handle both string and Date object formats
    let dayKey: string;
    if (row.day instanceof Date) {
      dayKey = row.day.toISOString().split('T')[0];
    } else {
      dayKey = String(row.day);
    }
    const stat = dayMap.get(dayKey);
    if (stat) {
      stat.users = Number(row.count || 0);
    }
  }

  // Convert map to sorted array
  for (let i = 0; i < days; i++) {
    const dayStart = startDate + i * 24 * 60 * 60 * 1000;
    const dateStr = new Date(dayStart).toISOString().split('T')[0];
    const stat = dayMap.get(dateStr);
    if (stat) dailyStats.push(stat);
  }

  return {
    totalUsers,
    totalGenerations,
    totalPoints,
    todayUsers,
    todayGenerations,
    dailyStats,
  };
}

// ========================================
// Admin generation management
// ========================================

export async function getAllGenerations(options: {
  limit?: number;
  offset?: number;
  userId?: string;
  type?: string;
  status?: string;
} = {}): Promise<{ generations: any[]; total: number }> {
  await initializeCodesTables();
  const db = getAdapter();

  const limit = Math.max(Number(options.limit) || 50, 1);
  const offset = Math.max(Number(options.offset) || 0, 0);

  const whereClauses: string[] = [];
  const params: unknown[] = [];

  if (options.userId) {
    whereClauses.push('g.user_id = ?');
    params.push(options.userId);
  }
  if (options.type) {
    whereClauses.push('g.type = ?');
    params.push(options.type);
  }
  if (options.status) {
    whereClauses.push('g.status = ?');
    params.push(options.status);
  }

  const whereStr = whereClauses.length > 0 ? 'WHERE ' + whereClauses.join(' AND ') : '';

  // Get total count
  const [countRows] = await db.execute(
    `SELECT COUNT(1) as count FROM generations g ${whereStr}`,
    params
  );
  const total = Number((countRows as any[])[0]?.count || 0);

  // Get generations with user info
  const [rows] = await db.execute(
    `SELECT g.*, u.email as user_email, u.name as user_name 
     FROM generations g 
     LEFT JOIN users u ON g.user_id = u.id 
     ${whereStr}
     ORDER BY g.created_at DESC 
     LIMIT ${limit} OFFSET ${offset}`,
    params
  );

  const generations = (rows as any[]).map(row => ({
    id: row.id,
    userId: row.user_id,
    userEmail: row.user_email,
    userName: row.user_name,
    type: row.type,
    prompt: row.prompt,
    params: typeof row.params === 'string' ? JSON.parse(row.params || '{}') : row.params,
    resultUrl: row.result_url,
    cost: row.cost,
    status: row.status || 'completed',
    errorMessage: row.error_message,
    createdAt: Number(row.created_at),
    updatedAt: Number(row.updated_at || row.created_at),
  }));

  return { generations, total };
}

export async function adminDeleteGeneration(id: string): Promise<boolean> {
  await initializeCodesTables();
  const db = getAdapter();

  const [result] = await db.execute('DELETE FROM generations WHERE id = ?', [id]);
  const affected = (result as any).affectedRows ?? (result as any).changes ?? 0;
  return affected > 0;
}
