/* eslint-disable no-console */
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { generateWithSora } from '@/lib/sora';
import { saveGeneration, updateUserBalance, getUserById, updateGeneration, getSystemConfig, refundGenerationBalance } from '@/lib/db';
import type { Generation, SoraGenerateRequest } from '@/types';
import { checkRateLimit, RateLimitConfig } from '@/lib/rate-limit';
import { fetchExternalBuffer } from '@/lib/safe-fetch';
import { processVideoPrompt } from '@/lib/prompt-processor';

// 配置路由段选项
export const maxDuration = 60;
export const dynamic = 'force-dynamic';

const MAX_REFERENCE_IMAGE_BYTES = 50 * 1024 * 1024;
const RATE_LIMIT_RETRIES = 3;
const RATE_LIMIT_BASE_DELAY_MS = 1500;
const RATE_LIMIT_MAX_DELAY_MS = 10000;

function isRateLimitError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const message = error.message.toLowerCase();
  return (
    message.includes('429') ||
    message.includes('rate limit') ||
    message.includes('rate limited') ||
    message.includes('too many requests')
  );
}

function getRateLimitDelayMs(attempt: number): number {
  const delay = Math.min(RATE_LIMIT_BASE_DELAY_MS * 2 ** (attempt - 1), RATE_LIMIT_MAX_DELAY_MS);
  const jitter = Math.floor(delay * 0.25 * Math.random());
  return delay - jitter;
}

async function generateWithRateLimitRetry(
  body: SoraGenerateRequest,
  onProgress: (progress: number) => void,
  taskId: string
) {
  let attempt = 0;
  while (true) {
    try {
      if (attempt > 0) {
        console.warn(`[Task ${taskId}] Retry attempt ${attempt} after rate limit`);
      }
      return await generateWithSora(body, onProgress);
    } catch (error) {
      if (!isRateLimitError(error) || attempt >= RATE_LIMIT_RETRIES) {
        throw error;
      }
      attempt += 1;
      const delayMs = getRateLimitDelayMs(attempt);
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
}

async function fetchImageAsBase64(imageUrl: string, origin: string): Promise<{ mimeType: string; data: string }> {
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
  return { mimeType: contentType, data };
}

// 后台处理任务
async function processGenerationTask(
  generationId: string,
  userId: string,
  body: SoraGenerateRequest,
  prechargedCost: number
): Promise<void> {
  try {
    console.log(`[Task ${generationId}] 开始处理生成任务`);

    const baseParams = {
      model: body.model,
      modelId: body.modelId,
      aspectRatio: body.aspectRatio,
      duration: body.duration,
    };
    let promptParams: {
      originalPrompt?: string;
      filteredPrompt?: string;
      translatedPrompt?: string;
      processedPrompt?: string;
    } = {};
    
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
          params: {
            ...baseParams,
            ...promptParams,
            progress,
          },
        }).catch(err => {
          console.error(`[Task ${generationId}] 更新进度失败:`, err);
        });
      }
    };

    // Process prompt (filter + translate)
    let processedBody = body;
    if (body.prompt && body.prompt.trim()) {
      try {
        const processed = await processVideoPrompt(body.prompt);
        promptParams = {
          originalPrompt: processed.originalPrompt,
          filteredPrompt: processed.filteredPrompt,
          translatedPrompt: processed.translatedPrompt,
          processedPrompt: processed.processedPrompt,
        };
        processedBody = {
          ...body,
          prompt: processed.processedPrompt,
        };
        await updateGeneration(generationId, {
          params: {
            ...baseParams,
            ...promptParams,
            progress: lastProgress,
          },
        }).catch(err => {
          console.error(`[Task ${generationId}] 更新提示词处理结果失败:`, err);
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Prompt processing failed';
        console.error(`[Task ${generationId}] 提示词处理失败:`, message);
        throw new Error(message);
      }
    }

    // 调用 Sora API 生成内容
    const result = await generateWithRateLimitRetry(processedBody, onProgress, generationId);

    console.log(`[Task ${generationId}] 生成成功:`, result.url);

    // 更新生成记录为完成状态
    await updateGeneration(generationId, {
      status: 'completed',
      resultUrl: result.url,
      params: {
        ...baseParams,
        ...promptParams,
        videoId: result.videoId,
        videoChannelId: result.videoChannelId,
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

    try {
      await refundGenerationBalance(generationId, userId, prechargedCost);
    } catch (refundErr) {
      console.error(`[Task ${generationId}] Refund failed:`, refundErr);
    }
  }
}

export async function POST(request: NextRequest) {
  try {
    const rateLimit = checkRateLimit(request, RateLimitConfig.GENERATE, 'generate-sora-video');
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: 'Too many requests' },
        { status: 429, headers: rateLimit.headers }
      );
    }

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
    const normalizedDuration = (body.duration || body.model || '').toLowerCase();
    const estimatedCost = normalizedDuration.includes('25')
      ? config.pricing.soraVideo25s
      : normalizedDuration.includes('15')
        ? config.pricing.soraVideo15s
        : config.pricing.soraVideo10s;

    // 检查余额
    if (user.balance < estimatedCost) {
      return NextResponse.json(
        { error: `余额不足，需要至少 ${estimatedCost} 积分` },
        { status: 402 }
      );
    }

    try {
      await updateUserBalance(user.id, -estimatedCost, 'strict');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Insufficient balance';
      if (message.includes('Insufficient balance')) {
        return NextResponse.json(
          { error: `余额不足，需要至少 ${estimatedCost} 积分` },
          { status: 402 }
        );
      }
      throw err;
    }

    // 生成类型固定为视频
    const type = 'sora-video';

    // 立即创建生成记录（状态为 pending）
    let generation: Generation;
    try {
      generation = await saveGeneration({
        userId: user.id,
        type,
        prompt: body.prompt || '',
        params: {
          model: body.model,
          modelId: body.modelId,
          aspectRatio: body.aspectRatio,
          duration: body.duration,
        },
        resultUrl: '',
        cost: estimatedCost,
        status: 'pending',
        balancePrecharged: true,
        balanceRefunded: false,
      });
    } catch (saveErr) {
      await updateUserBalance(user.id, estimatedCost, 'strict').catch(refundErr => {
        console.error('[API] Precharge rollback failed:', refundErr);
      });
      throw saveErr;
    }

    // 在后台异步处理（不等待完成）
    processGenerationTask(generation.id, user.id, normalizedBody, estimatedCost).catch((err) => {
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
