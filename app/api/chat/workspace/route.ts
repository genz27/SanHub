import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getChatModelRuntime } from '@/lib/db/chat-catalog-runtime';
import { updateUserBalance } from '@/lib/db/user-balance';
import { getUserById } from '@/lib/db/user-session';
import { checkRateLimit, RateLimitConfig } from '@/lib/rate-limit';
import { resolveChatCompletionsUrl } from '@/lib/chat-completions-url';

// Validation constants
const CHAT_MAX_LENGTH = 2000;
const MAX_IMAGES = 10;
const MAX_IMAGE_URL_LENGTH = 100000; // ~100KB for base64 data URLs

export async function POST(request: NextRequest) {
  try {
    const rateLimit = checkRateLimit(request, RateLimitConfig.CHAT, 'chat');
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { success: false, error: 'Too many requests' },
        { status: 429, headers: rateLimit.headers }
      );
    }

    const [session, body] = await Promise.all([
      getServerSession(authOptions),
      request.json(),
    ]);
    if (!session?.user) {
      return NextResponse.json({ success: false, error: '未登录' }, { status: 401 });
    }

    const userPromise = getUserById(session.user.id);
    const { modelId, prompt, images } = body as {
      modelId: string;
      prompt: string;
      images?: string[];
    };

    // Validate required fields
    if (!modelId || typeof modelId !== 'string') {
      return NextResponse.json(
        { success: false, error: '模型 ID 不能为空' },
        { status: 400 }
      );
    }

    const modelPromise = getChatModelRuntime(modelId);

    if (!prompt || typeof prompt !== 'string') {
      return NextResponse.json(
        { success: false, error: '提示词不能为空' },
        { status: 400 }
      );
    }

    // Validate prompt length
    if (prompt.length > CHAT_MAX_LENGTH) {
      return NextResponse.json(
        { success: false, error: `提示词不能超过 ${CHAT_MAX_LENGTH} 个字符` },
        { status: 400 }
      );
    }

    // Validate images array
    if (images !== undefined) {
      if (!Array.isArray(images)) {
        return NextResponse.json(
          { success: false, error: '图片参数格式错误' },
          { status: 400 }
        );
      }
      if (images.length > MAX_IMAGES) {
        return NextResponse.json(
          { success: false, error: `图片数量不能超过 ${MAX_IMAGES} 张` },
          { status: 400 }
        );
      }
      for (const img of images) {
        if (typeof img !== 'string' || img.length > MAX_IMAGE_URL_LENGTH) {
          return NextResponse.json(
            { success: false, error: '图片数据格式错误或过大' },
            { status: 400 }
          );
        }
      }
    }

    const [model, user] = await Promise.all([
      modelPromise,
      userPromise,
    ]);
    if (!model || !model.enabled) {
      return NextResponse.json(
        { success: false, error: '模型不存在或已禁用' },
        { status: 400 }
      );
    }

    if (images && images.length > 0 && !model.supportsVision) {
      return NextResponse.json(
        { success: false, error: '该模型不支持图片输入' },
        { status: 400 }
      );
    }
    if (!user || user.balance < model.costPerMessage) {
      return NextResponse.json(
        { success: false, error: '积分不足' },
        { status: 400 }
      );
    }

    // Build messages for the API call
    const messages: Array<{ role: string; content: unknown }> = [];
    
    if (images && images.length > 0 && model.supportsVision) {
      const imageParts = images.map((imageUrl) => ({
        type: 'image_url' as const,
        image_url: { url: imageUrl },
      }));
      const textPart = { type: 'text' as const, text: prompt };
      const isMiMoVision = /xiaomimimo\.com|mimo-/i.test(`${model.apiUrl} ${model.modelId}`);
      messages.push({
        role: 'user',
        content: isMiMoVision ? [...imageParts, textPart] : [textPart, ...imageParts],
      });
    } else {
      // Text-only message
      messages.push({ role: 'user', content: prompt });
    }

    // Call the chat API
    const isMiMo = /xiaomimimo\.com|mimo-/i.test(`${model.apiUrl} ${model.modelId}`);
    const response = await fetch(resolveChatCompletionsUrl(model.apiUrl), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${model.apiKey}`,
        ...(isMiMo ? { 'api-key': model.apiKey } : {}),
      },
      body: JSON.stringify({
        model: model.modelId,
        messages,
        ...(isMiMo
          ? { max_completion_tokens: Math.min(4096, model.maxTokens || 4096) }
          : { max_tokens: Math.min(4096, model.maxTokens) }),
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error?.message || `API 调用失败: ${response.status}`);
    }

    const data = await response.json();
    const assistantContent = data.choices?.[0]?.message?.content || '';

    // Deduct balance
    await updateUserBalance(session.user.id, -model.costPerMessage, 'strict');

    return NextResponse.json({
      success: true,
      data: {
        content: assistantContent,
        cost: model.costPerMessage,
      },
    });
  } catch (error) {
    console.error('Workspace chat error:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : '聊天失败' },
      { status: 500 }
    );
  }
}
