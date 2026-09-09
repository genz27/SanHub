import type { Workspace, WorkspaceData } from '@/types';
import { getAdapter } from './connection';
import { invalidateWorkspaceCache } from './workspaces-cache';
import { parseWorkspaceData } from './workspaces-parse';
import { ensureDatabase } from './ready';
import { generateId } from '../utils';

export async function createWorkspace(
  userId: string,
  name: string,
  data: WorkspaceData = { nodes: [], edges: [] }
): Promise<Workspace> {
  await ensureDatabase();
  const db = getAdapter();
  const id = generateId();
  const now = Date.now();
  const safeData = parseWorkspaceData(data);

  await db.execute(
    `INSERT INTO workspaces (id, user_id, name, data, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [id, userId, name, JSON.stringify(safeData), now, now]
  );

  invalidateWorkspaceCache(userId);

  return {
    id,
    userId,
    name,
    data: safeData,
    createdAt: now,
    updatedAt: now,
  };
}

export async function updateWorkspace(
  userId: string,
  id: string,
  updates: { name?: string; data?: WorkspaceData }
): Promise<boolean> {
  await ensureDatabase();
  const db = getAdapter();

  const fields: string[] = ['updated_at = ?'];
  const values: unknown[] = [Date.now()];

  if (updates.name !== undefined) {
    fields.push('name = ?');
    values.push(updates.name);
  }
  if (updates.data !== undefined) {
    const safeData = parseWorkspaceData(updates.data);
    fields.push('data = ?');
    values.push(JSON.stringify(safeData));
  }

  if (fields.length === 1) {
    const [rows] = await db.execute(
      'SELECT id FROM workspaces WHERE id = ? AND user_id = ?',
      [id, userId]
    );
    return (rows as any[]).length > 0;
  }

  values.push(id, userId);

  const [result] = await db.execute(
    `UPDATE workspaces SET ${fields.join(', ')} WHERE id = ? AND user_id = ?`,
    values
  );

  const updated = (result as any).affectedRows > 0;
  if (updated) {
    invalidateWorkspaceCache(userId);
  }
  return updated;
}

export async function deleteWorkspace(userId: string, id: string): Promise<boolean> {
  await ensureDatabase();
  const db = getAdapter();

  const [result] = await db.execute(
    'DELETE FROM workspaces WHERE id = ? AND user_id = ?',
    [id, userId]
  );

  const deleted = (result as any).affectedRows > 0;
  if (deleted) {
    invalidateWorkspaceCache(userId);
  }
  return deleted;
}
