import type { Workspace, WorkspaceData, WorkspaceSummary } from '@/types';
import { getAdapter } from './connection';
import { initializeDatabase } from './schema';
import { generateId } from '../utils';

// ========================================
// Workspace operations
// ========================================

function parseWorkspaceData(raw: unknown): WorkspaceData {
  if (!raw) {
    return { nodes: [], edges: [] };
  }
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw) as WorkspaceData;
      return {
        nodes: Array.isArray(parsed.nodes) ? parsed.nodes : [],
        edges: Array.isArray(parsed.edges) ? parsed.edges : [],
      };
    } catch {
      return { nodes: [], edges: [] };
    }
  }
  if (typeof raw === 'object' && raw !== null) {
    const data = raw as WorkspaceData;
    return {
      nodes: Array.isArray(data.nodes) ? data.nodes : [],
      edges: Array.isArray(data.edges) ? data.edges : [],
    };
  }
  return { nodes: [], edges: [] };
}

export async function createWorkspace(
  userId: string,
  name: string,
  data: WorkspaceData = { nodes: [], edges: [] }
): Promise<Workspace> {
  await initializeDatabase();
  const db = getAdapter();
  const id = generateId();
  const now = Date.now();
  const safeData = parseWorkspaceData(data);

  await db.execute(
    `INSERT INTO workspaces (id, user_id, name, data, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [id, userId, name, JSON.stringify(safeData), now, now]
  );

  return {
    id,
    userId,
    name,
    data: safeData,
    createdAt: now,
    updatedAt: now,
  };
}

export async function getWorkspaceSummaries(
  userId: string,
  options: { search?: string; sort?: 'updated' | 'created'; order?: 'asc' | 'desc'; limit?: number; offset?: number } = {}
): Promise<WorkspaceSummary[]> {
  await initializeDatabase();
  const db = getAdapter();
  const limit = Math.max(Number(options.limit) || 200, 1);
  const offset = Math.max(Number(options.offset) || 0, 0);
  const search = options.search?.trim();
  const sort = options.sort === 'created' ? 'created_at' : 'updated_at';
  const order = options.order === 'asc' ? 'ASC' : 'DESC';

  let sql = 'SELECT id, name, created_at, updated_at FROM workspaces WHERE user_id = ?';
  const params: unknown[] = [userId];

  if (search) {
    sql += ' AND name LIKE ?';
    params.push(`%${search}%`);
  }

  sql += ` ORDER BY ${sort} ${order} LIMIT ${limit} OFFSET ${offset}`;

  const [rows] = await db.execute(sql, params);

  return (rows as any[]).map((row) => ({
    id: row.id,
    name: row.name,
    createdAt: Number(row.created_at),
    updatedAt: Number(row.updated_at),
  }));
}

export async function getWorkspaceById(userId: string, id: string): Promise<Workspace | null> {
  await initializeDatabase();
  const db = getAdapter();

  const [rows] = await db.execute(
    'SELECT * FROM workspaces WHERE id = ? AND user_id = ?',
    [id, userId]
  );
  const workspaces = rows as any[];
  if (workspaces.length === 0) return null;

  const row = workspaces[0];
  return {
    id: row.id,
    userId: row.user_id,
    name: row.name,
    data: parseWorkspaceData(row.data),
    createdAt: Number(row.created_at),
    updatedAt: Number(row.updated_at),
  };
}

export async function updateWorkspace(
  userId: string,
  id: string,
  updates: { name?: string; data?: WorkspaceData }
): Promise<Workspace | null> {
  await initializeDatabase();
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
    return getWorkspaceById(userId, id);
  }

  values.push(id, userId);

  await db.execute(
    `UPDATE workspaces SET ${fields.join(', ')} WHERE id = ? AND user_id = ?`,
    values
  );

  return getWorkspaceById(userId, id);
}

export async function deleteWorkspace(userId: string, id: string): Promise<boolean> {
  await initializeDatabase();
  const db = getAdapter();

  const [result] = await db.execute(
    'DELETE FROM workspaces WHERE id = ? AND user_id = ?',
    [id, userId]
  );

  return (result as any).affectedRows > 0;
}
