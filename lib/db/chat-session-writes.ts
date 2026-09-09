import type { ChatMessage, ChatSession } from '@/types';
import { generateId } from '../utils';
import { getChatSession } from './chat-session-lookup';
import { getAdapter } from './connection';
import { ensureDatabase } from './ready';

export async function createChatSession(userId: string, modelId: string, title = '新对话'): Promise<ChatSession> {
  await ensureDatabase();
  const db = getAdapter();

  const id = generateId();
  const now = Date.now();

  await db.execute(
    `INSERT INTO chat_sessions (id, user_id, title, model_id, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [id, userId, title, modelId, now, now]
  );

  return { id, userId, title, modelId, createdAt: now, updatedAt: now };
}

export async function updateChatSession(id: string, updates: { title?: string; modelId?: string }): Promise<ChatSession | null> {
  await ensureDatabase();
  const db = getAdapter();

  const fields: string[] = ['updated_at = ?'];
  const values: unknown[] = [Date.now()];

  if (updates.title !== undefined) { fields.push('title = ?'); values.push(updates.title); }
  if (updates.modelId !== undefined) { fields.push('model_id = ?'); values.push(updates.modelId); }

  values.push(id);
  await db.execute(`UPDATE chat_sessions SET ${fields.join(', ')} WHERE id = ?`, values);

  return getChatSession(id);
}

export async function deleteChatSession(id: string, userId?: string): Promise<boolean> {
  await ensureDatabase();
  const db = getAdapter();

  if (userId) {
    await db.execute(
      'DELETE FROM chat_messages WHERE session_id = ? AND EXISTS (SELECT 1 FROM chat_sessions WHERE id = ? AND user_id = ?)',
      [id, id, userId]
    );
  } else {
    await db.execute('DELETE FROM chat_messages WHERE session_id = ?', [id]);
  }
  const [result] = await db.execute(
    userId
      ? 'DELETE FROM chat_sessions WHERE id = ? AND user_id = ?'
      : 'DELETE FROM chat_sessions WHERE id = ?',
    userId ? [id, userId] : [id]
  );
  return (result as any).affectedRows > 0;
}

export async function saveChatMessage(message: Omit<ChatMessage, 'id' | 'createdAt'>): Promise<ChatMessage> {
  await ensureDatabase();
  const db = getAdapter();

  const id = generateId();
  const now = Date.now();

  await db.execute(
    `INSERT INTO chat_messages (id, session_id, role, content, images, token_count, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [id, message.sessionId, message.role, message.content, JSON.stringify(message.images || []), message.tokenCount, now]
  );

  await db.execute('UPDATE chat_sessions SET updated_at = ? WHERE id = ?', [now, message.sessionId]);

  return { ...message, id, createdAt: now };
}

export async function deleteSessionMessages(sessionId: string): Promise<boolean> {
  await ensureDatabase();
  const db = getAdapter();

  const [result] = await db.execute('DELETE FROM chat_messages WHERE session_id = ?', [sessionId]);
  return (result as any).affectedRows > 0;
}
