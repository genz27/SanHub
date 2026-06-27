import type { ChatModel, ChatSession, ChatMessage } from '@/types';
import { getAdapter } from './connection';
import { initializeDatabase } from './schema';
import { generateId } from '../utils';

// ========================================
// 聊天模型操作
// ========================================

export async function getChatModels(enabledOnly = false): Promise<ChatModel[]> {
  await initializeDatabase();
  const db = getAdapter();

  const sql = enabledOnly
    ? 'SELECT * FROM chat_models WHERE enabled = TRUE ORDER BY created_at ASC'
    : 'SELECT * FROM chat_models ORDER BY created_at ASC';

  const [rows] = await db.execute(sql);

  return (rows as any[]).map((row) => ({
    id: row.id,
    name: row.name,
    apiUrl: row.api_url,
    apiKey: row.api_key,
    modelId: row.model_id,
    supportsVision: Boolean(row.supports_vision),
    maxTokens: row.max_tokens,
    enabled: Boolean(row.enabled),
    costPerMessage: row.cost_per_message,
    createdAt: Number(row.created_at),
  }));
}

export async function getChatModel(id: string): Promise<ChatModel | null> {
  await initializeDatabase();
  const db = getAdapter();

  const [rows] = await db.execute('SELECT * FROM chat_models WHERE id = ?', [id]);
  const models = rows as any[];
  if (models.length === 0) return null;

  const row = models[0];
  return {
    id: row.id,
    name: row.name,
    apiUrl: row.api_url,
    apiKey: row.api_key,
    modelId: row.model_id,
    supportsVision: Boolean(row.supports_vision),
    maxTokens: row.max_tokens,
    enabled: Boolean(row.enabled),
    costPerMessage: row.cost_per_message,
    createdAt: Number(row.created_at),
  };
}

export async function createChatModel(model: Omit<ChatModel, 'id' | 'createdAt'>): Promise<ChatModel> {
  await initializeDatabase();
  const db = getAdapter();

  const id = generateId();
  const now = Date.now();

  await db.execute(
    `INSERT INTO chat_models (id, name, api_url, api_key, model_id, supports_vision, max_tokens, enabled, cost_per_message, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, model.name, model.apiUrl, model.apiKey, model.modelId, model.supportsVision, model.maxTokens, model.enabled, model.costPerMessage, now]
  );

  return { ...model, id, createdAt: now };
}

export async function updateChatModel(id: string, updates: Partial<Omit<ChatModel, 'id' | 'createdAt'>>): Promise<ChatModel | null> {
  await initializeDatabase();
  const db = getAdapter();

  const fields: string[] = [];
  const values: unknown[] = [];

  if (updates.name !== undefined) { fields.push('name = ?'); values.push(updates.name); }
  if (updates.apiUrl !== undefined) { fields.push('api_url = ?'); values.push(updates.apiUrl); }
  if (updates.apiKey !== undefined) { fields.push('api_key = ?'); values.push(updates.apiKey); }
  if (updates.modelId !== undefined) { fields.push('model_id = ?'); values.push(updates.modelId); }
  if (updates.supportsVision !== undefined) { fields.push('supports_vision = ?'); values.push(updates.supportsVision); }
  if (updates.maxTokens !== undefined) { fields.push('max_tokens = ?'); values.push(updates.maxTokens); }
  if (updates.enabled !== undefined) { fields.push('enabled = ?'); values.push(updates.enabled); }
  if (updates.costPerMessage !== undefined) { fields.push('cost_per_message = ?'); values.push(updates.costPerMessage); }

  if (fields.length === 0) return getChatModel(id);

  values.push(id);
  await db.execute(`UPDATE chat_models SET ${fields.join(', ')} WHERE id = ?`, values);

  return getChatModel(id);
}

export async function deleteChatModel(id: string): Promise<boolean> {
  await initializeDatabase();
  const db = getAdapter();

  const [result] = await db.execute('DELETE FROM chat_models WHERE id = ?', [id]);
  return (result as any).affectedRows > 0;
}

// ========================================
// 聊天会话操作
// ========================================

export async function createChatSession(userId: string, modelId: string, title = '新对话'): Promise<ChatSession> {
  await initializeDatabase();
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

export async function getUserChatSessions(userId: string, limit = 50): Promise<ChatSession[]> {
  await initializeDatabase();
  const db = getAdapter();
  const safeLimit = Math.max(Number(limit) || 50, 1);

  const [rows] = await db.execute(
    `SELECT * FROM chat_sessions WHERE user_id = ? ORDER BY updated_at DESC LIMIT ${safeLimit}`,
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

export async function getChatSession(id: string): Promise<ChatSession | null> {
  await initializeDatabase();
  const db = getAdapter();

  const [rows] = await db.execute('SELECT * FROM chat_sessions WHERE id = ?', [id]);
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

export async function updateChatSession(id: string, updates: { title?: string; modelId?: string }): Promise<ChatSession | null> {
  await initializeDatabase();
  const db = getAdapter();

  const fields: string[] = ['updated_at = ?'];
  const values: unknown[] = [Date.now()];

  if (updates.title !== undefined) { fields.push('title = ?'); values.push(updates.title); }
  if (updates.modelId !== undefined) { fields.push('model_id = ?'); values.push(updates.modelId); }

  values.push(id);
  await db.execute(`UPDATE chat_sessions SET ${fields.join(', ')} WHERE id = ?`, values);

  return getChatSession(id);
}

export async function deleteChatSession(id: string): Promise<boolean> {
  await initializeDatabase();
  const db = getAdapter();

  const [result] = await db.execute('DELETE FROM chat_sessions WHERE id = ?', [id]);
  return (result as any).affectedRows > 0;
}

// ========================================
// 聊天消息操作
// ========================================

export async function saveChatMessage(message: Omit<ChatMessage, 'id' | 'createdAt'>): Promise<ChatMessage> {
  await initializeDatabase();
  const db = getAdapter();

  const id = generateId();
  const now = Date.now();

  await db.execute(
    `INSERT INTO chat_messages (id, session_id, role, content, images, token_count, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [id, message.sessionId, message.role, message.content, JSON.stringify(message.images || []), message.tokenCount, now]
  );

  // 更新会话时间
  await db.execute('UPDATE chat_sessions SET updated_at = ? WHERE id = ?', [now, message.sessionId]);

  return { ...message, id, createdAt: now };
}

export async function getSessionMessages(sessionId: string, limit = 100): Promise<ChatMessage[]> {
  await initializeDatabase();
  const db = getAdapter();
  const safeLimit = Math.max(Number(limit) || 100, 1);

  const [rows] = await db.execute(
    `SELECT * FROM chat_messages WHERE session_id = ? ORDER BY created_at ASC LIMIT ${safeLimit}`,
    [sessionId]
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

// 获取会话消息用于上下文（自动截断到 maxTokens 的一半）
export async function getSessionContext(sessionId: string, maxTokens = 128000): Promise<ChatMessage[]> {
  const messages = await getSessionMessages(sessionId, 200);

  // 截断到 maxTokens 的一半（64k for 128k context）
  const targetTokens = Math.floor(maxTokens / 2);
  let totalTokens = 0;
  const result: ChatMessage[] = [];

  // 从最新消息开始，保留最近的对话
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

export async function deleteSessionMessages(sessionId: string): Promise<boolean> {
  await initializeDatabase();
  const db = getAdapter();

  const [result] = await db.execute('DELETE FROM chat_messages WHERE session_id = ?', [sessionId]);
  return (result as any).affectedRows > 0;
}
