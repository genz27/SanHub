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

const SITE_STATUS_MAX_AGE_MS = 5_000;

export async function GET() {
  try {
    startVideoStatusPoller();
    const sessionPromise = getServerSession(authOptions);
    const now = Date.now();
    const cached = getCachedSiteVideoStatus();

    if (cached && now - cached.updatedAt < SITE_STATUS_MAX_AGE_MS) {
      const session = await sessionPromise;
      if (!session?.user?.id) {
        return NextResponse.json({ error: '未登录' }, { status: 401 });
      }
      return NextResponse.json({ success: true, data: cached });
    }

    const [session, snapshot] = await Promise.all([
      sessionPromise,
      buildVideoStatusSnapshotForSite(),
    ]);
    if (!session?.user?.id) {
      return NextResponse.json({ error: '未登录' }, { status: 401 });
    }

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
