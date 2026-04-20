import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { createVideoModel, getVideoChannel, getVideoModels } from '@/lib/db';
import {
  buildVideoModelDescription,
  getVeoDisplayName,
  getVeoGroupKey,
  isVeoApiModel,
} from '@/lib/video-model-normalizer';
import type { VideoDuration, VideoModelFeatures } from '@/types';

export const dynamic = 'force-dynamic';

type RemoteModel = {
  id: string;
  owned_by?: string;
};

type VideoCategory = 't2v' | 'i2v' | 'r2v' | 'interpolation' | 'upsample';

type ClassifiedVideoModel = {
  apiModel: string;
  name: string;
  description: string;
  category: VideoCategory;
  categoryLabel: string;
  features: VideoModelFeatures;
  aspectRatios: Array<{ value: string; label: string }>;
  defaultAspectRatio: string;
  durations: VideoDuration[];
  defaultDuration: string;
  sourceModelIds?: string[];
};

type ImportRequestBody = {
  channelId?: string;
  modelIds?: string[];
};

const CATEGORY_ORDER: Record<VideoCategory, number> = {
  t2v: 1,
  i2v: 2,
  r2v: 3,
  interpolation: 4,
  upsample: 5,
};

const CATEGORY_LABELS: Record<VideoCategory, string> = {
  t2v: '文生视频',
  i2v: '图生视频',
  r2v: '多图视频',
  interpolation: '首尾帧视频',
  upsample: '视频放大',
};

const CATEGORY_DESCRIPTION: Record<VideoCategory, string> = {
  t2v: '不支持上传图片',
  i2v: '支持 1-2 张图片（首帧/首尾帧）',
  r2v: '支持多张参考图片',
  interpolation: '支持首尾帧插帧生成',
  upsample: '用于视频放大输出',
};

function inferDurationSeconds(_modelId: string): 8 {
  return 8;
}

function inferDurationCost(modelId: string, category: VideoCategory, seconds: 8): number {
  const lower = modelId.toLowerCase();
  if (category === 'upsample') {
    if (/_4k$/.test(lower)) return 200;
    if (/_1080p$/.test(lower)) return 150;
    return 150;
  }
  return 100;
}

function inferAspectRatio(modelId: string): { value: string; label: string; zhLabel: string } {
  const lower = modelId.toLowerCase();
  if (lower.includes('portrait')) {
    return { value: 'portrait', label: '9:16', zhLabel: '竖屏' };
  }
  if (lower.includes('square')) {
    return { value: 'square', label: '1:1', zhLabel: '方屏' };
  }
  return { value: 'landscape', label: '16:9', zhLabel: '横屏' };
}

function inferOutputResolution(modelId: string): string | null {
  const lower = modelId.toLowerCase();
  if (/_4k$/.test(lower)) return '4K';
  if (/_1080p$/.test(lower)) return '1080P';
  return null;
}

function inferVeoVersionLabel(modelId: string): string {
  const lower = modelId.toLowerCase();
  const match = lower.match(/^veo_(\d+)_(\d+)/);
  if (match) return `Veo ${match[1]}.${match[2]}`;
  const fallback = lower.match(/^veo_(\d+)/);
  if (fallback) return `Veo ${fallback[1]}`;
  return 'Veo';
}

function inferModelTierLabel(modelId: string): string {
  const lower = modelId.toLowerCase();
  if (lower.includes('ultra_relaxed')) return 'Ultra Relaxed';
  if (lower.includes('ultra')) return 'Ultra';
  if (lower.includes('fast')) return 'Fast';
  return 'Standard';
}

function buildLocalizedName(params: {
  category: VideoCategory;
  orientationZh: string;
  seconds: 8;
  outputResolution: string | null;
  versionLabel: string;
  tierLabel: string;
}): string {
  const categoryLabel = CATEGORY_LABELS[params.category];
  if (params.category === 'upsample') {
    const output = params.outputResolution || '高清';
    return `${categoryLabel}（${output}）${params.versionLabel} ${params.tierLabel}`;
  }
  return `${categoryLabel}（${params.orientationZh} ${params.seconds}秒）${params.versionLabel} ${params.tierLabel}`;
}

function classifyFlow2ApiModel(modelId: string): ClassifiedVideoModel | null {
  const lower = modelId.toLowerCase();
  if (!lower.startsWith('veo_')) return null;

  const isUpsample = /_(4k|1080p)$/.test(lower);
  const isT2V = lower.includes('_t2v_');
  const isI2V = lower.includes('_i2v_');
  const isR2V = lower.includes('_r2v_');
  const isInterpolation = lower.includes('_interpolation_');
  if (!isT2V && !isI2V && !isR2V && !isInterpolation) return null;

  let category: VideoCategory;
  if (isUpsample) category = 'upsample';
  else if (isInterpolation) category = 'interpolation';
  else if (isI2V) category = 'i2v';
  else if (isR2V) category = 'r2v';
  else category = 't2v';

  const seconds = inferDurationSeconds(modelId);
  const cost = inferDurationCost(modelId, category, seconds);
  const duration = `${seconds}s`;
  const aspectRatio = inferAspectRatio(modelId);
  const outputResolution = inferOutputResolution(modelId);
  const versionLabel = inferVeoVersionLabel(modelId);
  const tierLabel = inferModelTierLabel(modelId);

  const features: VideoModelFeatures = {
    textToVideo: true,
    imageToVideo: isI2V || isR2V || isInterpolation,
    videoToVideo: false,
    supportStyles: false,
  };

  const categoryLabel = CATEGORY_LABELS[category];
  const usage = CATEGORY_DESCRIPTION[category];
  const readableName = buildLocalizedName({
    category,
    orientationZh: aspectRatio.zhLabel,
    seconds,
    outputResolution,
    versionLabel,
    tierLabel,
  });
  const readableDescription = [
    usage,
    `方向: ${aspectRatio.zhLabel}`,
    category === 'upsample' ? `输出: ${outputResolution || '高清'}` : `时长: ${seconds}秒`,
    `版本: ${versionLabel}`,
    `等级: ${tierLabel}`,
  ].join(' | ');

  return {
    apiModel: modelId,
    name: readableName,
    description: readableDescription,
    category,
    categoryLabel,
    features,
    aspectRatios: [{ value: aspectRatio.value, label: aspectRatio.label }],
    defaultAspectRatio: aspectRatio.value,
    durations: [{ value: duration, label: `${seconds} 秒`, cost }],
    defaultDuration: duration,
  };
}

function sortClassifiedModels(models: ClassifiedVideoModel[]): ClassifiedVideoModel[] {
  return [...models].sort((left, right) => {
    const categoryOrder = CATEGORY_ORDER[left.category] - CATEGORY_ORDER[right.category];
    if (categoryOrder !== 0) return categoryOrder;
    return left.apiModel.localeCompare(right.apiModel);
  });
}

function uniqueAspectRatios(models: ClassifiedVideoModel[]): Array<{ value: string; label: string }> {
  const ratioMap = new Map<string, { value: string; label: string }>();
  for (const model of models) {
    for (const ratio of model.aspectRatios) {
      if (!ratioMap.has(ratio.value)) {
        ratioMap.set(ratio.value, ratio);
      }
    }
  }

  const order = ['landscape', 'portrait', 'square'];
  return Array.from(ratioMap.values()).sort((left, right) => {
    const leftIndex = order.indexOf(left.value);
    const rightIndex = order.indexOf(right.value);
    return (leftIndex === -1 ? 99 : leftIndex) - (rightIndex === -1 ? 99 : rightIndex);
  });
}

function mergeGroupedFeatures(models: ClassifiedVideoModel[]): VideoModelFeatures {
  return {
    textToVideo: models.some((model) => model.features.textToVideo),
    imageToVideo: models.some((model) => model.features.imageToVideo),
    videoToVideo: models.some((model) => model.features.videoToVideo),
    supportStyles: models.some((model) => model.features.supportStyles),
  };
}

function pickRepresentativeModelId(models: ClassifiedVideoModel[]): string {
  const preferred =
    models.find(
      (model) =>
        model.category === 't2v' &&
        model.defaultAspectRatio === 'landscape' &&
        !/_(4k|1080p)$/i.test(model.apiModel)
    ) ||
    models.find((model) => model.category === 't2v' && !/_(4k|1080p)$/i.test(model.apiModel)) ||
    models.find((model) => !/_(4k|1080p)$/i.test(model.apiModel)) ||
    models[0];

  return preferred.apiModel;
}

function mergeClassifiedModels(models: ClassifiedVideoModel[]): ClassifiedVideoModel[] {
  const groups = new Map<string, ClassifiedVideoModel[]>();
  const order: string[] = [];

  for (const model of models) {
    const groupKey = isVeoApiModel(model.apiModel)
      ? getVeoGroupKey(model.apiModel)
      : model.apiModel;

    if (!groups.has(groupKey)) {
      groups.set(groupKey, []);
      order.push(groupKey);
    }
    groups.get(groupKey)!.push(model);
  }

  return order.map((groupKey) => {
    const groupModels = groups.get(groupKey)!;
    if (groupModels.length === 1) {
      return {
        ...groupModels[0],
        sourceModelIds: [groupModels[0].apiModel],
      };
    }

    const representativeApiModel = pickRepresentativeModelId(groupModels);
    const aspectRatios = uniqueAspectRatios(groupModels);
    const features = mergeGroupedFeatures(groupModels);
    const defaultAspectRatio = aspectRatios.some((ratio) => ratio.value === 'landscape')
      ? 'landscape'
      : aspectRatios[0]?.value || 'landscape';

    return {
      apiModel: representativeApiModel,
      name: getVeoDisplayName(representativeApiModel),
      description: buildVideoModelDescription({
        features,
        aspectRatios,
        sourceCount: groupModels.length,
      }),
      category: 't2v',
      categoryLabel: '视频生成',
      features,
      aspectRatios,
      defaultAspectRatio,
      durations: [{ value: '8s', label: '8 秒', cost: 100 }],
      defaultDuration: '8s',
      sourceModelIds: groupModels.map((model) => model.apiModel),
    };
  });
}

function getClassifiedModelSelectionId(model: ClassifiedVideoModel): string {
  if (isVeoApiModel(model.apiModel) && (model.sourceModelIds?.length || 0) > 1) {
    return getVeoGroupKey(model.apiModel);
  }
  return model.apiModel;
}

async function fetchChannelRemoteModels(channelId: string): Promise<RemoteModel[]> {
  const channel = await getVideoChannel(channelId);
  if (!channel) {
    throw new Error('渠道不存在');
  }
  if (channel.type !== 'flow2api') {
    throw new Error('仅支持 Flow2API 渠道一键导入');
  }
  if (!channel.baseUrl) {
    throw new Error('该渠道未配置 Base URL');
  }

  const baseUrl = channel.baseUrl.replace(/\/$/, '');
  const modelsUrl = `${baseUrl}/v1/models`;
  const apiKey = channel.apiKey?.split(',')[0]?.trim();

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`;

  const response = await fetch(modelsUrl, {
    method: 'GET',
    headers,
  });

  if (!response.ok) {
    const details = await response.text().catch(() => '');
    throw new Error(`拉取 /v1/models 失败 (${response.status})${details ? `: ${details}` : ''}`);
  }

  const data = await response.json();
  const models = (data?.data || data?.models || []) as RemoteModel[];
  return Array.isArray(models) ? models : [];
}

function parseSelectedModelIds(body: ImportRequestBody): Set<string> {
  const modelIds = Array.isArray(body.modelIds)
    ? body.modelIds.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    : [];
  return new Set(modelIds);
}

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user || session.user.role !== 'admin') {
      return NextResponse.json({ error: '无权限' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const channelId = searchParams.get('channelId');
    if (!channelId) {
      return NextResponse.json({ error: '缺少 channelId' }, { status: 400 });
    }

    const remoteModels = await fetchChannelRemoteModels(channelId);
    const classified = mergeClassifiedModels(sortClassifiedModels(
      remoteModels
        .map((model) => classifyFlow2ApiModel(model.id))
        .filter((model): model is ClassifiedVideoModel => Boolean(model))
    ));

    const existingModels = await getVideoModels();
    const existingApiModelSet = new Set(
      existingModels
        .filter((model) => model.channelId === channelId)
        .map((model) => model.apiModel)
    );

    return NextResponse.json({
      success: true,
      data: {
        total: remoteModels.length,
        matched: classified.length,
        models: classified.map((model) => ({
          id: getClassifiedModelSelectionId(model),
          displayName: model.name,
          description: model.description,
          category: model.category,
          categoryLabel: model.categoryLabel,
          defaultAspectRatio: model.defaultAspectRatio,
          defaultDuration: model.defaultDuration,
          alreadyImported:
            existingApiModelSet.has(model.apiModel) ||
            (model.sourceModelIds || []).some((sourceModelId) => existingApiModelSet.has(sourceModelId)),
        })),
      },
    });
  } catch (error) {
    console.error('[API] Fetch flow2api video models error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '拉取模型失败' },
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

    const body = (await request.json().catch(() => ({}))) as ImportRequestBody;
    const channelId = typeof body.channelId === 'string' ? body.channelId : '';
    if (!channelId) {
      return NextResponse.json({ error: '缺少 channelId' }, { status: 400 });
    }

    const selectedModelIds = parseSelectedModelIds(body);
    const remoteModels = await fetchChannelRemoteModels(channelId);
    let classified = sortClassifiedModels(
      remoteModels
        .map((model) => classifyFlow2ApiModel(model.id))
        .filter((model): model is ClassifiedVideoModel => Boolean(model))
    );

    if (selectedModelIds.size > 0) {
      classified = classified.filter(
        (model) =>
          selectedModelIds.has(model.apiModel) ||
          selectedModelIds.has(getVeoGroupKey(model.apiModel))
      );
    }

    classified = mergeClassifiedModels(classified);

    if (classified.length === 0) {
      return NextResponse.json(
        { error: selectedModelIds.size > 0 ? '未匹配到可导入的已选模型' : '远程 /v1/models 未发现可导入的视频模型' },
        { status: 400 }
      );
    }

    const existing = await getVideoModels();
    const existingApiModels = new Set(
      existing
        .filter((model) => model.channelId === channelId)
        .map((model) => model.apiModel)
    );
    const existingCount = existing.filter((model) => model.channelId === channelId).length;

    let created = 0;
    let skipped = 0;
    const failed: string[] = [];

    for (const model of classified) {
      const sourceModelIds = model.sourceModelIds || [model.apiModel];
      if (
        existingApiModels.has(model.apiModel) ||
        sourceModelIds.some((sourceModelId) => existingApiModels.has(sourceModelId))
      ) {
        skipped += 1;
        continue;
      }
      try {
        await createVideoModel({
          channelId,
          name: model.name,
          description: model.description,
          apiModel: model.apiModel,
          features: model.features,
          aspectRatios: model.aspectRatios,
          durations: model.durations,
          defaultAspectRatio: model.defaultAspectRatio,
          defaultDuration: model.defaultDuration,
          highlight: false,
          enabled: true,
          sortOrder: existingCount + created,
        });
        existingApiModels.add(model.apiModel);
        sourceModelIds.forEach((sourceModelId) => existingApiModels.add(sourceModelId));
        created += 1;
      } catch {
        skipped += 1;
        failed.push(model.apiModel);
      }
    }

    return NextResponse.json({
      success: true,
      data: {
        total: classified.length,
        created,
        skipped,
        failed,
      },
    });
  } catch (error) {
    console.error('[API] Import flow2api video models error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '导入失败' },
      { status: 500 }
    );
  }
}
