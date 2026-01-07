/* eslint-disable no-console */
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { generateImage } from '@/lib/sora-api';
import { saveGeneration, updateUserBalance, getUserById, updateGeneration, getSystemConfig } from '@/lib/db';
import { checkRateLimit, RateLimitConfig } from '@/lib/rate-limit';
import { fetchExternalBuffer } from '@/lib/safe-fetch';

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
  return { mimeType: contentType, data };
}

// 后台处理任务
async function processGenerationTask(
  generationId: string,
  userId: string,
  body: SoraImageRequest
): Promise<void> {
  try {
    console.log(`[Task ${generationId}] 开始处理 Sora 图像生成任务`);

    await updateGeneration(generationId, { status: 'processing' });

    // 调用非流式 API
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
    const config = await getSystemConfig();
    const cost = config.pricing.soraImage || 1;

    console.log(`[Task ${generationId}] 生成成功:`, first.url);

    await updateUserBalance(userId, -cost, 'strict');

    await updateGeneration(generationId, {
      status: 'completed',
      resultUrl: first.url,
      params: {
        model: body.model,
        size: body.size,
        revised_prompt: first.revised_prompt,
      },
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
    const rateLimit = checkRateLimit(request, RateLimitConfig.GENERATE, 'generate-sora-image');
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

    const body: SoraImageRequest = await request.json();
    const origin = new URL(request.url).origin;
    const normalizedBody: SoraImageRequest = { ...body };

    if (body.referenceImageUrl && !body.input_image) {
      const file = await fetchImageAsBase64(body.referenceImageUrl, origin);
      normalizedBody.input_image = file.data;
    }

    if (!normalizedBody.prompt) {
      return NextResponse.json(
        { error: '请输入提示词' },
        { status: 400 }
      );
    }

    const user = await getUserById(session.user.id);
    if (!user) {
      return NextResponse.json({ error: '用户不存在' }, { status: 401 });
    }

    const config = await getSystemConfig();
    const estimatedCost = config.pricing.soraImage || 1;

    if (user.balance < estimatedCost) {
      return NextResponse.json(
        { error: `余额不足，需要至少 ${estimatedCost} 积分` },
        { status: 402 }
      );
    }

    const generation = await saveGeneration({
      userId: user.id,
      type: 'sora-image',
      prompt: normalizedBody.prompt,
      params: {
        model: normalizedBody.model,
        size: normalizedBody.size,
      },
      resultUrl: '',
      cost: estimatedCost,
      status: 'pending',
    });

    processGenerationTask(generation.id, user.id, normalizedBody).catch((err) => {
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
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '生成失败' },
      { status: 500 }
    );
  }
}
