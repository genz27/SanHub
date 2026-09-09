import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getUserGenerations } from '@/lib/db/generation-list-reads';
import { getUserById } from '@/lib/db/user-session';
import { getUserAdminRecord } from '@/lib/db/users';
import { updateUser } from '@/lib/db/user-writes';

// 检查是否有管理权限（admin 或 moderator）
function hasAdminAccess(role: string): boolean {
  return role === 'admin' || role === 'moderator';
}

// 获取用户详情和生成记录
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user || !hasAdminAccess(session.user.role)) {
      return NextResponse.json({ error: '无权限' }, { status: 403 });
    }

    const [user, generations] = await Promise.all([
      getUserAdminRecord(params.id),
      getUserGenerations(params.id, 100),
    ]);
    if (!user) {
      return NextResponse.json({ error: '用户不存在' }, { status: 404 });
    }

    return NextResponse.json({
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        balance: user.balance,
        disabled: user.disabled,
        createdAt: user.createdAt,
      },
      generations,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '获取失败' },
      { status: 500 }
    );
  }
}

// 更新用户（密码、余额、禁用状态）
export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user || !hasAdminAccess(session.user.role)) {
      return NextResponse.json({ error: '无权限' }, { status: 403 });
    }

    // 获取目标用户
    const targetUser = await getUserById(params.id);
    if (!targetUser) {
      return NextResponse.json({ error: '用户不存在' }, { status: 404 });
    }

    // moderator 不能修改 admin 或其他 moderator
    if (session.user.role === 'moderator') {
      if (targetUser.role === 'admin' || targetUser.role === 'moderator') {
        return NextResponse.json({ error: '无权限修改管理员账号' }, { status: 403 });
      }
    }

    const data = await request.json();
    const updates: Record<string, unknown> = {};

    if (data.password !== undefined && data.password.trim()) {
      updates.password = data.password;
    }
    if (data.balance !== undefined) {
      updates.balance = parseInt(data.balance);
    }
    if (data.disabled !== undefined) {
      updates.disabled = Boolean(data.disabled);
    }
    if (data.name !== undefined) {
      updates.name = data.name;
    }
    // 只有 admin 可以修改角色
    if (data.role !== undefined && session.user.role === 'admin') {
      updates.role = data.role;
    }

    const updated = await updateUser(params.id, updates);
    if (!updated) {
      return NextResponse.json({ error: '用户不存在' }, { status: 404 });
    }

    const user = (await getUserAdminRecord(params.id)) || updated;
    return NextResponse.json({
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      balance: user.balance,
      disabled: user.disabled,
      createdAt: user.createdAt,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '更新失败' },
      { status: 500 }
    );
  }
}
