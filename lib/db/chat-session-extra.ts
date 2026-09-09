import type { ChatMessage, ChatSession } from '@/types';
import { getAdapter } from './connection';
import { ensureDatabase } from './ready';

export { chatSessionExists, getChatSession } from './chat-session-lookup';

export async function getUserChatSessions(userId: string, limit = 50): Promise<ChatSession[]> {
  await ensureDatabase();
  const db = getAdapter();
  const safeLimit = Math.max(Number(limit) || 50, 1);

  const [rows] = await db.execute(
    `SELECT id, user_id, title, model_id, created_at, updated_at FROM chat_sessions WHERE user_id = ? ORDER BY updated_at DESC LIMIT ${safeLimit}`,
    [userId]
  );

  return (rows as any[]).map((row) => ({
    id: row.id,
    userId: row.user_id,
    title: row.title,
    modelId: row.model_id,
    createdAt: Number(row.created_at),
    updatedAt: Number(row.updated_at),
  }));
}

export async function getSessionMessages(
  sessionId: string,
  limit = 100,
  userId?: string
): Promise<ChatMessage[]> {
  await ensureDatabase();
  const db = getAdapter();
  const safeLimit = Math.max(Number(limit) || 100, 1);

  const [rows] = await db.execute(
    userId
      ? `SELECT m.id, m.session_id, m.role, m.content, m.images, m.token_count, m.created_at
         FROM chat_messages m
         INNER JOIN chat_sessions s ON s.id = m.session_id AND s.user_id = ?
         WHERE m.session_id = ? ORDER BY m.created_at ASC LIMIT ${safeLimit}`
      : `SELECT id, session_id, role, content, images, token_count, created_at
         FROM chat_messages WHERE session_id = ? ORDER BY created_at ASC LIMIT ${safeLimit}`,
    userId ? [userId, sessionId] : [sessionId]
  );

  return (rows as any[]).map((row) => ({
    id: row.id,
    sessionId: row.session_id,
    role: row.role,
    content: row.content,
    images: typeof row.images === 'string' ? JSON.parse(row.images) : (row.images || []),
    tokenCount: row.token_count,
    createdAt: Number(row.created_at),
  }));
}

export async function getSessionContext(sessionId: string, maxTokens = 128000): Promise<ChatMessage[]> {
  const messages = await getSessionMessages(sessionId, 200);

  const targetTokens = Math.floor(maxTokens / 2);
  let totalTokens = 0;
  const result: ChatMessage[] = [];

  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    if (totalTokens + msg.tokenCount > targetTokens && result.length > 0) {
      break;
    }
    result.push(msg);
    totalTokens += msg.tokenCount;
  }

  return result.reverse();
}
