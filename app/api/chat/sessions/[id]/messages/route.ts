import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getOwnedSessionMessages } from '@/lib/db/chat-session-reads';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return NextResponse.json({ error: '请先登录' }, { status: 401 });

    const messages = await getOwnedSessionMessages(params.id, session.user.id, 100);
    if (!messages) {
      return NextResponse.json({ error: '会话不存在' }, { status: 404 });
    }

    return NextResponse.json({ success: true, data: messages });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : '获取消息失败' }, { status: 500 });
  }
}
