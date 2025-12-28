import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { 
  createRedemptionCodes, 
  getRedemptionCodes, 
  getRedemptionCodesCount,
  deleteRedemptionCode,
  deleteRedemptionCodesByBatch 
} from '@/lib/db-codes';

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
    const batchId = searchParams.get('batchId') || undefined;
    const showUsed = searchParams.get('showUsed') === 'true';

    const codes = await getRedemptionCodes({ limit, offset, batchId, showUsed });
    const total = await getRedemptionCodesCount({ batchId, showUsed });

    return NextResponse.json({
      success: true,
      data: codes,
      total,
      page,
      hasMore: offset + codes.length < total,
    });
  } catch (error) {
    console.error('Get redemption codes error:', error);
    return NextResponse.json({ error: '获取卡密失败' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || session.user.role !== 'admin') {
      return NextResponse.json({ error: '无权限' }, { status: 403 });
    }

    const { count, points, expiresAt, note } = await request.json();

    if (!count || count < 1 || count > 100) {
      return NextResponse.json({ error: '数量必须在 1-100 之间' }, { status: 400 });
    }
    if (!points || points < 1) {
      return NextResponse.json({ error: '积分必须大于 0' }, { status: 400 });
    }

    const codes = await createRedemptionCodes(count, points, { expiresAt, note });
    return NextResponse.json({ success: true, data: codes });
  } catch (error) {
    console.error('Create redemption codes error:', error);
    return NextResponse.json({ error: '创建卡密失败' }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || session.user.role !== 'admin') {
      return NextResponse.json({ error: '无权限' }, { status: 403 });
    }

    const { id, batchId } = await request.json();

    if (batchId) {
      const count = await deleteRedemptionCodesByBatch(batchId);
      return NextResponse.json({ success: true, deleted: count });
    }

    if (id) {
      const success = await deleteRedemptionCode(id);
      return NextResponse.json({ success });
    }

    return NextResponse.json({ error: '缺少参数' }, { status: 400 });
  } catch (error) {
    console.error('Delete redemption code error:', error);
    return NextResponse.json({ error: '删除失败' }, { status: 500 });
  }
}
