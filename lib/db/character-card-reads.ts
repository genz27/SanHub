import type { CharacterCard } from '@/types';
import { getAdapter } from './connection';
import { ensureDatabase } from './ready';
import { cache, CacheKeys, CacheTTL, withCache } from '../cache';

export function characterCardAvatarCacheKey(id: string): string {
  return `${CacheKeys.CHARACTER_CARDS}avatar:${id}`;
}

export function invalidateCharacterCardCache(userId?: string): void {
  cache.deleteByPrefix(userId ? `${CacheKeys.CHARACTER_CARDS}${userId}:` : CacheKeys.CHARACTER_CARDS);
}

export function invalidateCharacterCardLookups(ids?: string[]): void {
  if (ids && ids.length > 0) {
    for (const id of ids) {
      cache.delete(characterCardAvatarCacheKey(id));
    }
    return;
  }

  cache.deleteByPrefix(characterCardAvatarCacheKey(''));
}

function characterCardListColumns(
  includeError: boolean,
  includeTimestamps = true,
  includeStatus = true,
  includeUpdatedAt = true
): string {
  const timestampCols = includeTimestamps
    ? `, created_at${includeUpdatedAt ? ', updated_at' : ''}`
    : '';
  return `
  id, character_name${includeStatus ? ', status' : ''}${includeError ? ', error_message' : ''}${timestampCols},
  CASE
    WHEN avatar_url IS NULL OR avatar_url = '' THEN NULL
    WHEN LEFT(avatar_url, 8) = 'https://' OR LEFT(avatar_url, 7) = 'http://' THEN avatar_url
    ELSE ''
  END AS avatar_url
`;
}

function mapCharacterCardListRow(
  row: any,
  userId: string,
  statusFallback?: CharacterCard['status']
): CharacterCard {
  const rawUrl = row.avatar_url;
  return {
    id: row.id,
    userId,
    characterName: row.character_name || '',
    avatarUrl: rawUrl === '' ? `/api/character-cards/${row.id}/avatar` : rawUrl || '',
    sourceVideoUrl: undefined,
    status: row.status || statusFallback || 'pending',
    errorMessage: row.error_message || undefined,
    createdAt: Number(row.created_at) || 0,
    updatedAt: Number(row.updated_at || row.created_at) || 0,
  };
}

export type CharacterCardListStatus = 'completed' | 'pending' | 'processing';

export async function getUserCharacterCards(
  userId: string,
  limit = 50,
  offset = 0,
  options: { status?: CharacterCardListStatus; picker?: boolean } = {}
): Promise<CharacterCard[]> {
  const safeLimit = Math.max(Number(limit) || 50, 1);
  const safeOffset = Math.max(Number(offset) || 0, 0);
  const picker = Boolean(options.picker);

  const load = async () => {
    await ensureDatabase();
    const db = getAdapter();
    const whereClauses = ['user_id = ?'];
    const values: unknown[] = [userId];

    if (options.status) {
      whereClauses.push('status = ?');
      values.push(options.status);
    }

    const completed = options.status === 'completed';
    const [rows] = await db.execute(
      `SELECT ${characterCardListColumns(
        !completed,
        !picker,
        !completed,
        !completed
      )}
       FROM character_cards WHERE ${whereClauses.join(' AND ')} ORDER BY created_at DESC LIMIT ${safeLimit} OFFSET ${safeOffset}`,
      values
    );

    return (rows as any[]).map((row) =>
      mapCharacterCardListRow(row, userId, completed ? 'completed' : undefined)
    );
  };

  if (options.status === 'pending' || options.status === 'processing') {
    return load();
  }

  return withCache(
    `${CacheKeys.CHARACTER_CARDS}${userId}:${options.status || 'all'}:${picker ? 'picker' : 'full'}:${safeLimit}:${safeOffset}`,
    CacheTTL.CHARACTER_CARDS,
    load
  );
}

export async function getPendingCharacterCards(userId: string, limit = 50): Promise<CharacterCard[]> {
  const safeLimit = Math.max(Number(limit) || 50, 1);

  return withCache(
    `${CacheKeys.CHARACTER_CARDS}${userId}:pending-list:${safeLimit}`,
    CacheTTL.PENDING_GENERATIONS,
    async () => {
      await ensureDatabase();
      const db = getAdapter();
      const [rows] = await db.execute(
        `SELECT ${characterCardListColumns(false, true, true, false)}
         FROM character_cards WHERE user_id = ? AND status IN ('pending', 'processing') ORDER BY created_at DESC LIMIT ${safeLimit}`,
        [userId]
      );

      return (rows as any[]).map((row) => mapCharacterCardListRow(row, userId));
    }
  );
}

export type CharacterCardStatusRow = Pick<CharacterCard, 'id' | 'status'>;

export async function getPendingCharacterCardStatuses(
  userId: string,
  limit = 50
): Promise<CharacterCardStatusRow[]> {
  const safeLimit = Math.max(Number(limit) || 50, 1);

  return withCache(
    `${CacheKeys.CHARACTER_CARDS}${userId}:pending-status:${safeLimit}`,
    CacheTTL.PENDING_GENERATIONS,
    async () => {
      await ensureDatabase();
      const db = getAdapter();
      const [rows] = await db.execute(
        `SELECT id, status FROM character_cards
         WHERE user_id = ? AND status IN ('pending', 'processing')
         ORDER BY created_at DESC LIMIT ${safeLimit}`,
        [userId]
      );

      return (rows as any[]).map((row) => ({
        id: row.id as string,
        status: (row.status || 'pending') as CharacterCard['status'],
      }));
    }
  );
}

export type CharacterCardAvatarRecord = {
  id: string;
  userId: string;
  avatarUrl: string;
};

export async function getCharacterCardAvatar(id: string): Promise<CharacterCardAvatarRecord | null> {
  const cacheKey = characterCardAvatarCacheKey(id);
  const cached = cache.get<CharacterCardAvatarRecord>(cacheKey);
  if (cached) return cached;

  await ensureDatabase();
  const db = getAdapter();

  const [rows] = await db.execute(
    'SELECT id, user_id, avatar_url FROM character_cards WHERE id = ?',
    [id]
  );
  const cards = rows as any[];
  if (cards.length === 0) return null;

  const row = cards[0];
  const record: CharacterCardAvatarRecord = {
    id: row.id,
    userId: row.user_id,
    avatarUrl: row.avatar_url || '',
  };

  if (record.avatarUrl && !record.avatarUrl.startsWith('data:')) {
    cache.set(cacheKey, record, CacheTTL.CHARACTER_CARDS);
  }

  return record;
}
