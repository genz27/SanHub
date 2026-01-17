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

// Model grouping patterns for smart import
interface ModelPattern {
  basePattern: RegExp;
  ratioSuffixes: Record<string, string>; // suffix -> aspectRatio
  sizeSuffixes: Record<string, string>;  // suffix -> imageSize
}

const MODEL_PATTERNS: ModelPattern[] = [
  {
    // gemini-3.0-pro-image-{ratio}[-{size}]
    basePattern: /^(.+?-image)-(landscape|portrait|square|four-three|three-four)(-2k|-4k)?$/i,
    ratioSuffixes: {
      'landscape': '16:9',
      'portrait': '9:16',
      'square': '1:1',
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
    // imagen-4.0-generate-preview-{ratio}
    basePattern: /^(.+?-preview)-(landscape|portrait)$/i,
    ratioSuffixes: {
      'landscape': '16:9',
      'portrait': '9:16',
    },
    sizeSuffixes: {},
  },
];

interface GroupedModel {
  baseName: string;
  displayName: string;
  apiModel: string; // default model to use
  aspectRatios: string[];
  imageSizes: string[];
  resolutions: Record<string, string | Record<string, string>>;
  features: {
    textToImage: boolean;
    imageToImage: boolean;
    imageSize: boolean;
  };
}

function groupModels(models: RemoteModel[]): { grouped: GroupedModel[]; ungrouped: RemoteModel[] } {
  const grouped: Map<string, GroupedModel> = new Map();
  const ungrouped: RemoteModel[] = [];
  const processedIds = new Set<string>();

  for (const model of models) {
    let matched = false;

    for (const pattern of MODEL_PATTERNS) {
      const match = model.id.match(pattern.basePattern);
      if (match) {
        const baseName = match[1];
        const ratioSuffix = match[2].toLowerCase();
        const sizeSuffix = (match[3] || '').toLowerCase();

        const aspectRatio = pattern.ratioSuffixes[ratioSuffix];
        const imageSize = pattern.sizeSuffixes[sizeSuffix] || '1K';

        if (!aspectRatio) continue;

        let group = grouped.get(baseName);
        if (!group) {
          group = {
            baseName,
            displayName: baseName.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
            apiModel: model.id,
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

        // Add aspect ratio
        if (!group.aspectRatios.includes(aspectRatio)) {
          group.aspectRatios.push(aspectRatio);
        }

        // Add image size
        if (imageSize && !group.imageSizes.includes(imageSize)) {
          group.imageSizes.push(imageSize);
        }

        // Build resolutions mapping
        if (group.features.imageSize && imageSize) {
          // Nested: { ratio: { size: modelId } }
          if (!group.resolutions[aspectRatio]) {
            group.resolutions[aspectRatio] = {};
          }
          (group.resolutions[aspectRatio] as Record<string, string>)[imageSize] = model.id;
        } else {
          // Simple: { ratio: modelId }
          group.resolutions[aspectRatio] = model.id;
        }

        processedIds.add(model.id);
        matched = true;
        break;
      }
    }

    if (!matched) {
      ungrouped.push(model);
    }
  }

  // Sort aspect ratios and image sizes
  const ratioOrder = ['1:1', '16:9', '9:16', '4:3', '3:4'];
  const sizeOrder = ['1K', '2K', '4K'];

  for (const group of Array.from(grouped.values())) {
    group.aspectRatios.sort((a: string, b: string) => ratioOrder.indexOf(a) - ratioOrder.indexOf(b));
    group.imageSizes.sort((a: string, b: string) => sizeOrder.indexOf(a) - sizeOrder.indexOf(b));
    
    // Set default apiModel to the first available (1:1 or first ratio, 1K or first size)
    const defaultRatio = group.aspectRatios.includes('1:1') ? '1:1' : group.aspectRatios[0];
    if (defaultRatio) {
      const ratioConfig = group.resolutions[defaultRatio];
      if (typeof ratioConfig === 'string') {
        group.apiModel = ratioConfig;
      } else if (typeof ratioConfig === 'object') {
        const defaultSize = group.imageSizes.includes('1K') ? '1K' : group.imageSizes[0];
        if (defaultSize && ratioConfig[defaultSize]) {
          group.apiModel = ratioConfig[defaultSize];
        }
      }
    }
  }

  return {
    grouped: Array.from(grouped.values()),
    ungrouped: ungrouped.filter(m => !processedIds.has(m.id)),
  };
}

// GET - Fetch remote models from channel's /v1/models endpoint
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

    // Only support openai-chat and openai-compatible types
    if (channel.type !== 'openai-chat' && channel.type !== 'openai-compatible') {
      return NextResponse.json(
        { error: 'This channel type does not support fetching remote models' },
        { status: 400 }
      );
    }

    const baseUrl = channel.baseUrl.replace(/\/$/, '');
    const modelsUrl = `${baseUrl}/v1/models`;

    // Use first API key if multiple are configured
    const apiKey = channel.apiKey?.split(',')[0]?.trim();

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (apiKey) {
      headers['Authorization'] = `Bearer ${apiKey}`;
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
    
    // OpenAI format: { data: [{ id: "model-id", ... }] }
    const models: RemoteModel[] = data.data || data.models || [];

    // If group=true, return grouped models
    if (groupParam === 'true') {
      const { grouped, ungrouped } = groupModels(models);
      return NextResponse.json({
        success: true,
        data: {
          grouped,
          ungrouped: ungrouped.map(m => ({ id: m.id, owned_by: m.owned_by || 'unknown' })),
        },
      });
    }
    
    // Return simplified model list
    const result = models.map((m) => ({
      id: m.id,
      owned_by: m.owned_by || 'unknown',
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
