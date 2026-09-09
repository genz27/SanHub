/* eslint-disable no-console */
import { NextRequest, NextResponse } from 'next/server';
import { getAnnouncementConfig } from '@/lib/db/system-config-announcement';

// 禁用缓存
export const dynamic = 'force-dynamic';
export const revalidate = 0;

// 获取公告（公开接口）
export async function GET(request: NextRequest) {
  try {
    const announcement = await getAnnouncementConfig();
    const since = Number(request.nextUrl.searchParams.get('since') || 0);

    if (
      !announcement ||
      !announcement.enabled ||
      !announcement.title ||
      (Number.isFinite(since) && since > 0 && announcement.updatedAt <= since)
    ) {
      return NextResponse.json(
        { success: true, data: null },
        { headers: { 'Cache-Control': 'private, max-age=60' } }
      );
    }

    return NextResponse.json(
      {
        success: true,
        data: {
          title: announcement.title,
          content: announcement.content,
          updatedAt: announcement.updatedAt,
        },
      },
      {
        headers: {
          'Cache-Control': 'private, max-age=60',
        },
      }
    );
  } catch (error) {
    console.error('获取公告失败:', error);
    return NextResponse.json(
      { success: false, error: '获取公告失败' },
      { status: 500, headers: { 'Cache-Control': 'no-store' } }
    );
  }
}
