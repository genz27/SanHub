/* eslint-disable no-console */
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { generateImage, type ImageGenerateRequest } from '@/lib/image-generator';
import {
  saveGeneration,
  updateUserBalance,
  getUserById,
  updateGeneration,
  getImageModelWithChannel,
  refundGenerationBalance,
} from '@/lib/db';
import { saveMediaAsync } from '@/lib/media-storage';
import { checkRateLimit, RateLimitConfig } from '@/lib/rate-limit';
import { fetchExternalBuffer } from '@/lib/safe-fetch';
import type { ChannelType, Generation, GenerationType } from '@/types';

export const maxDuration = 60;
export const dynamic = 'force-dynamic';

const MAX_REFERENCE_IMAGE_BYTES = 10 * 1024 * 1024;
const IMAGE_TYPE_BY_CHANNEL: Record<ChannelType, GenerationType> = {
  'openai-compatible': 'gemini-image',
  'openai-chat': 'gemini-image',
  gemini: 'gemini-image',
  modelscope: 'zimage-image',
  gitee: 'gitee-image',
  sora: 'sora-image',
};

async function fetchImageAsBase64(
  imageUrl: string,
  origin: string
): Promise<{ mimeType: string; data: string }> {
  const { buffer, contentType } = await fetchExternalBuffer(imageUrl, {
    origin,
    allowRelative: true,
    maxBytes: MAX_REFERENCE_IMAGE_BYTES,
    timeoutMs: 10000,
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    },
  });
  if (!contentType.startsWith('image/')) {
    throw new Error('Unsupported reference image content type');
  }
  const data = buffer.toString('base64');
  return { mimeType: contentType, data: `data:${contentType};base64,${data}` };
}

// 后台处理任务
async function processGenerationTask(
  generationId: string,
  userId: string,
  request: ImageGenerateRequest,
  prechargedCost: number
) {
  try {
    console.log(`[Task ${generationId}] 开始处理图像生成任务`);

    await updateGeneration(generationId, { status: 'processing' });

    const result = await generateImage(request);

    // 保存到图床或本地
    const savedUrl = await saveMediaAsync(generationId, result.url);

    console.log(`[Task ${generationId}] 生成成功`);

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

    try {
      await refundGenerationBalance(generationId, userId, prechargedCost);
    } catch (refundErr) {
      console.error(`[Task ${generationId}] Refund failed:`, refundErr);
    }
  }
}

export async function POST(request: NextRequest) {
  try {
    const rateLimit = checkRateLimit(request, RateLimitConfig.GENERATE, 'generate-image');
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: 'Too many requests' },
        { status: 429, headers: rateLimit.headers }
      );
    }

    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: '请先登录' }, { status: 401 });
    }

    const body = await request.json();
    const {
      modelId,
      prompt,
      aspectRatio,
      imageSize,
      images,
      referenceImages,
      referenceImageUrl,
    } = body;

    if (!modelId) {
      return NextResponse.json({ error: '缺少模型 ID' }, { status: 400 });
    }

    // 获取模型配置
    const modelConfig = await getImageModelWithChannel(modelId);
    if (!modelConfig) {
      return NextResponse.json({ error: '模型不存在' }, { status: 404 });
    }
    const { model, channel } = modelConfig;
    if (!model.enabled) {
      return NextResponse.json({ error: '模型已禁用' }, { status: 400 });
    }

    // 检查用户
    const user = await getUserById(session.user.id);
    if (!user) {
      return NextResponse.json({ error: '用户不存在' }, { status: 401 });
    }
    if (user.disabled) {
      return NextResponse.json({ error: '账号已被禁用' }, { status: 403 });
    }

    // 检查余额
    if (user.balance < model.costPerGeneration) {
      return NextResponse.json(
        { error: `余额不足，需要至少 ${model.costPerGeneration} 积分` },
        { status: 402 }
      );
    }

    try {
      await updateUserBalance(user.id, -model.costPerGeneration, 'strict');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Insufficient balance';
      if (message.includes('Insufficient balance')) {
        return NextResponse.json(
          { error: `余额不足，需要至少 ${model.costPerGeneration} 积分` },
          { status: 402 }
        );
      }
      throw err;
    }

    // 处理参考图
    const origin = new URL(request.url).origin;
    const imageList: Array<{ mimeType: string; data: string }> = [];

    if (images && Array.isArray(images)) {
      imageList.push(...images);
    }

    if (referenceImageUrl) {
      const ref = await fetchImageAsBase64(referenceImageUrl, origin);
      imageList.push(ref);
    }

    if (referenceImages && Array.isArray(referenceImages)) {
      for (const img of referenceImages) {
        if (img.startsWith('data:')) {
          const match = img.match(/^data:([^;]+);base64,(.+)$/);
          if (match) {
            imageList.push({ mimeType: match[1], data: img });
          }
        } else {
          const ref = await fetchImageAsBase64(img, origin);
          imageList.push(ref);
        }
      }
    }

    // 验证必须参考图
    if (model.requiresReferenceImage && imageList.length === 0) {
      return NextResponse.json({ error: '该模型需要上传参考图' }, { status: 400 });
    }

    // 验证提示词
    if (!model.allowEmptyPrompt && !prompt && imageList.length === 0) {
      return NextResponse.json({ error: '请输入提示词或上传参考图' }, { status: 400 });
    }

    // 构建请求
    const generateRequest: ImageGenerateRequest = {
      modelId,
      prompt: prompt || '',
      aspectRatio,
      imageSize,
      images: imageList.length > 0 ? imageList : undefined,
    };

    // 保存生成记录
    let generation: Generation;
    try {
      generation = await saveGeneration({
        userId: user.id,
        type: IMAGE_TYPE_BY_CHANNEL[channel.type] || 'gemini-image',
        prompt: prompt || '',
        params: {
          model: model.apiModel,
          aspectRatio,
          imageSize,
          imageCount: imageList.length,
        },
        resultUrl: '',
        cost: model.costPerGeneration,
        status: 'pending',
        balancePrecharged: true,
        balanceRefunded: false,
      });
    } catch (saveErr) {
      await updateUserBalance(user.id, model.costPerGeneration, 'strict').catch(refundErr => {
        console.error('[API] Precharge rollback failed:', refundErr);
      });
      throw saveErr;
    }

    console.log('[API] 图像生成任务已创建:', {
      id: generation.id,
      modelId,
      model: model.apiModel,
    });

    // 后台处理
    processGenerationTask(generation.id, user.id, generateRequest, model.costPerGeneration).catch((err) => {
      console.error('[API] 后台任务启动失败:', err);
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
    console.error('[API] Image generation error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '生成失败' },
      { status: 500 }
    );
  }
}
