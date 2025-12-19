import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { generateWithZImage } from '@/lib/zimage';
import { saveGeneration, updateUserBalance, getUserById, getSystemConfig, updateGeneration } from '@/lib/db';
import { saveMediaAsync } from '@/lib/media-storage';
import type { ZImageGenerateRequest, GenerationType } from '@/types';

export const maxDuration = 60;
export const dynamic = 'force-dynamic';

// 后台处理任务
async function processGenerationTask(
  generationId: string,
  userId: string,
  request: ZImageGenerateRequest,
  isGitee: boolean
) {
  try {
    console.log(`[Task ${generationId}] 开始处理 Z-Image 生成任务`);
    
    await updateGeneration(generationId, { status: 'processing' });

    const result = await generateWithZImage(request);

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

export async function POST(req: NextRequest) {
  try {
    // 验证登录
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json(
        { success: false, error: '未登录' },
        { status: 401 }
      );
    }

    // 检查用户是否被禁用
    const user = await getUserById(session.user.id);
    if (!user || user.disabled) {
      return NextResponse.json(
        { success: false, error: '账号已被禁用' },
        { status: 403 }
      );
    }

    const body = await req.json();
    const { prompt, model, size, loras, channel, numInferenceSteps, images } = body;
    const isGitee = channel === 'gitee';
    const modelId = model || (isGitee ? 'z-image-turbo' : 'Tongyi-MAI/Z-Image-Turbo');

    const requiresPrompt = modelId !== 'SeedVR2-3B';
    if (requiresPrompt && !prompt) {
      return NextResponse.json(
        { success: false, error: '缺少 prompt 参数' },
        { status: 400 }
      );
    }

    // 获取系统配置检查余额
    const config = await getSystemConfig();
    const estimatedCost = isGitee ? (config.pricing?.giteeImage || 30) : (config.pricing?.zimageImage || 30);

    // 检查余额
    if (user.balance < estimatedCost) {
      return NextResponse.json(
        { success: false, error: `余额不足，需要至少 ${estimatedCost} 积分` },
        { status: 402 }
      );
    }

    // 构建请求
    const imageList = Array.isArray(images) ? images : [];
    const requiresReference = modelId === 'Qwen/Qwen-Image-Edit-2509' || modelId === 'SeedVR2-3B';
    if (requiresReference && imageList.length === 0) {
      return NextResponse.json(
        { success: false, error: '该模型需要上传参考图' },
        { status: 400 }
      );
    }

    const requestSize = modelId === 'SeedVR2-3B' ? undefined : size;

    const request: ZImageGenerateRequest = {
      prompt: prompt || '',
      model: modelId,
      channel: channel || 'modelscope',
      ...(requestSize && { size: requestSize }),
      ...(loras && { loras }),
      ...(imageList.length > 0 && { images: imageList }),
      ...(numInferenceSteps && { numInferenceSteps }),
    };

    // 保存记录 - 根据渠道选择类型
    const generationType: GenerationType = isGitee ? 'gitee-image' : 'zimage-image';
    const generation = await saveGeneration({
      userId: user.id,
      type: generationType,
      prompt,
      params: { model: request.model, size: request.size, channel: request.channel, loras, imageCount: imageList.length },
      resultUrl: '',
      cost: estimatedCost,
      status: 'pending',
    });

    console.log('[API] Z-Image 任务已创建:', {
      id: generation.id,
      channel: request.channel,
      model: request.model,
    });

    // 后台处理任务
    processGenerationTask(generation.id, user.id, request, isGitee).catch((err) => {
      console.error('[API] Z-Image 后台任务启动失败:', err);
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
    console.error('[API] Z-Image 生成失败:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : '生成失败',
      },
      { status: 500 }
    );
  }
}
