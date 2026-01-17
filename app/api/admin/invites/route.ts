import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { createInviteCode, getInviteCodes, getInviteCodesCount, deleteInviteCode } from '@/lib/db-codes';

export async function GET(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || session.user.role !== 'admin') {
      return NextResponse.json({ error: '无权限' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const page = Math.max(Number(searchParams.get('page')) || 1, 1);
    const limit = Math.min(Math.max(Number(searchParams.get('limit')) || 50, 1), 100);
    const offset = (page - 1) * limit;
    const showUsed = searchParams.get('showUsed') === 'true';

    const [codes, total] = await Promise.all([
      getInviteCodes({ limit, offset, showUsed }),
      getInviteCodesCount({ showUsed }),
    ]);

    return NextResponse.json({
      success: true,
      data: codes,
      page,
      total,
      hasMore: offset + codes.length < total,
    });
  } catch (error) {
    console.error('Get invite codes error:', error);
    return NextResponse.json({ error: '获取邀请码失败' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || session.user.role !== 'admin') {
      return NextResponse.json({ error: '无权限' }, { status: 403 });
    }

    const { bonusPoints = 0, creatorBonus = 0, expiresAt } = await request.json();

    const code = await createInviteCode(session.user.id, bonusPoints, creatorBonus, expiresAt);
    return NextResponse.json({ success: true, data: code });
  } catch (error) {
    console.error('Create invite code error:', error);
    return NextResponse.json({ error: '创建邀请码失败' }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || session.user.role !== 'admin') {
      return NextResponse.json({ error: '无权限' }, { status: 403 });
    }

    const { id } = await request.json();
    if (!id) {
      return NextResponse.json({ error: '缺少 ID' }, { status: 400 });
    }

    const success = await deleteInviteCode(id);
    return NextResponse.json({ success });
  } catch (error) {
    console.error('Delete invite code error:', error);
    return NextResponse.json({ error: '删除失败' }, { status: 500 });
  }
}
