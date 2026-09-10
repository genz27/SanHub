import type { ChatModel } from '@/types';
import { getAdapter } from './connection';
import { ensureDatabase } from './ready';
import { CacheKeys, CacheTTL, withCache } from '../cache';

export async function getChatModelRuntime(id: string): Promise<ChatModel | null> {
  return withCache(`${CacheKeys.CHAT_MODELS}runtime:${id}`, CacheTTL.CHAT_MODELS, async () => {
    await ensureDatabase();
    const db = getAdapter();

    const [rows] = await db.execute(
      'SELECT id, api_url, api_key, model_id, supports_vision, max_tokens, enabled, cost_per_message FROM chat_models WHERE id = ?',
      [id]
    );
    const models = rows as any[];
    if (models.length === 0) return null;

    const row = models[0];
    return {
      id: row.id,
      name: '',
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

function mapChatModelRow(row: any): ChatModel {
  return {
    id: row.id,
    name: row.name || '',
    apiUrl: row.api_url,
    apiKey: row.api_key,
    modelId: row.model_id,
    supportsVision: Boolean(row.supports_vision),
    maxTokens: row.max_tokens,
    enabled: Boolean(row.enabled),
    costPerMessage: row.cost_per_message,
    createdAt: Number(row.created_at) || 0,
  };
}

export async function getEnabledVisionChatModels(): Promise<ChatModel[]> {
  return withCache(`${CacheKeys.CHAT_MODELS}runtime:vision-list`, CacheTTL.CHAT_MODELS, async () => {
    await ensureDatabase();
    const db = getAdapter();
    const [rows] = await db.execute(
      `SELECT id, name, api_url, api_key, model_id, supports_vision, max_tokens, enabled, cost_per_message, created_at
       FROM chat_models
       WHERE enabled = TRUE AND supports_vision = TRUE
       ORDER BY created_at ASC`
    );
    return (rows as any[]).map(mapChatModelRow);
  });
}

export async function getEnabledVisionChatModel(): Promise<ChatModel | null> {
  const { rankVisionChatModels } = await import('@/lib/vision-chat');
  const models = rankVisionChatModels(await getEnabledVisionChatModels());
  return models[0] || null;
}
