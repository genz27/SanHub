import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { generateWithSora } from '@/lib/sora';
import { saveGeneration, updateUserBalance, getUserById, updateGeneration, getSystemConfig } from '@/lib/db';
import type { SoraGenerateRequest } from '@/types';

// 配置路由段选项
export const maxDuration = 60;
export const dynamic = 'force-dynamic';

async function fetchImageAsBase64(imageUrl: string, origin: string): Promise<{ mimeType: string; data: string }> {
  const resolvedUrl = imageUrl.startsWith('/')
    ? new URL(imageUrl, origin).toString()
    : imageUrl;
  const response = await fetch(resolvedUrl, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    },
  });
  if (!response.ok) {
    throw new Error(`参考图下载失败 (${response.status})`);
  }
  const contentType = response.headers.get('content-type') || 'image/png';
  const arrayBuffer = await response.arrayBuffer();
  const data = Buffer.from(arrayBuffer).toString('base64');
  return { mimeType: contentType, data };
}

// 后台处理任务
async function processGenerationTask(
  generationId: string,
  userId: string,
  body: SoraGenerateRequest
): Promise<void> {
  try {
    console.log(`[Task ${generationId}] 开始处理生成任务`);
    
    // 更新状态为 processing
    await updateGeneration(generationId, { status: 'processing' }).catch(err => {
      console.error(`[Task ${generationId}] 更新状态失败:`, err);
    });

    // 进度更新回调（节流：每5%更新一次）
    let lastProgress = 0;
    const onProgress = async (progress: number) => {
      if (progress - lastProgress >= 5 || progress >= 100) {
        lastProgress = progress;
        await updateGeneration(generationId, { 
          params: { model: body.model, progress } 
        }).catch(err => {
          console.error(`[Task ${generationId}] 更新进度失败:`, err);
        });
      }
    };

    // 调用 Sora API 生成内容
    const result = await generateWithSora(body, onProgress);

    console.log(`[Task ${generationId}] 生成成功:`, result.url);

    // 扣除余额
    await updateUserBalance(userId, -result.cost).catch(err => {
      console.error(`[Task ${generationId}] 扣除余额失败:`, err);
    });

    // 更新生成记录为完成状态
    await updateGeneration(generationId, {
      status: 'completed',
      resultUrl: result.url,
      params: {
        model: body.model,
        permalink: result.permalink,
        revised_prompt: result.revised_prompt,
      },
    }).catch(err => {
      console.error(`[Task ${generationId}] 更新完成状态失败:`, err);
    });

    console.log(`[Task ${generationId}] 任务完成`);
  } catch (error) {
    console.error(`[Task ${generationId}] 任务失败:`, error);
    
    // 确保错误消息格式正确
    let errorMessage = '生成失败';
    if (error instanceof Error) {
      errorMessage = error.message;
      // 处理 cause 属性中的额外信息
      if ('cause' in error && error.cause) {
        console.error(`[Task ${generationId}] 错误原因:`, error.cause);
      }
    }
    
    // 更新为失败状态（用 try-catch 确保不会抛出）
    try {
      await updateGeneration(generationId, {
        status: 'failed',
        errorMessage,
      });
    } catch (updateErr) {
      console.error(`[Task ${generationId}] 更新失败状态时出错:`, updateErr);
    }
  }
}

export async function POST(request: NextRequest) {
  try {
    // 验证登录
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: '请先登录' }, { status: 401 });
    }

    const body: SoraGenerateRequest = await request.json();
    const hasPrompt = Boolean(body.prompt && body.prompt.trim());
    const hasFiles = Boolean(body.files && body.files.length > 0);
    const hasReferenceUrl = Boolean(body.referenceImageUrl);

    if (!hasPrompt && !hasFiles && !hasReferenceUrl) {
      return NextResponse.json(
        { error: '请输入提示词或上传参考文件' },
        { status: 400 }
      );
    }

    const origin = new URL(request.url).origin;
    const normalizedBody: SoraGenerateRequest = {
      ...body,
      files: body.files ? [...body.files] : [],
    };

    if (body.referenceImageUrl) {
      const file = await fetchImageAsBase64(body.referenceImageUrl, origin);
      normalizedBody.files?.push(file);
    }

    // 获取最新用户信息
    const user = await getUserById(session.user.id);
    if (!user) {
      return NextResponse.json({ error: '用户不存在' }, { status: 401 });
    }

    // 预估成本
    const config = await getSystemConfig();
    const estimatedCost = body.model.includes('15s')
      ? config.pricing.soraVideo15s
      : config.pricing.soraVideo10s;

    // 检查余额
    if (user.balance < estimatedCost) {
      return NextResponse.json(
        { error: `余额不足，需要至少 ${estimatedCost} 积分` },
        { status: 402 }
      );
    }

    // 生成类型固定为视频
    const type = 'sora-video';

    // 立即创建生成记录（状态为 pending）
    const generation = await saveGeneration({
      userId: user.id,
      type,
      prompt: body.prompt || '',
      params: { model: body.model },
      resultUrl: '',
      cost: estimatedCost,
      status: 'pending',
    });

    // 在后台异步处理（不等待完成）
    processGenerationTask(generation.id, user.id, normalizedBody).catch((err) => {
      console.error('[API] 后台任务启动失败:', err);
    });

    // 立即返回任务 ID
    return NextResponse.json({
      success: true,
      data: {
        id: generation.id,
        status: 'pending',
        message: '任务已创建，正在后台处理中',
      },
    });
  } catch (error) {
    console.error('[API] Sora generation error:', error);
    
    const errorMessage = error instanceof Error ? error.message : '生成失败';
    const errorStack = error instanceof Error ? error.stack : undefined;
    
    console.error('[API] Error details:', {
      message: errorMessage,
      stack: errorStack,
    });

    return NextResponse.json(
      { 
        error: errorMessage,
        details: process.env.NODE_ENV === 'development' ? errorStack : undefined,
      },
      { status: 500 }
    );
  }
}
