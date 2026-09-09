import type { ChatModel } from '@/types';
import { getAdapter } from './connection';
import { ensureDatabase } from './ready';
import { CacheKeys, CacheTTL, withCache } from '../cache';

export type SafeChatModel = Pick<
  ChatModel,
  'id' | 'name' | 'modelId' | 'supportsVision' | 'maxTokens' | 'enabled' | 'costPerMessage'
>;

export async function getSafeChatModels(enabledOnly = true): Promise<SafeChatModel[]> {
  return withCache(
    `${CacheKeys.CHAT_MODELS}safe:${enabledOnly ? 'enabled' : 'all'}`,
    CacheTTL.CHAT_MODELS,
    async () => {
      await ensureDatabase();
      const db = getAdapter();
      const sql = enabledOnly
        ? 'SELECT id, name, model_id, supports_vision, cost_per_message FROM chat_models WHERE enabled = TRUE ORDER BY created_at ASC'
        : 'SELECT id, name, model_id, supports_vision, max_tokens, enabled, cost_per_message FROM chat_models ORDER BY created_at ASC';
      const [rows] = await db.execute(sql);
      return (rows as any[]).map((row) => ({
        id: row.id,
        name: row.name,
        modelId: row.model_id,
        supportsVision: Boolean(row.supports_vision),
        maxTokens: enabledOnly ? 4096 : row.max_tokens,
        enabled: enabledOnly ? true : Boolean(row.enabled),
        costPerMessage: row.cost_per_message,
      }));
    }
  );
}
