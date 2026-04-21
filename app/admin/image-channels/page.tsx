'use client';

import { useState, useEffect, useMemo } from 'react';
import {
  Loader2, Save, Plus, Trash2, Edit2, Eye, EyeOff,
  Layers, ChevronDown, ChevronUp, Image as ImageIcon, RefreshCw, Download, Check
} from 'lucide-react';
import { toast } from '@/components/ui/toaster';
import type { ImageChannel, ImageModel, ImageModelFeatures } from '@/types';

const CHANNEL_TYPES = [
  { value: 'openai-compatible', label: 'OpenAI Images', description: 'OpenAI /v1/images/generations API' },
  { value: 'openai-chat', label: 'OpenAI Chat', description: 'OpenAI /v1/chat/completions API' },
  { value: 'gemini', label: 'Gemini', description: 'Google Gemini Native API' },
  { value: 'modelscope', label: 'ModelScope', description: 'ModelScope API' },
  { value: 'gitee', label: 'Gitee AI', description: 'Gitee AI API' },
  { value: 'sora', label: 'Sora', description: 'OpenAI Sora API' },
] as const;

type ImageAdminChannelType = (typeof CHANNEL_TYPES)[number]['value'];

const DEFAULT_FEATURES: ImageModelFeatures = {
  textToImage: true,
  imageToImage: false,
  upscale: false,
  matting: false,
  multipleImages: false,
  imageSize: false,
};

type RatioResolutionRow = {
  ratio: string;
  resolution: string;
};

type SizeResolutionGroup = {
  size: string;
  rows: RatioResolutionRow[];
};

const DEFAULT_RATIO_ROWS: RatioResolutionRow[] = [
  { ratio: '1:1', resolution: '1024x1024' },
  { ratio: '16:9', resolution: '1792x1024' },
  { ratio: '9:16', resolution: '1024x1792' },
];

// Gemini 3 Pro standard resolutions (pixel values for display)
const GEMINI_PRO_SIZE_GROUPS_PIXELS: SizeResolutionGroup[] = [
  {
    size: '1K',
    rows: [
      { ratio: '1:1', resolution: '1024x1024' },
      { ratio: '2:3', resolution: '848x1264' },
      { ratio: '3:2', resolution: '1264x848' },
      { ratio: '3:4', resolution: '896x1200' },
      { ratio: '4:3', resolution: '1200x896' },
      { ratio: '4:5', resolution: '928x1152' },
      { ratio: '5:4', resolution: '1152x928' },
      { ratio: '9:16', resolution: '768x1376' },
      { ratio: '16:9', resolution: '1376x768' },
      { ratio: '21:9', resolution: '1584x672' },
    ],
  },
  {
    size: '2K',
    rows: [
      { ratio: '1:1', resolution: '2048x2048' },
      { ratio: '2:3', resolution: '1696x2528' },
      { ratio: '3:2', resolution: '2528x1696' },
      { ratio: '3:4', resolution: '1792x2400' },
      { ratio: '4:3', resolution: '2400x1792' },
      { ratio: '4:5', resolution: '1856x2304' },
      { ratio: '5:4', resolution: '2304x1856' },
      { ratio: '9:16', resolution: '1536x2752' },
      { ratio: '16:9', resolution: '2752x1536' },
      { ratio: '21:9', resolution: '3168x1344' },
    ],
  },
  {
    size: '4K',
    rows: [
      { ratio: '1:1', resolution: '4096x4096' },
      { ratio: '2:3', resolution: '3392x5056' },
      { ratio: '3:2', resolution: '5056x3392' },
      { ratio: '3:4', resolution: '3584x4800' },
      { ratio: '4:3', resolution: '4800x3584' },
      { ratio: '4:5', resolution: '3712x4608' },
      { ratio: '5:4', resolution: '4608x3712' },
      { ratio: '9:16', resolution: '3072x5504' },
      { ratio: '16:9', resolution: '5504x3072' },
      { ratio: '21:9', resolution: '6336x2688' },
    ],
  },
];

// Gemini 3 Pro model ID mapping (for dynamic model selection)
// Format: gemini-3.0-pro-image-{ratio}[-{size}]
const buildGeminiProModelGroups = (baseModel: string): SizeResolutionGroup[] => {
  const baseName = baseModel.replace(/-(landscape|portrait|square|four-three|three-four)(-2k|-4k)?$/i, '');

  const ratioToSuffix: Record<string, string> = {
    '1:1': 'square',
    '16:9': 'landscape',
    '9:16': 'portrait',
    '4:3': 'four-three',
    '3:4': 'three-four',
  };

  const sizes = ['1K', '2K', '4K'];
  const sizeSuffixes: Record<string, string> = { '1K': '', '2K': '-2k', '4K': '-4k' };

  return sizes.map((size) => ({
    size,
    rows: Object.entries(ratioToSuffix).map(([ratio, suffix]) => ({
      ratio,
      resolution: `${baseName}-${suffix}${sizeSuffixes[size]}`,
    })),
  }));
};

type RemoteModelOption = {
  id: string;
  owned_by: string;
};

type GroupedRemoteModel = {
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
  features: { textToImage: boolean; imageToImage: boolean; imageSize: boolean };
};

type ModelPresetId = 'general' | 'edit' | 'hd' | 'matting' | 'upscale';

type ModelPresetOption = {
  id: ModelPresetId;
  label: string;
  description: string;
};

type ModelFormState = {
  name: string;
  description: string;
  apiModel: string;
  baseUrl: string;
  apiKey: string;
  features: ImageModelFeatures;
  defaultAspectRatio: string;
  defaultImageSize: string;
  requiresReferenceImage: boolean;
  allowEmptyPrompt: boolean;
  highlight: boolean;
  enabled: boolean;
  costPerGeneration: number;
  sortOrder: number;
};

const ORIGINAL_IMAGE_ROWS: RatioResolutionRow[] = [{ ratio: 'original', resolution: '' }];

const CHANNEL_FORM_GUIDES: Record<ImageAdminChannelType, {
  defaultName: string;
  summary: string;
  hint: string;
  baseUrlExample?: string;
  recommendedAction: string;
}> = {
  'openai-compatible': {
    defaultName: 'OpenAI Images',
    summary: '适合 NewAPI、One API、OpenRouter 这类兼容 OpenAI Images 的聚合渠道。',
    hint: '优先填写可访问的 Base URL，保存后可直接从 /v1/models 智能拉取模型。',
    recommendedAction: '先保存渠道，再点“智能导入远端模型”',
  },
  'openai-chat': {
    defaultName: 'OpenAI Chat',
    summary: '适合通过 /v1/chat/completions 提供生图能力的兼容渠道。',
    hint: '如果上游同时提供 /v1/models，可在保存后直接拉取并批量导入。',
    recommendedAction: '先保存渠道，再点“智能导入远端模型”',
  },
  gemini: {
    defaultName: 'Gemini',
    summary: '适合 Google Gemini 原生接口，兼顾快速出图和高分辨率模型。',
    hint: '通常只需要 Base URL 和 API Key，模型建议优先使用下方预设。',
    baseUrlExample: 'https://generativelanguage.googleapis.com',
    recommendedAction: '先用预设生成模型，再按需微调',
  },
  modelscope: {
    defaultName: 'ModelScope',
    summary: '适合接入 Qwen、FLUX 等阿里系图像模型。',
    hint: '可先创建渠道，再直接套用通用生图或编辑预设。',
    baseUrlExample: 'https://api-inference.modelscope.cn/',
    recommendedAction: '先套预设，再补充模型 ID',
  },
  gitee: {
    defaultName: 'Gitee AI',
    summary: '适合 Z-Image、抠图、超分等偏工具型图像能力。',
    hint: '建议按用途拆成多个模型，方便前台直接选择。',
    baseUrlExample: 'https://ai.gitee.com/',
    recommendedAction: '优先使用工具类预设',
  },
  sora: {
    defaultName: 'Sora',
    summary: '适合接入 Sora Image 一类图像接口。',
    hint: '一般只需要创建一个默认模型，支持图生图时可开启参考图。',
    recommendedAction: '先创建默认模型，再微调能力开关',
  },
};

const MANUAL_PRESET_OPTIONS: Record<ImageAdminChannelType, ModelPresetOption[]> = {
  'openai-compatible': [
    { id: 'general', label: '标准生图', description: '适合常规文生图，带默认常用比例。' },
    { id: 'edit', label: '编辑变体', description: '适合编辑、局部重绘或 variation 场景。' },
    { id: 'hd', label: '高清多档', description: '适合需要 1K / 2K / 4K 多档分辨率的模型。' },
  ],
  'openai-chat': [
    { id: 'general', label: '标准生图', description: '适合兼容聊天接口的图像生成模型。' },
    { id: 'edit', label: '编辑变体', description: '适合参考图编辑、变体和重绘。' },
    { id: 'hd', label: '高清多档', description: '适合支持多档分辨率映射的模型。' },
  ],
  gemini: [
    { id: 'general', label: '快速生图', description: '默认填充 Gemini Flash 图像模型。' },
    { id: 'hd', label: '高清多档', description: '默认填充 Gemini Pro 的多档分辨率配置。' },
    { id: 'edit', label: '编辑模式', description: '适合图生图、重绘和参考图编辑。' },
  ],
  modelscope: [
    { id: 'general', label: '通用生图', description: '默认填充 Qwen / FLUX 一类常规模型。' },
    { id: 'edit', label: '编辑模式', description: '默认填充 Qwen Image Edit 一类编辑模型。' },
  ],
  gitee: [
    { id: 'general', label: '通用生图', description: '默认填充 Z-Image 一类生图模型。' },
    { id: 'matting', label: '抠图工具', description: '适合背景移除、主体分离等工具型能力。' },
    { id: 'upscale', label: '超分工具', description: '适合放大、增强和修复等工具型能力。' },
  ],
  sora: [
    { id: 'general', label: '默认生图', description: '默认填充 Sora Image 的推荐配置。' },
  ],
};

function cloneRatioRows(rows: RatioResolutionRow[]): RatioResolutionRow[] {
  return rows.map((row) => ({ ...row }));
}

function cloneSizeGroups(groups: SizeResolutionGroup[]): SizeResolutionGroup[] {
  return groups.map((group) => ({
    size: group.size,
    rows: cloneRatioRows(group.rows),
  }));
}

function createDefaultSizeGroups(): SizeResolutionGroup[] {
  return [{ size: '1K', rows: cloneRatioRows(DEFAULT_RATIO_ROWS) }];
}

function isImageAdminChannelType(value: string): value is ImageAdminChannelType {
  return CHANNEL_TYPES.some((item) => item.value === value);
}

function toImageAdminChannelType(value?: string): ImageAdminChannelType {
  if (value && isImageAdminChannelType(value)) {
    return value;
  }
  return 'openai-compatible';
}

function createEmptyChannelForm(type: ImageAdminChannelType = 'openai-compatible') {
  return {
    name: CHANNEL_FORM_GUIDES[type].defaultName,
    type,
    baseUrl: '',
    apiKey: '',
    enabled: true,
  };
}

function createEmptyModelForm(): ModelFormState {
  return {
    name: '',
    description: '',
    apiModel: '',
    baseUrl: '',
    apiKey: '',
    features: { ...DEFAULT_FEATURES },
    defaultAspectRatio: '1:1',
    defaultImageSize: '',
    requiresReferenceImage: false,
    allowEmptyPrompt: false,
    highlight: false,
    enabled: true,
    costPerGeneration: 10,
    sortOrder: 0,
  };
}

function buildModelPreset(channelType: ImageAdminChannelType, presetId: ModelPresetId): {
  form: ModelFormState;
  ratioRows: RatioResolutionRow[];
  sizeGroups: SizeResolutionGroup[];
} {
  const form = createEmptyModelForm();
  let ratioRows = cloneRatioRows(DEFAULT_RATIO_ROWS);
  let sizeGroups = createDefaultSizeGroups();

  if (presetId === 'general') {
    form.name =
      channelType === 'gemini'
        ? 'Gemini Nano'
        : channelType === 'modelscope'
        ? 'Qwen Image'
        : channelType === 'gitee'
        ? 'Z-Image Gitee'
        : channelType === 'sora'
        ? 'Sora Image'
        : '通用图像模型';
    form.description = '适合常规文生图，默认带常用比例。';
    form.apiModel =
      channelType === 'gemini'
        ? 'gemini-2.5-flash-image'
        : channelType === 'modelscope'
        ? 'Qwen/Qwen-Image'
        : channelType === 'gitee'
        ? 'z-image-turbo'
        : channelType === 'sora'
        ? 'sora-image'
        : '';
    form.features = {
      textToImage: true,
      imageToImage: channelType === 'gemini' || channelType === 'sora',
      upscale: false,
      matting: false,
      multipleImages: false,
      imageSize: false,
    };
  }

  if (presetId === 'edit') {
    form.name = channelType === 'modelscope' ? 'Qwen Image Edit' : '图像编辑模型';
    form.description = '适合编辑、重绘或 variation，默认要求上传参考图。';
    form.apiModel = channelType === 'modelscope' ? 'Qwen/Qwen-Image-Edit-2509' : '';
    form.features = {
      textToImage: false,
      imageToImage: true,
      upscale: false,
      matting: false,
      multipleImages: false,
      imageSize: false,
    };
    form.requiresReferenceImage = true;
  }

  if (presetId === 'hd') {
    form.name = channelType === 'gemini' ? 'Gemini Pro' : '高清图像模型';
    form.description = '适合需要 1K / 2K / 4K 多档分辨率的模型。';
    form.apiModel = channelType === 'gemini' ? 'gemini-3.0-pro-image-square' : '';
    form.features = {
      textToImage: true,
      imageToImage: true,
      upscale: false,
      matting: false,
      multipleImages: channelType === 'gemini',
      imageSize: true,
    };
    form.defaultImageSize = '1K';
    sizeGroups = cloneSizeGroups(GEMINI_PRO_SIZE_GROUPS_PIXELS);
  }

  if (presetId === 'matting') {
    form.name = '抠图模型';
    form.description = '适合去背景、主体分离等工具型场景。';
    form.apiModel = channelType === 'gitee' ? 'RMBG-2.0' : '';
    form.features = {
      textToImage: false,
      imageToImage: false,
      upscale: false,
      matting: true,
      multipleImages: false,
      imageSize: false,
    };
    form.defaultAspectRatio = 'original';
    form.requiresReferenceImage = true;
    form.allowEmptyPrompt = true;
    ratioRows = cloneRatioRows(ORIGINAL_IMAGE_ROWS);
    sizeGroups = createDefaultSizeGroups();
  }

  if (presetId === 'upscale') {
    form.name = '超分模型';
    form.description = '适合图片增强、放大和修复等工具型场景。';
    form.apiModel = channelType === 'gitee' ? 'SeedVR2-3B' : '';
    form.features = {
      textToImage: false,
      imageToImage: false,
      upscale: true,
      matting: false,
      multipleImages: false,
      imageSize: false,
    };
    form.defaultAspectRatio = 'original';
    form.requiresReferenceImage = true;
    form.allowEmptyPrompt = true;
    form.highlight = true;
    ratioRows = cloneRatioRows(ORIGINAL_IMAGE_ROWS);
    sizeGroups = createDefaultSizeGroups();
  }

  return { form, ratioRows, sizeGroups };
}

export default function ImageChannelsPage() {
  const [channels, setChannels] = useState<ImageChannel[]>([]);
  const [models, setModels] = useState<ImageModel[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [migrating, setMigrating] = useState(false);
  const [expandedChannels, setExpandedChannels] = useState<Set<string>>(new Set());
  const [showKeys, setShowKeys] = useState<Record<string, boolean>>({});
  
  // Channel form
  const [editingChannel, setEditingChannel] = useState<string | null>(null);
  const [channelForm, setChannelForm] = useState(() => createEmptyChannelForm());

  // Model form
  const [editingModel, setEditingModel] = useState<string | null>(null);
  const [modelChannelId, setModelChannelId] = useState<string | null>(null);
  const [activeModelPresetId, setActiveModelPresetId] = useState<ModelPresetId | null>(null);

  // Remote models
  const [remoteModels, setRemoteModels] = useState<RemoteModelOption[]>([]);
  const [groupedModels, setGroupedModels] = useState<GroupedRemoteModel[]>([]);
  const [remoteModelsChannelId, setRemoteModelsChannelId] = useState<string | null>(null);
  const [fetchingRemoteModels, setFetchingRemoteModels] = useState(false);
  const [selectedRemoteModels, setSelectedRemoteModels] = useState<Set<string>>(new Set());
  const [selectedGroupedModels, setSelectedGroupedModels] = useState<Set<string>>(new Set());
  const [addingRemoteModels, setAddingRemoteModels] = useState(false);
  const [groupedModelOverrides, setGroupedModelOverrides] = useState<Record<string, { displayName: string; description: string }>>({});

  const [modelForm, setModelForm] = useState<ModelFormState>(() => createEmptyModelForm());
  const [ratioRows, setRatioRows] = useState<RatioResolutionRow[]>(() => cloneRatioRows(DEFAULT_RATIO_ROWS));
  const [sizeGroups, setSizeGroups] = useState<SizeResolutionGroup[]>(() => createDefaultSizeGroups());

  const currentEditableChannel = useMemo(
    () => channels.find((channel) => channel.id === modelChannelId) || null,
    [channels, modelChannelId]
  );
  const channelFormGuide = CHANNEL_FORM_GUIDES[channelForm.type];
  const manualPresetOptions = useMemo(
    () => MANUAL_PRESET_OPTIONS[toImageAdminChannelType(currentEditableChannel?.type)],
    [currentEditableChannel?.type]
  );

  const availableRatios = useMemo(() => {
    const rows = modelForm.features.imageSize
      ? sizeGroups.flatMap((group) => group.rows)
      : ratioRows;
    const unique = new Set(rows.map((row) => row.ratio.trim()).filter(Boolean));
    return Array.from(unique);
  }, [modelForm.features.imageSize, ratioRows, sizeGroups]);

  const availableSizes = useMemo(() => {
    return sizeGroups.map((group) => group.size.trim()).filter(Boolean);
  }, [sizeGroups]);

  useEffect(() => {
    if (availableRatios.length === 0) return;
    if (!availableRatios.includes(modelForm.defaultAspectRatio)) {
      setModelForm((prev) => ({
        ...prev,
        defaultAspectRatio: availableRatios[0],
      }));
    }
  }, [availableRatios, modelForm.defaultAspectRatio]);

  useEffect(() => {
    if (!modelForm.features.imageSize || availableSizes.length === 0) return;
    if (!availableSizes.includes(modelForm.defaultImageSize)) {
      setModelForm((prev) => ({
        ...prev,
        defaultImageSize: availableSizes[0],
      }));
    }
  }, [availableSizes, modelForm.defaultImageSize, modelForm.features.imageSize]);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [channelsRes, modelsRes] = await Promise.all([
        fetch('/api/admin/image-channels'),
        fetch('/api/admin/image-models'),
      ]);
      if (channelsRes.ok) {
        const data = await channelsRes.json();
        setChannels(data.data || []);
      }
      if (modelsRes.ok) {
        const data = await modelsRes.json();
        setModels(data.data || []);
      }
    } catch (err) {
      console.error('Failed to load data:', err);
    } finally {
      setLoading(false);
    }
  };

  const migrateFromLegacy = async () => {
    if (!confirm('确定要从旧配置迁移吗？这将创建默认的渠道和模型配置。')) return;
    setMigrating(true);
    try {
      const res = await fetch('/api/admin/migrate-models', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || '迁移失败');
      }
      toast({ title: `迁移成功：${data.channels} 个渠道，${data.models} 个模型` });
      loadData();
    } catch (err) {
      toast({ title: '迁移失败', description: err instanceof Error ? err.message : '未知错误', variant: 'destructive' });
    } finally {
      setMigrating(false);
    }
  };

  const resetChannelForm = () => {
    setChannelForm(createEmptyChannelForm());
    setEditingChannel(null);
  };

  const resetModelForm = () => {
    setModelForm(createEmptyModelForm());
    setRatioRows(cloneRatioRows(DEFAULT_RATIO_ROWS));
    setSizeGroups(createDefaultSizeGroups());
    setEditingModel(null);
    setModelChannelId(null);
    setActiveModelPresetId(null);
  };

  const buildRatioRows = (resolutions: Record<string, string> | undefined) => {
    const entries = Object.entries(resolutions || {});
    if (entries.length === 0) {
      return [{ ratio: '', resolution: '' }];
    }
    return entries.map(([ratio, resolution]) => ({ ratio, resolution }));
  };

  const buildSizeGroups = (
    resolutions: Record<string, Record<string, string>> | undefined,
    sizes: string[] | undefined
  ) => {
    const sizeList = (sizes || []).filter(Boolean);
    const keys = sizeList.length > 0 ? sizeList : Object.keys(resolutions || {});
    if (keys.length === 0) {
      return [{ size: '1K', rows: [{ ratio: '', resolution: '' }] }];
    }
    return keys.map((size) => ({
      size,
      rows: buildRatioRows(resolutions?.[size]),
    }));
  };

  const getChannelModels = (channelId: string) => models.filter((model) => model.channelId === channelId);

  const getExistingApiModelSet = (channelId: string | null) => {
    if (!channelId) return new Set<string>();
    return new Set(getChannelModels(channelId).map((model) => model.apiModel));
  };

  const isGroupedRemoteModelImported = (group: GroupedRemoteModel, existingApiModels: Set<string>) => {
    if (existingApiModels.has(group.apiModel)) {
      return true;
    }
    return (group.sourceModelIds || []).some((modelId) => existingApiModels.has(modelId));
  };

  const handleChannelTypeChange = (nextType: ImageAdminChannelType) => {
    setChannelForm((prev) => {
      const knownNames = new Set(Object.values(CHANNEL_FORM_GUIDES).map((guide) => guide.defaultName));
      const shouldReplaceName = !prev.name.trim() || knownNames.has(prev.name.trim());
      return {
        ...prev,
        type: nextType,
        name: shouldReplaceName ? CHANNEL_FORM_GUIDES[nextType].defaultName : prev.name,
      };
    });
  };

  const applyManualPreset = (presetId: ModelPresetId, replaceIdentity = false) => {
    const channelType = toImageAdminChannelType(currentEditableChannel?.type);
    const preset = buildModelPreset(channelType, presetId);

    setModelForm((prev) => ({
      ...prev,
      name: replaceIdentity || !prev.name.trim() ? preset.form.name : prev.name,
      description:
        replaceIdentity || !prev.description.trim() ? preset.form.description : prev.description,
      apiModel: replaceIdentity || !prev.apiModel.trim() ? preset.form.apiModel : prev.apiModel,
      features: { ...preset.form.features },
      defaultAspectRatio: preset.form.defaultAspectRatio,
      defaultImageSize: preset.form.defaultImageSize,
      requiresReferenceImage: preset.form.requiresReferenceImage,
      allowEmptyPrompt: preset.form.allowEmptyPrompt,
      highlight: replaceIdentity ? preset.form.highlight : prev.highlight,
    }));
    setRatioRows(cloneRatioRows(preset.ratioRows));
    setSizeGroups(cloneSizeGroups(preset.sizeGroups));
    setActiveModelPresetId(presetId);
  };

  const startEditChannel = (channel: ImageChannel) => {
    setChannelForm({
      name: channel.name,
      type: toImageAdminChannelType(channel.type),
      baseUrl: channel.baseUrl,
      apiKey: channel.apiKey,
      enabled: channel.enabled,
    });
    setEditingChannel(channel.id);
  };

  const startEditModel = (model: ImageModel) => {
    setModelForm({
      name: model.name,
      description: model.description,
      apiModel: model.apiModel,
      baseUrl: model.baseUrl || '',
      apiKey: model.apiKey || '',
      features: model.features,
      defaultAspectRatio: model.defaultAspectRatio,
      defaultImageSize: model.defaultImageSize || '',
      requiresReferenceImage: model.requiresReferenceImage || false,
      allowEmptyPrompt: model.allowEmptyPrompt || false,
      highlight: model.highlight || false,
      enabled: model.enabled,
      costPerGeneration: model.costPerGeneration,
      sortOrder: model.sortOrder,
    });
    if (model.features.imageSize) {
      const groups = buildSizeGroups(
        model.resolutions as Record<string, Record<string, string>>,
        model.imageSizes
      );
      setSizeGroups(groups);
      setRatioRows(groups[0]?.rows || [{ ratio: '', resolution: '' }]);
    } else {
      setRatioRows(buildRatioRows(model.resolutions as Record<string, string>));
      setSizeGroups(createDefaultSizeGroups());
    }
    setEditingModel(model.id);
    setModelChannelId(model.channelId);
    setActiveModelPresetId(null);
  };

  const startAddModel = (channelId: string) => {
    const channel = channels.find((item) => item.id === channelId);
    const channelType = toImageAdminChannelType(channel?.type);
    const presetId: ModelPresetId = channelType === 'gemini' ? 'hd' : 'general';
    const preset = buildModelPreset(channelType, presetId);

    setModelForm({
      ...preset.form,
      sortOrder: getChannelModels(channelId).length,
    });
    setRatioRows(cloneRatioRows(preset.ratioRows));
    setSizeGroups(cloneSizeGroups(preset.sizeGroups));
    setEditingModel(null);
    setModelChannelId(channelId);
    setActiveModelPresetId(presetId);
  };

  const saveChannel = async () => {
    if (!channelForm.name || !channelForm.type) {
      toast({ title: '请填写名称和类型', variant: 'destructive' });
      return;
    }
    setSaving(true);
    try {
      const res = await fetch('/api/admin/image-channels', {
        method: editingChannel ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editingChannel ? { id: editingChannel, ...channelForm } : channelForm),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error);
      }
      toast({ title: editingChannel ? '渠道已更新' : '渠道已创建' });
      resetChannelForm();
      loadData();
    } catch (err) {
      toast({ title: '保存失败', description: err instanceof Error ? err.message : '未知错误', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const deleteChannel = async (id: string) => {
    if (!confirm('确定删除该渠道？渠道下的所有模型也会被删除。')) return;
    try {
      const res = await fetch(`/api/admin/image-channels?id=${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('删除失败');
      toast({ title: '渠道已删除' });
      loadData();
    } catch {
      toast({ title: '删除失败', variant: 'destructive' });
    }
  };

  const toggleChannelEnabled = async (channel: ImageChannel) => {
    try {
      const res = await fetch('/api/admin/image-channels', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: channel.id, enabled: !channel.enabled }),
      });
      if (!res.ok) throw new Error('更新失败');
      loadData();
    } catch {
      toast({ title: '更新失败', variant: 'destructive' });
    }
  };

  const saveModel = async () => {
    if (!modelChannelId || !modelForm.name || !modelForm.apiModel) {
      toast({ title: '请填写名称和模型 ID', variant: 'destructive' });
      return;
    }

    const normalizeRows = (rows: RatioResolutionRow[]) =>
      rows
        .map((row) => ({ ratio: row.ratio.trim(), resolution: row.resolution.trim() }))
        .filter((row) => row.ratio && (row.resolution || row.ratio === 'original'));

    let aspectRatios: string[] = [];
    let resolutions: Record<string, string | Record<string, string>> = {};
    let imageSizes: string[] | undefined;

    if (modelForm.features.imageSize) {
      const normalizedGroups = sizeGroups
        .map((group) => ({
          size: group.size.trim(),
          rows: normalizeRows(group.rows),
        }))
        .filter((group) => group.size && group.rows.length > 0);

      if (normalizedGroups.length === 0) {
        toast({ title: '请至少配置一个分辨率档位', variant: 'destructive' });
        return;
      }

      const ratioSet = new Set<string>();
      const sizeMap: Record<string, Record<string, string>> = {};

      normalizedGroups.forEach((group) => {
        const ratioMap: Record<string, string> = {};
        group.rows.forEach((row) => {
          ratioSet.add(row.ratio);
          ratioMap[row.ratio] = row.resolution;
        });
        sizeMap[group.size] = ratioMap;
      });

      aspectRatios = Array.from(ratioSet);
      resolutions = sizeMap;
      imageSizes = normalizedGroups.map((group) => group.size);
    } else {
      const normalizedRows = normalizeRows(ratioRows);
      if (normalizedRows.length === 0) {
        toast({ title: '请至少配置一个画面比例', variant: 'destructive' });
        return;
      }
      const ratioMap: Record<string, string> = {};
      normalizedRows.forEach((row) => {
        ratioMap[row.ratio] = row.resolution;
      });
      aspectRatios = normalizedRows.map((row) => row.ratio);
      resolutions = ratioMap;
    }

    const defaultAspectRatio = aspectRatios.includes(modelForm.defaultAspectRatio)
      ? modelForm.defaultAspectRatio
      : aspectRatios[0];
    const defaultImageSize =
      modelForm.features.imageSize && imageSizes && imageSizes.length > 0
        ? imageSizes.includes(modelForm.defaultImageSize)
          ? modelForm.defaultImageSize
          : imageSizes[0]
        : undefined;

    setSaving(true);
    try {
      const payload = {
        ...(editingModel ? { id: editingModel } : {}),
        channelId: modelChannelId,
        name: modelForm.name,
        description: modelForm.description,
        apiModel: modelForm.apiModel,
        baseUrl: modelForm.baseUrl || undefined,
        apiKey: modelForm.apiKey || undefined,
        features: modelForm.features,
        aspectRatios,
        resolutions,
        imageSizes: modelForm.features.imageSize ? imageSizes : undefined,
        defaultAspectRatio,
        defaultImageSize,
        requiresReferenceImage: modelForm.requiresReferenceImage,
        allowEmptyPrompt: modelForm.allowEmptyPrompt,
        highlight: modelForm.highlight,
        enabled: modelForm.enabled,
        costPerGeneration: modelForm.costPerGeneration,
        sortOrder: modelForm.sortOrder,
      };

      const res = await fetch('/api/admin/image-models', {
        method: editingModel ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error);
      }
      toast({ title: editingModel ? '模型已更新' : '模型已创建' });
      resetModelForm();
      loadData();
    } catch (err) {
      toast({ title: '保存失败', description: err instanceof Error ? err.message : '未知错误', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const deleteModel = async (id: string) => {
    if (!confirm('确定删除该模型？')) return;
    try {
      const res = await fetch(`/api/admin/image-models?id=${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('删除失败');
      toast({ title: '模型已删除' });
      loadData();
    } catch {
      toast({ title: '删除失败', variant: 'destructive' });
    }
  };

  const toggleModelEnabled = async (model: ImageModel) => {
    try {
      const res = await fetch('/api/admin/image-models', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: model.id, enabled: !model.enabled }),
      });
      if (!res.ok) throw new Error('更新失败');
      loadData();
    } catch {
      toast({ title: '更新失败', variant: 'destructive' });
    }
  };

  const handleFeatureToggle = (key: keyof ImageModelFeatures, value: boolean) => {
    if (key === 'imageSize') {
      if (value) {
        if (sizeGroups.length === 0) {
          setSizeGroups([{ size: modelForm.defaultImageSize || '1K', rows: [...ratioRows] }]);
        }
      } else {
        if (ratioRows.length === 0 && sizeGroups.length > 0) {
          setRatioRows(sizeGroups[0].rows);
        }
      }
    }
    setModelForm((prev) => ({
      ...prev,
      features: { ...prev.features, [key]: value },
    }));
  };

  const toggleExpand = (id: string) => {
    setExpandedChannels(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // Fetch remote models from /v1/models
  const fetchRemoteModels = async (channelId: string) => {
    setFetchingRemoteModels(true);
    setRemoteModelsChannelId(channelId);
    setRemoteModels([]);
    setGroupedModels([]);
    setSelectedRemoteModels(new Set());
    setSelectedGroupedModels(new Set());
    setGroupedModelOverrides({});
    try {
      const res = await fetch(`/api/admin/image-channels/models?channelId=${channelId}&group=true`);
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || '无法拉取远端模型');
      }
      const nextGroupedModels = (data.data?.grouped || []) as GroupedRemoteModel[];
      const nextRemoteModels = (data.data?.ungrouped || []) as RemoteModelOption[];
      const existingApiModels = getExistingApiModelSet(channelId);

      setGroupedModels(nextGroupedModels);
      setRemoteModels(nextRemoteModels);
      setSelectedGroupedModels(
        new Set(
          nextGroupedModels
            .filter((group) => !isGroupedRemoteModelImported(group, existingApiModels))
            .map((group) => group.baseName)
        )
      );
      setSelectedRemoteModels(
        new Set(nextRemoteModels.filter((model) => !existingApiModels.has(model.id)).map((model) => model.id))
      );
    } catch (err) {
      toast({
        title: '拉取远端模型失败',
        description: err instanceof Error ? err.message : '未知错误',
        variant: 'destructive',
      });
      setRemoteModelsChannelId(null);
    } finally {
      setFetchingRemoteModels(false);
    }
  };

  const closeRemoteModels = () => {
    setRemoteModelsChannelId(null);
    setRemoteModels([]);
    setGroupedModels([]);
    setSelectedRemoteModels(new Set());
    setSelectedGroupedModels(new Set());
    setGroupedModelOverrides({});
  };

  const toggleRemoteModelSelection = (modelId: string) => {
    setSelectedRemoteModels(prev => {
      const next = new Set(prev);
      if (next.has(modelId)) next.delete(modelId);
      else next.add(modelId);
      return next;
    });
  };

  const toggleGroupedModelSelection = (baseName: string) => {
    setSelectedGroupedModels(prev => {
      const next = new Set(prev);
      if (next.has(baseName)) next.delete(baseName);
      else next.add(baseName);
      return next;
    });
  };

  const selectAllRemoteModels = () => {
    const existingApiModels = new Set(models.filter(m => m.channelId === remoteModelsChannelId).map(m => m.apiModel));
    const available = remoteModels.filter(m => !existingApiModels.has(m.id));
    setSelectedRemoteModels(new Set(available.map(m => m.id)));
  };

  const selectAllGroupedModels = () => {
    const existingApiModels = getExistingApiModelSet(remoteModelsChannelId);
    const available = groupedModels.filter((group) => !isGroupedRemoteModelImported(group, existingApiModels));
    setSelectedGroupedModels(new Set(available.map(g => g.baseName)));
  };

  const deselectAllRemoteModels = () => {
    setSelectedRemoteModels(new Set());
    setSelectedGroupedModels(new Set());
  };

  const addSelectedRemoteModels = async () => {
    if (!remoteModelsChannelId || (selectedRemoteModels.size === 0 && selectedGroupedModels.size === 0)) return;
    setAddingRemoteModels(true);
    try {
      let added = 0;
      const existingApiModels = getExistingApiModelSet(remoteModelsChannelId);

      // Add grouped models
      for (const baseName of Array.from(selectedGroupedModels)) {
        const group = groupedModels.find(g => g.baseName === baseName);
        if (!group) continue;
        if (isGroupedRemoteModelImported(group, existingApiModels)) continue;
        const override = groupedModelOverrides[baseName];
        const name = (override?.displayName || group.recommendedName || group.displayName).trim() || group.displayName;
        const description = (override?.description || group.recommendedDescription || '').trim();
        const nextSortOrder = getChannelModels(remoteModelsChannelId).length + added;

        const res = await fetch('/api/admin/image-models', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            channelId: remoteModelsChannelId,
            name,
            apiModel: group.apiModel,
            description,
            features: {
              textToImage: group.features.textToImage,
              imageToImage: group.features.imageToImage,
              upscale: false,
              matting: false,
              multipleImages: false,
              imageSize: group.features.imageSize,
            },
            aspectRatios: group.aspectRatios,
            imageSizes: group.features.imageSize ? group.imageSizes : undefined,
            resolutions: group.resolutions,
            defaultAspectRatio: group.aspectRatios.includes('1:1') ? '1:1' : group.aspectRatios[0],
            defaultImageSize: group.features.imageSize ? (group.imageSizes.includes('1K') ? '1K' : group.imageSizes[0]) : undefined,
            enabled: true,
            costPerGeneration: 10,
            sortOrder: nextSortOrder,
          }),
        });
        if (res.ok) {
          existingApiModels.add(group.apiModel);
          (group.sourceModelIds || []).forEach((modelId) => existingApiModels.add(modelId));
          added++;
        }
      }

      // Add ungrouped models
      for (const modelId of Array.from(selectedRemoteModels)) {
        if (existingApiModels.has(modelId)) continue;
        const nextSortOrder = getChannelModels(remoteModelsChannelId).length + added;
        const res = await fetch('/api/admin/image-models', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            channelId: remoteModelsChannelId,
            name: modelId,
            apiModel: modelId,
            description: '',
            features: { textToImage: true, imageToImage: true, upscale: false, matting: false, multipleImages: false, imageSize: false },
            aspectRatios: ['1:1', '16:9', '9:16'],
            resolutions: { '1:1': '1024x1024', '16:9': '1792x1024', '9:16': '1024x1792' },
            defaultAspectRatio: '1:1',
            enabled: true,
            costPerGeneration: 10,
            sortOrder: nextSortOrder,
          }),
        });
        if (res.ok) {
          existingApiModels.add(modelId);
          added++;
        }
      }

      toast({ title: '模型导入完成', description: `已新增 ${added} 个模型。` });
      closeRemoteModels();
      loadData();
    } catch (err) {
      toast({
        title: '导入模型失败',
        description: err instanceof Error ? err.message : '未知错误',
        variant: 'destructive',
      });
    } finally {
      setAddingRemoteModels(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-foreground/30" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-light text-foreground">图像渠道管理</h1>
          <p className="text-foreground/50 mt-1">管理图像生成渠道和模型</p>
        </div>
        {channels.length === 0 && (
          <button
            onClick={migrateFromLegacy}
            disabled={migrating}
            className="flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-amber-500 to-orange-500 text-foreground rounded-xl font-medium hover:opacity-90 disabled:opacity-50"
          >
            {migrating ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
            从旧配置迁移
          </button>
        )}
      </div>

      {/* Channel Form */}
      <div className="bg-card/60 border border-border/70 rounded-2xl p-6 space-y-4">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 bg-blue-500/20 rounded-xl flex items-center justify-center">
            <Layers className="w-5 h-5 text-blue-400" />
          </div>
          <h2 className="text-lg font-semibold text-foreground">
            {editingChannel ? '编辑渠道' : '添加渠道'}
          </h2>
        </div>

        <div className="rounded-2xl border border-border/70 bg-card/50 p-4 space-y-2">
          <div className="flex flex-col gap-2 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <p className="text-sm font-medium text-foreground">渠道接入建议</p>
              <p className="text-sm text-foreground/60 mt-1">{channelFormGuide.summary}</p>
            </div>
            <span className="inline-flex items-center rounded-full bg-blue-500/10 px-3 py-1 text-xs text-blue-300 border border-blue-500/20">
              推荐操作：{channelFormGuide.recommendedAction}
            </span>
          </div>
          <p className="text-xs text-foreground/50">提示：{channelFormGuide.hint}</p>
          {channelFormGuide.baseUrlExample && (
            <p className="text-xs text-foreground/50">
              推荐 Base URL：
              <code className="ml-1 rounded bg-card/70 px-2 py-1 text-foreground/80">{channelFormGuide.baseUrlExample}</code>
            </p>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <label className="text-sm text-foreground/70">名称 *</label>
            <input
              type="text"
              value={channelForm.name}
              onChange={(e) => setChannelForm({ ...channelForm, name: e.target.value })}
              placeholder="NEWAPI"
              className="w-full px-4 py-3 bg-card/60 border border-border/70 rounded-xl text-foreground placeholder:text-foreground/30 focus:outline-none focus:border-border"
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm text-foreground/70">类型 *</label>
            <select
              value={channelForm.type}
              onChange={(e) => handleChannelTypeChange(e.target.value as ImageAdminChannelType)}
              className="w-full px-4 py-3 bg-card/60 border border-border/70 rounded-xl text-foreground focus:outline-none focus:border-border"
            >
              {CHANNEL_TYPES.map(t => (
                <option key={t.value} value={t.value} className="bg-card/95">{t.label} - {t.description}</option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <label className="text-sm text-foreground/70">Base URL</label>
            <input
              type="text"
              value={channelForm.baseUrl}
              onChange={(e) => setChannelForm({ ...channelForm, baseUrl: e.target.value })}
              placeholder="https://api.example.com"
              className="w-full px-4 py-3 bg-card/60 border border-border/70 rounded-xl text-foreground placeholder:text-foreground/30 focus:outline-none focus:border-border"
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm text-foreground/70">API Key（多个用逗号分隔）</label>
            <div className="relative">
              <input
                type={showKeys['channel'] ? 'text' : 'password'}
                value={channelForm.apiKey}
                onChange={(e) => setChannelForm({ ...channelForm, apiKey: e.target.value })}
                placeholder="sk-..."
                className="w-full px-4 py-3 pr-12 bg-card/60 border border-border/70 rounded-xl text-foreground placeholder:text-foreground/30 focus:outline-none focus:border-border"
              />
              <button
                type="button"
                onClick={() => setShowKeys({ ...showKeys, channel: !showKeys['channel'] })}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-foreground/40 hover:text-foreground/70"
              >
                {showKeys['channel'] ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-6 pt-2">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={channelForm.enabled}
              onChange={(e) => setChannelForm({ ...channelForm, enabled: e.target.checked })}
              className="w-4 h-4 rounded border-border/70 bg-card/60 text-blue-500 focus:ring-blue-500"
            />
            <span className="text-sm text-foreground/70">启用</span>
          </label>
        </div>

        <div className="flex items-center gap-3 pt-4">
          <button
            onClick={saveChannel}
            disabled={saving}
            className="flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-blue-500 to-cyan-500 text-foreground rounded-xl font-medium hover:opacity-90 disabled:opacity-50"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            {editingChannel ? '更新' : '添加'}
          </button>
          {editingChannel && (
            <button onClick={resetChannelForm} className="px-5 py-2.5 bg-card/70 text-foreground rounded-xl hover:bg-card/80">
              取消
            </button>
          )}
        </div>
      </div>

      {/* Model Form (shown when adding/editing) */}
      {modelChannelId && (
        <div className="bg-card/60 border border-border/70 rounded-2xl p-6 space-y-4">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 bg-sky-500/20 rounded-xl flex items-center justify-center">
            <ImageIcon className="w-5 h-5 text-sky-400" />
          </div>
          <h2 className="text-lg font-semibold text-foreground">
            {editingModel ? '编辑模型' : '添加模型'}
          </h2>
        </div>

        {currentEditableChannel && (
          <div className="rounded-2xl border border-border/70 bg-card/50 p-4 space-y-3">
            <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <p className="text-sm font-medium text-foreground">快速预设</p>
                <p className="text-xs text-foreground/50 mt-1">
                  点一个预设就会自动填入推荐名称、模型 ID、能力开关和常用比例，后面只需要微调。
                </p>
              </div>
              <span className="text-xs text-foreground/40">
                当前渠道：{currentEditableChannel.name} / {currentEditableChannel.type}
              </span>
            </div>
            <div className="grid grid-cols-1 xl:grid-cols-3 gap-3">
              {manualPresetOptions.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => applyManualPreset(option.id, true)}
                  className={`rounded-xl border p-4 text-left transition-all ${
                    activeModelPresetId === option.id
                      ? 'border-sky-500/50 bg-sky-500/10'
                      : 'border-border/70 bg-card/60 hover:bg-card/70'
                  }`}
                >
                  <p className="text-sm font-medium text-foreground">{option.label}</p>
                  <p className="text-xs text-foreground/50 mt-1">{option.description}</p>
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <label className="text-sm text-foreground/70">名称 *</label>
              <input
                type="text"
                value={modelForm.name}
                onChange={(e) => setModelForm({ ...modelForm, name: e.target.value })}
                placeholder="GPT-4o Image"
                className="w-full px-4 py-3 bg-card/60 border border-border/70 rounded-xl text-foreground placeholder:text-foreground/30 focus:outline-none focus:border-border"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm text-foreground/70">模型 ID *</label>
              <input
                type="text"
                value={modelForm.apiModel}
                onChange={(e) => setModelForm({ ...modelForm, apiModel: e.target.value })}
                placeholder="gpt-4o-image"
                className="w-full px-4 py-3 bg-card/60 border border-border/70 rounded-xl text-foreground placeholder:text-foreground/30 focus:outline-none focus:border-border"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm text-foreground/70">描述</label>
              <input
                type="text"
                value={modelForm.description}
                onChange={(e) => setModelForm({ ...modelForm, description: e.target.value })}
                placeholder="高质量图像生成"
                className="w-full px-4 py-3 bg-card/60 border border-border/70 rounded-xl text-foreground placeholder:text-foreground/30 focus:outline-none focus:border-border"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm text-foreground/70">Base URL（可选，覆盖渠道）</label>
              <input
                type="text"
                value={modelForm.baseUrl}
                onChange={(e) => setModelForm({ ...modelForm, baseUrl: e.target.value })}
                placeholder="留空使用渠道默认"
                className="w-full px-4 py-3 bg-card/60 border border-border/70 rounded-xl text-foreground placeholder:text-foreground/30 focus:outline-none focus:border-border"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm text-foreground/70">API Key（可选，覆盖渠道）</label>
              <div className="relative">
                <input
                  type={showKeys['model'] ? 'text' : 'password'}
                  value={modelForm.apiKey}
                  onChange={(e) => setModelForm({ ...modelForm, apiKey: e.target.value })}
                  placeholder="留空使用渠道默认"
                  className="w-full px-4 py-3 pr-12 bg-card/60 border border-border/70 rounded-xl text-foreground placeholder:text-foreground/30 focus:outline-none focus:border-border"
                />
                <button
                  type="button"
                  onClick={() => setShowKeys({ ...showKeys, model: !showKeys['model'] })}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-foreground/40 hover:text-foreground/70"
                >
                  {showKeys['model'] ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-sm text-foreground/70">每次消耗积分</label>
              <input
                type="number"
                value={modelForm.costPerGeneration}
                onChange={(e) => setModelForm({ ...modelForm, costPerGeneration: parseInt(e.target.value) || 10 })}
                className="w-full px-4 py-3 bg-card/60 border border-border/70 rounded-xl text-foreground focus:outline-none focus:border-border"
              />
            </div>
          </div>

          {!modelForm.features.imageSize && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <label className="text-sm text-foreground/70">画面比例与分辨率</label>
                <button
                  type="button"
                  onClick={() => setRatioRows((prev) => [...prev, { ratio: '', resolution: '' }])}
                  className="text-xs text-foreground/60 hover:text-foreground"
                >
                  添加比例
                </button>
              </div>
              <div className="space-y-2">
                {ratioRows.map((row, index) => (
                  <div key={`${row.ratio}-${index}`} className="grid grid-cols-[140px_1fr_auto] gap-2">
                    <input
                      type="text"
                      value={row.ratio}
                      onChange={(e) => {
                        const next = [...ratioRows];
                        next[index] = { ...next[index], ratio: e.target.value };
                        setRatioRows(next);
                      }}
                      placeholder="1:1"
                      className="w-full px-3 py-2.5 bg-card/60 border border-border/70 rounded-xl text-foreground placeholder:text-foreground/30 focus:outline-none focus:border-border"
                    />
                    <input
                      type="text"
                      value={row.resolution}
                      onChange={(e) => {
                        const next = [...ratioRows];
                        next[index] = { ...next[index], resolution: e.target.value };
                        setRatioRows(next);
                      }}
                      placeholder="1024x1024"
                      className="w-full px-3 py-2.5 bg-card/60 border border-border/70 rounded-xl text-foreground placeholder:text-foreground/30 focus:outline-none focus:border-border"
                    />
                    <button
                      type="button"
                      onClick={() => setRatioRows((prev) => prev.filter((_, i) => i !== index))}
                      className="px-3 py-2.5 text-foreground/40 hover:text-red-400 hover:bg-red-500/10 rounded-xl"
                    >
                      删除
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {modelForm.features.imageSize && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <label className="text-sm text-foreground/70">分辨率档位</label>
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => setSizeGroups(buildGeminiProModelGroups(modelForm.apiModel))}
                    className="text-xs text-blue-400 hover:text-blue-300"
                    title="根据模型ID自动生成对应的模型ID映射，如 gemini-3.0-pro-image-square-2k"
                  >
                    填充模型ID映射
                  </button>
                  <button
                    type="button"
                    onClick={() => setSizeGroups([...GEMINI_PRO_SIZE_GROUPS_PIXELS])}
                    className="text-xs text-foreground/60 hover:text-foreground"
                    title="填充像素分辨率值，仅用于显示"
                  >
                    填充像素值
                  </button>
                  <button
                    type="button"
                    onClick={() => setSizeGroups((prev) => [...prev, { size: '', rows: [{ ratio: '', resolution: '' }] }])}
                    className="text-xs text-foreground/60 hover:text-foreground"
                  >
                    添加档位
                  </button>
                </div>
              </div>
              <div className="space-y-3">
                {sizeGroups.map((group, groupIndex) => (
                  <div key={`${group.size}-${groupIndex}`} className="border border-border/70 rounded-xl p-3 space-y-3">
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        value={group.size}
                        onChange={(e) => {
                          const next = [...sizeGroups];
                          next[groupIndex] = { ...next[groupIndex], size: e.target.value };
                          setSizeGroups(next);
                        }}
                        placeholder="1K"
                        className="w-28 px-3 py-2 bg-card/60 border border-border/70 rounded-lg text-foreground placeholder:text-foreground/30 focus:outline-none focus:border-border"
                      />
                      <span className="text-xs text-foreground/40">如 1K / 2K / 4K</span>
                      <button
                        type="button"
                        onClick={() => setSizeGroups((prev) => prev.filter((_, i) => i !== groupIndex))}
                        className="ml-auto px-3 py-2 text-foreground/40 hover:text-red-400 hover:bg-red-500/10 rounded-lg"
                      >
                        删除档位
                      </button>
                    </div>
                    <div className="space-y-2">
                      {group.rows.map((row, rowIndex) => (
                        <div key={`${row.ratio}-${rowIndex}`} className="grid grid-cols-[140px_1fr_auto] gap-2">
                          <input
                            type="text"
                            value={row.ratio}
                            onChange={(e) => {
                              const next = [...sizeGroups];
                              const rows = [...next[groupIndex].rows];
                              rows[rowIndex] = { ...rows[rowIndex], ratio: e.target.value };
                              next[groupIndex] = { ...next[groupIndex], rows };
                              setSizeGroups(next);
                            }}
                            placeholder="1:1"
                            className="w-full px-3 py-2.5 bg-card/60 border border-border/70 rounded-xl text-foreground placeholder:text-foreground/30 focus:outline-none focus:border-border"
                          />
                          <input
                            type="text"
                            value={row.resolution}
                            onChange={(e) => {
                              const next = [...sizeGroups];
                              const rows = [...next[groupIndex].rows];
                              rows[rowIndex] = { ...rows[rowIndex], resolution: e.target.value };
                              next[groupIndex] = { ...next[groupIndex], rows };
                              setSizeGroups(next);
                            }}
                            placeholder="1024x1024"
                            className="w-full px-3 py-2.5 bg-card/60 border border-border/70 rounded-xl text-foreground placeholder:text-foreground/30 focus:outline-none focus:border-border"
                          />
                          <button
                            type="button"
                            onClick={() => {
                              const next = [...sizeGroups];
                              next[groupIndex] = {
                                ...next[groupIndex],
                                rows: next[groupIndex].rows.filter((_, i) => i !== rowIndex),
                              };
                              setSizeGroups(next);
                            }}
                            className="px-3 py-2.5 text-foreground/40 hover:text-red-400 hover:bg-red-500/10 rounded-xl"
                          >
                            删除
                          </button>
                        </div>
                      ))}
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        const next = [...sizeGroups];
                        next[groupIndex] = {
                          ...next[groupIndex],
                          rows: [...next[groupIndex].rows, { ratio: '', resolution: '' }],
                        };
                        setSizeGroups(next);
                      }}
                      className="text-xs text-foreground/60 hover:text-foreground"
                    >
                      添加比例
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <label className="text-sm text-foreground/70">默认比例</label>
              <select
                value={modelForm.defaultAspectRatio}
                onChange={(e) => setModelForm({ ...modelForm, defaultAspectRatio: e.target.value })}
                className="w-full px-4 py-3 bg-card/60 border border-border/70 rounded-xl text-foreground focus:outline-none focus:border-border"
              >
                {availableRatios.length === 0 ? (
                  <option value="" className="bg-card/95">请先添加比例</option>
                ) : (
                  availableRatios.map((ratio) => (
                    <option key={ratio} value={ratio} className="bg-card/95">
                      {ratio}
                    </option>
                  ))
                )}
              </select>
            </div>
            {modelForm.features.imageSize && (
              <div className="space-y-2">
                <label className="text-sm text-foreground/70">默认分辨率档位</label>
                <select
                  value={modelForm.defaultImageSize}
                  onChange={(e) => setModelForm({ ...modelForm, defaultImageSize: e.target.value })}
                  className="w-full px-4 py-3 bg-card/60 border border-border/70 rounded-xl text-foreground focus:outline-none focus:border-border"
                >
                  {availableSizes.length === 0 ? (
                    <option value="" className="bg-card/95">请先添加档位</option>
                  ) : (
                    availableSizes.map((size) => (
                      <option key={size} value={size} className="bg-card/95">
                        {size}
                      </option>
                    ))
                  )}
                </select>
              </div>
            )}
            <div className="space-y-2">
              <label className="text-sm text-foreground/70">排序（数字越小越靠前）</label>
              <input
                type="number"
                value={modelForm.sortOrder}
                onChange={(e) => setModelForm({ ...modelForm, sortOrder: parseInt(e.target.value) || 0 })}
                className="w-full px-4 py-3 bg-card/60 border border-border/70 rounded-xl text-foreground focus:outline-none focus:border-border"
              />
            </div>
          </div>

          <div className="space-y-3 pt-2">
            <label className="text-sm text-foreground/70">功能特性</label>
            <div className="flex flex-wrap gap-4">
              {[
                { key: 'textToImage', label: '文生图' },
                { key: 'imageToImage', label: '图生图' },
                { key: 'upscale', label: '超分辨率' },
                { key: 'matting', label: '抠图' },
                { key: 'multipleImages', label: '多图输入' },
                { key: 'imageSize', label: '分辨率选择' },
              ].map(f => (
                <label key={f.key} className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={modelForm.features[f.key as keyof ImageModelFeatures]}
                    onChange={(e) => handleFeatureToggle(f.key as keyof ImageModelFeatures, e.target.checked)}
                    className="w-4 h-4 rounded border-border/70 bg-card/60 text-sky-500 focus:ring-sky-500"
                  />
                  <span className="text-sm text-foreground/70">{f.label}</span>
                </label>
              ))}
            </div>
          </div>

          <div className="flex flex-wrap gap-4 pt-2">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={modelForm.requiresReferenceImage}
                onChange={(e) => setModelForm({ ...modelForm, requiresReferenceImage: e.target.checked })}
                className="w-4 h-4 rounded border-border/70 bg-card/60 text-sky-500 focus:ring-sky-500"
              />
              <span className="text-sm text-foreground/70">必须上传参考图</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={modelForm.allowEmptyPrompt}
                onChange={(e) => setModelForm({ ...modelForm, allowEmptyPrompt: e.target.checked })}
                className="w-4 h-4 rounded border-border/70 bg-card/60 text-sky-500 focus:ring-sky-500"
              />
              <span className="text-sm text-foreground/70">允许空提示词</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={modelForm.highlight}
                onChange={(e) => setModelForm({ ...modelForm, highlight: e.target.checked })}
                className="w-4 h-4 rounded border-border/70 bg-card/60 text-sky-500 focus:ring-sky-500"
              />
              <span className="text-sm text-foreground/70">高亮显示</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={modelForm.enabled}
                onChange={(e) => setModelForm({ ...modelForm, enabled: e.target.checked })}
                className="w-4 h-4 rounded border-border/70 bg-card/60 text-sky-500 focus:ring-sky-500"
              />
              <span className="text-sm text-foreground/70">启用</span>
            </label>
          </div>

          <div className="flex items-center gap-3 pt-4">
            <button
              onClick={saveModel}
              disabled={saving}
              className="flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-sky-500 to-emerald-500 text-foreground rounded-xl font-medium hover:opacity-90 disabled:opacity-50"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              {editingModel ? '更新' : '添加'}
            </button>
            <button onClick={resetModelForm} className="px-5 py-2.5 bg-card/70 text-foreground rounded-xl hover:bg-card/80">
              取消
            </button>
          </div>
        </div>
      )}

      {/* Channels List */}
      <div className="space-y-4">
        <h2 className="text-lg font-semibold text-foreground">渠道列表</h2>
        
        {channels.length === 0 ? (
          <div className="text-center py-12 text-foreground/40 bg-card/60 border border-border/70 rounded-2xl">
            <Layers className="w-12 h-12 mx-auto mb-3 opacity-20" />
            <p>暂无渠道，请先添加</p>
          </div>
        ) : (
          <div className="space-y-3">
            {channels.map(channel => {
              const channelModels = getChannelModels(channel.id);
              const isExpanded = expandedChannels.has(channel.id);
              const typeInfo = CHANNEL_TYPES.find(t => t.value === channel.type);

              return (
                <div key={channel.id} className="bg-card/60 border border-border/70 rounded-2xl overflow-hidden">
                  {/* Channel Header */}
                  <div className="p-4 flex items-center justify-between">
                    <div className="flex items-center gap-4 cursor-pointer" onClick={() => toggleExpand(channel.id)}>
                      <div className="w-10 h-10 bg-blue-500/20 rounded-xl flex items-center justify-center">
                        <Layers className="w-5 h-5 text-blue-400" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-foreground">{channel.name}</span>
                          <span className="px-2 py-0.5 text-xs rounded-full bg-card/70 text-foreground/60">
                            {typeInfo?.label || channel.type}
                          </span>
                          <span className="px-2 py-0.5 text-xs rounded-full bg-card/70 text-foreground/40">
                            {channelModels.length} 个模型
                          </span>
                        </div>
                        <p className="text-sm text-foreground/40 truncate max-w-md">{channel.baseUrl || '未配置 Base URL'}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => toggleChannelEnabled(channel)}
                        className={`px-2.5 py-1 text-xs rounded-full ${
                          channel.enabled
                            ? 'bg-green-500/20 text-green-400 border border-green-500/30'
                            : 'bg-card/70 text-foreground/40 border border-border/70'
                        }`}
                      >
                        {channel.enabled ? '启用' : '禁用'}
                      </button>
                      <button
                        onClick={() => startAddModel(channel.id)}
                        className="p-2 text-foreground/40 hover:text-green-400 hover:bg-green-500/10 rounded-lg"
                        title="手动添加模型"
                      >
                        <Plus className="w-4 h-4" />
                      </button>
                      {(channel.type === 'openai-chat' || channel.type === 'openai-compatible') && (
                        <button
                          onClick={() => fetchRemoteModels(channel.id)}
                          disabled={fetchingRemoteModels}
                          className="p-2 text-foreground/40 hover:text-blue-400 hover:bg-blue-500/10 rounded-lg"
                          title="智能导入远端模型"
                        >
                          <Download className="w-4 h-4" />
                        </button>
                      )}
                      <button onClick={() => startEditChannel(channel)} className="p-2 text-foreground/40 hover:text-foreground hover:bg-card/70 rounded-lg">
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button onClick={() => deleteChannel(channel.id)} className="p-2 text-foreground/40 hover:text-red-400 hover:bg-red-500/10 rounded-lg">
                        <Trash2 className="w-4 h-4" />
                      </button>
                      <button onClick={() => toggleExpand(channel.id)} className="p-2 text-foreground/40 hover:text-foreground hover:bg-card/70 rounded-lg">
                        {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>

                  {/* Models List */}
                  {isExpanded && (
                    <div className="border-t border-border/70 p-4 space-y-3 bg-card/60">
                      {/* Remote Models Selection UI */}
                      {remoteModelsChannelId === channel.id && (
                        <div className="bg-card/80 border border-blue-500/30 rounded-xl p-4 space-y-3">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <Download className="w-4 h-4 text-blue-400" />
                              <span className="text-sm font-medium text-foreground">远端模型智能导入</span>
                              {fetchingRemoteModels && <Loader2 className="w-4 h-4 animate-spin text-foreground/40" />}
                            </div>
                            <button onClick={closeRemoteModels} className="text-xs text-foreground/40 hover:text-foreground">
                              收起
                            </button>
                          </div>
                          <p className="text-xs text-foreground/50">
                            已自动按模型家族做智能分组，像 `image-2 / image-2-16:9 / image-2-9:16` 这类会聚合成一个模型，并默认勾选当前渠道还没导入的项。
                          </p>

                          {/* Grouped Models Section */}
                          {groupedModels.length > 0 && (
                            <div className="space-y-2">
                              <div className="flex items-center justify-between">
                                <span className="text-xs text-foreground/60 font-medium">智能分组（{groupedModels.length}）</span>
                                <button onClick={selectAllGroupedModels} className="text-xs text-blue-400 hover:text-blue-300">全选可导入</button>
                              </div>
                              <div className="max-h-40 overflow-y-auto space-y-2">
                                {groupedModels.map(group => {
                                  const existingApiModels = new Set(channelModels.map(m => m.apiModel));
                                  const alreadyExists = isGroupedRemoteModelImported(group, existingApiModels);
                                  const isSelected = selectedGroupedModels.has(group.baseName);
                                  const override = groupedModelOverrides[group.baseName];
                                  const displayName = override?.displayName ?? group.recommendedName ?? group.displayName;
                                  const description = override?.description ?? group.recommendedDescription ?? '';
                                  const displayLabel = displayName.trim() || group.recommendedName || group.displayName;

                                  return (
                                    <div key={group.baseName} className="space-y-2">
                                      <div
                                        onClick={() => !alreadyExists && toggleGroupedModelSelection(group.baseName)}
                                        className={`flex items-center gap-2 p-2 rounded-lg cursor-pointer transition-colors ${
                                          alreadyExists
                                            ? 'opacity-40 cursor-not-allowed bg-card/40'
                                            : isSelected
                                            ? 'bg-blue-500/20 border border-blue-500/40'
                                            : 'hover:bg-card/70'
                                        }`}
                                      >
                                        <div className={`w-4 h-4 rounded border flex items-center justify-center ${
                                          alreadyExists
                                            ? 'border-foreground/20 bg-foreground/10'
                                            : isSelected
                                            ? 'border-blue-500 bg-blue-500'
                                            : 'border-foreground/30'
                                        }`}>
                                          {(isSelected || alreadyExists) && <Check className="w-3 h-3 text-white" />}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                          <span className="text-sm text-foreground truncate block">{displayLabel}</span>
                                          <span className="text-xs text-foreground/40">
                                            {group.aspectRatios.join(', ')}
                                            {group.features.imageSize && ` · ${group.imageSizes.join('/')}`}
                                          </span>
                                          <p className="mt-1 text-xs text-foreground/40 line-clamp-2">{group.recommendedDescription}</p>
                                          <div className="mt-2 flex flex-wrap gap-1">
                                            {group.tags.map((tag) => (
                                              <span key={tag} className="rounded-full bg-card/70 px-2 py-0.5 text-[10px] text-foreground/50">
                                                {tag}
                                              </span>
                                            ))}
                                          </div>
                                        </div>
                                        {alreadyExists && <span className="text-xs text-foreground/40">已存在</span>}
                                      </div>
                                      {isSelected && !alreadyExists && (
                                        <div
                                          className="pl-6 pr-2 pb-1 space-y-2"
                                          onClick={(e) => e.stopPropagation()}
                                        >
                                          <input
                                            type="text"
                                            value={displayName}
                                            onChange={(e) => {
                                              const nextValue = e.target.value;
                                              setGroupedModelOverrides(prev => ({
                                                ...prev,
                                                [group.baseName]: {
                                                  displayName: nextValue,
                                                  description: prev[group.baseName]?.description || group.recommendedDescription,
                                                },
                                              }));
                                            }}
                                            placeholder="前台显示名称"
                                            className="w-full px-3 py-2 bg-card/60 border border-border/70 rounded-lg text-foreground placeholder:text-foreground/30 text-sm focus:outline-none focus:border-border"
                                          />
                                          <input
                                            type="text"
                                            value={description}
                                            onChange={(e) => {
                                              const nextValue = e.target.value;
                                              setGroupedModelOverrides(prev => ({
                                                ...prev,
                                                [group.baseName]: {
                                                  displayName: prev[group.baseName]?.displayName ?? group.recommendedName ?? group.displayName,
                                                  description: nextValue,
                                                },
                                              }));
                                            }}
                                            placeholder="模型说明"
                                            className="w-full px-3 py-2 bg-card/60 border border-border/70 rounded-lg text-foreground placeholder:text-foreground/30 text-sm focus:outline-none focus:border-border"
                                          />
                                        </div>
                                      )}
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          )}

                          {/* Ungrouped Models Section */}
                          {remoteModels.length > 0 && (
                            <div className="space-y-2">
                              <div className="flex items-center justify-between">
                                <span className="text-xs text-foreground/60 font-medium">未分组模型（{remoteModels.length}）</span>
                                <button onClick={selectAllRemoteModels} className="text-xs text-blue-400 hover:text-blue-300">全选可导入</button>
                              </div>
                              <div className="max-h-40 overflow-y-auto space-y-1">
                                {remoteModels.map(rm => {
                                  const existingApiModels = new Set(channelModels.map(m => m.apiModel));
                                  const alreadyExists = existingApiModels.has(rm.id);
                                  const isSelected = selectedRemoteModels.has(rm.id);
                                  return (
                                    <div
                                      key={rm.id}
                                      onClick={() => !alreadyExists && toggleRemoteModelSelection(rm.id)}
                                      className={`flex items-center gap-2 p-2 rounded-lg cursor-pointer transition-colors ${
                                        alreadyExists
                                          ? 'opacity-40 cursor-not-allowed bg-card/40'
                                          : isSelected
                                          ? 'bg-blue-500/20 border border-blue-500/40'
                                          : 'hover:bg-card/70'
                                      }`}
                                    >
                                      <div className={`w-4 h-4 rounded border flex items-center justify-center ${
                                        alreadyExists
                                          ? 'border-foreground/20 bg-foreground/10'
                                          : isSelected
                                          ? 'border-blue-500 bg-blue-500'
                                          : 'border-foreground/30'
                                      }`}>
                                        {(isSelected || alreadyExists) && <Check className="w-3 h-3 text-white" />}
                                      </div>
                                      <span className="text-sm text-foreground truncate">{rm.id}</span>
                                      {alreadyExists && <span className="text-xs text-foreground/40 ml-auto">已存在</span>}
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          )}

                          {(groupedModels.length > 0 || remoteModels.length > 0) && (
                            <>
                              <div className="flex items-center gap-2 text-xs pt-2 border-t border-border/50">
                                <button onClick={deselectAllRemoteModels} className="text-foreground/50 hover:text-foreground">清空选择</button>
                                <span className="text-foreground/30 ml-auto">已选 {selectedGroupedModels.size + selectedRemoteModels.size} 项</span>
                              </div>
                              <button
                                onClick={addSelectedRemoteModels}
                                disabled={selectedRemoteModels.size === 0 && selectedGroupedModels.size === 0 || addingRemoteModels}
                                className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-gradient-to-r from-blue-500 to-cyan-500 text-foreground rounded-lg font-medium hover:opacity-90 disabled:opacity-50"
                              >
                                {addingRemoteModels ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                                一键导入 {selectedGroupedModels.size + selectedRemoteModels.size} 个模型
                              </button>
                            </>
                          )}
                          {!fetchingRemoteModels && groupedModels.length === 0 && remoteModels.length === 0 && (
                            <p className="text-sm text-foreground/40 text-center py-2">未找到可导入的远端模型</p>
                          )}
                        </div>
                      )}
                      {channelModels.length === 0 ? (
                        <p className="text-center text-foreground/30 py-4">暂无模型</p>
                      ) : (
                        channelModels.map(model => (
                          <div key={model.id} className="flex items-center justify-between p-3 bg-card/60 rounded-xl hover:bg-card/70 transition-colors">
                            <div className="flex items-center gap-3">
                              <ImageIcon className="w-4 h-4 text-sky-400" />
                              <div>
                                <div className="flex items-center gap-2">
                                  <span className="text-foreground font-medium">{model.name}</span>
                                  {model.highlight && <span className="px-1.5 py-0.5 text-xs rounded bg-yellow-500/20 text-yellow-400">推荐</span>}
                                </div>
                                <p className="text-xs text-foreground/40">{model.apiModel} · {model.costPerGeneration} 积分</p>
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              <button
                                onClick={() => toggleModelEnabled(model)}
                                className={`px-2 py-0.5 text-xs rounded-full ${
                                  model.enabled
                                    ? 'bg-green-500/20 text-green-400'
                                    : 'bg-card/70 text-foreground/40'
                                }`}
                              >
                                {model.enabled ? '启用' : '禁用'}
                              </button>
                              <button onClick={() => startEditModel(model)} className="p-1.5 text-foreground/40 hover:text-foreground hover:bg-card/70 rounded-lg">
                                <Edit2 className="w-3.5 h-3.5" />
                              </button>
                              <button onClick={() => deleteModel(model.id)} className="p-1.5 text-foreground/40 hover:text-red-400 hover:bg-red-500/10 rounded-lg">
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

