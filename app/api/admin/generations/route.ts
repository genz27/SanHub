import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getAllGenerations, adminDeleteGeneration } from '@/lib/db-codes';

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

    const userId = searchParams.get('userId') || undefined;
    const type = searchParams.get('type') || undefined;
    const status = searchParams.get('status') || undefined;

    const { generations, total } = await getAllGenerations({ limit, offset, userId, type, status });

    return NextResponse.json({
      success: true,
      data: generations,
      total,
      page,
      hasMore: offset + generations.length < total,
    });
  } catch (error) {
    console.error('Get generations error:', error);
    return NextResponse.json({ error: '获取记录失败' }, { status: 500 });
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

    const success = await adminDeleteGeneration(id);
    return NextResponse.json({ success });
  } catch (error) {
    console.error('Delete generation error:', error);
    return NextResponse.json({ error: '删除失败' }, { status: 500 });
  }
}
