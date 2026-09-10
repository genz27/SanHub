/* eslint-disable no-console */
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { refundGenerationBalance, updateGeneration } from '@/lib/db/generation-mutations';
import { saveGeneration } from '@/lib/db/generation-writes';
import { getPricingConfig } from '@/lib/db/system-config-pricing';
import { getRateLimitConfig } from '@/lib/db/system-config-rate-limit';
import { updateUserBalance } from '@/lib/db/user-balance';
import { getUserById } from '@/lib/db/user-session';
import { checkRateLimit } from '@/lib/rate-limit';
import type { Generation } from '@/types';
import { persistGenerationReferenceImages } from '@/lib/generation-reference-media';
import { assertPromptsAllowed, isPromptBlockedError } from '@/lib/prompt-blocklist';

export const maxDuration = 120;
export const dynamic = 'force-dynamic';

const MAX_REFERENCE_IMAGE_BYTES = 10 * 1024 * 1024;

interface SoraImageRequest {
  prompt: string;
  model?: string;
  size?: string;
  input_image?: string;
  referenceImageUrl?: string;
}

// 后台处理任务
async function processGenerationTask(
  generationId: string,
  userId: string,
  body: SoraImageRequest,
  prechargedCost: number,
  generationParams: Generation['params'],
  publicBaseUrl?: string
): Promise<void> {
  try {
    console.log(`[Task ${generationId}] 开始处理 Sora 图像生成任务`);

    const generateImagePromise = import('@/lib/sora-image-api').then((mod) => mod.generateImage);
    const saveMediaPromise = import('@/lib/media-storage');
    void updateGeneration(generationId, {
      status: 'processing',
      params: {
        ...generationParams,
        progress: 15,
      },
    }, userId).catch((err) => {
      console.error(`[Task ${generationId}] 更新状态失败:`, err);
    });

    const generateImage = await generateImagePromise;
    const result = await generateImage({
      prompt: body.prompt,
      model: body.model || 'sora-image',
      size: body.size,
      input_image: body.input_image,
      response_format: 'url',
    });

    if (!result.data || result.data.length === 0 || !result.data[0].url) {
      throw new Error('图片生成失败：未返回有效的图片 URL');
    }

    const first = result.data[0];

    void updateGeneration(generationId, {
      status: 'processing',
      params: {
        ...generationParams,
        revised_prompt: first.revised_prompt,
        progress: 85,
      },
    }, userId).catch((err) => {
      console.error(`[Task ${generationId}] 更新进度失败:`, err);
    });

    const firstUrl = first.url;
    if (!firstUrl) {
      throw new Error('图片生成失败：未返回有效的图片 URL');
    }
    const { saveMediaAsync } = await saveMediaPromise;
    const savedUrl = await saveMediaAsync(generationId, firstUrl, { publicBaseUrl });

    console.log(`[Task ${generationId}] 生成成功:`, savedUrl);

    await updateGeneration(generationId, {
      status: 'completed',
      resultUrl: savedUrl,
      params: {
        ...generationParams,
        revised_prompt: first.revised_prompt,
        progress: 100,
      },
    }, userId);

    console.log(`[Task ${generationId}] 任务完成`);
  } catch (error) {
    console.error(`[Task ${generationId}] 任务失败:`, error);

    await updateGeneration(generationId, {
      status: 'failed',
      errorMessage: error instanceof Error ? error.message : '生成失败',
    }, userId);

    try {
      await refundGenerationBalance(generationId, userId, prechargedCost);
    } catch (refundErr) {
      console.error(`[Task ${generationId}] Refund failed:`, refundErr);
    }
  }
}

export async function POST(request: NextRequest) {
  try {
    const [rateLimitConfig, session, body] = await Promise.all([
      getRateLimitConfig(),
      getServerSession(authOptions),
      request.json() as Promise<SoraImageRequest>,
    ]);
    const imageMaxRequests = Math.max(1, Number(rateLimitConfig.imageMaxRequests) || 30);
    const imageWindowSeconds = Math.max(1, Number(rateLimitConfig.imageWindowSeconds) || 60);
    const rateLimit = checkRateLimit(
      request,
      { maxRequests: imageMaxRequests, windowSeconds: imageWindowSeconds },
      'generate-sora-image'
    );
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: 'Too many requests' },
        { status: 429, headers: rateLimit.headers }
      );
    }

    if (!session?.user) {
      return NextResponse.json({ error: '请先登录' }, { status: 401 });
    }

    if (!body.prompt) {
      return NextResponse.json(
        { error: '请输入提示词' },
        { status: 400 }
      );
    }

    void import('@/lib/sora-config').then((mod) => {
      void mod.warmupSoraConfig();
    });
    void import('@/lib/media-storage');
    const pricingPromise = getPricingConfig();
    const userPromise = getUserById(session.user.id);
    const assertPromise = assertPromptsAllowed([body.prompt]);
    const origin = new URL(request.url).origin;
    const normalizedBody: SoraImageRequest = { ...body };
    const referenceImagePromise =
      body.referenceImageUrl && !body.input_image
        ? import('@/lib/reference-image').then(({ fetchReferenceImage }) =>
            fetchReferenceImage(body.referenceImageUrl as string, {
              origin,
              userId: session.user.id,
              userRole: session.user.role,
              maxBytes: MAX_REFERENCE_IMAGE_BYTES,
              headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
              },
            })
          )
        : null;

    const [user, , pricing, referenceImage] = await Promise.all([
      userPromise,
      assertPromise,
      pricingPromise,
      referenceImagePromise,
    ]);
    if (referenceImage) {
      normalizedBody.input_image = referenceImage.base64;
    }
    if (!user) {
      return NextResponse.json({ error: '用户不存在' }, { status: 401 });
    }

    const estimatedCost = pricing.soraImage || 1;

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

    const generationParams: Generation['params'] = {
      model: normalizedBody.model,
      size: normalizedBody.size,
      progress: 0,
    };

    let generation: Generation;
    try {
      generation = await saveGeneration({
        userId: user.id,
        type: 'sora-image',
        prompt: normalizedBody.prompt,
        params: generationParams,
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

    if (normalizedBody.input_image) {
      const storedReferences = await persistGenerationReferenceImages(
        generation.id,
        [{ data: normalizedBody.input_image }],
        origin
      );
      if (storedReferences.length > 0) {
        generationParams.referenceImages = storedReferences;
        generationParams.imageCount = storedReferences.length;
        await updateGeneration(generation.id, { params: generationParams }, user.id);
      }
    }

    processGenerationTask(
      generation.id,
      user.id,
      normalizedBody,
      estimatedCost,
      generationParams,
      origin
    ).catch((err) => {
      console.error('[API] Sora Image 后台任务启动失败:', err);
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
    console.error('[API] Sora Image generation error:', error);

    if (isPromptBlockedError(error)) {
      return NextResponse.json(
        { error: error instanceof Error ? error.message : 'Prompt blocked by safety policy' },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : '生成失败' },
      { status: 500 }
    );
  }
}
