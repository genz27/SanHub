import type { CharacterCard } from '@/types';
import { cache, CacheKeys } from '../cache';
import { generateId } from '../utils';
import {
  invalidateCharacterCardCache,
  invalidateCharacterCardLookups,
} from './character-card-reads';
import { getAdapter } from './connection';
import { ensureDatabase } from './ready';

export async function saveCharacterCard(
  card: Omit<CharacterCard, 'id' | 'createdAt' | 'updatedAt'>
): Promise<CharacterCard> {
  await ensureDatabase();
  const db = getAdapter();

  const now = Date.now();
  const newCard: CharacterCard = {
    ...card,
    id: generateId(),
    createdAt: now,
    updatedAt: now,
  };

  await db.execute(
    `INSERT INTO character_cards (id, user_id, character_name, avatar_url, source_video_url, status, error_message, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      newCard.id,
      newCard.userId,
      newCard.characterName,
      newCard.avatarUrl,
      newCard.sourceVideoUrl || null,
      newCard.status,
      newCard.errorMessage || null,
      newCard.createdAt,
      newCard.updatedAt,
    ]
  );

  cache.deleteByPrefix(`${CacheKeys.DAILY_USAGE}${newCard.userId}:`);
  invalidateCharacterCardCache(newCard.userId);
  return newCard;
}

export async function updateCharacterCard(
  id: string,
  updates: Partial<Pick<CharacterCard, 'characterName' | 'avatarUrl' | 'status' | 'errorMessage'>>,
  userId?: string
): Promise<void> {
  await ensureDatabase();
  const db = getAdapter();

  const fields: string[] = ['updated_at = ?'];
  const values: unknown[] = [Date.now()];

  if (updates.characterName !== undefined) {
    fields.push('character_name = ?');
    values.push(updates.characterName);
  }
  if (updates.avatarUrl !== undefined) {
    fields.push('avatar_url = ?');
    values.push(updates.avatarUrl);
  }
  if (updates.status !== undefined) {
    fields.push('status = ?');
    values.push(updates.status);
  }
  if (updates.errorMessage !== undefined) {
    fields.push('error_message = ?');
    values.push(updates.errorMessage);
  }

  values.push(id);
  await db.execute(
    `UPDATE character_cards SET ${fields.join(', ')} WHERE id = ?`,
    values
  );

  if (userId) {
    invalidateCharacterCardCache(userId);
    invalidateCharacterCardLookups([id]);
    return;
  }

  invalidateCharacterCardCache();
}

export async function deleteCharacterCard(id: string, userId: string): Promise<boolean> {
  await ensureDatabase();
  const db = getAdapter();

  const [result] = await db.execute(
    'DELETE FROM character_cards WHERE id = ? AND user_id = ?',
    [id, userId]
  );

  const deleted = (result as any).affectedRows > 0;
  if (deleted) {
    cache.deleteByPrefix(`${CacheKeys.DAILY_USAGE}${userId}:`);
    invalidateCharacterCardCache(userId);
    invalidateCharacterCardLookups([id]);
  }
  return deleted;
}

export async function deleteAllUserCharacterCards(userId: string): Promise<number> {
  await ensureDatabase();
  const db = getAdapter();

  const [result] = await db.execute(
    'DELETE FROM character_cards WHERE user_id = ?',
    [userId]
  );

  const deleted = (result as any).affectedRows || 0;
  if (deleted > 0) {
    cache.deleteByPrefix(`${CacheKeys.DAILY_USAGE}${userId}:`);
    invalidateCharacterCardCache(userId);
    invalidateCharacterCardLookups();
  }
  return deleted;
}
