import type { ChatModel } from '@/types';
import { getAdapter } from './connection';
import { ensureDatabase } from './ready';
import { CacheKeys, CacheTTL, withCache } from '../cache';

export type SafeChatModelPicker = Pick<ChatModel, 'id' | 'name' | 'supportsVision' | 'enabled'>;

export async function getSafeChatModelPicker(): Promise<SafeChatModelPicker[]> {
  return withCache(
    `${CacheKeys.CHAT_MODELS}safe:picker`,
    CacheTTL.CHAT_MODELS,
    async () => {
      await ensureDatabase();
      const db = getAdapter();
      const [rows] = await db.execute(
        'SELECT id, name, supports_vision FROM chat_models WHERE enabled = TRUE ORDER BY created_at ASC'
      );
      return (rows as any[]).map((row) => ({
        id: row.id,
        name: row.name,
        supportsVision: Boolean(row.supports_vision),
        enabled: true,
      }));
    }
  );
}
