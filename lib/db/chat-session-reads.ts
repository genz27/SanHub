import type { ChatMessage } from '@/types';
import { getAdapter } from './connection';
import { ensureDatabase } from './ready';

export async function getOwnedSessionMessages(
  sessionId: string,
  userId: string,
  limit = 100
): Promise<ChatMessage[] | null> {
  await ensureDatabase();
  const db = getAdapter();
  const safeLimit = Math.max(Number(limit) || 100, 1);

  const [rows] = await db.execute(
    `SELECT m.id, m.session_id, m.role, m.content, m.images, m.created_at
     FROM chat_sessions s
     LEFT JOIN chat_messages m ON m.session_id = s.id
     WHERE s.id = ? AND s.user_id = ?
     ORDER BY m.created_at ASC
     LIMIT ${safeLimit}`,
    [sessionId, userId]
  );

  const messages = rows as any[];
  if (messages.length === 0) return null;

  return messages.filter((row) => row.id).map((row) => ({
    id: row.id,
    sessionId: row.session_id,
    role: row.role,
    content: row.content,
    images: typeof row.images === 'string' ? JSON.parse(row.images) : (row.images || []),
    tokenCount: 0,
    createdAt: Number(row.created_at),
  }));
}
