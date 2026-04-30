import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import {
  getVideoChannels,
  createVideoChannel,
  updateVideoChannel,
  deleteVideoChannel,
} from '@/lib/db';
import type { VideoChannelType } from '@/types';

export const dynamic = 'force-dynamic';

const VIDEO_CHANNEL_TYPES: VideoChannelType[] = [
  'apexerapi',
  'sora',
  'openai-compatible',
  'flow2api',
  'grok2api',
];

const VIDEO_CHANNEL_TYPE_ALIASES: Record<string, VideoChannelType> = {
  apexerapi: 'apexerapi',
  apexer: 'apexerapi',
  apexer_api: 'apexerapi',
  sora: 'sora',
  'openai-compatible': 'openai-compatible',
  openai_compatible: 'openai-compatible',
  openai: 'openai-compatible',
  flow2api: 'flow2api',
  flow2apiw: 'flow2api',
  grok2api: 'grok2api',
};

function normalizeVideoChannelType(input: unknown): VideoChannelType | null {
  if (typeof input !== 'string') return null;
  const normalized = input.trim().toLowerCase();
  return VIDEO_CHANNEL_TYPE_ALIASES[normalized] || null;
}

function buildTypeErrorMessage(): string {
  return `无效的渠道类型，支持: ${VIDEO_CHANNEL_TYPES.join(', ')}`;
}

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user || session.user.role !== 'admin') {
      return NextResponse.json({ error: '无权限' }, { status: 403 });
    }

    const channels = await getVideoChannels();
    return NextResponse.json({ success: true, data: channels });
  } catch (error) {
    console.error('[API] Get video channels error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '获取失败' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user || session.user.role !== 'admin') {
      return NextResponse.json({ error: '无权限' }, { status: 403 });
    }

    const body = await request.json();
    const { name, type, baseUrl, apiKey, enabled } = body;
    const normalizedType = normalizeVideoChannelType(type);

    if (!name || !type) {
      return NextResponse.json({ error: '名称和类型必填' }, { status: 400 });
    }
    if (!normalizedType) {
      return NextResponse.json({ error: buildTypeErrorMessage() }, { status: 400 });
    }

    const channel = await createVideoChannel({
      name,
      type: normalizedType,
      baseUrl: baseUrl || '',
      apiKey: apiKey || '',
      enabled: enabled !== false,
    });

    return NextResponse.json({ success: true, data: channel });
  } catch (error) {
    console.error('[API] Create video channel error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '创建失败' },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user || session.user.role !== 'admin') {
      return NextResponse.json({ error: '无权限' }, { status: 403 });
    }

    const body = await request.json();
    const { id, ...updates } = body;

    if (!id) {
      return NextResponse.json({ error: '缺少 ID' }, { status: 400 });
    }

    const normalizedUpdates = { ...updates } as Partial<{
      name: string;
      type: VideoChannelType;
      baseUrl: string;
      apiKey: string;
      enabled: boolean;
    }>;
    if (Object.prototype.hasOwnProperty.call(updates, 'type')) {
      const normalizedType = normalizeVideoChannelType((updates as { type?: unknown }).type);
      if (!normalizedType) {
        return NextResponse.json({ error: buildTypeErrorMessage() }, { status: 400 });
      }
      normalizedUpdates.type = normalizedType;
    }

    const channel = await updateVideoChannel(id, normalizedUpdates);
    if (!channel) {
      return NextResponse.json({ error: '渠道不存在' }, { status: 404 });
    }

    return NextResponse.json({ success: true, data: channel });
  } catch (error) {
    console.error('[API] Update video channel error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '更新失败' },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user || session.user.role !== 'admin') {
      return NextResponse.json({ error: '无权限' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ error: '缺少 ID' }, { status: 400 });
    }

    const success = await deleteVideoChannel(id);
    if (!success) {
      return NextResponse.json({ error: '删除失败' }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[API] Delete video channel error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '删除失败' },
      { status: 500 }
    );
  }
}
