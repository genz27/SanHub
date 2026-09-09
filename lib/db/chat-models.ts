import type { ChatModel } from '@/types';
import { getAdapter } from './connection';
import { ensureDatabase } from './ready';
import { generateId } from '../utils';
import { CacheKeys, CacheTTL, invalidateChatModelsCache, withCache } from '../cache';

export async function getChatModels(enabledOnly = false): Promise<ChatModel[]> {
  return withCache(
    `${CacheKeys.CHAT_MODELS}${enabledOnly ? 'enabled' : 'all'}`,
    CacheTTL.CHAT_MODELS,
    async () => {
      await ensureDatabase();
      const db = getAdapter();

      const sql = enabledOnly
        ? 'SELECT id, name, api_url, api_key, model_id, supports_vision, max_tokens, enabled, cost_per_message FROM chat_models WHERE enabled = TRUE ORDER BY created_at ASC'
        : 'SELECT id, name, api_url, api_key, model_id, supports_vision, max_tokens, enabled, cost_per_message FROM chat_models ORDER BY created_at ASC';

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
        createdAt: 0,
      }));
    }
  );
}

export async function getChatModel(id: string): Promise<ChatModel | null> {
  return withCache(`${CacheKeys.CHAT_MODELS}id:${id}`, CacheTTL.CHAT_MODELS, async () => {
    await ensureDatabase();
    const db = getAdapter();

    const [rows] = await db.execute(
      'SELECT id, name, api_url, api_key, model_id, supports_vision, max_tokens, enabled, cost_per_message FROM chat_models WHERE id = ?',
      [id]
    );
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
      createdAt: 0,
    };
  });
}

export async function createChatModel(model: Omit<ChatModel, 'id' | 'createdAt'>): Promise<ChatModel> {
  await ensureDatabase();
  const db = getAdapter();

  const id = generateId();
  const now = Date.now();

  await db.execute(
    `INSERT INTO chat_models (id, name, api_url, api_key, model_id, supports_vision, max_tokens, enabled, cost_per_message, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, model.name, model.apiUrl, model.apiKey, model.modelId, model.supportsVision, model.maxTokens, model.enabled, model.costPerMessage, now]
  );

  invalidateChatModelsCache();
  return { ...model, id, createdAt: now };
}

export async function updateChatModel(id: string, updates: Partial<Omit<ChatModel, 'id' | 'createdAt'>>): Promise<ChatModel | null> {
  await ensureDatabase();
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

  invalidateChatModelsCache();
  return getChatModel(id);
}

export async function deleteChatModel(id: string): Promise<boolean> {
  await ensureDatabase();
  const db = getAdapter();

  const [result] = await db.execute('DELETE FROM chat_models WHERE id = ?', [id]);
  invalidateChatModelsCache();
  return (result as any).affectedRows > 0;
}
