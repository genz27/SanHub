import { NextResponse } from 'next/server';
import { ensureDatabase } from '@/lib/db/ready';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    await ensureDatabase();
    return NextResponse.json({ 
      status: 'ok', 
      message: '数据库连接正常',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Database health check failed:', error);
    return NextResponse.json(
      { 
        status: 'error', 
        message: error instanceof Error ? error.message : '数据库连接失败'
      },
      { status: 500 }
    );
  }
}
