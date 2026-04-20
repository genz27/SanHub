import type {
  SafeVideoModel,
  VideoAspectRatio,
  VideoChannel,
  VideoDuration,
  VideoModel,
  VideoModelFeatures,
} from '@/types';

type VideoModelWithChannel = {
  model: VideoModel;
  channel: VideoChannel;
};

type VeoFamily = 'fast' | 'ultra' | 'ultra_relaxed' | 'lite' | 'standard';
type FlowVeoKind = 't2v' | 'i2v' | 'r2v' | 'interpolation';
type FlowVeoAspect = 'landscape' | 'portrait';

const USER_VIDEO_DURATION_VALUE = '8s';
const USER_VIDEO_DURATION_LABEL = '8 秒';

const ASPECT_RATIO_ORDER = ['landscape', 'portrait', 'square', '16:9', '9:16', '1:1'];

const VEO_31_MODEL_MATRIX: Record<
  VeoFamily,
  Partial<Record<FlowVeoKind, Record<FlowVeoAspect, string>>>
> = {
  fast: {
    t2v: {
      landscape: 'veo_3_1_t2v_fast_landscape',
      portrait: 'veo_3_1_t2v_fast_portrait',
    },
    i2v: {
      landscape: 'veo_3_1_i2v_s_fast_fl',
      portrait: 'veo_3_1_i2v_s_fast_portrait_fl',
    },
    r2v: {
      landscape: 'veo_3_1_r2v_fast',
      portrait: 'veo_3_1_r2v_fast_portrait',
    },
  },
  ultra: {
    t2v: {
      landscape: 'veo_3_1_t2v_fast_ultra',
      portrait: 'veo_3_1_t2v_fast_portrait_ultra',
    },
    i2v: {
      landscape: 'veo_3_1_i2v_s_fast_ultra_fl',
      portrait: 'veo_3_1_i2v_s_fast_portrait_ultra_fl',
    },
    r2v: {
      landscape: 'veo_3_1_r2v_fast_ultra',
      portrait: 'veo_3_1_r2v_fast_portrait_ultra',
    },
  },
  ultra_relaxed: {
    t2v: {
      landscape: 'veo_3_1_t2v_fast_ultra_relaxed',
      portrait: 'veo_3_1_t2v_fast_portrait_ultra_relaxed',
    },
    i2v: {
      landscape: 'veo_3_1_i2v_s_fast_ultra_relaxed',
      portrait: 'veo_3_1_i2v_s_fast_portrait_ultra_relaxed',
    },
    r2v: {
      landscape: 'veo_3_1_r2v_fast_ultra_relaxed',
      portrait: 'veo_3_1_r2v_fast_portrait_ultra_relaxed',
    },
  },
  lite: {
    t2v: {
      landscape: 'veo_3_1_t2v_lite_landscape',
      portrait: 'veo_3_1_t2v_lite_portrait',
    },
    i2v: {
      landscape: 'veo_3_1_i2v_lite_landscape',
      portrait: 'veo_3_1_i2v_lite_portrait',
    },
    interpolation: {
      landscape: 'veo_3_1_interpolation_lite_landscape',
      portrait: 'veo_3_1_interpolation_lite_portrait',
    },
  },
  standard: {
    t2v: {
      landscape: 'veo_3_1_t2v_landscape',
      portrait: 'veo_3_1_t2v_portrait',
    },
    i2v: {
      landscape: 'veo_3_1_i2v_s_landscape',
      portrait: 'veo_3_1_i2v_s_portrait',
    },
  },
};

export function isVeoApiModel(apiModel?: string): boolean {
  return /^veo_\d+(?:_\d+)?_/i.test((apiModel || '').trim());
}

export function isVeo31ApiModel(apiModel?: string): boolean {
  return /^veo_3_1_/i.test((apiModel || '').trim());
}

export function inferVeoFamily(apiModel: string): VeoFamily {
  const lower = apiModel.toLowerCase();
  if (lower.includes('ultra_relaxed')) return 'ultra_relaxed';
  if (lower.includes('ultra')) return 'ultra';
  if (lower.includes('lite')) return 'lite';
  if (lower.includes('fast')) return 'fast';
  return 'standard';
}

export function inferVeoVersionLabel(apiModel: string): string {
  const lower = apiModel.toLowerCase();
  const minorMatch = lower.match(/^veo_(\d+)_(\d+)/);
  if (minorMatch) return `Veo ${minorMatch[1]}.${minorMatch[2]}`;
  const majorMatch = lower.match(/^veo_(\d+)/);
  if (majorMatch) return `Veo ${majorMatch[1]}`;
  return 'Veo';
}

export function inferVeoTierLabel(apiModel: string): string {
  switch (inferVeoFamily(apiModel)) {
    case 'ultra_relaxed':
      return 'Ultra Relaxed';
    case 'ultra':
      return 'Ultra';
    case 'lite':
      return 'Lite';
    case 'fast':
      return 'Fast';
    default:
      return 'Standard';
  }
}

export function getVeoDisplayName(apiModel: string): string {
  return `${inferVeoVersionLabel(apiModel)} ${inferVeoTierLabel(apiModel)}`;
}

export function getVeoGroupKey(apiModel: string, channelId = ''): string {
  const version = inferVeoVersionLabel(apiModel).toLowerCase().replace(/\s+/g, '-');
  const key = `veo:${version}:${inferVeoFamily(apiModel)}`;
  return channelId ? `${channelId}:${key}` : key;
}

export function normalizeFlowVeoAspect(aspectRatio?: string): FlowVeoAspect {
  const normalized = (aspectRatio || '').trim().toLowerCase();
  if (normalized === 'portrait' || normalized === '9:16') return 'portrait';
  return 'landscape';
}

function inferVeoAspectRatio(apiModel: string): { value: string; label: string } | null {
  const lower = apiModel.toLowerCase();
  if (lower.includes('portrait')) return { value: 'portrait', label: '9:16' };
  if (lower.includes('square')) return { value: 'square', label: '1:1' };
  if (isVeoApiModel(apiModel)) return { value: 'landscape', label: '16:9' };
  return null;
}

function sortAspectRatios(
  ratios: Array<{ value: string; label: string }>
): Array<{ value: string; label: string }> {
  return [...ratios].sort((left, right) => {
    const leftIndex = ASPECT_RATIO_ORDER.indexOf(left.value);
    const rightIndex = ASPECT_RATIO_ORDER.indexOf(right.value);
    const normalizedLeft = leftIndex === -1 ? Number.MAX_SAFE_INTEGER : leftIndex;
    const normalizedRight = rightIndex === -1 ? Number.MAX_SAFE_INTEGER : rightIndex;
    if (normalizedLeft !== normalizedRight) return normalizedLeft - normalizedRight;
    return left.label.localeCompare(right.label);
  });
}

export function mergeVideoAspectRatios(models: VideoModel[]): Array<{ value: string; label: string }> {
  const ratioMap = new Map<string, { value: string; label: string }>();

  for (const model of models) {
    for (const ratio of model.aspectRatios || []) {
      if (ratio.value && !ratioMap.has(ratio.value)) {
        ratioMap.set(ratio.value, ratio);
      }
    }

    const inferred = inferVeoAspectRatio(model.apiModel);
    if (inferred && !ratioMap.has(inferred.value)) {
      ratioMap.set(inferred.value, inferred);
    }
  }

  if (ratioMap.size === 0) {
    ratioMap.set('landscape', { value: 'landscape', label: '16:9' });
    ratioMap.set('portrait', { value: 'portrait', label: '9:16' });
  }

  return sortAspectRatios(Array.from(ratioMap.values()));
}

function pickDurationCost(models: VideoModel[]): number {
  const durations = models.flatMap((model) => model.durations || []);
  const exact = durations.find((duration) => duration.value === USER_VIDEO_DURATION_VALUE);
  if (exact && Number.isFinite(exact.cost)) return exact.cost;

  const tenSeconds = durations.find((duration) => duration.value === '10s');
  if (tenSeconds && Number.isFinite(tenSeconds.cost)) return tenSeconds.cost;

  const first = durations.find((duration) => Number.isFinite(duration.cost));
  return first ? first.cost : 100;
}

export function getUserFacingVideoDurations(models: VideoModel[]): VideoDuration[] {
  return [
    {
      value: USER_VIDEO_DURATION_VALUE,
      label: USER_VIDEO_DURATION_LABEL,
      cost: pickDurationCost(models),
    },
  ];
}

function getDefaultAspectRatio(ratios: Array<{ value: string; label: string }>): string {
  if (ratios.some((ratio) => ratio.value === 'landscape')) return 'landscape';
  if (ratios.some((ratio) => ratio.value === '16:9')) return '16:9';
  return ratios[0]?.value || 'landscape';
}

function mergeFeatures(models: VideoModel[]): VideoModelFeatures {
  return {
    textToVideo: models.some((model) => model.features.textToVideo || model.apiModel.includes('_t2v_')),
    imageToVideo: models.some(
      (model) =>
        model.features.imageToVideo ||
        model.apiModel.includes('_i2v_') ||
        model.apiModel.includes('_r2v_') ||
        model.apiModel.includes('_interpolation_')
    ),
    videoToVideo: models.some((model) => model.features.videoToVideo),
    supportStyles: models.some((model) => model.features.supportStyles),
  };
}

export function buildVideoModelDescription(params: {
  features: VideoModelFeatures;
  aspectRatios: Array<{ value: string; label: string }>;
  sourceCount?: number;
}): string {
  const abilities: string[] = [];
  if (params.features.textToVideo) abilities.push('文生视频');
  if (params.features.imageToVideo) abilities.push('图生视频');
  if (params.features.videoToVideo) abilities.push('视频转视频');

  const ratioLabels = params.aspectRatios.map((ratio) => ratio.label).join(' / ');
  const parts = [
    abilities.length > 0 ? abilities.join(' / ') : '视频生成',
    ratioLabels ? `比例 ${ratioLabels}` : '',
    '时长 8 秒',
    params.sourceCount && params.sourceCount > 1 ? `已合并 ${params.sourceCount} 个模型` : '',
  ];

  return parts.filter(Boolean).join(' | ');
}

function toSafeVideoModel(model: VideoModel, channel: VideoChannel): SafeVideoModel {
  const aspectRatios = mergeVideoAspectRatios([model]);
  return {
    id: model.id,
    channelId: model.channelId,
    channelType: channel.type,
    apiModel: isVeoApiModel(model.apiModel) ? undefined : model.apiModel,
    name: model.name,
    description: isVeoApiModel(model.apiModel)
      ? buildVideoModelDescription({
          features: mergeFeatures([model]),
          aspectRatios,
        })
      : model.description,
    features: model.features,
    aspectRatios,
    durations: getUserFacingVideoDurations([model]),
    defaultAspectRatio: getDefaultAspectRatio(aspectRatios),
    defaultDuration: USER_VIDEO_DURATION_VALUE,
    videoConfigObject: model.videoConfigObject
      ? {
          ...model.videoConfigObject,
          video_length: 8,
        }
      : undefined,
    highlight: model.highlight,
    enabled: model.enabled,
  };
}

function toMergedVeoModel(models: VideoModel[], channel: VideoChannel): SafeVideoModel {
  const representative = models[0];
  const aspectRatios = mergeVideoAspectRatios(models);
  const features = mergeFeatures(models);

  return {
    id: representative.id,
    channelId: representative.channelId,
    channelType: channel.type,
    name: getVeoDisplayName(representative.apiModel),
    description: buildVideoModelDescription({
      features,
      aspectRatios,
      sourceCount: models.length,
    }),
    features,
    aspectRatios,
    durations: getUserFacingVideoDurations(models),
    defaultAspectRatio: getDefaultAspectRatio(aspectRatios),
    defaultDuration: USER_VIDEO_DURATION_VALUE,
    highlight: models.some((model) => model.highlight),
    enabled: models.some((model) => model.enabled),
  };
}

export function buildSafeVideoModels(
  models: VideoModel[],
  channels: VideoChannel[],
  enabledOnly = false
): SafeVideoModel[] {
  const channelMap = new Map(channels.map((channel) => [channel.id, channel]));
  const grouped = new Map<
    string,
    { index: number; channel: VideoChannel; models: VideoModel[] }
  >();
  const entries: Array<
    | { index: number; kind: 'single'; model: VideoModel; channel: VideoChannel }
    | { index: number; kind: 'group'; groupKey: string }
  > = [];

  models.forEach((model, index) => {
    const channel = channelMap.get(model.channelId);
    if (!channel || (enabledOnly && !channel.enabled)) return;

    if (channel.type === 'flow2api' && isVeoApiModel(model.apiModel)) {
      const groupKey = getVeoGroupKey(model.apiModel, model.channelId);
      const existing = grouped.get(groupKey);
      if (existing) {
        existing.models.push(model);
        return;
      }

      grouped.set(groupKey, { index, channel, models: [model] });
      entries.push({ index, kind: 'group', groupKey });
      return;
    }

    entries.push({ index, kind: 'single', model, channel });
  });

  const safeModels = entries
    .sort((left, right) => left.index - right.index)
    .map((entry) => {
      if (entry.kind === 'single') {
        return toSafeVideoModel(entry.model, entry.channel);
      }

      const group = grouped.get(entry.groupKey);
      if (!group) return null;
      return toMergedVeoModel(group.models, group.channel);
    })
    .filter((model): model is SafeVideoModel => Boolean(model));

  const seenNames = new Set<string>();
  return safeModels.filter((model) => {
    if (seenNames.has(model.name)) return false;
    seenNames.add(model.name);
    return true;
  });
}

function resolveFlowVeoKind(family: VeoFamily, imageCount: number): FlowVeoKind {
  if (imageCount <= 0) return 't2v';
  if (family === 'lite' && imageCount >= 2) return 'interpolation';
  if (imageCount >= 3) return 'r2v';
  return 'i2v';
}

export function resolveFlowVeoModel(
  apiModel: string,
  aspectRatio: string | undefined,
  imageCount: number
): string | null {
  if (!isVeo31ApiModel(apiModel)) return null;

  const family = inferVeoFamily(apiModel);
  const aspect = normalizeFlowVeoAspect(aspectRatio);
  const preferredKind = resolveFlowVeoKind(family, imageCount);
  const familyModels = VEO_31_MODEL_MATRIX[family];
  const variants =
    familyModels[preferredKind] ||
    familyModels.i2v ||
    familyModels.t2v ||
    VEO_31_MODEL_MATRIX.fast.t2v;

  return variants?.[aspect] || variants?.landscape || null;
}

export function toVideoConfigAspectRatio(
  aspectRatio: string | undefined
): VideoAspectRatio {
  const normalized = (aspectRatio || '').trim().toLowerCase();
  if (normalized === 'portrait') return '9:16';
  if (normalized === 'square') return '1:1';
  if (normalized === '2:3' || normalized === '3:2') return normalized;
  return '16:9';
}
