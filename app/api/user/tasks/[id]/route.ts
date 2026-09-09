import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getGenerationCancelTarget } from '@/lib/db/generation-lookup-reads';
import { refundGenerationBalance, updateGeneration } from '@/lib/db/generation-mutations';

// 取消任务
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const [session, generation] = await Promise.all([
      getServerSession(authOptions),
      getGenerationCancelTarget(params.id),
    ]);

    if (!session?.user?.id) {
      return NextResponse.json({ error: '未登录' }, { status: 401 });
    }

    if (!generation) {
      return NextResponse.json({ error: '任务不存在' }, { status: 404 });
    }

    // 验证任务所有权
    if (generation.userId !== session.user.id) {
      return NextResponse.json({ error: '无权操作此任务' }, { status: 403 });
    }

    // 只能取消 pending 或 processing 状态的任务
    if (generation.status !== 'pending' && generation.status !== 'processing') {
      return NextResponse.json(
        { error: '只能取消进行中的任务' },
        { status: 400 }
      );
    }

    // 更新任务状态为已取消
    await updateGeneration(params.id, {
      status: 'cancelled',
    }, generation.userId);

    try {
      await refundGenerationBalance(generation.id, generation.userId, generation.cost);
    } catch (refundErr) {
      console.error('[API] Failed to refund balance:', refundErr);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[API] Failed to cancel task:', error);
    return NextResponse.json(
      { error: '取消任务失败' },
      { status: 500 }
    );
  }
}
