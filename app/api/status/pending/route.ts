import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getPendingGenerationsCount } from '@/lib/db/generation-lookup-reads';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const [session, count] = await Promise.all([
      getServerSession(authOptions),
      getPendingGenerationsCount(),
    ]);

    if (!session?.user?.id) {
      return NextResponse.json({ error: '未登录' }, {
        status: 401,
        headers: { 'Cache-Control': 'no-store' },
      });
    }

    return NextResponse.json(
      { success: true, data: { count } },
      { headers: { 'Cache-Control': 'private, max-age=15' } }
    );
  } catch (error) {
    console.error('[API] Failed to get pending count:', error);
    return NextResponse.json(
      { error: '获取任务失败' },
      { status: 500, headers: { 'Cache-Control': 'no-store' } }
    );
  }
}
