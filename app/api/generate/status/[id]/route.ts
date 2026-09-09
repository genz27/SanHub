import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getGenerationStatus } from '@/lib/db/generation-lookup-reads';
import { toClientMediaUrl } from '@/lib/client-media-url';
import { isOpenAIHostedVideoUrl, rewriteOpenAIVideoUrl } from '@/lib/video-proxy-url';

export const dynamic = 'force-dynamic';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const sessionPromise = getServerSession(authOptions);
    const { id } = await params;
    const [session, generation] = await Promise.all([
      sessionPromise,
      getGenerationStatus(id),
    ]);
    if (!session?.user) {
      return NextResponse.json({ error: '请先登录' }, { status: 401 });
    }

    if (!generation) {
      return NextResponse.json({ error: '任务不存在' }, { status: 404 });
    }

    if (generation.userId !== session.user.id) {
      return NextResponse.json({ error: '无权访问此任务' }, { status: 403 });
    }

    const isCompleted = generation.status === 'completed';
    const isFailed = generation.status === 'failed' || generation.status === 'cancelled';

    let url = '';
    if (isCompleted) {
      const mappedUrl = toClientMediaUrl(generation.resultUrl, generation.id, generation.type);
      if (isOpenAIHostedVideoUrl(mappedUrl)) {
        const { getVideoProxyConfig } = await import('@/lib/db/system-config-video-proxy');
        url = rewriteOpenAIVideoUrl(mappedUrl, await getVideoProxyConfig());
      } else {
        url = mappedUrl;
      }
    }

    return NextResponse.json({
      success: true,
      data: {
        id: generation.id,
        status: generation.status,
        type: generation.type,
        ...(isCompleted
          ? {
              url,
              cost: generation.cost,
              createdAt: generation.createdAt,
              updatedAt: generation.updatedAt,
            }
          : isFailed
            ? { errorMessage: generation.errorMessage }
            : {
                url: '',
                progress: generation.params?.progress ?? 0,
              }),
      },
    });
  } catch (error) {
    console.error('[API] Get generation status error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '查询失败' },
      { status: 500 }
    );
  }
}
