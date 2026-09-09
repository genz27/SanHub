import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import {
  getPendingGenerations,
  getUserGenerations,
  type UserGenerationKindFilter,
  type UserGenerationStatusFilter,
} from '@/lib/db/generation-list-reads';
import type { Generation } from '@/types';
import { getDailyLimitConfig } from '@/lib/db/system-config-daily-limit';
import { getVideoProxyConfig } from '@/lib/db/system-config-video-proxy';
import { getUserDailyUsage, type DailyUsageKind } from '@/lib/db/usage';
import { withClientMediaUrl } from '@/lib/client-media-url';
import { rewriteOpenAIVideoUrl } from '@/lib/video-proxy-url';
import { checkRateLimit, RateLimitConfig } from '@/lib/rate-limit';

const HISTORY_KINDS = new Set<UserGenerationKindFilter>(['all', 'video', 'image']);
const HISTORY_STATUSES = new Set<UserGenerationStatusFilter>([
  'all',
  'active',
  'terminal',
  'feed',
  'pending',
  'processing',
  'completed',
  'failed',
  'cancelled',
]);

function parseHistoryKind(value: string | null): UserGenerationKindFilter {
  return value && HISTORY_KINDS.has(value as UserGenerationKindFilter)
    ? (value as UserGenerationKindFilter)
    : 'all';
}

function parseHistoryStatus(value: string | null): UserGenerationStatusFilter {
  return value && HISTORY_STATUSES.has(value as UserGenerationStatusFilter)
    ? (value as UserGenerationStatusFilter)
    : 'all';
}

export async function GET(request: NextRequest) {
  try {
    // 限流检查
    const rateLimit = checkRateLimit(request, RateLimitConfig.API, 'history');
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: '请求过于频繁，请稍后再试' },
        { status: 429, headers: rateLimit.headers }
      );
    }

    const searchParams = request.nextUrl.searchParams;
    const parsedPage = Number.parseInt(searchParams.get('page') || '1', 10);
    const parsedLimit = Number.parseInt(searchParams.get('limit') || '50', 10);
    const page = Math.max(Number.isFinite(parsedPage) ? parsedPage : 1, 1);
    const limit = Math.min(Math.max(Number.isFinite(parsedLimit) ? parsedLimit : 50, 1), 100);
    const offset = (page - 1) * limit;
    const kind = parseHistoryKind(searchParams.get('kind'));
    const status = parseHistoryStatus(searchParams.get('status'));
    const includePending = searchParams.get('includePending') === 'true';
    const includeUsage = searchParams.get('includeUsage') === 'true';
    const pendingKind = parseHistoryKind(searchParams.get('pendingKind') || searchParams.get('kind'));
    const usageKind: DailyUsageKind =
      kind === 'image' || kind === 'video' ? kind : 'all';
    const parsedPendingLimit = Number.parseInt(searchParams.get('pendingLimit') || '50', 10);
    const pendingLimit = Math.min(
      Math.max(Number.isFinite(parsedPendingLimit) ? parsedPendingLimit : 50, 1),
      200
    );
    const sessionPromise = getServerSession(authOptions);
    const configPromise = kind === 'image' ? Promise.resolve(null) : getVideoProxyConfig();
    const limitsPromise = includeUsage ? getDailyLimitConfig() : Promise.resolve(null);

    const session = await sessionPromise;
    if (!session?.user) {
      return NextResponse.json({ error: '请先登录' }, { status: 401 });
    }

    const [generations, config, pendingGenerations, usageBundle] = await Promise.all([
      getUserGenerations(session.user.id, limit, offset, {
        kind,
        status,
      }),
      configPromise,
      includePending
        ? getPendingGenerations(session.user.id, pendingLimit, { kind: pendingKind })
        : Promise.resolve(null),
      includeUsage
        ? Promise.all([
            getUserDailyUsage(session.user.id, usageKind),
            limitsPromise,
          ]).then(([usage, limits]) => ({ usage, limits }))
        : Promise.resolve(null),
    ]);

    const processedGenerations = generations.map((generation) => {
      const mapped = withClientMediaUrl(generation);
      if (!config) return mapped;
      const resultUrl = rewriteOpenAIVideoUrl(mapped.resultUrl, config);
      if (resultUrl === mapped.resultUrl) return mapped;
      return { ...mapped, resultUrl };
    });
    
    const pending = pendingGenerations?.map((task: Generation) => ({
      id: task.id,
      prompt: task.prompt,
      type: task.type,
      status: task.status,
      progress: typeof task.params?.progress === 'number' ? task.params.progress : 0,
      modelId: task.params?.modelId,
      model: task.params?.model,
      createdAt: task.createdAt,
      updatedAt: task.updatedAt,
    }));

    return NextResponse.json(
      {
        success: true,
        data: processedGenerations,
        ...(pending ? { pending } : {}),
        ...(usageBundle ? { usage: usageBundle.usage, limits: usageBundle.limits } : {}),
        page,
        limit,
        kind,
        status,
        hasMore: processedGenerations.length === limit,
      },
      { 
        headers: {
          ...rateLimit.headers,
          'Cache-Control': 'no-store, no-cache, must-revalidate',
          'Pragma': 'no-cache',
        }
      }
    );
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '获取历史记录失败' },
      { status: 500 }
    );
  }
}
