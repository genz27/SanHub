import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';

// 调试接口 - 直接查询数据库
export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user || session.user.role !== 'admin') {
      return NextResponse.json({ error: '无权限' }, { status: 403 });
    }

    const { getAdapter, initializeDatabase } = await import('@/lib/db');
    await initializeDatabase();
    const db = getAdapter();

    const [rows] = await db.execute('SELECT * FROM system_config WHERE id = 1');
    const configs = rows as any[];

    if (configs.length === 0) {
      return NextResponse.json({ error: '配置不存在' });
    }

    const row = configs[0];

    return NextResponse.json({
      success: true,
      raw: {
        announcement_title: row.announcement_title,
        announcement_content: row.announcement_content,
        announcement_enabled: row.announcement_enabled,
        announcement_updated_at: row.announcement_updated_at,
      },
      parsed: {
        title: row.announcement_title || '',
        content: row.announcement_content || '',
        enabled: Boolean(row.announcement_enabled),
        updatedAt: Number(row.announcement_updated_at) || 0,
      },
      allColumns: Object.keys(row),
    });
  } catch (error) {
    return NextResponse.json({
      error: error instanceof Error ? error.message : '查询失败',
    });
  }
}
