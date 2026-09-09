import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getDailyLimitConfig } from '@/lib/db/system-config-daily-limit';
import { getUserDailyUsage, type DailyUsageKind } from '@/lib/db/usage';

export const dynamic = 'force-dynamic';

const USAGE_KINDS = new Set<DailyUsageKind>(['all', 'image', 'video', 'character-card']);

function parseUsageKind(value: string | null): DailyUsageKind {
  return value && USAGE_KINDS.has(value as DailyUsageKind)
    ? (value as DailyUsageKind)
    : 'all';
}

// GET /api/user/daily-usage - 获取用户今日使用量和限制
export async function GET(request: NextRequest) {
  try {
    const kind = parseUsageKind(request.nextUrl.searchParams.get('kind'));
    const sessionPromise = getServerSession(authOptions);
    const configPromise = getDailyLimitConfig();
    const session = await sessionPromise;
    if (!session?.user?.id) {
      return NextResponse.json(
        { success: false, error: '未登录' },
        { status: 401, headers: { 'Cache-Control': 'no-store' } }
      );
    }

    const [usage, config] = await Promise.all([
      getUserDailyUsage(session.user.id, kind),
      configPromise,
    ]);

    return NextResponse.json({
      success: true,
      data: {
        usage,
        limits: config,
      },
    }, {
      headers: { 'Cache-Control': 'private, max-age=15' },
    });
  } catch (error) {
    console.error('[DailyUsage] Error:', error);
    return NextResponse.json(
      { success: false, error: '获取使用量失败' },
      { status: 500, headers: { 'Cache-Control': 'no-store' } }
    );
  }
}
