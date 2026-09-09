import { getAdapter } from './connection';
import { ensureDatabase } from './ready';
import { CacheKeys, CacheTTL, withCache } from '../cache';

export interface DailyUsageStats {
  imageCount: number;
  videoCount: number;
  characterCardCount: number;
}

export type DailyUsageKind = 'all' | 'image' | 'video' | 'character-card';

const EMPTY_USAGE: DailyUsageStats = {
  imageCount: 0,
  videoCount: 0,
  characterCardCount: 0,
};

const IMAGE_TYPES_SQL = "type IN ('sora-image', 'gemini-image', 'zimage-image', 'gitee-image')";

function todayStartMs(): number {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
}

export async function getUserDailyUsage(
  userId: string,
  kind: DailyUsageKind = 'all'
): Promise<DailyUsageStats> {
  const todayStart = todayStartMs();

  return withCache(
    `${CacheKeys.DAILY_USAGE}${userId}:${todayStart}:${kind}`,
    CacheTTL.DAILY_USAGE,
    async () => {
      await ensureDatabase();
      const db = getAdapter();

      if (kind === 'image') {
        const [rows] = await db.execute(
          `SELECT COUNT(1) AS image_count FROM generations
           WHERE user_id = ? AND created_at >= ? AND status != 'cancelled'
           AND ${IMAGE_TYPES_SQL}`,
          [userId, todayStart]
        );
        return {
          ...EMPTY_USAGE,
          imageCount: Number((rows as any[])[0]?.image_count || 0),
        };
      }

      if (kind === 'video') {
        const [rows] = await db.execute(
          `SELECT COUNT(1) AS video_count FROM generations
           WHERE user_id = ? AND created_at >= ? AND status != 'cancelled'
           AND type = 'sora-video'`,
          [userId, todayStart]
        );
        return {
          ...EMPTY_USAGE,
          videoCount: Number((rows as any[])[0]?.video_count || 0),
        };
      }

      if (kind === 'character-card') {
        const [rows] = await db.execute(
          `SELECT COUNT(1) AS count FROM character_cards
           WHERE user_id = ? AND created_at >= ? AND status != 'cancelled'`,
          [userId, todayStart]
        );
        return {
          ...EMPTY_USAGE,
          characterCardCount: Number((rows as any[])[0]?.count || 0),
        };
      }

      const [generationRows, cardRows] = await Promise.all([
        db.execute(
          `SELECT
             SUM(CASE WHEN ${IMAGE_TYPES_SQL} THEN 1 ELSE 0 END) AS image_count,
             SUM(CASE WHEN type = 'sora-video' THEN 1 ELSE 0 END) AS video_count
           FROM generations
           WHERE user_id = ? AND created_at >= ?
           AND status != 'cancelled'`,
          [userId, todayStart]
        ),
        db.execute(
          `SELECT COUNT(1) as count FROM character_cards
           WHERE user_id = ? AND created_at >= ?
           AND status != 'cancelled'`,
          [userId, todayStart]
        ),
      ]);

      const generation = (generationRows[0] as any[])[0] || {};
      return {
        imageCount: Number(generation.image_count || 0),
        videoCount: Number(generation.video_count || 0),
        characterCardCount: Number((cardRows[0] as any[])[0]?.count || 0),
      };
    }
  );
}
