import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getChatSession, deleteChatSession } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return NextResponse.json({ error: '请先登录' }, { status: 401 });

    // Verify ownership
    const chatSession = await getChatSession(params.id);
    if (!chatSession) return NextResponse.json({ error: '会话不存在' }, { status: 404 });
    if (chatSession.userId !== session.user.id) return NextResponse.json({ error: '无权限' }, { status: 403 });

    await deleteChatSession(params.id);
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : '删除失败' }, { status: 500 });
  }
}
