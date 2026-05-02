import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import {
  getUserGenerations,
  type UserGenerationKindFilter,
  type UserGenerationStatusFilter,
} from '@/lib/db';
import { checkRateLimit, RateLimitConfig } from '@/lib/rate-limit';
import type { Generation } from '@/types';

const HISTORY_KINDS = new Set<UserGenerationKindFilter>(['all', 'video', 'image']);
const HISTORY_STATUSES = new Set<UserGenerationStatusFilter>([
  'all',
  'active',
  'terminal',
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

function convertToMediaUrl(generation: Generation): Generation {
  const { resultUrl, type } = generation;
  
  if (!resultUrl) {
    return generation;
  }

  if (type.includes('video')) {
    return {
      ...generation,
      resultUrl: `/api/media/${generation.id}`,
    };
  }

  if (resultUrl.includes('/v1/videos/') && resultUrl.includes('/content')) {
    return {
      ...generation,
      resultUrl: `/api/media/${generation.id}`,
    };
  }

  if (resultUrl.startsWith('data:') || resultUrl.startsWith('file:')) {
    return {
      ...generation,
      resultUrl: `/api/media/${generation.id}`,
    };
  }

  return generation;
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

    const session = await getServerSession(authOptions);
    
    if (!session?.user) {
      return NextResponse.json({ error: '请先登录' }, { status: 401 });
    }

    // 支持分页
    const searchParams = request.nextUrl.searchParams;
    const parsedPage = Number.parseInt(searchParams.get('page') || '1', 10);
    const parsedLimit = Number.parseInt(searchParams.get('limit') || '50', 10);
    const page = Math.max(Number.isFinite(parsedPage) ? parsedPage : 1, 1);
    const limit = Math.min(Math.max(Number.isFinite(parsedLimit) ? parsedLimit : 50, 1), 100);
    const offset = (page - 1) * limit;
    const kind = parseHistoryKind(searchParams.get('kind'));
    const status = parseHistoryStatus(searchParams.get('status'));

    const generations = await getUserGenerations(session.user.id, limit, offset, {
      kind,
      status,
    });
    
    // 将 base64 URL 转换为媒体 API URL，大幅减小响应体积
    const processedGenerations = generations.map(convertToMediaUrl);
    
    return NextResponse.json(
      {
        success: true,
        data: processedGenerations,
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
