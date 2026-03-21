import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getUserInviteCode, createUserInviteCode } from '@/lib/db-codes';
import { getSystemConfig } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: '未登录' }, { status: 401 });
    }

    const config = await getSystemConfig();
    if (!config.inviteSettings.enabled) {
      return NextResponse.json({ code: null, enabled: false });
    }

    // Get or create user's invite code
    let code = await getUserInviteCode(session.user.id);
    if (!code) {
      code = await createUserInviteCode(session.user.id);
    }

    return NextResponse.json({ code, enabled: true });
  } catch (error) {
    console.error('Get user invite code error:', error);
    return NextResponse.json({ error: '获取邀请码失败' }, { status: 500 });
  }
}
