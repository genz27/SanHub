import type { Agent, AgentSession, AgentMessage, AgentSummary } from '@/types/agent';
import { getAdapter } from './connection';
import { initializeDatabase } from './schema';
import { generateId } from '../utils';

// ========================================
// Agent 操作
// ========================================

export async function getAgents(enabledOnly = false): Promise<Agent[]> {
  await initializeDatabase();
  const db = getAdapter();

  const sql = enabledOnly
    ? 'SELECT * FROM agents WHERE enabled = TRUE ORDER BY created_at ASC'
    : 'SELECT * FROM agents ORDER BY created_at ASC';

  const [rows] = await db.execute(sql);

  return (rows as any[]).map(rowToAgent);
}

export async function getUserAgents(userId: string, enabledOnly = false): Promise<Agent[]> {
  await initializeDatabase();
  const db = getAdapter();

  const sql = enabledOnly
    ? 'SELECT * FROM agents WHERE user_id = ? AND enabled = TRUE ORDER BY created_at ASC'
    : 'SELECT * FROM agents WHERE user_id = ? ORDER BY created_at ASC';

  const [rows] = await db.execute(sql, [userId]);

  return (rows as any[]).map(rowToAgent);
}

export async function getAgent(id: string): Promise<Agent | null> {
  await initializeDatabase();
  const db = getAdapter();

  const [rows] = await db.execute('SELECT * FROM agents WHERE id = ?', [id]);
  const agents = rows as any[];
  if (agents.length === 0) return null;

  return rowToAgent(agents[0]);
}

export async function createAgent(agent: Omit<Agent, 'id' | 'createdAt' | 'updatedAt'>): Promise<Agent> {
  await initializeDatabase();
  const db = getAdapter();

  const id = generateId();
  const now = Date.now();

  await db.execute(
    `INSERT INTO agents (id, user_id, name, description, system_prompt, model_id, tools, temperature, max_tokens, max_tool_roundtrips, enabled, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      agent.userId,
      agent.name,
      agent.description,
      agent.systemPrompt,
      agent.modelId,
      JSON.stringify(agent.tools),
      agent.temperature,
      agent.maxTokens,
      agent.maxToolRoundtrips,
      agent.enabled,
      now,
      now,
    ]
  );

  return { ...agent, id, createdAt: now, updatedAt: now };
}

export async function updateAgent(id: string, updates: Partial<Omit<Agent, 'id' | 'createdAt'>>): Promise<Agent | null> {
  await initializeDatabase();
  const db = getAdapter();

  const fields: string[] = ['updated_at = ?'];
  const values: unknown[] = [Date.now()];

  if (updates.userId !== undefined) { fields.push('user_id = ?'); values.push(updates.userId); }
  if (updates.name !== undefined) { fields.push('name = ?'); values.push(updates.name); }
  if (updates.description !== undefined) { fields.push('description = ?'); values.push(updates.description); }
  if (updates.systemPrompt !== undefined) { fields.push('system_prompt = ?'); values.push(updates.systemPrompt); }
  if (updates.modelId !== undefined) { fields.push('model_id = ?'); values.push(updates.modelId); }
  if (updates.tools !== undefined) { fields.push('tools = ?'); values.push(JSON.stringify(updates.tools)); }
  if (updates.temperature !== undefined) { fields.push('temperature = ?'); values.push(updates.temperature); }
  if (updates.maxTokens !== undefined) { fields.push('max_tokens = ?'); values.push(updates.maxTokens); }
  if (updates.maxToolRoundtrips !== undefined) { fields.push('max_tool_roundtrips = ?'); values.push(updates.maxToolRoundtrips); }
  if (updates.enabled !== undefined) { fields.push('enabled = ?'); values.push(updates.enabled); }

  if (fields.length === 1) return getAgent(id);

  values.push(id);
  await db.execute(`UPDATE agents SET ${fields.join(', ')} WHERE id = ?`, values);

  return getAgent(id);
}

export async function deleteAgent(id: string): Promise<boolean> {
  await initializeDatabase();
  const db = getAdapter();

  const [result] = await db.execute('DELETE FROM agents WHERE id = ?', [id]);
  return (result as any).affectedRows > 0;
}

export async function getAgentSummaries(userId?: string): Promise<AgentSummary[]> {
  await initializeDatabase();
  const db = getAdapter();

  const sql = userId
    ? 'SELECT id, name, description, tools, enabled, created_at, updated_at FROM agents WHERE user_id = ? ORDER BY created_at ASC'
    : 'SELECT id, name, description, tools, enabled, created_at, updated_at FROM agents ORDER BY created_at ASC';

  const [rows] = userId
    ? await db.execute(sql, [userId])
    : await db.execute(sql);

  return (rows as any[]).map((row) => ({
    id: row.id,
    name: row.name,
    description: row.description,
    toolCount: Array.isArray(parseTools(row.tools)) ? parseTools(row.tools).length : 0,
    enabled: Boolean(row.enabled),
    createdAt: Number(row.created_at),
    updatedAt: Number(row.updated_at),
  }));
}

// ========================================
// Agent 会话操作
// ========================================

export async function createAgentSession(userId: string, agentId: string, title?: string): Promise<AgentSession> {
  await initializeDatabase();
  const db = getAdapter();

  const id = generateId();
  const now = Date.now();
  const sessionTitle = title || '新对话';

  await db.execute(
    `INSERT INTO agent_sessions (id, user_id, agent_id, title, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [id, userId, agentId, sessionTitle, now, now]
  );

  return { id, userId, agentId, title: sessionTitle, createdAt: now, updatedAt: now };
}

export async function getUserAgentSessions(userId: string, agentId?: string): Promise<AgentSession[]> {
  await initializeDatabase();
  const db = getAdapter();

  if (agentId) {
    const [rows] = await db.execute(
      'SELECT * FROM agent_sessions WHERE user_id = ? AND agent_id = ? ORDER BY updated_at DESC',
      [userId, agentId]
    );
    return (rows as any[]).map(rowToAgentSession);
  }

  const [rows] = await db.execute(
    'SELECT * FROM agent_sessions WHERE user_id = ? ORDER BY updated_at DESC',
    [userId]
  );

  return (rows as any[]).map(rowToAgentSession);
}

export async function getAgentSession(id: string): Promise<AgentSession | null> {
  await initializeDatabase();
  const db = getAdapter();

  const [rows] = await db.execute('SELECT * FROM agent_sessions WHERE id = ?', [id]);
  const sessions = rows as any[];
  if (sessions.length === 0) return null;

  return rowToAgentSession(sessions[0]);
}

export async function updateAgentSession(id: string, updates: { title?: string }): Promise<AgentSession | null> {
  await initializeDatabase();
  const db = getAdapter();

  const fields: string[] = ['updated_at = ?'];
  const values: unknown[] = [Date.now()];

  if (updates.title !== undefined) { fields.push('title = ?'); values.push(updates.title); }

  values.push(id);
  await db.execute(`UPDATE agent_sessions SET ${fields.join(', ')} WHERE id = ?`, values);

  return getAgentSession(id);
}

export async function deleteAgentSession(id: string): Promise<boolean> {
  await initializeDatabase();
  const db = getAdapter();

  // 先删除关联消息
  await db.execute('DELETE FROM agent_messages WHERE session_id = ?', [id]);

  const [result] = await db.execute('DELETE FROM agent_sessions WHERE id = ?', [id]);
  return (result as any).affectedRows > 0;
}

// ========================================
// Agent 消息操作
// ========================================

export async function saveAgentMessage(msg: Omit<AgentMessage, 'id' | 'createdAt'>): Promise<AgentMessage> {
  await initializeDatabase();
  const db = getAdapter();

  const id = generateId();
  const now = Date.now();

  await db.execute(
    `INSERT INTO agent_messages (id, session_id, role, content, tool_calls, tool_call_id, tool_name, is_error, token_count, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      msg.sessionId,
      msg.role,
      msg.content,
      JSON.stringify(msg.toolCalls || null),
      msg.toolCallId || null,
      msg.toolName || null,
      msg.isError ? 1 : 0,
      msg.tokenCount,
      now,
    ]
  );

  // 更新会话时间
  await db.execute('UPDATE agent_sessions SET updated_at = ? WHERE id = ?', [now, msg.sessionId]);

  return { ...msg, id, createdAt: now };
}

export async function getAgentSessionMessages(sessionId: string, limit?: number): Promise<AgentMessage[]> {
  await initializeDatabase();
  const db = getAdapter();
  const safeLimit = Math.max(Number(limit) || 200, 1);

  const [rows] = await db.execute(
    `SELECT * FROM agent_messages WHERE session_id = ? ORDER BY created_at ASC LIMIT ${safeLimit}`,
    [sessionId]
  );

  return (rows as any[]).map(rowToAgentMessage);
}

// ========================================
// 行映射辅助函数
// ========================================

function parseTools(tools: unknown): unknown[] {
  if (typeof tools === 'string') {
    try { return JSON.parse(tools); } catch { return []; }
  }
  return Array.isArray(tools) ? tools : [];
}

function rowToAgent(row: any): Agent {
  return {
    id: row.id,
    userId: row.user_id,
    name: row.name,
    description: row.description,
    systemPrompt: row.system_prompt,
    modelId: row.model_id,
    tools: parseTools(row.tools) as Agent['tools'],
    temperature: Number(row.temperature),
    maxTokens: row.max_tokens,
    maxToolRoundtrips: row.max_tool_roundtrips,
    enabled: Boolean(row.enabled),
    createdAt: Number(row.created_at),
    updatedAt: Number(row.updated_at),
  };
}

function rowToAgentSession(row: any): AgentSession {
  return {
    id: row.id,
    userId: row.user_id,
    agentId: row.agent_id,
    title: row.title,
    createdAt: Number(row.created_at),
    updatedAt: Number(row.updated_at),
  };
}

function rowToAgentMessage(row: any): AgentMessage {
  return {
    id: row.id,
    sessionId: row.session_id,
    role: row.role,
    content: row.content,
    toolCalls: typeof row.tool_calls === 'string' ? JSON.parse(row.tool_calls) : (row.tool_calls || undefined),
    toolCallId: row.tool_call_id || undefined,
    toolName: row.tool_name || undefined,
    isError: Boolean(row.is_error),
    tokenCount: row.token_count,
    createdAt: Number(row.created_at),
  };
}
