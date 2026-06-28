import type { Generation } from '@/types';
import { getAdapter } from './connection';
import { initializeDatabase } from './schema';
import { generateId } from '../utils';
import { updateUserBalance } from './users';

// ========================================
// 生成记录操作
// ========================================

export async function saveGeneration(
  generation: Omit<Generation, 'id' | 'createdAt' | 'updatedAt'>
): Promise<Generation> {
  await initializeDatabase();
  const db = getAdapter();

  const now = Date.now();
  const gen: Generation = {
    ...generation,
    id: generateId(),
    createdAt: now,
    updatedAt: now,
    balancePrecharged: generation.balancePrecharged ?? false,
    balanceRefunded: generation.balanceRefunded ?? false,
  };

  await db.execute(
    `INSERT INTO generations (id, user_id, type, prompt, params, result_url, cost, balance_precharged, balance_refunded, status, error_message, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      gen.id,
      gen.userId,
      gen.type,
      gen.prompt,
      JSON.stringify(gen.params),
      gen.resultUrl,
      gen.cost,
      gen.balancePrecharged ? 1 : 0,
      gen.balanceRefunded ? 1 : 0,
      gen.status,
      gen.errorMessage || null,
      gen.createdAt,
      gen.updatedAt,
    ]
  );

  return gen;
}

export async function getGenerationByClientRequestId(
  userId: string,
  clientRequestId: string
): Promise<Generation | null> {
  await initializeDatabase();
  const db = getAdapter();

  const [rows] = await db.execute(
    `SELECT * FROM generations
     WHERE user_id = ? AND params LIKE ?
     ORDER BY created_at DESC LIMIT 10`,
    [userId, `%"clientRequestId":"${clientRequestId}"%`]
  );

  for (const row of rows as any[]) {
    const params = typeof row.params === 'string' ? JSON.parse(row.params) : row.params;
    if (params?.clientRequestId !== clientRequestId) {
      continue;
    }

    return {
      id: row.id,
      userId: row.user_id,
      type: row.type,
      prompt: row.prompt,
      params,
      resultUrl: row.result_url,
      cost: row.cost,
      status: row.status || 'completed',
      balancePrecharged: Boolean(row.balance_precharged),
      balanceRefunded: Boolean(row.balance_refunded),
      errorMessage: row.error_message || undefined,
      createdAt: Number(row.created_at),
      updatedAt: Number(row.updated_at || row.created_at),
    };
  }

  return null;
}

export async function updateGeneration(
  id: string,
  updates: Partial<Pick<Generation, 'status' | 'resultUrl' | 'errorMessage' | 'params' | 'balancePrecharged' | 'balanceRefunded'>>
): Promise<Generation | null> {
  await initializeDatabase();
  const db = getAdapter();

  const fields: string[] = ['updated_at = ?'];
  const values: unknown[] = [Date.now()];

  if (updates.status !== undefined) {
    fields.push('status = ?');
    values.push(updates.status);
  }
  if (updates.resultUrl !== undefined) {
    fields.push('result_url = ?');
    values.push(updates.resultUrl);
  }
  if (updates.params !== undefined) {
    fields.push('params = ?');
    values.push(JSON.stringify(updates.params));
  }
  if (updates.balancePrecharged !== undefined) {
    fields.push('balance_precharged = ?');
    values.push(updates.balancePrecharged ? 1 : 0);
  }
  if (updates.balanceRefunded !== undefined) {
    fields.push('balance_refunded = ?');
    values.push(updates.balanceRefunded ? 1 : 0);
  }
  if (updates.errorMessage !== undefined) {
    fields.push('error_message = ?');
    values.push(updates.errorMessage);
  }

  values.push(id);
  await db.execute(
    `UPDATE generations SET ${fields.join(', ')} WHERE id = ?`,
    values
  );

  return getGeneration(id);
}

export async function refundGenerationBalance(
  generationId: string,
  userId: string,
  cost: number
): Promise<boolean> {
  await initializeDatabase();
  const db = getAdapter();

  const safeCost = Number(cost);
  const now = Date.now();

  const [markResult] = await db.execute(
    'UPDATE generations SET balance_refunded = 1, updated_at = ? WHERE id = ? AND user_id = ? AND balance_precharged = 1 AND balance_refunded = 0',
    [now, generationId, userId]
  );

  if (!(markResult as any).affectedRows) {
    return false;
  }

  if (!Number.isFinite(safeCost) || safeCost <= 0) {
    return true;
  }

  try {
    await updateUserBalance(userId, safeCost, 'strict');
    return true;
  } catch (error) {
    await db.execute(
      'UPDATE generations SET balance_refunded = 0, updated_at = ? WHERE id = ? AND user_id = ?',
      [Date.now(), generationId, userId]
    ).catch(() => {});
    throw error;
  }
}

export type UserGenerationKindFilter = 'all' | 'video' | 'image';
export type UserGenerationStatusFilter =
  | 'all'
  | 'active'
  | 'terminal'
  | 'pending'
  | 'processing'
  | 'completed'
  | 'failed'
  | 'cancelled';

export interface GetUserGenerationsOptions {
  kind?: UserGenerationKindFilter;
  status?: UserGenerationStatusFilter;
}

export async function getUserGenerations(
  userId: string,
  limit = 50,
  offset = 0,
  options: GetUserGenerationsOptions = {}
): Promise<Generation[]> {
  await initializeDatabase();
  const db = getAdapter();
  const safeLimit = Math.max(Number(limit) || 50, 1);
  const safeOffset = Math.max(Number(offset) || 0, 0);
  const whereClauses = ['user_id = ?'];
  const values: any[] = [userId];

  if (options.kind === 'video') {
    whereClauses.push('type LIKE ?');
    values.push('%video%');
  } else if (options.kind === 'image') {
    whereClauses.push('type NOT LIKE ?');
    whereClauses.push('type <> ?');
    values.push('%video%', 'character-card');
  }

  switch (options.status) {
    case 'active':
      whereClauses.push("status IN ('pending', 'processing')");
      break;
    case 'terminal':
      whereClauses.push("(status IN ('completed', 'failed', 'cancelled') OR status IS NULL)");
      break;
    case 'completed':
      whereClauses.push("(status = 'completed' OR status IS NULL)");
      break;
    case 'pending':
    case 'processing':
    case 'failed':
    case 'cancelled':
      whereClauses.push('status = ?');
      values.push(options.status);
      break;
    case 'all':
    default:
      break;
  }

  const [rows] = await db.execute(
    `SELECT * FROM generations WHERE ${whereClauses.join(' AND ')} ORDER BY created_at DESC LIMIT ${safeLimit} OFFSET ${safeOffset}`,
    values
  );

  return (rows as any[]).map((row) => ({
    id: row.id,
    userId: row.user_id,
    type: row.type,
    prompt: row.prompt,
    params: typeof row.params === 'string' ? JSON.parse(row.params) : row.params,
    resultUrl: row.result_url,
    cost: row.cost,
    status: row.status || 'completed',
    balancePrecharged: Boolean(row.balance_precharged),
    balanceRefunded: Boolean(row.balance_refunded),
    errorMessage: row.error_message || undefined,
    createdAt: Number(row.created_at),
    updatedAt: Number(row.updated_at || row.created_at),
  }));
}

// 获取用户正在进行的任务（pending 或 processing）
export async function getPendingGenerations(userId: string, limit = 50): Promise<Generation[]> {
  await initializeDatabase();
  const db = getAdapter();
  const safeLimit = Math.max(Number(limit) || 50, 1);

  const [rows] = await db.execute(
    `SELECT * FROM generations WHERE user_id = ? AND status IN ('pending', 'processing') ORDER BY created_at DESC LIMIT ${safeLimit}`,
    [userId]
  );

  return (rows as any[]).map((row) => ({
    id: row.id,
    userId: row.user_id,
    type: row.type,
    prompt: row.prompt,
    params: typeof row.params === 'string' ? JSON.parse(row.params) : row.params,
    resultUrl: row.result_url,
    cost: row.cost,
    status: row.status,
    balancePrecharged: Boolean(row.balance_precharged),
    balanceRefunded: Boolean(row.balance_refunded),
    errorMessage: row.error_message || undefined,
    createdAt: Number(row.created_at),
    updatedAt: Number(row.updated_at || row.created_at),
  }));
}

// getPendingGenerationsCount 统计所有 pending/processing 任务数（不限用户）
// 该函数逻辑上属于 generations 域
export async function getPendingGenerationsCount(): Promise<number> {
  await initializeDatabase();
  const db = getAdapter();

  const [rows] = await db.execute(
    `SELECT COUNT(1) as count FROM generations WHERE status IN ('pending', 'processing')`
  );

  return Number((rows as any[])[0]?.count || 0);
}

export async function getUserIdsWithRecentSoraVideos(sinceMs: number): Promise<string[]> {
  await initializeDatabase();
  const db = getAdapter();

  const [rows] = await db.execute(
    `SELECT DISTINCT user_id FROM generations
     WHERE type = 'sora-video'
     AND (created_at >= ? OR status IN ('pending', 'processing'))`,
    [sinceMs]
  );

  return (rows as any[]).map((row) => String(row.user_id));
}

export async function getRecentSoraVideoGenerationsByUser(
  userId: string,
  limit = 20
): Promise<Generation[]> {
  await initializeDatabase();
  const db = getAdapter();
  const safeLimit = Math.max(Number(limit) || 20, 1);

  const [rows] = await db.execute(
    `SELECT * FROM generations
     WHERE user_id = ? AND type = 'sora-video'
     ORDER BY created_at DESC LIMIT ${safeLimit}`,
    [userId]
  );

  return (rows as any[]).map((row) => ({
    id: row.id,
    userId: row.user_id,
    type: row.type,
    prompt: row.prompt,
    params: typeof row.params === 'string' ? JSON.parse(row.params) : row.params,
    resultUrl: row.result_url,
    cost: row.cost,
    status: row.status || 'completed',
    balancePrecharged: Boolean(row.balance_precharged),
    balanceRefunded: Boolean(row.balance_refunded),
    errorMessage: row.error_message || undefined,
    createdAt: Number(row.created_at),
    updatedAt: Number(row.updated_at || row.created_at),
  }));
}

export async function getRecentSoraVideoGenerations(limit = 20): Promise<Generation[]> {
  await initializeDatabase();
  const db = getAdapter();
  const safeLimit = Math.max(Number(limit) || 20, 1);

  const [rows] = await db.execute(
    `SELECT * FROM generations
     WHERE type = 'sora-video'
     ORDER BY created_at DESC LIMIT ${safeLimit}`
  );

  return (rows as any[]).map((row) => ({
    id: row.id,
    userId: row.user_id,
    type: row.type,
    prompt: row.prompt,
    params: typeof row.params === 'string' ? JSON.parse(row.params) : row.params,
    resultUrl: row.result_url,
    cost: row.cost,
    status: row.status || 'completed',
    balancePrecharged: Boolean(row.balance_precharged),
    balanceRefunded: Boolean(row.balance_refunded),
    errorMessage: row.error_message || undefined,
    createdAt: Number(row.created_at),
    updatedAt: Number(row.updated_at || row.created_at),
  }));
}

export async function getGeneration(id: string): Promise<Generation | null> {
  await initializeDatabase();
  const db = getAdapter();

  const [rows] = await db.execute('SELECT * FROM generations WHERE id = ?', [id]);
  const gens = rows as any[];
  if (gens.length === 0) return null;

  const row = gens[0];
  return {
    id: row.id,
    userId: row.user_id,
    type: row.type,
    prompt: row.prompt,
    params: typeof row.params === 'string' ? JSON.parse(row.params) : row.params,
    resultUrl: row.result_url,
    cost: row.cost,
    status: row.status || 'completed',
    balancePrecharged: Boolean(row.balance_precharged),
    balanceRefunded: Boolean(row.balance_refunded),
    errorMessage: row.error_message || undefined,
    createdAt: Number(row.created_at),
    updatedAt: Number(row.updated_at || row.created_at),
  };
}

// 删除单个生成记录
export async function deleteGeneration(id: string, userId: string): Promise<boolean> {
  await initializeDatabase();
  const db = getAdapter();

  const [result] = await db.execute(
    'DELETE FROM generations WHERE id = ? AND user_id = ?',
    [id, userId]
  );

  return (result as any).affectedRows > 0;
}

// 批量删除生成记录
export async function deleteGenerations(ids: string[], userId: string): Promise<number> {
  if (ids.length === 0) return 0;

  await initializeDatabase();
  const db = getAdapter();

  const placeholders = ids.map(() => '?').join(',');
  const [result] = await db.execute(
    `DELETE FROM generations WHERE id IN (${placeholders}) AND user_id = ?`,
    [...ids, userId]
  );

  return (result as any).affectedRows || 0;
}

// 清空用户所有已完成的生成记录
export async function deleteAllUserGenerations(userId: string): Promise<number> {
  await initializeDatabase();
  const db = getAdapter();

  // 只删除已完成或失败的，保留进行中的任务
  const [result] = await db.execute(
    `DELETE FROM generations WHERE user_id = ? AND status NOT IN ('pending', 'processing')`,
    [userId]
  );

  return (result as any).affectedRows || 0;
}

// 清空用户所有失败的生成记录
export async function deleteAllFailedGenerations(userId: string): Promise<number> {
  await initializeDatabase();
  const db = getAdapter();

  const [result] = await db.execute(
    `DELETE FROM generations WHERE user_id = ? AND status IN ('failed', 'cancelled')`,
    [userId]
  );

  return (result as any).affectedRows || 0;
}

// Get all generations (admin)
export async function getAllGenerations(options: {
  limit?: number;
  offset?: number;
  userId?: string;
  type?: string;
  status?: string;
  search?: string;
} = {}): Promise<{ generations: any[]; total: number }> {
  await initializeDatabase();
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
  if (options.search) {
    const pattern = `%${options.search}%`;
    whereClauses.push('(u.email LIKE ? OR u.name LIKE ? OR g.prompt LIKE ?)');
    params.push(pattern, pattern, pattern);
  }

  const whereStr = whereClauses.length > 0 ? 'WHERE ' + whereClauses.join(' AND ') : '';
  const countJoin = options.search ? 'LEFT JOIN users u ON g.user_id = u.id' : '';

  // Get total count
  const [countRows] = await db.execute(
    `SELECT COUNT(1) as count FROM generations g ${countJoin} ${whereStr}`,
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

// Delete generation (admin)
export async function adminDeleteGeneration(id: string): Promise<boolean> {
  await initializeDatabase();
  const db = getAdapter();

  const [result] = await db.execute('DELETE FROM generations WHERE id = ?', [id]);
  return (result as any).affectedRows > 0;
}

export interface GenerationDisplayRow {
  id: string;
  userId: string;
  userEmail?: string;
  userName?: string;
  type: string;
  prompt: string;
  cost: number;
  status: string;
  createdAt: number;
}

function rowToGenerationDisplay(row: any): GenerationDisplayRow {
  return {
    id: row.id,
    userId: row.user_id,
    userEmail: row.user_email || undefined,
    userName: row.user_name || undefined,
    type: row.type,
    prompt: row.prompt || '',
    cost: row.cost || 0,
    status: row.status,
    createdAt: row.created_at,
  };
}
