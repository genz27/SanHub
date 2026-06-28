import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getAgents, createAgent, updateAgent, deleteAgent, getUserAgents } from '@/lib/db';
import type { AgentToolDefinition } from '@/types/agent';

export const dynamic = 'force-dynamic';

// GET /api/agents — List agents
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: '请先登录' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const all = searchParams.get('all') === 'true';

    // Admin can see all agents via ?all=true
    if (all && session.user.role !== 'admin') {
      return NextResponse.json({ error: '无权限' }, { status: 403 });
    }

    const agents = all ? await getAgents() : await getUserAgents(session.user.id);

    return NextResponse.json({ success: true, data: agents });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '获取 Agent 列表失败' },
      { status: 500 }
    );
  }
}

// POST /api/agents — Create agent
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: '请先登录' }, { status: 401 });
    }

    const body = await request.json();

    if (!body.name || !body.modelId) {
      return NextResponse.json({ error: '名称和模型为必填项' }, { status: 400 });
    }

    const tools: AgentToolDefinition[] = (body.tools || []).map((t: any) => ({
      name: t.name,
      description: t.description || '',
      enabled: t.enabled !== false,
      config: t.config,
    }));

    const agent = await createAgent({
      userId: session.user.id,
      name: body.name,
      description: body.description || '',
      systemPrompt: body.systemPrompt || '你是 SanHub AI 助手。',
      modelId: body.modelId,
      tools,
      temperature: body.temperature ?? 0.7,
      maxTokens: body.maxTokens ?? 4096,
      maxToolRoundtrips: body.maxToolRoundtrips ?? 10,
      enabled: body.enabled !== false,
    });

    return NextResponse.json({ success: true, data: agent });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '创建 Agent 失败' },
      { status: 500 }
    );
  }
}

// PUT /api/agents — Update agent
export async function PUT(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: '请先登录' }, { status: 401 });
    }

    const body = await request.json();
    if (!body.id) {
      return NextResponse.json({ error: '缺少 Agent ID' }, { status: 400 });
    }

    const updates: Record<string, unknown> = {};
    if (body.name !== undefined) updates.name = body.name;
    if (body.description !== undefined) updates.description = body.description;
    if (body.systemPrompt !== undefined) updates.systemPrompt = body.systemPrompt;
    if (body.modelId !== undefined) updates.modelId = body.modelId;
    if (body.tools !== undefined) {
      updates.tools = (body.tools as any[]).map((t: any) => ({
        name: t.name,
        description: t.description || '',
        enabled: t.enabled !== false,
        config: t.config,
      }));
    }
    if (body.temperature !== undefined) updates.temperature = body.temperature;
    if (body.maxTokens !== undefined) updates.maxTokens = body.maxTokens;
    if (body.maxToolRoundtrips !== undefined) updates.maxToolRoundtrips = body.maxToolRoundtrips;
    if (body.enabled !== undefined) updates.enabled = body.enabled;

    const agent = await updateAgent(body.id, updates);
    if (!agent) {
      return NextResponse.json({ error: 'Agent 不存在' }, { status: 404 });
    }

    return NextResponse.json({ success: true, data: agent });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '更新 Agent 失败' },
      { status: 500 }
    );
  }
}

// DELETE /api/agents?id=xxx — Delete agent
export async function DELETE(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: '请先登录' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    if (!id) {
      return NextResponse.json({ error: '缺少 Agent ID' }, { status: 400 });
    }

    const deleted = await deleteAgent(id);
    if (!deleted) {
      return NextResponse.json({ error: 'Agent 不存在' }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '删除 Agent 失败' },
      { status: 500 }
    );
  }
}
