import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getGeneration } from '@/lib/db';

export const dynamic = 'force-dynamic';

// 处理媒体 URL：
// - 视频：保持原始外部 URL（不代理）
// - 图片：base64/file 转换为代理 URL
function convertToMediaUrl(resultUrl: string | undefined, id: string, type: string): string {
  if (!resultUrl) return '';
  
  // 视频：保持原始 URL 不变
  if (type.includes('video')) {
    return resultUrl;
  }
  
  // 图片：需要通过代理访问
  // 1. base64 data URL
  // 2. 本地文件 (file:xxx.png)
  if (resultUrl.startsWith('data:') || resultUrl.startsWith('file:')) {
    return `/api/media/${id}`;
  }
  
  return resultUrl;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // 验证登录
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: '请先登录' }, { status: 401 });
    }

    const { id } = await params;
    const generation = await getGeneration(id);

    if (!generation) {
      return NextResponse.json({ error: '任务不存在' }, { status: 404 });
    }

    // 验证任务所有权
    if (generation.userId !== session.user.id) {
      return NextResponse.json({ error: '无权访问此任务' }, { status: 403 });
    }

    // 解析 params（可能是 JSON 字符串或对象）
    let generationParams: Record<string, unknown> | undefined;
    if (generation.params) {
      if (typeof generation.params === 'string') {
        try {
          generationParams = JSON.parse(generation.params);
        } catch {
          generationParams = undefined;
        }
      } else {
        generationParams = generation.params as Record<string, unknown>;
      }
    }

    return NextResponse.json({
      success: true,
      data: {
        id: generation.id,
        status: generation.status,
        type: generation.type,
        url: convertToMediaUrl(generation.resultUrl, generation.id, generation.type),
        cost: generation.cost,
        errorMessage: generation.errorMessage,
        params: generationParams,
        createdAt: generation.createdAt,
        updatedAt: generation.updatedAt,
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
