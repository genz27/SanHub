import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

/**
 * POST /api/sora/unwatermark
 * 获取 Sora 视频无水印下载链接
 * 
 * Body:
 * - permalink: string (Sora 分享链接，如 https://sora.chatgpt.com/p/s_xxx)
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json(
        { success: false, error: '未登录' },
        { status: 401 }
      );
    }

    const { permalink } = await request.json();

    if (!permalink || typeof permalink !== 'string') {
      return NextResponse.json(
        { success: false, error: '缺少 permalink 参数' },
        { status: 400 }
      );
    }

    // 获取 Sora 后台配置
    const { getSystemConfig } = await import('@/lib/db');
    const config = await getSystemConfig();
    const { soraBackendUrl, soraBackendToken } = config;

    if (!soraBackendUrl) {
      return NextResponse.json(
        { success: false, error: 'Sora 后台未配置' },
        { status: 500 }
      );
    }

    // 调用 Sora 后台 /get-sora-link 接口
    const backendUrl = `${soraBackendUrl.replace(/\/$/, '')}/get-sora-link`;
    
    const backendResponse = await fetch(backendUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        url: permalink,
        token: soraBackendToken || undefined,
      }),
    });

    const backendData = await backendResponse.json();

    if (!backendResponse.ok) {
      return NextResponse.json(
        { 
          success: false, 
          error: backendData.error || '获取无水印链接失败' 
        },
        { status: backendResponse.status }
      );
    }

    // 返回无水印下载链接
    return NextResponse.json({
      success: true,
      data: {
        download_link: backendData.download_link,
      },
    });

  } catch (error) {
    console.error('[Sora Unwatermark] Error:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: error instanceof Error ? error.message : '服务器错误' 
      },
      { status: 500 }
    );
  }
}
