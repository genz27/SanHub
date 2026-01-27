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

    // 获取 Sora 后台配置和视频渠道配置
    const { getSystemConfig, getVideoChannels } = await import('@/lib/db');
    const config = await getSystemConfig();
    const { soraBackendUrl } = config;

    if (!soraBackendUrl) {
      return NextResponse.json(
        { success: false, error: 'Sora 后台 URL 未配置' },
        { status: 500 }
      );
    }
    
    // 从 Sora 视频渠道获取 API Key 作为 token
    const channels = await getVideoChannels(true);
    const soraChannel = channels.find(c => c.type === 'sora');
    
    if (!soraChannel?.apiKey) {
      return NextResponse.json(
        { success: false, error: 'Sora 视频渠道未配置或缺少 API Key，请在管理后台「视频渠道」中配置' },
        { status: 500 }
      );
    }
    
    const soraBackendToken = soraChannel.apiKey;

    // 调用 Sora 后台 /get-sora-link 接口
    const backendUrl = `${soraBackendUrl.replace(/\/$/, '')}/get-sora-link`;
    
    console.log('[Sora Unwatermark] Request:', { backendUrl, permalink, hasToken: !!soraBackendToken });
    
    const backendResponse = await fetch(backendUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        url: permalink,
        token: soraBackendToken,
      }),
    });

    const backendData = await backendResponse.json();
    
    // 调试日志：查看后端返回的完整数据
    console.log('[Sora Unwatermark] Backend response:', JSON.stringify(backendData, null, 2));

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
