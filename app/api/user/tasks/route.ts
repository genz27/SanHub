import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getPendingGenerations, type UserGenerationKindFilter } from '@/lib/db/generation-list-reads';
import type { Generation } from '@/types';

const TASK_KINDS = new Set<UserGenerationKindFilter>(['all', 'video', 'image']);

function parseTaskKind(value: string | null): UserGenerationKindFilter {
  return value && TASK_KINDS.has(value as UserGenerationKindFilter)
    ? (value as UserGenerationKindFilter)
    : 'all';
}

export const dynamic = 'force-dynamic';

// 获取用户正在进行的任务
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: '未登录' }, { status: 401 });
    }

    const searchParams = request.nextUrl.searchParams;
    const rawLimit = parseInt(searchParams.get('limit') || '50');
    const limit = Math.min(Math.max(Number.isFinite(rawLimit) ? rawLimit : 50, 1), 200);
    const kind = parseTaskKind(searchParams.get('kind'));
    const tasks = await getPendingGenerations(session.user.id, limit, { kind });

    return NextResponse.json({
      data: tasks.map((t: Generation) => ({
        id: t.id,
        prompt: t.prompt,
        type: t.type,
        status: t.status,
        progress: typeof t.params?.progress === 'number' ? t.params.progress : 0,
        modelId: t.params?.modelId,
        model: t.params?.model,
        createdAt: t.createdAt,
        updatedAt: t.updatedAt,
      })),
    });
  } catch (error) {
    console.error('[API] Failed to get pending tasks:', error);
    return NextResponse.json(
      { error: '获取任务失败' },
      { status: 500 }
    );
  }
}
