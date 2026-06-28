import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getUserChatSessions, getSessionMessages } from '@/lib/db';

export const dynamic = 'force-dynamic';

// GET /api/agents/sessions?agentId=xxx — list sessions for an agent
export async function GET(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: '请先登录' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const agentId = searchParams.get('agentId') || '';

    // Get all user's chat sessions and filter by agent prefix
    const allSessions = await getUserChatSessions(session.user.id);

    const agentSessions = allSessions.filter(s =>
      s.title.startsWith(`Agent:${agentId}:`) ||
      s.title.startsWith(`Agent:`)
    );

    return NextResponse.json({ success: true, data: agentSessions });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '获取会话失败' },
      { status: 500 }
    );
  }
}
