import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getSessionMessages } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return NextResponse.json({ error: '请先登录' }, { status: 401 });

    const messages = await getSessionMessages(params.id);

    return NextResponse.json({ success: true, data: messages });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : '获取消息失败' }, { status: 500 });
  }
}
