import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import {
  buildVideoStatusSnapshotForSite,
  getCachedSiteVideoStatus,
  setCachedSiteVideoStatus,
  startVideoStatusPoller,
} from '@/lib/status-poller';

export const dynamic = 'force-dynamic';

startVideoStatusPoller();

export async function GET() {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: '未登录' }, { status: 401 });
    }

    const cached = getCachedSiteVideoStatus();
    if (cached) {
      return NextResponse.json({ success: true, data: cached });
    }

    const snapshot = await buildVideoStatusSnapshotForSite();
    setCachedSiteVideoStatus(snapshot);

    return NextResponse.json({ success: true, data: snapshot });
  } catch (error) {
    console.error('[API] Failed to get site video status:', error);
    return NextResponse.json(
      { error: '获取状态失败' },
      { status: 500 }
    );
  }
}
