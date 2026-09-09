import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getSafeChatModelPicker } from '@/lib/db/chat-catalog-picker';

export async function GET(request: NextRequest) {
  try {
    const all = request.nextUrl.searchParams.get('all') === 'true';
    const sessionPromise = getServerSession(authOptions);
    const [session, safeModels] = await Promise.all([
      sessionPromise,
      all ? Promise.resolve(null) : getSafeChatModelPicker(),
    ]);
    if (!session?.user) {
      return NextResponse.json({ success: false, error: '未登录' }, {
        status: 401,
        headers: { 'Cache-Control': 'no-store' },
      });
    }

    if (session.user.role === 'admin' && all) {
      const { getChatModels } = await import('@/lib/db/chat-models');
      const models = await getChatModels(false);
      return NextResponse.json(
        { success: true, data: models },
        { headers: { 'Cache-Control': 'no-store, max-age=0' } }
      );
    }

    const models = safeModels ?? (await getSafeChatModelPicker());
    return NextResponse.json(
      { success: true, data: models },
      { headers: { 'Cache-Control': 'private, max-age=60' } }
    );
  } catch (error) {
    console.error('Failed to get chat models:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : '获取聊天模型失败' },
      { status: 500, headers: { 'Cache-Control': 'no-store' } }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const [session, body] = await Promise.all([
      getServerSession(authOptions),
      request.json(),
    ]);
    if (!session?.user || session.user.role !== 'admin') {
      return NextResponse.json({ success: false, error: '无权限' }, { status: 403 });
    }

    const { name, apiUrl, apiKey, modelId, supportsVision, maxTokens, costPerMessage, enabled } = body;

    if (!name || !apiUrl || !apiKey || !modelId) {
      return NextResponse.json({ success: false, error: '缺少必要参数' }, { status: 400 });
    }

    const { createChatModel } = await import('@/lib/db/chat-models');
    const model = await createChatModel({
      name,
      apiUrl,
      apiKey,
      modelId,
      supportsVision: supportsVision ?? false,
      maxTokens: maxTokens ?? 4096,
      costPerMessage: costPerMessage ?? 1,
      enabled: enabled ?? true,
    });

    return NextResponse.json({ success: true, data: model });
  } catch (error) {
    console.error('Failed to create chat model:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : '创建失败' },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest) {
  try {
    const [session, body] = await Promise.all([
      getServerSession(authOptions),
      request.json(),
    ]);
    if (!session?.user || session.user.role !== 'admin') {
      return NextResponse.json({ success: false, error: '无权限' }, { status: 403 });
    }

    const { id, ...updates } = body;

    if (!id) {
      return NextResponse.json({ success: false, error: '缺少 ID' }, { status: 400 });
    }

    const { updateChatModel } = await import('@/lib/db/chat-models');
    const model = await updateChatModel(id, updates);
    if (!model) {
      return NextResponse.json({ success: false, error: '模型不存在' }, { status: 404 });
    }

    return NextResponse.json({ success: true, data: model });
  } catch (error) {
    console.error('Failed to update chat model:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : '更新失败' },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user || session.user.role !== 'admin') {
      return NextResponse.json({ success: false, error: '无权限' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ success: false, error: '缺少 ID' }, { status: 400 });
    }

    const { deleteChatModel } = await import('@/lib/db/chat-models');
    const success = await deleteChatModel(id);
    if (!success) {
      return NextResponse.json({ success: false, error: '删除失败' }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Failed to delete chat model:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : '删除失败' },
      { status: 500 }
    );
  }
}
