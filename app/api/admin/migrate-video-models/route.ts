import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import {
  createVideoChannel,
  createVideoModel,
  getVideoChannels,
  initializeVideoChannelsTables,
  getSystemConfig,
} from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user || session.user.role !== 'admin') {
      return NextResponse.json({ error: '无权限' }, { status: 403 });
    }

    await initializeVideoChannelsTables();

    const existingChannels = await getVideoChannels();
    if (existingChannels.length > 0) {
      return NextResponse.json({
        success: false,
        error: '已存在渠道配置，请手动管理',
        channels: existingChannels.length,
      });
    }

    const config = await getSystemConfig();

    // 创建 Sora 渠道
    const soraChannel = await createVideoChannel({
      name: 'Sora',
      type: 'sora',
      baseUrl: config.soraBaseUrl || 'http://localhost:8000',
      apiKey: config.soraApiKey || '',
      enabled: true,
    });

    // 创建 Sora 视频模型
    await createVideoModel({
      channelId: soraChannel.id,
      name: 'Sora Video',
      description: 'OpenAI 视频生成',
      apiModel: 'sora-video',
      features: {
        textToVideo: true,
        imageToVideo: true,
        videoToVideo: false,
        supportStyles: true,
      },
      aspectRatios: [
        { value: 'landscape', label: '16:9' },
        { value: 'portrait', label: '9:16' },
      ],
      durations: [
        { value: '10s', label: '10 秒', cost: config.pricing.soraVideo10s || 100 },
        { value: '15s', label: '15 秒', cost: config.pricing.soraVideo15s || 150 },
        { value: '25s', label: '25 秒', cost: config.pricing.soraVideo25s || 200 },
      ],
      defaultAspectRatio: 'landscape',
      defaultDuration: '10s',
      highlight: true,
      enabled: true,
      sortOrder: 0,
    });

    return NextResponse.json({
      success: true,
      message: '迁移完成',
      channels: 1,
      models: 1,
    });
  } catch (error) {
    console.error('[API] Video migration error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '迁移失败' },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user || session.user.role !== 'admin') {
      return NextResponse.json({ error: '无权限' }, { status: 403 });
    }

    await initializeVideoChannelsTables();
    const channels = await getVideoChannels();

    return NextResponse.json({
      success: true,
      migrated: channels.length > 0,
      channels: channels.length,
    });
  } catch (error) {
    console.error('[API] Check video migration error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '检查失败' },
      { status: 500 }
    );
  }
}
