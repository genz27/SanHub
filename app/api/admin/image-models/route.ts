import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import {
  getImageModels,
  getImageModelsByChannel,
  getImageModel,
  createImageModel,
  updateImageModel,
  deleteImageModel,
} from '@/lib/db/image-channels';

export const dynamic = 'force-dynamic';

// GET - 获取所有模型或指定渠道的模型
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user || session.user.role !== 'admin') {
      return NextResponse.json({ error: '无权限' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const channelId = searchParams.get('channelId');

    const models = channelId
      ? await getImageModelsByChannel(channelId)
      : await getImageModels();

    return NextResponse.json({ success: true, data: models });
  } catch (error) {
    console.error('[API] Get image models error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '获取失败' },
      { status: 500 }
    );
  }
}

// POST - 创建模型
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user || session.user.role !== 'admin') {
      return NextResponse.json({ error: '无权限' }, { status: 403 });
    }

    const body = await request.json();
    const {
      channelId,
      name,
      description,
      apiModel,
      baseUrl,
      apiKey,
      features,
      aspectRatios,
      resolutions,
      imageSizes,
      defaultAspectRatio,
      defaultImageSize,
      requiresReferenceImage,
      allowEmptyPrompt,
      highlight,
      enabled,
      costPerGeneration,
      sortOrder,
    } = body;

    if (!channelId || !name || !apiModel) {
      return NextResponse.json({ error: '渠道、名称和模型 ID 必填' }, { status: 400 });
    }

    const model = await createImageModel({
      channelId,
      name,
      description: description || '',
      apiModel,
      baseUrl: baseUrl || undefined,
      apiKey: apiKey || undefined,
      features: features || {
        textToImage: true,
        imageToImage: false,
        upscale: false,
        matting: false,
        multipleImages: false,
        imageSize: false,
      },
      aspectRatios: aspectRatios || ['1:1'],
      resolutions: resolutions || { '1:1': '1024x1024' },
      imageSizes: imageSizes || undefined,
      defaultAspectRatio: defaultAspectRatio || '1:1',
      defaultImageSize: defaultImageSize || undefined,
      requiresReferenceImage: requiresReferenceImage || false,
      allowEmptyPrompt: allowEmptyPrompt || false,
      highlight: highlight || false,
      enabled: enabled !== false,
      costPerGeneration: costPerGeneration || 10,
      sortOrder: sortOrder || 0,
    });

    return NextResponse.json({ success: true, data: model });
  } catch (error) {
    console.error('[API] Create image model error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '创建失败' },
      { status: 500 }
    );
  }
}

// PUT - 更新模型
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

    const model = await updateImageModel(id, updates);
    if (!model) {
      return NextResponse.json({ error: '模型不存在' }, { status: 404 });
    }

    return NextResponse.json({ success: true, data: model });
  } catch (error) {
    console.error('[API] Update image model error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '更新失败' },
      { status: 500 }
    );
  }
}

// DELETE - 删除模型
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

    const success = await deleteImageModel(id);
    if (!success) {
      return NextResponse.json({ error: '删除失败' }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[API] Delete image model error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '删除失败' },
      { status: 500 }
    );
  }
}
