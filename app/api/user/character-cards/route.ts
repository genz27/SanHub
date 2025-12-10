import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getUserCharacterCards, getPendingCharacterCards } from '@/lib/db';

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    
    if (!session?.user) {
      return NextResponse.json({ error: '请先登录' }, { status: 401 });
    }

    // 支持分页
    const searchParams = request.nextUrl.searchParams;
    const page = parseInt(searchParams.get('page') || '1');
    const limit = Math.min(parseInt(searchParams.get('limit') || '50'), 100);
    const offset = (page - 1) * limit;
    const pendingOnly = searchParams.get('pending') === 'true';

    let cards;
    if (pendingOnly) {
      cards = await getPendingCharacterCards(session.user.id);
    } else {
      cards = await getUserCharacterCards(session.user.id, limit, offset);
    }
    
    return NextResponse.json({
      success: true,
      data: cards,
      page,
      limit,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '获取角色卡失败' },
      { status: 500 }
    );
  }
}
