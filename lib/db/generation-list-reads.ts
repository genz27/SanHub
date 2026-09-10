import type { Generation } from '@/types';
import { getAdapter } from './connection';
import { generationListColumns, mapGenerationListRow } from './generation-row';
import { ensureDatabase } from './ready';
import { CacheKeys, CacheTTL, withCache } from '../cache';

export type UserGenerationKindFilter = 'all' | 'video' | 'image';
export type UserGenerationStatusFilter =
  | 'all'
  | 'active'
  | 'terminal'
  | 'feed'
  | 'pending'
  | 'processing'
  | 'completed'
  | 'failed'
  | 'cancelled';

export interface GetUserGenerationsOptions {
  kind?: UserGenerationKindFilter;
  status?: UserGenerationStatusFilter;
}

function appendGenerationKindFilter(
  kind: UserGenerationKindFilter | undefined,
  whereClauses: string[],
  values: any[]
): void {
  if (kind === 'video') {
    whereClauses.push('type LIKE ?');
    values.push('%video%');
  } else if (kind === 'image') {
    whereClauses.push('type NOT LIKE ?');
    whereClauses.push('type <> ?');
    whereClauses.push('type <> ?');
    values.push('%video%', 'character-card', 'extract-prompt');
  }
}

const CACHEABLE_GENERATION_STATUSES = new Set<UserGenerationStatusFilter>([
  'completed',
  'terminal',
  'feed',
  'failed',
  'cancelled',
]);

function isSettledGenerationList(status?: UserGenerationStatusFilter): boolean {
  return status === 'completed' || status === 'terminal' || status === 'feed';
}

async function loadUserGenerations(
  userId: string,
  safeLimit: number,
  safeOffset: number,
  options: GetUserGenerationsOptions
): Promise<Generation[]> {
  await ensureDatabase();
  const db = getAdapter();
  const whereClauses = ['user_id = ?'];
  const values: any[] = [userId];

  appendGenerationKindFilter(options.kind, whereClauses, values);

  switch (options.status) {
    case 'active':
      whereClauses.push("status IN ('pending', 'processing')");
      break;
    case 'terminal':
      whereClauses.push("(status IN ('completed', 'failed', 'cancelled') OR status IS NULL)");
      break;
    case 'feed':
      whereClauses.push("(status IN ('completed', 'failed') OR status IS NULL)");
      break;
    case 'completed':
      whereClauses.push("(status = 'completed' OR status IS NULL)");
      break;
    case 'pending':
    case 'processing':
    case 'failed':
    case 'cancelled':
      whereClauses.push('status = ?');
      values.push(options.status);
      break;
    case 'all':
    default:
      break;
  }

  const [rows] = await db.execute(
    `SELECT ${generationListColumns(
      options.status !== 'completed',
      !isSettledGenerationList(options.status),
      options.kind !== 'image',
      !isSettledGenerationList(options.status)
    )} FROM generations WHERE ${whereClauses.join(' AND ')} ORDER BY created_at DESC LIMIT ${safeLimit} OFFSET ${safeOffset}`,
    values
  );

  return (rows as any[]).map((row) => mapGenerationListRow(row, userId));
}

export async function getUserGenerations(
  userId: string,
  limit = 50,
  offset = 0,
  options: GetUserGenerationsOptions = {}
): Promise<Generation[]> {
  const safeLimit = Math.max(Number(limit) || 50, 1);
  const safeOffset = Math.max(Number(offset) || 0, 0);
  const kind = options.kind || 'all';
  const status = options.status || 'all';

  if (!CACHEABLE_GENERATION_STATUSES.has(status)) {
    return loadUserGenerations(userId, safeLimit, safeOffset, options);
  }

  return withCache(
    `${CacheKeys.USER_GENERATIONS}${userId}:${kind}:${status}:${safeLimit}:${safeOffset}`,
    CacheTTL.USER_GENERATIONS,
    () => loadUserGenerations(userId, safeLimit, safeOffset, options)
  );
}

export async function getPendingGenerations(
  userId: string,
  limit = 50,
  options: Pick<GetUserGenerationsOptions, 'kind'> = {}
): Promise<Generation[]> {
  const safeLimit = Math.max(Number(limit) || 50, 1);
  const kind = options.kind || 'all';

  return withCache(
    `${CacheKeys.PENDING_GENERATIONS}${userId}:${kind}:${safeLimit}`,
    CacheTTL.PENDING_GENERATIONS,
    async () => {
      await ensureDatabase();
      const db = getAdapter();
      const whereClauses = ["user_id = ?", "status IN ('pending', 'processing')"];
      const values: any[] = [userId];

      appendGenerationKindFilter(options.kind, whereClauses, values);

      const [rows] = await db.execute(
        `SELECT
           id, type, prompt, status, created_at,
           JSON_UNQUOTE(JSON_EXTRACT(params, '$.modelId')) AS param_model_id,
           JSON_UNQUOTE(JSON_EXTRACT(params, '$.model')) AS param_model,
           JSON_EXTRACT(params, '$.progress') AS param_progress
         FROM generations WHERE ${whereClauses.join(' AND ')} ORDER BY created_at DESC LIMIT ${safeLimit}`,
        values
      );

      return (rows as any[]).map((row) => {
        const progressRaw = row.param_progress;
        const progress = progressRaw === null || progressRaw === undefined ? undefined : Number(progressRaw);
        return {
          id: row.id,
          userId,
          type: row.type,
          prompt: row.prompt || '',
          params: {
            modelId: row.param_model_id || undefined,
            model: row.param_model || undefined,
            ...(Number.isFinite(progress) ? { progress } : {}),
          },
          resultUrl: '',
          cost: 0,
          status: row.status || 'pending',
          createdAt: Number(row.created_at),
          updatedAt: Number(row.created_at),
        };
      });
    }
  );
}
