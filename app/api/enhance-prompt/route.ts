import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';

export async function POST(request: NextRequest) {
  try {
    const soraApiPromise = import('@/lib/sora-enhance');
    const [session, body] = await Promise.all([
      getServerSession(authOptions),
      request.json(),
    ]);
    if (!session?.user) {
      return NextResponse.json({ error: '未登录' }, { status: 401 });
    }

    const { prompt, expansion_level, duration_s } = body;

    if (!prompt || typeof prompt !== 'string' || !prompt.trim()) {
      return NextResponse.json({ error: '请输入提示词' }, { status: 400 });
    }

    const { enhancePrompt } = await soraApiPromise;
    const result = await enhancePrompt({
      prompt: prompt.trim(),
      expansion_level: expansion_level || 'medium',
      duration_s: duration_s,
    });

    return NextResponse.json({
      success: true,
      data: {
        enhanced_prompt: result.enhanced_prompt,
      },
    });
  } catch (error) {
    console.error('[API] 提示词增强失败:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '提示词增强失败' },
      { status: 500 }
    );
  }
}
