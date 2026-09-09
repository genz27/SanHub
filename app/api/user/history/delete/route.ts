import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { deleteAllFailedGenerations, deleteAllUserGenerations, deleteGeneration, deleteGenerations } from '@/lib/db/generation-deletes';
import { checkRateLimit, RateLimitConfig } from '@/lib/rate-limit';

export async function POST(request: NextRequest) {
  try {
    // 限流检查
    const rateLimit = checkRateLimit(request, RateLimitConfig.API, 'history-delete');
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: '请求过于频繁，请稍后再试' },
        { status: 429, headers: rateLimit.headers }
      );
    }

    const [session, body] = await Promise.all([
      getServerSession(authOptions),
      request.json(),
    ]);
    
    if (!session?.user) {
      return NextResponse.json({ error: '请先登录' }, { status: 401 });
    }

    const { action, id, ids } = body;

    let deletedCount = 0;

    switch (action) {
      case 'single':
        // 删除单个
        if (!id) {
          return NextResponse.json({ error: '缺少 id 参数' }, { status: 400 });
        }
        const success = await deleteGeneration(id, session.user.id);
        deletedCount = success ? 1 : 0;
        break;

      case 'batch':
        // 批量删除
        if (!ids || !Array.isArray(ids) || ids.length === 0) {
          return NextResponse.json({ error: '缺少 ids 参数' }, { status: 400 });
        }
        if (ids.length > 100) {
          return NextResponse.json({ error: '一次最多删除 100 条' }, { status: 400 });
        }
        deletedCount = await deleteGenerations(ids, session.user.id);
        break;

      case 'all':
        // 清空所有
        deletedCount = await deleteAllUserGenerations(session.user.id);
        break;

      case 'all-errors':
        // 清空所有失败记录
        deletedCount = await deleteAllFailedGenerations(session.user.id);
        break;

      default:
        return NextResponse.json({ error: '无效的操作类型' }, { status: 400 });
    }

    return NextResponse.json(
      { success: true, deletedCount },
      { headers: rateLimit.headers }
    );
  } catch (error) {
    console.error('Delete history error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '删除失败' },
      { status: 500 }
    );
  }
}
