import type { InviteBatchResult, InviteCode, RedemptionBatchSummary, RedemptionCode, StatsOverview, DailyStats } from '@/types';
import { cache, CacheKeys, CacheTTL, withCache } from '../cache';
import { generateId } from '../utils';
import { getAdapter } from './connection';
import {
  generateInviteCode,
  initializeCodesTables,
  invalidateUserInviteCode,
} from './invite-code-user';

export { initializeCodesTables } from './invite-code-user';

function generateRedemptionCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 16; i++) {
    if (i > 0 && i % 4 === 0) code += '-';
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
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

  invalidateUserInviteCode(creatorId);
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
    `SELECT ic.id, ic.code, ic.creator_id, ic.used_by, ic.used_at, ic.bonus_points,
            ic.creator_bonus, ic.expires_at, ic.created_at,
            creator.email as creator_email, creator.name as creator_name,
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
  const deleted = (result as any).affectedRows > 0;
  if (deleted) {
    cache.deleteByPrefix(CacheKeys.INVITE_CODE);
  }
  return deleted;
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
    `SELECT id, code, points, used_by, used_at, expires_at, batch_id, note, created_at
     FROM redemption_codes ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`,
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

function dayBucketExpr(): string {
  return process.env.DB_TYPE === 'mysql'
    ? "FROM_UNIXTIME(created_at / 1000, '%Y-%m-%d')"
    : "strftime('%Y-%m-%d', created_at / 1000, 'unixepoch')";
}

function toCountMap(rows: any[], key: string, valueKey: string): Map<string, number> {
  const map = new Map<string, number>();
  for (const row of rows) {
    const day = String(row[key] || '');
    if (!day) continue;
    map.set(day, Number(row[valueKey] || 0));
  }
  return map;
}

export async function getStatsOverview(days = 30): Promise<StatsOverview> {
  const safeDays = Math.min(Math.max(Number(days) || 30, 7), 90);
  await initializeCodesTables();

  return withCache(`${CacheKeys.ADMIN_STATS}${safeDays}`, CacheTTL.ADMIN_STATS, async () => {
    const db = getAdapter();
    const now = new Date();
    const todayUTC = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
    const startDate = todayUTC - (safeDays - 1) * 24 * 60 * 60 * 1000;
    const rangeEnd = todayUTC + 24 * 60 * 60 * 1000;
    const dayExpr = dayBucketExpr();

    const [
      userRows,
      activeRows,
      chatModelRows,
      chatEnabledRows,
      genRows,
      pointsRows,
      todayUserRows,
      todayGenRows,
      dailyGenRows,
      dailyUserRows,
      dailyPointRows,
      typeRows,
    ] = await Promise.all([
      db.execute('SELECT COUNT(1) as count FROM users'),
      db.execute('SELECT COUNT(1) as count FROM users WHERE disabled = 0'),
      db.execute('SELECT COUNT(1) as count FROM chat_models'),
      db.execute('SELECT COUNT(1) as count FROM chat_models WHERE enabled = 1'),
      db.execute('SELECT COUNT(1) as count FROM generations'),
      db.execute('SELECT SUM(balance) as total FROM users'),
      db.execute('SELECT COUNT(1) as count FROM users WHERE created_at >= ?', [todayUTC]),
      db.execute('SELECT COUNT(1) as count FROM generations WHERE created_at >= ?', [todayUTC]),
      db.execute(
        `SELECT ${dayExpr} as day, COUNT(1) as count FROM generations WHERE created_at >= ? AND created_at < ? GROUP BY ${dayExpr}`,
        [startDate, rangeEnd]
      ),
      db.execute(
        `SELECT ${dayExpr} as day, COUNT(1) as count FROM users WHERE created_at >= ? AND created_at < ? GROUP BY ${dayExpr}`,
        [startDate, rangeEnd]
      ),
      db.execute(
        `SELECT ${dayExpr} as day, COALESCE(SUM(balance), 0) as total FROM users WHERE created_at >= ? AND created_at < ? GROUP BY ${dayExpr}`,
        [startDate, rangeEnd]
      ),
      db.execute('SELECT type, COUNT(1) as count FROM generations GROUP BY type'),
    ]);

    const genByDay = toCountMap(dailyGenRows[0] as any[], 'day', 'count');
    const userByDay = toCountMap(dailyUserRows[0] as any[], 'day', 'count');
    const pointsByDay = toCountMap(dailyPointRows[0] as any[], 'day', 'total');

    const dailyStats: DailyStats[] = [];
    for (let i = 0; i < safeDays; i++) {
      const dayStart = startDate + i * 24 * 60 * 60 * 1000;
      const date = new Date(dayStart);
      const dateStr = `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;
      dailyStats.push({
        date: dateStr,
        generations: genByDay.get(dateStr) || 0,
        users: userByDay.get(dateStr) || 0,
        points: pointsByDay.get(dateStr) || 0,
      });
    }

    const typeCount = new Map(
      (typeRows[0] as any[]).map((row) => [String(row.type), Number(row.count || 0)])
    );
    const generationTypes = ['sora-video', 'sora-image', 'gemini-image', 'zimage-image', 'gitee-image', 'extract-prompt']
      .map((type) => ({ type, count: typeCount.get(type) || 0 }))
      .filter((item) => item.count > 0 || item.type === 'sora-video');

    return {
      totalUsers: Number((userRows[0] as any[])[0]?.count || 0),
      activeUsers: Number((activeRows[0] as any[])[0]?.count || 0),
      totalChatModels: Number((chatModelRows[0] as any[])[0]?.count || 0),
      enabledChatModels: Number((chatEnabledRows[0] as any[])[0]?.count || 0),
      totalGenerations: Number((genRows[0] as any[])[0]?.count || 0),
      totalPoints: Number((pointsRows[0] as any[])[0]?.total || 0),
      todayUsers: Number((todayUserRows[0] as any[])[0]?.count || 0),
      todayGenerations: Number((todayGenRows[0] as any[])[0]?.count || 0),
      dailyStats,
      generationTypes,
    };
  });
}

