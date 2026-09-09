import type { CharacterCard } from '@/types';
import { getAdapter } from './connection';
import { ensureDatabase } from './ready';

export async function getCharacterCard(id: string): Promise<CharacterCard | null> {
  await ensureDatabase();
  const db = getAdapter();

  const [rows] = await db.execute(
    `SELECT id, user_id, character_name, avatar_url, source_video_url, status, error_message, created_at, updated_at
     FROM character_cards WHERE id = ?`,
    [id]
  );
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
