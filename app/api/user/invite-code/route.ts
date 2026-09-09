import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getOrCreateUserInviteCode } from '@/lib/db/invite-code-user';
import { getPublicSystemConfig } from '@/lib/db/system-config-public';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const [session, config] = await Promise.all([
      getServerSession(authOptions),
      getPublicSystemConfig(),
    ]);
    if (!session?.user?.id) {
      return NextResponse.json({ error: '未登录' }, {
        status: 401,
        headers: { 'Cache-Control': 'no-store' },
      });
    }

    if (!config.inviteSettings.enabled) {
      return NextResponse.json(
        { code: null, enabled: false },
        { headers: { 'Cache-Control': 'private, max-age=60' } }
      );
    }

    const code = await getOrCreateUserInviteCode(
      session.user.id,
      config.inviteSettings.inviteeBonusPoints
    );

    return NextResponse.json(
      { code, enabled: true },
      { headers: { 'Cache-Control': 'private, max-age=60' } }
    );
  } catch (error) {
    console.error('Get user invite code error:', error);
    return NextResponse.json({ error: '获取邀请码失败' }, {
      status: 500,
      headers: { 'Cache-Control': 'no-store' },
    });
  }
}
