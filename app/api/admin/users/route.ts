import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getAllUsers, getUsersCount } from '@/lib/db';

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    
    // admin 和 moderator 都可以访问用户列表
    if (!session?.user || (session.user.role !== 'admin' && session.user.role !== 'moderator')) {
      return NextResponse.json({ error: '无权限' }, { status: 403 });
    }

    const searchParams = request.nextUrl.searchParams;
    const rawPage = parseInt(searchParams.get('page') || '1');
    const page = Math.max(Number.isFinite(rawPage) ? rawPage : 1, 1);
    const rawLimit = parseInt(searchParams.get('limit') || '50');
    const limit = Math.min(Math.max(Number.isFinite(rawLimit) ? rawLimit : 50, 1), 200);
    const search = searchParams.get('q')?.trim() || undefined;
    const offset = (page - 1) * limit;

    const [users, total] = await Promise.all([
      getAllUsers({ limit, offset, search }),
      getUsersCount(search),
    ]);

    const hasMore = offset + users.length < total;

    return NextResponse.json({
      success: true,
      data: users,
      page,
      limit,
      total,
      hasMore,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '获取用户列表失败' },
      { status: 500 }
    );
  }
}
