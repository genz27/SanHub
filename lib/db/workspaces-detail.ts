import type { Workspace } from '@/types';
import { getAdapter } from './connection';
import { parseWorkspaceData } from './workspaces-parse';
import { ensureDatabase } from './ready';
import { CacheKeys, CacheTTL, withCache } from '../cache';

export async function getWorkspaceById(userId: string, id: string): Promise<Workspace | null> {
  return withCache(
    `${CacheKeys.WORKSPACES}${userId}:id:${id}`,
    CacheTTL.WORKSPACES,
    async () => {
      await ensureDatabase();
      const db = getAdapter();

      const [rows] = await db.execute(
        'SELECT id, name, data FROM workspaces WHERE id = ? AND user_id = ?',
        [id, userId]
      );
      const workspaces = rows as any[];
      if (workspaces.length === 0) return null;

      const row = workspaces[0];
      return {
        id: row.id,
        userId,
        name: row.name,
        data: parseWorkspaceData(row.data),
        createdAt: Number(row.created_at) || 0,
        updatedAt: Number(row.updated_at) || 0,
      };
    }
  );
}
