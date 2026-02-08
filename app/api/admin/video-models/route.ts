import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import {
  getVideoModels,
  getVideoModel,
  createVideoModel,
  updateVideoModel,
  deleteVideoModel,
} from '@/lib/db';
import type { VideoConfigObject } from '@/types';

function normalizeVideoConfigObject(raw: unknown): VideoConfigObject | undefined {
  if (!raw || typeof raw !== 'object') return undefined;

  const source = raw as Record<string, unknown>;
  const config: VideoConfigObject = {};

  const aspectRatioRaw = source.aspect_ratio;
  if (typeof aspectRatioRaw === 'string') {
    const aspectRatio = aspectRatioRaw.trim();
    if (['16:9', '9:16', '1:1', '2:3', '3:2'].includes(aspectRatio)) {
      config.aspect_ratio = aspectRatio as VideoConfigObject['aspect_ratio'];
    }
  }

  const videoLengthRaw = source.video_length;
  if (typeof videoLengthRaw === 'number' && Number.isFinite(videoLengthRaw)) {
    const seconds = Math.max(5, Math.min(15, Math.floor(videoLengthRaw)));
    config.video_length = seconds;
  }

  const resolutionRaw = source.resolution;
  if (typeof resolutionRaw === 'string') {
    const resolution = resolutionRaw.trim().toUpperCase();
    if (resolution === 'SD' || resolution === 'HD') {
      config.resolution = resolution;
    }
  }

  const presetRaw = source.preset;
  if (typeof presetRaw === 'string') {
    const preset = presetRaw.trim().toLowerCase();
    if (preset === 'fun' || preset === 'normal' || preset === 'spicy') {
      config.preset = preset;
    }
  }

  return Object.keys(config).length > 0 ? config : undefined;
}

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user || session.user.role !== 'admin') {
      return NextResponse.json({ error: '无权限' }, { status: 403 });
    }

    const models = await getVideoModels();
    return NextResponse.json({ success: true, data: models });
  } catch (error) {
    console.error('[API] Get video models error:', error);
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
    const {
      channelId, name, description, apiModel, baseUrl, apiKey,
      features, aspectRatios, durations,
      defaultAspectRatio, defaultDuration, videoConfigObject, highlight, enabled, sortOrder,
    } = body;

    if (!channelId || !name || !apiModel) {
      return NextResponse.json({ error: '渠道、名称和模型 ID 必填' }, { status: 400 });
    }

    const model = await createVideoModel({
      channelId,
      name,
      description: description || '',
      apiModel,
      baseUrl: baseUrl || undefined,
      apiKey: apiKey || undefined,
      features: features || {
        textToVideo: true,
        imageToVideo: false,
        videoToVideo: false,
        supportStyles: false,
      },
      aspectRatios: aspectRatios || [
        { value: 'landscape', label: '16:9' },
        { value: 'portrait', label: '9:16' },
      ],
      durations: durations || [
        { value: '10s', label: '10 秒', cost: 100 },
      ],
      defaultAspectRatio: defaultAspectRatio || 'landscape',
      defaultDuration: defaultDuration || '10s',
      videoConfigObject: normalizeVideoConfigObject(videoConfigObject),
      highlight: highlight || false,
      enabled: enabled !== false,
      sortOrder: sortOrder || 0,
    });

    return NextResponse.json({ success: true, data: model });
  } catch (error) {
    console.error('[API] Create video model error:', error);
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

    const normalizedUpdates =
      Object.prototype.hasOwnProperty.call(updates, 'videoConfigObject')
        ? {
            ...updates,
            videoConfigObject: normalizeVideoConfigObject(
              (updates as { videoConfigObject?: unknown }).videoConfigObject
            ),
          }
        : updates;

    const model = await updateVideoModel(id, normalizedUpdates);
    if (!model) {
      return NextResponse.json({ error: '模型不存在' }, { status: 404 });
    }

    return NextResponse.json({ success: true, data: model });
  } catch (error) {
    console.error('[API] Update video model error:', error);
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

    const success = await deleteVideoModel(id);
    if (!success) {
      return NextResponse.json({ error: '删除失败' }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[API] Delete video model error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '删除失败' },
      { status: 500 }
    );
  }
}
