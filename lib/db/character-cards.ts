import type { CharacterCard } from '@/types';
import { getAdapter } from './connection';
import { initializeDatabase } from './schema';
import { generateId } from '../utils';

// ========================================
// 角色卡操作
// ========================================

export async function saveCharacterCard(
  card: Omit<CharacterCard, 'id' | 'createdAt' | 'updatedAt'>
): Promise<CharacterCard> {
  await initializeDatabase();
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

  return newCard;
}

export async function updateCharacterCard(
  id: string,
  updates: Partial<Pick<CharacterCard, 'characterName' | 'avatarUrl' | 'status' | 'errorMessage'>>
): Promise<CharacterCard | null> {
  await initializeDatabase();
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

  return getCharacterCard(id);
}

export async function getCharacterCard(id: string): Promise<CharacterCard | null> {
  await initializeDatabase();
  const db = getAdapter();

  const [rows] = await db.execute('SELECT * FROM character_cards WHERE id = ?', [id]);
  const cards = rows as any[];
  if (cards.length === 0) return null;

  const row = cards[0];
  return {
    id: row.id,
    userId: row.user_id,
    characterName: row.character_name || '',
    avatarUrl: row.avatar_url || '',
    sourceVideoUrl: row.source_video_url || undefined,
    status: row.status || 'pending',
    errorMessage: row.error_message || undefined,
    createdAt: Number(row.created_at),
    updatedAt: Number(row.updated_at || row.created_at),
  };
}

export async function getUserCharacterCards(
  userId: string,
  limit = 50,
  offset = 0
): Promise<CharacterCard[]> {
  await initializeDatabase();
  const db = getAdapter();
  const safeLimit = Math.max(Number(limit) || 50, 1);
  const safeOffset = Math.max(Number(offset) || 0, 0);

  const [rows] = await db.execute(
    `SELECT * FROM character_cards WHERE user_id = ? ORDER BY created_at DESC LIMIT ${safeLimit} OFFSET ${safeOffset}`,
    [userId]
  );

  return (rows as any[]).map((row) => ({
    id: row.id,
    userId: row.user_id,
    characterName: row.character_name || '',
    avatarUrl: row.avatar_url || '',
    sourceVideoUrl: row.source_video_url || undefined,
    status: row.status || 'pending',
    errorMessage: row.error_message || undefined,
    createdAt: Number(row.created_at),
    updatedAt: Number(row.updated_at || row.created_at),
  }));
}

export async function getPendingCharacterCards(userId: string, limit = 50): Promise<CharacterCard[]> {
  await initializeDatabase();
  const db = getAdapter();
  const safeLimit = Math.max(Number(limit) || 50, 1);

  const [rows] = await db.execute(
    `SELECT * FROM character_cards WHERE user_id = ? AND status IN ('pending', 'processing') ORDER BY created_at DESC LIMIT ${safeLimit}`,
    [userId]
  );

  return (rows as any[]).map((row) => ({
    id: row.id,
    userId: row.user_id,
    characterName: row.character_name || '',
    avatarUrl: row.avatar_url || '',
    sourceVideoUrl: row.source_video_url || undefined,
    status: row.status,
    errorMessage: row.error_message || undefined,
    createdAt: Number(row.created_at),
    updatedAt: Number(row.updated_at || row.created_at),
  }));
}

export async function deleteCharacterCard(id: string, userId: string): Promise<boolean> {
  await initializeDatabase();
  const db = getAdapter();

  const [result] = await db.execute(
    'DELETE FROM character_cards WHERE id = ? AND user_id = ?',
    [id, userId]
  );

  return (result as any).affectedRows > 0;
}
