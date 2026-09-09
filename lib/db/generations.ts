import { getAdapter } from './connection';
import { ensureDatabase } from './ready';
import { cache, CacheKeys } from '../cache';
import { invalidateGenerationLookups } from './generation-cache';

// Get all generations (admin)
export async function getAllGenerations(options: {
  limit?: number;
  offset?: number;
  userId?: string;
  type?: string;
  status?: string;
  search?: string;
} = {}): Promise<{ generations: any[]; total: number }> {
  await ensureDatabase();
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

  const [countResult, listResult] = await Promise.all([
    db.execute(
      `SELECT COUNT(1) as count FROM generations g ${countJoin} ${whereStr}`,
      params
    ),
    db.execute(
      `SELECT
         g.id, g.user_id, g.type, g.prompt, g.cost, g.status, g.error_message,
         g.created_at, g.updated_at,
         CASE
           WHEN g.result_url IS NULL OR g.result_url = '' THEN NULL
           WHEN LEFT(g.result_url, 8) = 'https://' OR LEFT(g.result_url, 7) = 'http://' THEN g.result_url
           ELSE ''
         END AS result_url,
         JSON_UNQUOTE(JSON_EXTRACT(g.params, '$.model')) AS param_model,
         u.email as user_email, u.name as user_name
       FROM generations g
       LEFT JOIN users u ON g.user_id = u.id
       ${whereStr}
       ORDER BY g.created_at DESC
       LIMIT ${limit} OFFSET ${offset}`,
      params
    ),
  ]);
  const total = Number((countResult[0] as any[])[0]?.count || 0);
  const rows = listResult[0];

  const generations = (rows as any[]).map((row) => ({
    id: row.id,
    userId: row.user_id,
    userEmail: row.user_email,
    userName: row.user_name,
    type: row.type,
    prompt: row.prompt,
    params: { model: row.param_model || undefined },
    resultUrl: row.result_url === '' ? `/api/media/${row.id}` : row.result_url || '',
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
  await ensureDatabase();
  const db = getAdapter();

  const [result] = await db.execute('DELETE FROM generations WHERE id = ?', [id]);
  const deleted = (result as any).affectedRows > 0;
  if (deleted) {
    cache.delete(CacheKeys.PENDING_COUNT);
    cache.deleteByPrefix(CacheKeys.USER_GENERATIONS);
    cache.deleteByPrefix(CacheKeys.PENDING_GENERATIONS);
    invalidateGenerationLookups([id]);
  }
  return deleted;
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

