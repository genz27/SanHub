import { NextResponse } from 'next/server';
import { getSystemConfig } from '@/lib/db';

// GET /api/site-config - 获取网站配置（公开接口）
export async function GET() {
  try {
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
