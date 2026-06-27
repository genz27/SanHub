import { getAdapter } from './connection';
import { initializeDatabase } from './schema';

// 获取用户今日使用量统计
export interface DailyUsageStats {
  imageCount: number;
  videoCount: number;
  characterCardCount: number;
}

export async function getUserDailyUsage(userId: string): Promise<DailyUsageStats> {
  await initializeDatabase();
  const db = getAdapter();

  // 获取今天 0 点的时间戳
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();

  // 统计今日图像生成数量（包括 pending/processing/completed）
  const [imageRows] = await db.execute(
    `SELECT COUNT(1) as count FROM generations
     WHERE user_id = ? AND created_at >= ?
     AND type IN ('sora-image', 'gemini-image', 'zimage-image', 'gitee-image')
     AND status != 'cancelled'`,
    [userId, todayStart]
  );
  const imageCount = Number((imageRows as any[])[0]?.count || 0);

  // 统计今日视频生成数量
  const [videoRows] = await db.execute(
    `SELECT COUNT(1) as count FROM generations
     WHERE user_id = ? AND created_at >= ?
     AND type = 'sora-video'
     AND status != 'cancelled'`,
    [userId, todayStart]
  );
  const videoCount = Number((videoRows as any[])[0]?.count || 0);

  // 统计今日角色卡生成数量
  const [cardRows] = await db.execute(
    `SELECT COUNT(1) as count FROM character_cards
     WHERE user_id = ? AND created_at >= ?
     AND status != 'cancelled'`,
    [userId, todayStart]
  );
  const characterCardCount = Number((cardRows as any[])[0]?.count || 0);

  return { imageCount, videoCount, characterCardCount };
}
