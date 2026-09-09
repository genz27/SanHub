import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';

export const dynamic = 'force-dynamic';

function loadImageCatalog(fields: string | null) {
  if (fields === 'badges') {
    return import('@/lib/db/image-catalog-badges').then((mod) => mod.getSafeImageModelBadges());
  }
  if (fields === 'workspace') {
    return import('@/lib/db/image-catalog-workspace').then((mod) => mod.getSafeImageModelsWorkspace());
  }
  return import('@/lib/db/image-catalog').then((mod) => mod.getSafeImageModels(true));
}

// GET - 获取可用的图像模型列表（不含敏感信息）
export async function GET(request: NextRequest) {
  try {
    const fields = request.nextUrl.searchParams.get('fields');
    const [session, models] = await Promise.all([
      getServerSession(authOptions),
      loadImageCatalog(fields),
    ]);
    if (!session?.user) {
      return NextResponse.json({ error: '请先登录' }, {
        status: 401,
        headers: { 'Cache-Control': 'no-store' },
      });
    }

    return NextResponse.json({
      success: true,
      data: {
        models,
      },
    }, {
      headers: { 'Cache-Control': 'private, max-age=60' },
    });
  } catch (error) {
    console.error('[API] Get safe image models error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '获取失败' },
      { status: 500, headers: { 'Cache-Control': 'no-store' } }
    );
  }
}
