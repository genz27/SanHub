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

interface ModelPattern {
  basePattern: RegExp;
  ratioSuffixes: Record<string, string>;
  sizeSuffixes: Record<string, string>;
}

const MODEL_PATTERNS: ModelPattern[] = [
  {
    basePattern: /^(.+?-image)-(landscape|portrait|square|four-three|three-four)(-2k|-4k)?$/i,
    ratioSuffixes: {
      landscape: '16:9',
      portrait: '9:16',
      square: '1:1',
      'four-three': '4:3',
      'three-four': '3:4',
    },
    sizeSuffixes: {
      '': '1K',
      '-2k': '2K',
      '-4k': '4K',
    },
  },
  {
    basePattern: /^(.+?-preview)-(landscape|portrait)$/i,
    ratioSuffixes: {
      landscape: '16:9',
      portrait: '9:16',
    },
    sizeSuffixes: {},
  },
];

interface GroupedModel {
  baseName: string;
  displayName: string;
  apiModel: string;
  modelIds: string[];
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

const RATIO_ORDER = ['1:1', '16:9', '9:16', '4:3', '3:4'];
const SIZE_ORDER = ['1K', '2K', '4K'];

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
  const ungrouped: RemoteModel[] = [];
  const processedIds = new Set<string>();

  for (const model of models) {
    let matched = false;

    for (const pattern of MODEL_PATTERNS) {
      const match = model.id.match(pattern.basePattern);
      if (!match) continue;

      const baseName = match[1];
      const ratioSuffix = match[2].toLowerCase();
      const sizeSuffix = (match[3] || '').toLowerCase();

      const aspectRatio = pattern.ratioSuffixes[ratioSuffix];
      const imageSize = pattern.sizeSuffixes[sizeSuffix] || '1K';
      if (!aspectRatio) continue;

      let group = grouped.get(baseName);
      if (!group) {
        const displayName = formatDisplayName(baseName);
        group = {
          baseName,
          displayName,
          apiModel: model.id,
          modelIds: [],
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
            imageSize: Object.keys(pattern.sizeSuffixes).length > 1,
          },
        };
        grouped.set(baseName, group);
      }

      if (!group.modelIds.includes(model.id)) {
        group.modelIds.push(model.id);
        group.modelCount = group.modelIds.length;
      }

      if (!group.aspectRatios.includes(aspectRatio)) {
        group.aspectRatios.push(aspectRatio);
      }

      if (imageSize && !group.imageSizes.includes(imageSize)) {
        group.imageSizes.push(imageSize);
      }

      if (group.features.imageSize && imageSize) {
        if (!group.resolutions[imageSize]) {
          group.resolutions[imageSize] = {};
        }
        (group.resolutions[imageSize] as Record<string, string>)[aspectRatio] = model.id;
      } else {
        group.resolutions[aspectRatio] = model.id;
      }

      processedIds.add(model.id);
      matched = true;
      break;
    }

    if (!matched) {
      ungrouped.push(model);
    }
  }

  for (const group of Array.from(grouped.values())) {
    group.aspectRatios.sort((left, right) => RATIO_ORDER.indexOf(left) - RATIO_ORDER.indexOf(right));
    group.imageSizes.sort((left, right) => SIZE_ORDER.indexOf(left) - SIZE_ORDER.indexOf(right));

    const tags: string[] = [];
    if (group.features.textToImage) tags.push('文生图');
    if (group.features.imageToImage) tags.push('图生图');
    if (group.features.imageSize) tags.push('多清晰度');
    tags.push(`${group.modelCount} 个远端模型`);
    group.tags = tags;

    const defaultRatio = group.aspectRatios.includes('1:1') ? '1:1' : group.aspectRatios[0];
    const defaultSize = group.imageSizes.includes('1K') ? '1K' : group.imageSizes[0];

    if (group.features.imageSize && defaultSize) {
      const sizeConfig = group.resolutions[defaultSize];
      if (typeof sizeConfig === 'object' && defaultRatio && sizeConfig[defaultRatio]) {
        group.apiModel = sizeConfig[defaultRatio];
      }
    } else if (defaultRatio) {
      const ratioConfig = group.resolutions[defaultRatio];
      if (typeof ratioConfig === 'string') {
        group.apiModel = ratioConfig;
      }
    }

    group.recommendedDescription = buildRecommendedDescription(group);
  }

  return {
    grouped: Array.from(grouped.values()).sort((left, right) => left.displayName.localeCompare(right.displayName)),
    ungrouped: ungrouped.filter((model) => !processedIds.has(model.id)),
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
