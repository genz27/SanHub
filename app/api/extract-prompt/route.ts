import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getChatModelRuntime, getEnabledVisionChatModel } from '@/lib/db/chat-catalog-runtime';
import { updateUserBalance } from '@/lib/db/user-balance';
import { getUserById } from '@/lib/db/user-session';
import { EXTRACT_PROMPT_INSTRUCTION, sanitizeExtractedPrompt } from '@/lib/extract-prompt';
import { isExtractableImageDataUrl, resolveExtractPromptImage } from '@/lib/extract-prompt-image';
import { checkRateLimit, RateLimitConfig } from '@/lib/rate-limit';
import { persistGenerationReferenceImages } from '@/lib/generation-reference-media';
import { saveGeneration } from '@/lib/db/generation-writes';
import { updateGeneration } from '@/lib/db/generation-mutations';
import { completeVisionChat } from '@/lib/vision-chat';

export const maxDuration = 60;

export async function POST(request: NextRequest) {
  try {
    const rateLimit = checkRateLimit(request, RateLimitConfig.CHAT, 'extract-prompt');
    if (!rateLimit.allowed) {
      return NextResponse.json({ success: false, error: '请求过于频繁' }, {
        status: 429,
        headers: rateLimit.headers,
      });
    }

    const [session, body] = await Promise.all([
      getServerSession(authOptions),
      request.json().catch(() => null),
    ]);
    if (!session?.user) {
      return NextResponse.json({ success: false, error: '未登录' }, { status: 401 });
    }
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ success: false, error: '请求格式错误' }, { status: 400 });
    }

    const { generationId, image, modelId } = body as {
      generationId?: string;
      image?: string;
      modelId?: string;
    };

    if (modelId !== undefined && (typeof modelId !== 'string' || !modelId || modelId.length > 80)) {
      return NextResponse.json({ success: false, error: '模型无效' }, { status: 400 });
    }
    if (generationId !== undefined && (typeof generationId !== 'string' || !generationId || generationId.length > 80)) {
      return NextResponse.json({ success: false, error: '图片无效' }, { status: 400 });
    }
    if (image !== undefined && (typeof image !== 'string' || !isExtractableImageDataUrl(image))) {
      return NextResponse.json({ success: false, error: '图片数据格式错误或过大' }, { status: 400 });
    }

    const [model, user] = await Promise.all([
      modelId ? getChatModelRuntime(modelId) : getEnabledVisionChatModel(),
      getUserById(session.user.id),
    ]);

    if (!model || !model.enabled) {
      return NextResponse.json({ success: false, error: '未配置支持识图的聊天模型' }, { status: 400 });
    }
    if (!model.supportsVision) {
      return NextResponse.json({ success: false, error: '该模型不支持识图' }, { status: 400 });
    }
    if (!user || user.balance < model.costPerMessage) {
      return NextResponse.json({ success: false, error: '积分不足' }, { status: 400 });
    }

    let dataUrl: string;
    try {
      dataUrl = await resolveExtractPromptImage({
        generationId,
        image,
        userId: session.user.id,
        isAdmin: session.user.role === 'admin' || session.user.role === 'moderator',
      });
    } catch (error) {
      return NextResponse.json(
        { success: false, error: error instanceof Error ? error.message : '无法读取这张图' },
        { status: 400 }
      );
    }

    const prompt = sanitizeExtractedPrompt(
      await completeVisionChat(model, dataUrl, EXTRACT_PROMPT_INSTRUCTION)
    );
    if (!prompt) {
      throw new Error('模型没有返回可用的提示词');
    }

    await updateUserBalance(session.user.id, -model.costPerMessage, 'strict');

    try {
      const origin = new URL(request.url).origin;
      const generation = await saveGeneration({
        userId: session.user.id,
        type: 'extract-prompt',
        prompt,
        params: {
          kind: 'extract-prompt',
          model: model.modelId,
          modelId: model.id,
          modelName: model.name || undefined,
        },
        resultUrl: '',
        cost: model.costPerMessage,
        status: 'completed',
      });
      const stored = await persistGenerationReferenceImages(
        generation.id,
        [{ data: dataUrl }],
        origin
      );
      if (stored[0]) {
        await updateGeneration(generation.id, {
          resultUrl: stored[0],
          params: {
            ...generation.params,
            referenceImages: stored,
            imageCount: stored.length,
          },
        }, session.user.id);
      }
    } catch (error) {
      console.error('[API] extract prompt log failed:', error);
    }

    return NextResponse.json({
      success: true,
      data: {
        prompt,
        cost: model.costPerMessage,
      },
    });
  } catch (error) {
    console.error('[API] extract prompt failed:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : '反推失败' },
      { status: 500 }
    );
  }
}
