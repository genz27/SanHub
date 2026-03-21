import { NextResponse } from 'next/server';
import { getSystemConfig } from '@/lib/db';

export const dynamic = 'force-dynamic';

// GET /api/channels - 获取启用的渠道列表
export async function GET() {
  try {
    const config = await getSystemConfig();
    return NextResponse.json({
      success: true,
      data: config.channelEnabled,
    });
  } catch (error) {
    console.error('[Channels] Error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to get channels' },
      { status: 500 }
    );
  }
}
