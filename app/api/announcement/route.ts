/* eslint-disable no-console */
import { NextResponse } from 'next/server';
import { getSystemConfig } from '@/lib/db';

// 禁用缓存
export const dynamic = 'force-dynamic';
export const revalidate = 0;

// 获取公告（公开接口）
export async function GET() {
  try {
    const config = await getSystemConfig();
    const { announcement } = config;

    console.log('[Announcement API] config:', JSON.stringify({ announcement }, null, 2));

    // 如果公告未启用或无标题，返回空
    if (!announcement || !announcement.enabled || !announcement.title) {
      console.log('[Announcement API] 返回 null，原因:', !announcement ? '无公告' : !announcement.enabled ? '未启用' : '无标题');
      return NextResponse.json({ success: true, data: null });
    }

    return NextResponse.json({
      success: true,
      data: {
        title: announcement.title,
        content: announcement.content,
        updatedAt: announcement.updatedAt,
      },
    });
  } catch (error) {
    console.error('获取公告失败:', error);
    return NextResponse.json(
      { success: false, error: '获取公告失败' },
      { status: 500 }
    );
  }
}
