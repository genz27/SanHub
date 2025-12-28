import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getStatsOverview } from '@/lib/db-codes';

export async function GET(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || session.user.role !== 'admin') {
      return NextResponse.json({ error: '无权限' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const days = Math.min(Math.max(Number(searchParams.get('days')) || 30, 7), 90);

    const stats = await getStatsOverview(days);
    return NextResponse.json({ success: true, data: stats });
  } catch (error) {
    console.error('Get stats error:', error);
    return NextResponse.json({ error: '获取统计失败' }, { status: 500 });
  }
}
