import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { searchCharacters } from '@/lib/sora-api';
import { getSystemConfig } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    // 验证登录
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: '请先登录' }, { status: 401 });
    }

    const config = await getSystemConfig();
    if (!config.featureFlags.squareEnabled) {
      return NextResponse.json({ error: '广场功能未开启' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const username = searchParams.get('username') || '';
    const intent = (searchParams.get('intent') || 'users') as 'users' | 'cameo';
    const limit = parseInt(searchParams.get('limit') || '10');

    if (!username.trim()) {
      return NextResponse.json({ error: '请输入搜索关键词' }, { status: 400 });
    }

    const result = await searchCharacters({
      username: username.trim(),
      intent,
      limit,
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error('[API] Search error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '搜索失败' },
      { status: 500 }
    );
  }
}
