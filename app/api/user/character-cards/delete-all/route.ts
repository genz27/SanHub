import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { deleteAllUserCharacterCards } from '@/lib/db/character-card-writes';

export async function POST(_request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user) {
      return NextResponse.json({ error: '请先登录' }, { status: 401 });
    }

    const deletedCount = await deleteAllUserCharacterCards(session.user.id);

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
