import { NextResponse } from 'next/server';
import { getSystemConfig } from '@/lib/db';

export const dynamic = 'force-dynamic';

// GET /api/disabled-models - 获取禁用的模型列表
export async function GET() {
  try {
    const config = await getSystemConfig();
    return NextResponse.json({
      success: true,
      data: config.disabledModels,
    });
  } catch (error) {
    console.error('[DisabledModels] Error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to get disabled models' },
      { status: 500 }
    );
  }
}
