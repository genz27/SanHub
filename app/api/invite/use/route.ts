import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { applyInviteCode } from '@/lib/db-codes';
import { getSystemConfig } from '@/lib/db';

export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: '请先登录' }, { status: 401 });
    }

    const config = await getSystemConfig();
    if (!config.inviteSettings.enabled) {
      return NextResponse.json({ error: '邀请码功能未开启' }, { status: 403 });
    }

    const { code } = await request.json();
    if (!code || typeof code !== 'string') {
      return NextResponse.json({ error: '请输入邀请码' }, { status: 400 });
    }

    const result = await applyInviteCode(code.trim(), session.user.id);
    
    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    return NextResponse.json({ 
      success: true, 
      bonusPoints: result.bonusPoints,
      message: result.bonusPoints ? `使用成功，获得 ${result.bonusPoints} 积分奖励` : '使用成功'
    });
  } catch (error) {
    console.error('Use invite code error:', error);
    return NextResponse.json({ error: '使用失败' }, { status: 500 });
  }
}
