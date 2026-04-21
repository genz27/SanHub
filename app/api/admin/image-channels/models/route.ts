import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getImageChannel } from '@/lib/db';

export const dynamic = 'force-dynamic';

interface RemoteModel {
  id: string;
  object?: string;
  created?: number;
  owned_by?: string;
}

type ParsedModelVariant = {
  baseName: string;
  aspectRatio: string;
  imageSize: string;
};

const RATIO_SUFFIX_ALIASES: Record<string, string> = {
  landscape: '16:9',
  portrait: '9:16',
  square: '1:1',
  'four-three': '4:3',
  'three-four': '3:4',
  '1:1': '1:1',
  '1x1': '1:1',
  '1_1': '1:1',
  '1:4': '1:4',
  '1x4': '1:4',
  '1_4': '1:4',
  '1:8': '1:8',
  '1x8': '1:8',
  '1_8': '1:8',
  '2:3': '2:3',
  '2x3': '2:3',
  '2_3': '2:3',
  '3:2': '3:2',
  '3x2': '3:2',
  '3_2': '3:2',
  '3:4': '3:4',
  '3x4': '3:4',
  '3_4': '3:4',
  '4:1': '4:1',
  '4x1': '4:1',
  '4_1': '4:1',
  '4:3': '4:3',
  '4x3': '4:3',
  '4_3': '4:3',
  '4:5': '4:5',
  '4x5': '4:5',
  '4_5': '4:5',
  '5:4': '5:4',
  '5x4': '5:4',
  '5_4': '5:4',
  '8:1': '8:1',
  '8x1': '8:1',
  '8_1': '8:1',
  '9:16': '9:16',
  '9x16': '9:16',
  '9_16': '9:16',
  '16:9': '16:9',
  '16x9': '16:9',
  '16_9': '16:9',
  '21:9': '21:9',
  '21x9': '21:9',
  '21_9': '21:9',
};

const IMAGE_SIZE_SUFFIXES: Record<string, string> = {
  '': '1K',
  '-2k': '2K',
  '-4k': '4K',
};

const ORDERED_RATIO_SUFFIXES = Object.keys(RATIO_SUFFIX_ALIASES).sort((left, right) => right.length - left.length);
const ORDERED_IMAGE_SIZE_SUFFIXES = Object.entries(IMAGE_SIZE_SUFFIXES).sort(
  (left, right) => right[0].length - left[0].length
);

interface GroupedModel {
  baseName: string;
  displayName: string;
  apiModel: string;
  modelIds: string[];
  sourceModelIds: string[];
  modelCount: number;
  recommendedName: string;
  recommendedDescription: string;
  tags: string[];
  aspectRatios: string[];
  imageSizes: string[];
  resolutions: Record<string, string | Record<string, string>>;
  features: {
    textToImage: boolean;
    imageToImage: boolean;
    imageSize: boolean;
  };
}

const RATIO_ORDER = ['1:1', '16:9', '9:16', '4:3', '3:4', '3:2', '2:3', '4:5', '5:4', '21:9', '4:1', '8:1', '1:4', '1:8'];
const SIZE_ORDER = ['1K', '2K', '4K'];

function parseModelVariant(modelId: string): ParsedModelVariant | null {
  const normalized = modelId.trim().toLowerCase();
  if (!normalized) return null;

  for (const [sizeSuffix, imageSize] of ORDERED_IMAGE_SIZE_SUFFIXES) {
    for (const ratioSuffix of ORDERED_RATIO_SUFFIXES) {
      const suffix = `-${ratioSuffix}${sizeSuffix}`;
      if (!normalized.endsWith(suffix)) continue;

      const baseName = modelId.slice(0, modelId.length - suffix.length).trim();
      if (!baseName) continue;

      return {
        baseName,
        aspectRatio: RATIO_SUFFIX_ALIASES[ratioSuffix],
        imageSize,
      };
    }
  }

  return null;
}

function formatDisplayName(baseName: string): string {
  const lower = baseName.toLowerCase();
  if (lower.includes('gemini-3.0-pro-image')) return 'Gemini 3 Pro';
  if (lower.includes('gemini-2.5-flash-image')) return 'Gemini 2.5 Flash';
  if (lower.includes('imagen-4.0-generate-preview')) return 'Imagen 4 Preview';

  return baseName
    .replace(/[-_]+/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function buildRecommendedDescription(group: Pick<GroupedModel, 'features' | 'aspectRatios' | 'imageSizes' | 'modelCount'>): string {
  const abilities: string[] = [];
  if (group.features.textToImage) abilities.push('文生图');
  if (group.features.imageToImage) abilities.push('图生图');
  if (group.features.imageSize) abilities.push(`分档 ${group.imageSizes.join('/')}`);

  const summary = abilities.length > 0 ? abilities.join(' / ') : '基础图像能力';
  return `${summary}，已自动整理 ${group.aspectRatios.length} 种比例，共 ${group.modelCount} 个远端模型。`;
}

function groupModels(models: RemoteModel[]): { grouped: GroupedModel[]; ungrouped: RemoteModel[] } {
  const grouped: Map<string, GroupedModel> = new Map();
  const modelMap = new Map(models.map((model) => [model.id, model]));
  const processedIds = new Set<string>();

  for (const model of models) {
    const parsed = parseModelVariant(model.id);
    if (!parsed) {
      continue;
    }

    let group = grouped.get(parsed.baseName);
    if (!group) {
      const displayName = formatDisplayName(parsed.baseName);
      group = {
        baseName: parsed.baseName,
        displayName,
        apiModel: parsed.baseName,
        modelIds: [],
        sourceModelIds: [],
        modelCount: 0,
        recommendedName: displayName,
        recommendedDescription: '',
        tags: [],
        aspectRatios: [],
        imageSizes: [],
        resolutions: {},
        features: {
          textToImage: true,
          imageToImage: true,
          imageSize: false,
        },
      };
      grouped.set(parsed.baseName, group);
    }

    if (!group.modelIds.includes(model.id)) {
      group.modelIds.push(model.id);
    }
    if (!group.sourceModelIds.includes(model.id)) {
      group.sourceModelIds.push(model.id);
    }

    if (!group.aspectRatios.includes(parsed.aspectRatio)) {
      group.aspectRatios.push(parsed.aspectRatio);
    }
    if (!group.imageSizes.includes(parsed.imageSize)) {
      group.imageSizes.push(parsed.imageSize);
    }

    if (!group.resolutions[parsed.imageSize] || typeof group.resolutions[parsed.imageSize] === 'string') {
      group.resolutions[parsed.imageSize] = {};
    }
    (group.resolutions[parsed.imageSize] as Record<string, string>)[parsed.aspectRatio] = model.id;

    processedIds.add(model.id);
  }

  for (const group of Array.from(grouped.values())) {
    if (!modelMap.has(group.baseName)) continue;

    if (!group.modelIds.includes(group.baseName)) {
      group.modelIds.unshift(group.baseName);
    }
    if (!group.sourceModelIds.includes(group.baseName)) {
      group.sourceModelIds.unshift(group.baseName);
    }
    processedIds.add(group.baseName);
  }

  for (const group of Array.from(grouped.values())) {
    group.modelCount = group.modelIds.length;
    group.aspectRatios.sort((left, right) => {
      const leftIndex = RATIO_ORDER.indexOf(left);
      const rightIndex = RATIO_ORDER.indexOf(right);
      return (leftIndex === -1 ? 99 : leftIndex) - (rightIndex === -1 ? 99 : rightIndex);
    });
    group.imageSizes.sort((left, right) => {
      const leftIndex = SIZE_ORDER.indexOf(left);
      const rightIndex = SIZE_ORDER.indexOf(right);
      return (leftIndex === -1 ? 99 : leftIndex) - (rightIndex === -1 ? 99 : rightIndex);
    });

    const sizeBuckets = group.resolutions as Record<string, Record<string, string>>;
    group.features.imageSize = group.imageSizes.length > 1;

    if (!group.features.imageSize) {
      const flattenedRatioMap = sizeBuckets[group.imageSizes[0]] || {};
      group.resolutions = flattenedRatioMap;
    }

    const tags: string[] = [];
    if (group.features.textToImage) tags.push('文生图');
    if (group.features.imageToImage) tags.push('图生图');
    if (group.features.imageSize) tags.push('多清晰度');
    tags.push(`${group.modelCount} 个远端模型`);
    group.tags = tags;

    const defaultRatio = group.aspectRatios.includes('1:1') ? '1:1' : group.aspectRatios[0];
    const defaultSize = group.imageSizes.includes('1K') ? '1K' : group.imageSizes[0];

    if (modelMap.has(group.baseName)) {
      group.apiModel = group.baseName;
    } else if (group.features.imageSize && defaultSize) {
      const sizeConfig = sizeBuckets[defaultSize];
      if (sizeConfig && defaultRatio && sizeConfig[defaultRatio]) {
        group.apiModel = sizeConfig[defaultRatio];
      }
    } else if (defaultRatio) {
      const ratioConfig = (group.resolutions as Record<string, string>)[defaultRatio];
      if (typeof ratioConfig === 'string') {
        group.apiModel = ratioConfig;
      }
    }

    group.recommendedDescription = buildRecommendedDescription(group);
  }

  return {
    grouped: Array.from(grouped.values()).sort((left, right) => left.displayName.localeCompare(right.displayName)),
    ungrouped: models.filter((model) => !processedIds.has(model.id)),
  };
}

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user || session.user.role !== 'admin') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const channelId = searchParams.get('channelId');
    const groupParam = searchParams.get('group');

    if (!channelId) {
      return NextResponse.json({ error: 'channelId is required' }, { status: 400 });
    }

    const channel = await getImageChannel(channelId);
    if (!channel) {
      return NextResponse.json({ error: 'Channel not found' }, { status: 404 });
    }

    if (!channel.baseUrl) {
      return NextResponse.json({ error: 'Channel has no baseUrl configured' }, { status: 400 });
    }

    if (channel.type !== 'openai-chat' && channel.type !== 'openai-compatible') {
      return NextResponse.json(
        { error: 'This channel type does not support fetching remote models' },
        { status: 400 }
      );
    }

    const baseUrl = channel.baseUrl.replace(/\/$/, '');
    const modelsUrl = `${baseUrl}/v1/models`;
    const apiKey = channel.apiKey?.split(',')[0]?.trim();

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (apiKey) {
      headers.Authorization = `Bearer ${apiKey}`;
    }

    const response = await fetch(modelsUrl, {
      method: 'GET',
      headers,
    });

    if (!response.ok) {
      const errorText = await response.text();
      return NextResponse.json(
        { error: `Failed to fetch models (${response.status}): ${errorText}` },
        { status: 502 }
      );
    }

    const data = await response.json();
    const models: RemoteModel[] = data.data || data.models || [];

    if (groupParam === 'true') {
      const { grouped, ungrouped } = groupModels(models);
      return NextResponse.json({
        success: true,
        data: {
          grouped,
          ungrouped: ungrouped.map((model) => ({ id: model.id, owned_by: model.owned_by || 'unknown' })),
        },
      });
    }

    const result = models.map((model) => ({
      id: model.id,
      owned_by: model.owned_by || 'unknown',
    }));

    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    console.error('[API] Fetch remote models error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch models' },
      { status: 500 }
    );
  }
}
