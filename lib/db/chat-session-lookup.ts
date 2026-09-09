import type { ChatSession } from '@/types';
import { getAdapter } from './connection';
import { ensureDatabase } from './ready';

export async function chatSessionExists(id: string, userId: string): Promise<boolean> {
  await ensureDatabase();
  const db = getAdapter();

  const [rows] = await db.execute(
    'SELECT 1 FROM chat_sessions WHERE id = ? AND user_id = ? LIMIT 1',
    [id, userId]
  );
  return (rows as any[]).length > 0;
}

export async function getChatSession(id: string, userId?: string): Promise<ChatSession | null> {
  await ensureDatabase();
  const db = getAdapter();

  const [rows] = await db.execute(
    userId
      ? 'SELECT id, user_id, title, model_id, created_at, updated_at FROM chat_sessions WHERE id = ? AND user_id = ?'
      : 'SELECT id, user_id, title, model_id, created_at, updated_at FROM chat_sessions WHERE id = ?',
    userId ? [id, userId] : [id]
  );
  const sessions = rows as any[];
  if (sessions.length === 0) return null;

  const row = sessions[0];
  return {
    id: row.id,
    userId: row.user_id,
    title: row.title,
    modelId: row.model_id,
    createdAt: Number(row.created_at),
    updatedAt: Number(row.updated_at),
  };
}
