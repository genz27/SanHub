import { NextResponse } from 'next/server';
import { getDisabledModelsConfig } from '@/lib/db/system-config-disabled-models';

export const dynamic = 'force-dynamic';

// GET /api/disabled-models - 获取禁用的模型列表
export async function GET() {
  try {
    const disabledModels = await getDisabledModelsConfig();
    return NextResponse.json({
      success: true,
      data: disabledModels,
    }, {
      headers: { 'Cache-Control': 'private, max-age=60' },
    });
  } catch (error) {
    console.error('[DisabledModels] Error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to get disabled models' },
      { status: 500 }
    );
  }
}
