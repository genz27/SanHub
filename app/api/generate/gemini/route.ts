import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { generateWithGemini } from '@/lib/gemini';
import { saveGeneration, updateUserBalance, getUserById, updateGeneration, getSystemConfig } from '@/lib/db';
import { saveMediaAsync } from '@/lib/media-storage';
import type { GeminiGenerateRequest } from '@/types';

export const maxDuration = 60;
export const dynamic = 'force-dynamic';

// 后台处理任务
async function processGenerationTask(
  generationId: string,
  userId: string,
  body: GeminiGenerateRequest
) {
  try {
    console.log(`[Task ${generationId}] 开始处理 Gemini 生成任务`);
    
    await updateGeneration(generationId, { status: 'processing' });

    const result = await generateWithGemini(body);

    // 优先上传到 PicUI 图床，否则保存为本地文件
    const savedUrl = await saveMediaAsync(generationId, result.url);
    
    console.log(`[Task ${generationId}] 生成成功:`, savedUrl);

    await updateUserBalance(userId, -result.cost);

    await updateGeneration(generationId, {
      status: 'completed',
      resultUrl: savedUrl,
    });

    console.log(`[Task ${generationId}] 任务完成`);
  } catch (error) {
    console.error(`[Task ${generationId}] 任务失败:`, error);
    
    await updateGeneration(generationId, {
      status: 'failed',
      errorMessage: error instanceof Error ? error.message : '生成失败',
    });
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: '请先登录' }, { status: 401 });
    }

    const body: GeminiGenerateRequest = await request.json();

    if (!body.prompt && (!body.images || body.images.length === 0)) {
      return NextResponse.json(
        { error: '请输入提示词或上传参考图片' },
        { status: 400 }
      );
    }

    const user = await getUserById(session.user.id);
    if (!user) {
      return NextResponse.json({ error: '用户不存在' }, { status: 401 });
    }

    const config = await getSystemConfig();
    const estimatedCost = body.model.includes('pro')
      ? config.pricing.geminiPro
      : config.pricing.geminiNano;

    if (user.balance < estimatedCost) {
      return NextResponse.json(
        { error: `余额不足，需要至少 ${estimatedCost} 积分` },
        { status: 402 }
      );
    }

    const generation = await saveGeneration({
      userId: user.id,
      type: 'gemini-image',
      prompt: body.prompt,
      params: {
        model: body.model,
        aspectRatio: body.aspectRatio,
        imageSize: body.imageSize,
      },
      resultUrl: '',
      cost: estimatedCost,
      status: 'pending',
    });

    processGenerationTask(generation.id, user.id, body).catch((err) => {
      console.error('[API] Gemini 后台任务启动失败:', err);
    });

    return NextResponse.json({
      success: true,
      data: {
        id: generation.id,
        status: 'pending',
        message: '任务已创建，正在后台处理中',
      },
    });
  } catch (error) {
    console.error('[API] Gemini generation error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '生成失败' },
      { status: 500 }
    );
  }
}
