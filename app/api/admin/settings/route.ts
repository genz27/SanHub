import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getSystemConfig, updateSystemConfig } from '@/lib/db';

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    
    if (!session?.user || session.user.role !== 'admin') {
      return NextResponse.json({ error: '无权限' }, { status: 403 });
    }

    const config = await getSystemConfig();
    return NextResponse.json({ success: true, data: config });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '获取配置失败' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    
    if (!session?.user || session.user.role !== 'admin') {
      return NextResponse.json({ error: '无权限' }, { status: 403 });
    }

    const updates = await request.json();

    // 如果后台地址发生变化，则清空旧的 admin token，强制下一次重新登录
    const current = await getSystemConfig();
    const nextUpdates: any = { ...updates };
    if (
      typeof updates.soraBackendUrl === 'string' &&
      updates.soraBackendUrl.trim() &&
      updates.soraBackendUrl.trim() !== (current.soraBackendUrl || '').trim()
    ) {
      nextUpdates.soraBackendToken = '';
    }

    const config = await updateSystemConfig(nextUpdates);
    return NextResponse.json({ success: true, data: config });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '更新配置失败' },
      { status: 500 }
    );
  }
}
