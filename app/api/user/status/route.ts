import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import {
  buildVideoStatusSnapshotForUser,
  getCachedVideoStatus,
  setCachedVideoStatus,
  startVideoStatusPoller,
} from '@/lib/status-poller';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: '未登录' }, { status: 401 });
    }

    startVideoStatusPoller();

    const cached = getCachedVideoStatus(session.user.id);
    if (cached) {
      return NextResponse.json({ success: true, data: cached });
    }

    const snapshot = await buildVideoStatusSnapshotForUser(session.user.id);
    setCachedVideoStatus(session.user.id, snapshot);

    return NextResponse.json({ success: true, data: snapshot });
  } catch (error) {
    console.error('[API] Failed to get status snapshot:', error);
    return NextResponse.json(
      { error: '获取状态失败' },
      { status: 500 }
    );
  }
}
