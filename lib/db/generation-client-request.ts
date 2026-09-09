import type { Generation } from '@/types';
import { getAdapter } from './connection';
import { ensureDatabase } from './ready';

const CLIENT_REQUEST_ID_LOOKUP_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
const CLIENT_REQUEST_HIT_MS = 15 * 60 * 1000;
const clientRequestIdLookups = new Map<
  string,
  Promise<Pick<Generation, 'id' | 'type' | 'status'> | null>
>();

async function loadGenerationByClientRequestId(
  userId: string,
  clientRequestId: string
): Promise<Pick<Generation, 'id' | 'type' | 'status'> | null> {
  await ensureDatabase();
  const db = getAdapter();

  const [rows] = await db.execute(
    `SELECT id, type, status
     FROM generations
     WHERE user_id = ?
       AND created_at >= ?
       AND type NOT LIKE ?
       AND type <> ?
       AND JSON_UNQUOTE(JSON_EXTRACT(params, '$.clientRequestId')) = ?
     ORDER BY created_at DESC
     LIMIT 1`,
    [userId, Date.now() - CLIENT_REQUEST_ID_LOOKUP_WINDOW_MS, '%video%', 'character-card', clientRequestId]
  );

  const gens = rows as any[];
  if (gens.length === 0) return null;

  return {
    id: gens[0].id,
    type: gens[0].type,
    status: gens[0].status || 'pending',
  };
}

export async function getGenerationByClientRequestId(
  userId: string,
  clientRequestId: string
): Promise<Pick<Generation, 'id' | 'type' | 'status'> | null> {
  const lookupKey = `${userId}:${clientRequestId}`;
  const pending = clientRequestIdLookups.get(lookupKey);
  if (pending) {
    return pending;
  }

  let lookup!: Promise<Pick<Generation, 'id' | 'type' | 'status'> | null>;
  lookup = loadGenerationByClientRequestId(userId, clientRequestId).then(
    (result) => {
      if (!result) {
        if (clientRequestIdLookups.get(lookupKey) === lookup) {
          clientRequestIdLookups.delete(lookupKey);
        }
        return null;
      }

      const timeout = setTimeout(() => {
        if (clientRequestIdLookups.get(lookupKey) === lookup) {
          clientRequestIdLookups.delete(lookupKey);
        }
      }, CLIENT_REQUEST_HIT_MS);
      timeout.unref?.();
      return result;
    },
    (error) => {
      if (clientRequestIdLookups.get(lookupKey) === lookup) {
        clientRequestIdLookups.delete(lookupKey);
      }
      throw error;
    }
  );

  clientRequestIdLookups.set(lookupKey, lookup);
  return lookup;
}
