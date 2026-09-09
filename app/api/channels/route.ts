import { NextResponse } from 'next/server';
import { getChannelEnabledConfig } from '@/lib/db/system-config-channels';

export const dynamic = 'force-dynamic';

// GET /api/channels - 获取启用的渠道列表
export async function GET() {
  try {
    const channelEnabled = await getChannelEnabledConfig();
    return NextResponse.json({
      success: true,
      data: channelEnabled,
    }, {
      headers: { 'Cache-Control': 'private, max-age=60' },
    });
  } catch (error) {
    console.error('[Channels] Error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to get channels' },
      { status: 500 }
    );
  }
}
