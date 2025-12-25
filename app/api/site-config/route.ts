import { NextResponse } from 'next/server';
import { getSystemConfig } from '@/lib/db';
import { cache, CacheKeys } from '@/lib/cache';

// 禁用 Next.js 路由缓存，确保每次请求都获取最新数据
export const dynamic = 'force-dynamic';
export const revalidate = 0;

// GET /api/site-config - 获取网站配置（公开接口）
export async function GET() {
  try {
    // 清除缓存确保获取最新配置
    cache.delete(CacheKeys.SYSTEM_CONFIG);
    const config = await getSystemConfig();
    return NextResponse.json({
      success: true,
      data: config.siteConfig,
    });
  } catch (error) {
    console.error('Failed to get site config:', error);
    return NextResponse.json(
      { success: false, error: '获取配置失败' },
      { status: 500 }
    );
  }
}
