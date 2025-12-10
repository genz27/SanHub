import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { initializeDatabase } from '@/lib/db';
import { createDatabaseAdapter } from '@/lib/db-adapter';

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    
    if (!session?.user) {
      return NextResponse.json({ error: '请先登录' }, { status: 401 });
    }

    await initializeDatabase();
    const db = createDatabaseAdapter();

    // 删除用户所有角色卡
    const [result] = await db.execute(
      'DELETE FROM character_cards WHERE user_id = ?',
      [session.user.id]
    );

    const deletedCount = (result as any).affectedRows || 0;

    return NextResponse.json({
      success: true,
      deletedCount,
    });
  } catch (error) {
    console.error('Delete all character cards error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '删除失败' },
      { status: 500 }
    );
  }
}
