import type { WorkspaceSummary } from '@/types';
import { getAdapter } from './connection';
import { ensureDatabase } from './ready';
import { CacheKeys, CacheTTL, withCache } from '../cache';

export async function getWorkspaceSummaries(
  userId: string,
  options: { search?: string; sort?: 'updated' | 'created'; order?: 'asc' | 'desc'; limit?: number; offset?: number } = {}
): Promise<WorkspaceSummary[]> {
  const limit = Math.max(Number(options.limit) || 200, 1);
  const offset = Math.max(Number(options.offset) || 0, 0);
  const search = options.search?.trim() || '';
  const sort = options.sort === 'created' ? 'created' : 'updated';
  const order = options.order === 'asc' ? 'asc' : 'desc';

  return withCache(
    `${CacheKeys.WORKSPACES}${userId}:${search}:${sort}:${order}:${limit}:${offset}`,
    CacheTTL.WORKSPACES,
    async () => {
      await ensureDatabase();
      const db = getAdapter();
      const sortColumn = sort === 'created' ? 'created_at' : 'updated_at';
      const orderSql = order === 'asc' ? 'ASC' : 'DESC';

      let sql = 'SELECT id, name, updated_at FROM workspaces WHERE user_id = ?';
      const params: unknown[] = [userId];

      if (search) {
        sql += ' AND name LIKE ?';
        params.push(`%${search}%`);
      }

      sql += ` ORDER BY ${sortColumn} ${orderSql} LIMIT ${limit} OFFSET ${offset}`;

      const [rows] = await db.execute(sql, params);

      return (rows as any[]).map((row) => ({
        id: row.id,
        name: row.name,
        createdAt: Number(row.created_at) || 0,
        updatedAt: Number(row.updated_at),
      }));
    }
  );
}
