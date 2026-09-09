import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const sessionPromise = getServerSession(authOptions);
    const searchParams = request.nextUrl.searchParams;
    const search = searchParams.get('search') || undefined;
    const sort = (searchParams.get('sort') || 'updated') as 'updated' | 'created';
    const order = (searchParams.get('order') || 'desc') as 'asc' | 'desc';
    const rawLimit = parseInt(searchParams.get('limit') || '200', 10);
    const limit = Math.min(Math.max(Number.isFinite(rawLimit) ? rawLimit : 200, 1), 200);
    const rawOffset = parseInt(searchParams.get('offset') || '0', 10);
    const offset = Math.max(Number.isFinite(rawOffset) ? rawOffset : 0, 0);

    const session = await sessionPromise;
    if (!session?.user) {
      return NextResponse.json({ error: '请先登录' }, { status: 401 });
    }

    const { getWorkspaceSummaries } = await import('@/lib/db/workspaces-list');
    const workspaces = await getWorkspaceSummaries(session.user.id, {
      search,
      sort,
      order,
      limit,
      offset,
    });

    return NextResponse.json({ success: true, data: workspaces });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '获取工作空间失败' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const [session, body] = await Promise.all([
      getServerSession(authOptions),
      request.json().catch(() => ({})),
    ]);
    if (!session?.user) {
      return NextResponse.json({ error: '请先登录' }, { status: 401 });
    }
    const name = typeof body.name === 'string' && body.name.trim() ? body.name.trim() : '未命名工作空间';
    const data = body.data;

    const { createWorkspace } = await import('@/lib/db/workspaces-writes');
    const workspace = await createWorkspace(session.user.id, name, data);

    return NextResponse.json({ success: true, data: workspace });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '创建工作空间失败' },
      { status: 500 }
    );
  }
}
