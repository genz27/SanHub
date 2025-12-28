import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { redeemCode } from '@/lib/db-codes';

export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: '请先登录' }, { status: 401 });
    }

    const { code } = await request.json();
    if (!code || typeof code !== 'string') {
      return NextResponse.json({ error: '请输入卡密' }, { status: 400 });
    }

    const result = await redeemCode(code.trim(), session.user.id);
    
    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    return NextResponse.json({ 
      success: true, 
      points: result.points,
      message: `兑换成功，获得 ${result.points} 积分` 
    });
  } catch (error) {
    console.error('Redeem code error:', error);
    return NextResponse.json({ error: '兑换失败' }, { status: 500 });
  }
}
