import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getChatModel, getUserById, updateUserBalance } from '@/lib/db';
import { checkRateLimit, RateLimitConfig } from '@/lib/rate-limit';

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

    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ success: false, error: '未登录' }, { status: 401 });
    }

    const body = await request.json();
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

    const model = await getChatModel(modelId);
    if (!model || !model.enabled) {
      return NextResponse.json(
        { success: false, error: '模型不存在或已禁用' },
        { status: 400 }
      );
    }

    // Check if model supports vision when images are provided
    if (images && images.length > 0 && !model.supportsVision) {
      return NextResponse.json(
        { success: false, error: '该模型不支持图片输入' },
        { status: 400 }
      );
    }

    // Check user balance
    const user = await getUserById(session.user.id);
    if (!user || user.balance < model.costPerMessage) {
      return NextResponse.json(
        { success: false, error: '积分不足' },
        { status: 400 }
      );
    }

    // Build messages for the API call
    const messages: Array<{ role: string; content: unknown }> = [];
    
    if (images && images.length > 0 && model.supportsVision) {
      // Vision model with images
      const content: Array<{ type: string; text?: string; image_url?: { url: string } }> = [
        { type: 'text', text: prompt },
      ];
      
      for (const imageUrl of images) {
        content.push({
          type: 'image_url',
          image_url: { url: imageUrl },
        });
      }
      
      messages.push({ role: 'user', content });
    } else {
      // Text-only message
      messages.push({ role: 'user', content: prompt });
    }

    // Call the chat API
    const response = await fetch(model.apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${model.apiKey}`,
      },
      body: JSON.stringify({
        model: model.modelId,
        messages,
        max_tokens: Math.min(4096, model.maxTokens),
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
