import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import {
  getPendingCharacterCardStatuses,
  getPendingCharacterCards,
  getUserCharacterCards,
} from '@/lib/db/character-card-reads';
import { getDailyLimitConfig } from '@/lib/db/system-config-daily-limit';
import { getUserDailyUsage } from '@/lib/db/usage';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const includeUsage = searchParams.get('includeUsage') === 'true';
    const sessionPromise = getServerSession(authOptions);
    const limitsPromise = includeUsage ? getDailyLimitConfig() : Promise.resolve(null);
    const session = await sessionPromise;
    if (!session?.user) {
      return NextResponse.json({ error: '请先登录' }, {
        status: 401,
        headers: { 'Cache-Control': 'no-store' },
      });
    }

    const rawPage = parseInt(searchParams.get('page') || '1');
    const page = Math.max(Number.isFinite(rawPage) ? rawPage : 1, 1);
    const rawLimit = parseInt(searchParams.get('limit') || '50');
    const limit = Math.min(Math.max(Number.isFinite(rawLimit) ? rawLimit : 50, 1), 100);
    const offset = (page - 1) * limit;
    const pendingOnly = searchParams.get('pending') === 'true';
    const includePending = searchParams.get('includePending') === 'true';
    const usagePromise = includeUsage
      ? Promise.all([
          getUserDailyUsage(session.user.id, 'character-card'),
          limitsPromise,
        ]).then(([usage, limits]) => ({ usage, limits }))
      : Promise.resolve(null);
    const statusParam = searchParams.get('status');
    const status =
      statusParam === 'completed' || statusParam === 'pending' || statusParam === 'processing'
        ? statusParam
        : undefined;

    if (pendingOnly) {
      const statusesOnly = searchParams.get('fields') === 'status';
      const [cards, usageBundle] = await Promise.all([
        statusesOnly
          ? getPendingCharacterCardStatuses(session.user.id, limit)
          : getPendingCharacterCards(session.user.id, limit),
        usagePromise,
      ]);
      return NextResponse.json({
        success: true,
        data: cards,
        ...(usageBundle ? { usage: usageBundle.usage, limits: usageBundle.limits } : {}),
        page,
        limit,
      }, {
        // Align with pending character-card caches (CacheTTL.PENDING_GENERATIONS = 3).
        headers: { 'Cache-Control': 'private, max-age=3' },
      });
    }

    if (includePending) {
      const [completed, pending, usageBundle] = await Promise.all([
        getUserCharacterCards(session.user.id, limit, offset, {
          status: status || 'completed',
        }),
        getPendingCharacterCards(session.user.id, limit),
        usagePromise,
      ]);
      return NextResponse.json({
        success: true,
        data: completed,
        pending,
        ...(usageBundle ? { usage: usageBundle.usage, limits: usageBundle.limits } : {}),
        page,
        limit,
      }, {
        headers: { 'Cache-Control': 'no-store' },
      });
    }

    const picker = searchParams.get('fields') === 'picker';
    const [cards, usageBundle] = await Promise.all([
      getUserCharacterCards(session.user.id, limit, offset, { status, picker }),
      usagePromise,
    ]);
    const isLiveList = status === 'pending' || status === 'processing';

    return NextResponse.json({
      success: true,
      data: cards,
      ...(usageBundle ? { usage: usageBundle.usage, limits: usageBundle.limits } : {}),
      page,
      limit,
    }, {
      headers: {
        'Cache-Control': includeUsage || isLiveList || !status ? 'no-store' : 'private, max-age=15',
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '获取角色卡失败' },
      { status: 500, headers: { 'Cache-Control': 'no-store' } }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const [session, body] = await Promise.all([
      getServerSession(authOptions),
      request.json().catch(() => ({})),
    ]);
    if (!session?.user) {
      return NextResponse.json({ error: '请先登录' }, { status: 401 });
    }

    const { cardId } = body as { cardId?: string };
    
    if (!cardId) {
      return NextResponse.json({ error: '缺少卡片 ID' }, { status: 400 });
    }

    const { deleteCharacterCard } = await import('@/lib/db/character-card-writes');
    const deleted = await deleteCharacterCard(cardId, session.user.id);
    
    if (!deleted) {
      return NextResponse.json({ error: '删除失败或无权限' }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '删除失败' },
      { status: 500 }
    );
  }
}
