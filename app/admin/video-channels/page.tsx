'use client';

import { useState, useEffect } from 'react';
import {
  Loader2, Save, Plus, Trash2, Edit2, Eye, EyeOff,
  Layers, ChevronDown, ChevronUp, Video, RefreshCw
} from 'lucide-react';
import { toast } from '@/components/ui/toaster';
import type {
  VideoChannel,
  VideoModel,
  VideoChannelType,
  VideoModelFeatures,
  VideoDuration,
  VideoConfigObject,
} from '@/types';

const CHANNEL_TYPES: { value: VideoChannelType; label: string }[] = [
  { value: 'sora', label: 'Sora API' },
  { value: 'openai-compatible', label: 'OpenAI 流式' },
  { value: 'flow2api', label: 'Flow2API' },
  { value: 'grok2api', label: 'Grok2API' },
];

const DEFAULT_FEATURES: VideoModelFeatures = {
  textToVideo: true,
  imageToVideo: false,
  videoToVideo: false,
  supportStyles: false,
};

type AspectRatioRow = { value: string; label: string };
type DurationRow = { value: string; label: string; cost: number };
type RemoteFlow2ApiModel = {
  id: string;
  displayName: string;
  description: string;
  category: 't2v' | 'i2v' | 'r2v' | 'upsample';
  categoryLabel: string;
  defaultAspectRatio: string;
  defaultDuration: string;
  alreadyImported: boolean;
};

const DEFAULT_ASPECT_RATIOS: AspectRatioRow[] = [
  { value: 'landscape', label: '16:9' },
  { value: 'portrait', label: '9:16' },
];

const DEFAULT_DURATIONS: VideoDuration[] = [
  { value: '8s', label: '8 秒', cost: 100 },
];

const GROK_MAX_VIDEO_LENGTH_SECONDS = 30;

const GROK_ASPECT_RATIO_OPTIONS: Array<{ value: NonNullable<VideoConfigObject['aspect_ratio']>; label: string }> = [
  { value: '16:9', label: '16:9' },
  { value: '9:16', label: '9:16' },
  { value: '1:1', label: '1:1' },
  { value: '2:3', label: '2:3' },
  { value: '3:2', label: '3:2' },
];

const GROK_TEMPLATE_ASPECT_RATIOS: AspectRatioRow[] = GROK_ASPECT_RATIO_OPTIONS.map((item) => ({
  value: item.value,
  label: item.label,
}));

const GROK_TEMPLATE_DURATIONS: VideoDuration[] = [
  { value: '5s', label: '5 \u79d2', cost: 100 },
  { value: '8s', label: '8 \u79d2', cost: 100 },
  { value: '15s', label: '15 \u79d2', cost: 150 },
  { value: '30s', label: '30 \u79d2', cost: 200 },
];

const GROK_TEMPLATE_VIDEO_CONFIG_OBJECT: VideoConfigObject = {
  aspect_ratio: '16:9',
  video_length: 8,
  resolution: 'HD',
  preset: 'normal',
};

function parseDurationToSeconds(duration: string): number {
  const matched = (duration || '').match(/(\d+)/);
  const value = matched ? Number.parseInt(matched[1], 10) : 8;
  if (!Number.isFinite(value) || value <= 0) return 8;
  return value;
}

function normalizeAspectRatioForVideoConfig(aspectRatio?: string): NonNullable<VideoConfigObject['aspect_ratio']> {
  if (!aspectRatio) return '16:9';
  const normalized = aspectRatio.trim().toLowerCase();
  if (normalized === 'landscape') return '16:9';
  if (normalized === 'portrait') return '9:16';
  if (normalized === 'square') return '1:1';
  const matched = GROK_ASPECT_RATIO_OPTIONS.find((item) => item.value === aspectRatio.trim());
  return matched?.value || '16:9';
}

function normalizeVideoConfigObject(input: VideoConfigObject): VideoConfigObject {
  const videoLengthRaw = typeof input.video_length === 'number' ? input.video_length : 8;
  const videoLength = Math.max(5, Math.min(GROK_MAX_VIDEO_LENGTH_SECONDS, Math.floor(videoLengthRaw)));
  const resolution = input.resolution === 'SD' ? 'SD' : 'HD';
  const preset = input.preset === 'fun' || input.preset === 'spicy' ? input.preset : 'normal';
  return {
    aspect_ratio: normalizeAspectRatioForVideoConfig(input.aspect_ratio),
    video_length: videoLength,
    resolution,
    preset,
  };
}

function buildGrokTemplateModelPayload(channelId: string) {
  return {
    channelId,
    name: 'Grok Imagine Video',
    description: 'Grok \u9ed8\u8ba4\u6a21\u677f\uff0c\u5185\u7f6e 5/8/15/30 \u79d2\u548c HD \u914d\u7f6e',
    apiModel: 'grok-imagine-1.0-video',
    features: {
      textToVideo: true,
      imageToVideo: true,
      videoToVideo: false,
      supportStyles: false,
    },
    aspectRatios: GROK_TEMPLATE_ASPECT_RATIOS,
    durations: GROK_TEMPLATE_DURATIONS,
    defaultAspectRatio: '16:9',
    defaultDuration: '8s',
    videoConfigObject: GROK_TEMPLATE_VIDEO_CONFIG_OBJECT,
    highlight: false,
    enabled: true,
    sortOrder: 0,
  };
}

function buildSoraTemplateModelPayload(channelId: string) {
  return {
    channelId,
    name: 'Sora \u9ed8\u8ba4\u6a21\u578b',
    description: '\u6309\u5e38\u7528 Sora \u914d\u7f6e\u9884\u586b\uff0c\u521b\u5efa\u6e20\u9053\u540e\u53ef\u76f4\u63a5\u4f7f\u7528',
    apiModel: 'sora-video',
    features: {
      textToVideo: true,
      imageToVideo: true,
      videoToVideo: false,
      supportStyles: false,
    },
    aspectRatios: [...DEFAULT_ASPECT_RATIOS],
    durations: [...DEFAULT_DURATIONS],
    defaultAspectRatio: 'landscape',
    defaultDuration: '8s',
    highlight: true,
    enabled: true,
    sortOrder: 0,
  };
}

function buildManualTemplateModelPayload(channel: VideoChannel) {
  if (channel.type === 'grok2api') {
    return {
      name: 'Grok Imagine Video',
      description: '\u5df2\u9884\u586b Grok \u6a21\u677f\uff0c\u652f\u6301 5/8/15/30 \u79d2',
      apiModel: 'grok-imagine-1.0-video',
      baseUrl: '',
      apiKey: '',
      features: {
        textToVideo: true,
        imageToVideo: true,
        videoToVideo: false,
        supportStyles: false,
      },
      defaultAspectRatio: '16:9',
      defaultDuration: '8s',
      videoConfigObject: {
        ...GROK_TEMPLATE_VIDEO_CONFIG_OBJECT,
      },
      highlight: false,
      enabled: true,
      sortOrder: 0,
    };
  }

  if (channel.type === 'sora') {
    return {
      name: `${channel.name} \u9ed8\u8ba4\u6a21\u578b`,
      description: '\u5df2\u6309 Sora \u5e38\u7528\u6a21\u677f\u9884\u586b\uff0c\u786e\u8ba4\u540e\u53ef\u76f4\u63a5\u4fdd\u5b58',
      apiModel: 'sora-video',
      baseUrl: '',
      apiKey: '',
      features: {
        textToVideo: true,
        imageToVideo: true,
        videoToVideo: false,
        supportStyles: false,
      },
      defaultAspectRatio: 'landscape',
      defaultDuration: '8s',
      videoConfigObject: {
        ...GROK_TEMPLATE_VIDEO_CONFIG_OBJECT,
      },
      highlight: true,
      enabled: true,
      sortOrder: 0,
    };
  }

  if (channel.type === 'flow2api') {
    return {
      name: `${channel.name} \u624b\u52a8\u6a21\u578b`,
      description: '\u9002\u5408\u5df2\u77e5 Flow2API \u6a21\u578b ID \u7684\u573a\u666f\uff0c\u4e5f\u53ef\u5148\u7528\u4e00\u952e\u5bfc\u5165',
      apiModel: '',
      baseUrl: '',
      apiKey: '',
      features: {
        textToVideo: true,
        imageToVideo: true,
        videoToVideo: false,
        supportStyles: false,
      },
      defaultAspectRatio: 'landscape',
      defaultDuration: '8s',
      videoConfigObject: {
        ...GROK_TEMPLATE_VIDEO_CONFIG_OBJECT,
      },
      highlight: false,
      enabled: true,
      sortOrder: 0,
    };
  }

  return {
    name: `${channel.name} \u81ea\u5b9a\u4e49\u6a21\u578b`,
    description: '\u9002\u7528\u4e8e\u517c\u5bb9 /v1/chat/completions \u7684\u89c6\u9891\u63a5\u53e3',
    apiModel: '',
    baseUrl: '',
    apiKey: '',
    features: {
      textToVideo: true,
      imageToVideo: true,
      videoToVideo: false,
      supportStyles: false,
    },
    defaultAspectRatio: 'landscape',
    defaultDuration: '8s',
    videoConfigObject: {
      ...GROK_TEMPLATE_VIDEO_CONFIG_OBJECT,
    },
    highlight: false,
    enabled: true,
    sortOrder: 0,
  };
}

export default function VideoChannelsPage() {
  const [channels, setChannels] = useState<VideoChannel[]>([]);
  const [models, setModels] = useState<VideoModel[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [migrating, setMigrating] = useState(false);
  const [importingChannelId, setImportingChannelId] = useState<string | null>(null);
  const [remoteFlowModelsChannelId, setRemoteFlowModelsChannelId] = useState<string | null>(null);
  const [remoteFlowModels, setRemoteFlowModels] = useState<RemoteFlow2ApiModel[]>([]);
  const [fetchingRemoteFlowModels, setFetchingRemoteFlowModels] = useState(false);
  const [selectedRemoteFlowModels, setSelectedRemoteFlowModels] = useState<Set<string>>(new Set());
  const [expandedChannels, setExpandedChannels] = useState<Set<string>>(new Set());
  const [showKeys, setShowKeys] = useState<Record<string, boolean>>({});

  // Channel form
  const [editingChannel, setEditingChannel] = useState<string | null>(null);
  const [channelForm, setChannelForm] = useState({
    name: '',
    type: 'sora' as VideoChannelType,
    baseUrl: '',
    apiKey: '',
    enabled: true,
  });

  // Model form
  const [editingModel, setEditingModel] = useState<string | null>(null);
  const [modelChannelId, setModelChannelId] = useState<string | null>(null);
  const [modelForm, setModelForm] = useState({
    name: '',
    description: '',
    apiModel: '',
    baseUrl: '',
    apiKey: '',
    features: { ...DEFAULT_FEATURES },
    defaultAspectRatio: 'landscape',
    defaultDuration: '8s',
    videoConfigObject: {
      ...GROK_TEMPLATE_VIDEO_CONFIG_OBJECT,
    } as VideoConfigObject,
    highlight: false,
    enabled: true,
    sortOrder: 0,
  });
  const [aspectRatioRows, setAspectRatioRows] = useState<AspectRatioRow[]>([...DEFAULT_ASPECT_RATIOS]);
  const [durationRows, setDurationRows] = useState<DurationRow[]>([...DEFAULT_DURATIONS]);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [channelsRes, modelsRes] = await Promise.all([
        fetch('/api/admin/video-channels'),
        fetch('/api/admin/video-models'),
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
    if (!confirm('确定要从旧配置迁移吗？这将创建默认的 Sora 视频渠道和模型。')) return;
    setMigrating(true);
    try {
      const res = await fetch('/api/admin/migrate-video-models', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '迁移失败');
      toast({ title: `迁移成功：${data.channels} 个渠道，${data.models} 个模型` });
      loadData();
    } catch (err) {
      toast({ title: '迁移失败', description: err instanceof Error ? err.message : '未知错误', variant: 'destructive' });
    } finally {
      setMigrating(false);
    }
  };

  const resetChannelForm = () => {
    setChannelForm({ name: '', type: 'sora', baseUrl: '', apiKey: '', enabled: true });
    setEditingChannel(null);
  };

  const resetModelForm = () => {
    setModelForm({
      name: '', description: '', apiModel: '', baseUrl: '', apiKey: '',
      features: { ...DEFAULT_FEATURES },
      defaultAspectRatio: 'landscape', defaultDuration: '8s',
      videoConfigObject: {
        ...GROK_TEMPLATE_VIDEO_CONFIG_OBJECT,
      },
      highlight: false, enabled: true, sortOrder: 0,
    });
    setAspectRatioRows([...DEFAULT_ASPECT_RATIOS]);
    setDurationRows([...DEFAULT_DURATIONS]);
    setEditingModel(null);
    setModelChannelId(null);
  };

  const startEditChannel = (channel: VideoChannel) => {
    setChannelForm({
      name: channel.name,
      type: channel.type,
      baseUrl: channel.baseUrl,
      apiKey: channel.apiKey,
      enabled: channel.enabled,
    });
    setEditingChannel(channel.id);
  };

  const startEditModel = (model: VideoModel) => {
    const existingVideoConfigObject = model.videoConfigObject
      ? normalizeVideoConfigObject(model.videoConfigObject)
      : normalizeVideoConfigObject({
          aspect_ratio: normalizeAspectRatioForVideoConfig(model.defaultAspectRatio),
          video_length: Math.max(5, Math.min(GROK_MAX_VIDEO_LENGTH_SECONDS, parseDurationToSeconds(model.defaultDuration))),
          resolution: 'HD' as const,
          preset: 'normal' as const,
        });

    setModelForm({
      name: model.name,
      description: model.description,
      apiModel: model.apiModel,
      baseUrl: model.baseUrl || '',
      apiKey: model.apiKey || '',
      features: model.features,
      defaultAspectRatio: model.defaultAspectRatio,
      defaultDuration: model.defaultDuration,
      videoConfigObject: existingVideoConfigObject,
      highlight: model.highlight || false,
      enabled: model.enabled,
      sortOrder: model.sortOrder,
    });
    setAspectRatioRows(model.aspectRatios);
    setDurationRows(model.durations);
    setEditingModel(model.id);
    setModelChannelId(model.channelId);
  };

  const startAddModel = (channelId: string) => {
    const channel = channels.find((item) => item.id === channelId);
    if (!channel) return;

    resetModelForm();
    setModelForm(buildManualTemplateModelPayload(channel));
    setAspectRatioRows(
      channel.type === 'grok2api'
        ? [...GROK_TEMPLATE_ASPECT_RATIOS]
        : [...DEFAULT_ASPECT_RATIOS]
    );
    setDurationRows(
      channel.type === 'grok2api'
        ? [...GROK_TEMPLATE_DURATIONS]
        : [...DEFAULT_DURATIONS]
    );
    setModelChannelId(channelId);
  };

  const ensureTemplateModelForChannel = async (channel: VideoChannel) => {
    const modelListRes = await fetch('/api/admin/video-models');
    const modelListJson = modelListRes.ok ? await modelListRes.json() : null;
    const allModels = (modelListJson?.data || []) as VideoModel[];
    const existingForChannel = allModels.filter((item) => item.channelId === channel.id);
    if (existingForChannel.length > 0) {
      return false;
    }

    let templatePayload:
      | ReturnType<typeof buildGrokTemplateModelPayload>
      | ReturnType<typeof buildSoraTemplateModelPayload>
      | null = null;

    if (channel.type === 'grok2api') {
      templatePayload = buildGrokTemplateModelPayload(channel.id);
    } else if (channel.type === 'sora') {
      templatePayload = buildSoraTemplateModelPayload(channel.id);
    }

    if (!templatePayload) {
      return false;
    }

    const templateRes = await fetch('/api/admin/video-models', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(templatePayload),
    });
    if (!templateRes.ok) {
      const templateData = await templateRes.json().catch(() => ({}));
      throw new Error(templateData.error || '\u81ea\u52a8\u521b\u5efa\u6a21\u677f\u6a21\u578b\u5931\u8d25');
    }

    toast({
      title: channel.type === 'grok2api' ? '\u5df2\u81ea\u52a8\u6dfb\u52a0 Grok \u6a21\u677f' : '\u5df2\u81ea\u52a8\u6dfb\u52a0 Sora \u6a21\u677f',
      description: channel.type === 'grok2api' ? '\u9ed8\u8ba4\u5e26 5/10/15/30 \u79d2\u548c HD \u914d\u7f6e' : '\u5e38\u7528\u7684 Sora \u6a21\u578b\u5df2\u81ea\u52a8\u8865\u9f50',
    });
    return true;
  };

  const quickImportFlow2ApiModels = async (channel: VideoChannel) => {
    if (channel.type !== 'flow2api') return;

    setImportingChannelId(channel.id);
    setRemoteFlowModelsChannelId(channel.id);
    setFetchingRemoteFlowModels(true);
    try {
      const listRes = await fetch(`/api/admin/video-channels/models?channelId=${channel.id}`);
      const listData = await listRes.json().catch(() => ({}));
      if (!listRes.ok) {
        throw new Error(listData.error || '\u62c9\u53d6\u8fdc\u7aef\u6a21\u578b\u5931\u8d25');
      }

      const remoteItems = (listData?.data?.models || []) as RemoteFlow2ApiModel[];
      setRemoteFlowModels(remoteItems);

      const importableIds = remoteItems
        .filter((item) => !item.alreadyImported)
        .map((item) => item.id);

      setSelectedRemoteFlowModels(new Set(importableIds));
      setExpandedChannels((prev) => {
        const next = new Set(prev);
        next.add(channel.id);
        return next;
      });

      if (importableIds.length === 0) {
        toast({ title: '\u5f53\u524d Flow2API \u6a21\u578b\u90fd\u5df2\u5bfc\u5165\uff0c\u65e0\u9700\u91cd\u590d\u5bfc\u5165' });
        return;
      }

      const importRes = await fetch('/api/admin/video-channels/models', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          channelId: channel.id,
          modelIds: importableIds,
        }),
      });
      const importData = await importRes.json().catch(() => ({}));
      if (!importRes.ok) {
        throw new Error(importData.error || '\u5bfc\u5165\u6a21\u578b\u5931\u8d25');
      }

      toast({
        title: 'Flow2API \u4e00\u952e\u5bfc\u5165\u5b8c\u6210',
        description: `\u65b0\u589e ${importData?.data?.created || 0} \u4e2a\uff0c\u8df3\u8fc7 ${importData?.data?.skipped || 0} \u4e2a`,
      });

      await loadData();
      await fetchRemoteFlow2ApiModels(channel);
    } catch (err) {
      toast({
        title: 'Flow2API \u4e00\u952e\u5bfc\u5165\u5931\u8d25',
        description: err instanceof Error ? err.message : '\u672a\u77e5\u9519\u8bef',
        variant: 'destructive',
      });
    } finally {
      setFetchingRemoteFlowModels(false);
      setImportingChannelId(null);
    }
  };

  const saveChannel = async () => {
    if (!channelForm.name || !channelForm.type) {
      toast({ title: '请填写名称和类型', variant: 'destructive' });
      return;
    }
    setSaving(true);
    try {
      const res = await fetch('/api/admin/video-channels', {
        method: editingChannel ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editingChannel ? { id: editingChannel, ...channelForm } : channelForm),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error);
      }

      const channelData = await res.json();
      const createdChannel = channelData?.data as VideoChannel | undefined;
      toast({ title: editingChannel ? '\u6e20\u9053\u5df2\u66f4\u65b0' : '\u6e20\u9053\u5df2\u521b\u5efa' });

      if (!editingChannel && createdChannel) {
        if (createdChannel.type === 'flow2api') {
          if (createdChannel.baseUrl) {
            toast({
              title: '\u5f00\u59cb\u81ea\u52a8\u5bfc\u5165',
              description: '\u5df2\u5c1d\u8bd5\u81ea\u52a8\u62c9\u53d6\u5e76\u5bfc\u5165 Flow2API \u89c6\u9891\u6a21\u578b',
            });
            await quickImportFlow2ApiModels(createdChannel);
          } else {
            toast({
              title: '\u6e20\u9053\u5df2\u521b\u5efa',
              description: 'Flow2API \u5efa\u8bae\u5148\u586b\u5199 Base URL\uff0c\u518d\u4f7f\u7528\u201c\u4e00\u952e\u5bfc\u5165\u201d\u81ea\u52a8\u62c9\u53d6\u6a21\u578b',
            });
          }
        } else {
          await ensureTemplateModelForChannel(createdChannel);
        }
      }

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
      const res = await fetch(`/api/admin/video-channels?id=${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('删除失败');
      toast({ title: '渠道已删除' });
      loadData();
    } catch {
      toast({ title: '删除失败', variant: 'destructive' });
    }
  };

  const toggleChannelEnabled = async (channel: VideoChannel) => {
    try {
      const res = await fetch('/api/admin/video-channels', {
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

  const fetchRemoteFlow2ApiModels = async (channel: VideoChannel) => {
    if (channel.type !== 'flow2api') return;
    setFetchingRemoteFlowModels(true);
    setRemoteFlowModelsChannelId(channel.id);
    setRemoteFlowModels([]);
    setSelectedRemoteFlowModels(new Set());
    try {
      const res = await fetch(`/api/admin/video-channels/models?channelId=${channel.id}`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || '拉取模型失败');
      }
      const remoteItems = (data?.data?.models || []) as RemoteFlow2ApiModel[];
      setRemoteFlowModels(remoteItems);
      setSelectedRemoteFlowModels(
        new Set(remoteItems.filter((item) => !item.alreadyImported).map((item) => item.id))
      );
      setExpandedChannels((prev) => {
        const next = new Set(prev);
        next.add(channel.id);
        return next;
      });
      toast({ title: `已拉取 ${remoteItems.length} 个可识别视频模型` });
    } catch (err) {
      toast({
        title: '拉取失败',
        description: err instanceof Error ? err.message : '未知错误',
        variant: 'destructive',
      });
      setRemoteFlowModelsChannelId(null);
    } finally {
      setFetchingRemoteFlowModels(false);
    }
  };

  const closeRemoteFlow2ApiModels = () => {
    setRemoteFlowModelsChannelId(null);
    setRemoteFlowModels([]);
    setSelectedRemoteFlowModels(new Set());
  };

  const toggleRemoteFlowModelSelection = (modelId: string) => {
    setSelectedRemoteFlowModels((prev) => {
      const next = new Set(prev);
      if (next.has(modelId)) next.delete(modelId);
      else next.add(modelId);
      return next;
    });
  };

  const selectAllRemoteFlowModels = () => {
    setSelectedRemoteFlowModels(new Set(remoteFlowModels.filter((item) => !item.alreadyImported).map((item) => item.id)));
  };

  const deselectAllRemoteFlowModels = () => {
    setSelectedRemoteFlowModels(new Set());
  };

  const importSelectedFlow2ApiModels = async () => {
    if (!remoteFlowModelsChannelId || selectedRemoteFlowModels.size === 0) return;
    setImportingChannelId(remoteFlowModelsChannelId);
    try {
      const res = await fetch('/api/admin/video-channels/models', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          channelId: remoteFlowModelsChannelId,
          modelIds: Array.from(selectedRemoteFlowModels),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || '导入失败');
      }
      const summary = data?.data || {};
      toast({
        title: `导入完成：新增 ${summary.created || 0}，跳过 ${summary.skipped || 0}`,
      });
      await loadData();
      const currentChannel = channels.find((item) => item.id === remoteFlowModelsChannelId);
      if (currentChannel && currentChannel.type === 'flow2api') {
        await fetchRemoteFlow2ApiModels(currentChannel);
      }
    } catch (err) {
      toast({
        title: '导入失败',
        description: err instanceof Error ? err.message : '未知错误',
        variant: 'destructive',
      });
    } finally {
      setImportingChannelId(null);
    }
  };

  const saveModel = async () => {
    if (!modelChannelId || !modelForm.name || !modelForm.apiModel) {
      toast({ title: '请填写名称和模型 ID', variant: 'destructive' });
      return;
    }
    setSaving(true);
    try {
      const normalizedAspectRatios = aspectRatioRows
        .map((row) => ({ value: row.value.trim(), label: row.label.trim() || row.value.trim() }))
        .filter((row) => row.value);

      const normalizedDurations = durationRows
        .map((row) => ({
          value: row.value.trim(),
          label: row.label.trim() || row.value.trim(),
          cost: Number(row.cost) || 0,
        }))
        .filter((row) => row.value);

      if (normalizedAspectRatios.length === 0) {
        toast({ title: '请至少配置一个画面比例', variant: 'destructive' });
        setSaving(false);
        return;
      }

      if (normalizedDurations.length === 0) {
        toast({ title: '请至少配置一个时长', variant: 'destructive' });
        setSaving(false);
        return;
      }

      const defaultAspectRatio = normalizedAspectRatios.some((row) => row.value === modelForm.defaultAspectRatio)
        ? modelForm.defaultAspectRatio
        : normalizedAspectRatios[0].value;
      const defaultDuration = normalizedDurations.some((row) => row.value === modelForm.defaultDuration)
        ? modelForm.defaultDuration
        : normalizedDurations[0].value;
      const normalizedModelBaseUrl = modelForm.baseUrl.trim();
      const normalizedModelApiKey = modelForm.apiKey.trim();
      const selectedChannel = channels.find((channel) => channel.id === modelChannelId);
      const videoConfigObject =
        selectedChannel?.type === 'grok2api'
          ? normalizeVideoConfigObject({
              ...(modelForm.videoConfigObject || {}),
              aspect_ratio:
                modelForm.videoConfigObject?.aspect_ratio ||
                normalizeAspectRatioForVideoConfig(defaultAspectRatio),
              video_length:
                modelForm.videoConfigObject?.video_length ||
                Math.max(5, Math.min(GROK_MAX_VIDEO_LENGTH_SECONDS, parseDurationToSeconds(defaultDuration))),
            })
          : undefined;

      const payload = {
        ...(editingModel ? { id: editingModel } : {}),
        channelId: modelChannelId,
        name: modelForm.name,
        description: modelForm.description,
        apiModel: modelForm.apiModel,
        ...(editingModel
          ? {
              baseUrl: normalizedModelBaseUrl,
              apiKey: normalizedModelApiKey,
            }
          : {
              baseUrl: normalizedModelBaseUrl || undefined,
              apiKey: normalizedModelApiKey || undefined,
            }),
        features: {
          ...modelForm.features,
          supportStyles: false,
        },
        aspectRatios: normalizedAspectRatios,
        durations: normalizedDurations,
        defaultAspectRatio,
        defaultDuration,
        videoConfigObject,
        highlight: modelForm.highlight,
        enabled: modelForm.enabled,
        sortOrder: modelForm.sortOrder,
      };

      const res = await fetch('/api/admin/video-models', {
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
      const res = await fetch(`/api/admin/video-models?id=${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('删除失败');
      toast({ title: '模型已删除' });
      loadData();
    } catch {
      toast({ title: '删除失败', variant: 'destructive' });
    }
  };

  const toggleModelEnabled = async (model: VideoModel) => {
    try {
      const res = await fetch('/api/admin/video-models', {
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

  const toggleExpand = (id: string) => {
    setExpandedChannels(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const getChannelModels = (channelId: string) => models.filter(m => m.channelId === channelId);
  const selectedChannel = modelChannelId ? channels.find((channel) => channel.id === modelChannelId) : null;
  const flowImportableCount =
    remoteFlowModelsChannelId
      ? remoteFlowModels.filter((item) => !item.alreadyImported).length
      : 0;

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
          <h1 className="text-3xl font-light text-foreground">视频渠道管理</h1>
          <p className="text-foreground/50 mt-1">管理视频生成渠道和模型</p>
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
          <div className="w-10 h-10 bg-sky-500/20 rounded-xl flex items-center justify-center">
            <Layers className="w-5 h-5 text-sky-400" />
          </div>
          <h2 className="text-lg font-semibold text-foreground">
            {editingChannel ? '编辑渠道' : '添加渠道'}
          </h2>
        </div>

        <div className="rounded-xl border border-border/70 bg-card/50 p-4 text-sm text-foreground/60">
          {channelForm.type === 'flow2api' && '\u4fdd\u5b58\u6e20\u9053\u540e\u4f1a\u4f18\u5148\u5c1d\u8bd5\u81ea\u52a8\u62c9\u53d6\u5e76\u5bfc\u5165\u8fdc\u7aef\u6a21\u578b\uff1b\u540e\u7eed\u4e5f\u53ef\u4ee5\u5728\u6e20\u9053\u5361\u7247\u91cc\u4f7f\u7528\u201c\u4e00\u952e\u5bfc\u5165\u201d\u6216\u624b\u52a8\u52fe\u9009\u5bfc\u5165\u3002'}
          {channelForm.type === 'grok2api' && `\u4fdd\u5b58\u6e20\u9053\u540e\u4f1a\u81ea\u52a8\u8865\u4e00\u6761 Grok \u6a21\u677f\u6a21\u578b\uff0cvideo_length \u5141\u8bb8 5-${GROK_MAX_VIDEO_LENGTH_SECONDS} \u79d2\uff0c\u5e76\u4f1a\u7ee7\u7eed\u900f\u4f20\u5230\u751f\u6210\u8bf7\u6c42\u3002`}
          {channelForm.type === 'sora' && '\u4fdd\u5b58\u6e20\u9053\u540e\u4f1a\u81ea\u52a8\u8865\u4e00\u6761 Sora \u9ed8\u8ba4\u6a21\u578b\uff0c\u901a\u5e38\u4e0d\u9700\u8981\u624b\u5de5\u586b\u5199\u7b2c\u4e00\u6761\u6a21\u578b\u3002'}
          {channelForm.type === 'openai-compatible' && '\u9002\u7528\u4e8e\u517c\u5bb9 /v1/chat/completions \u7684\u89c6\u9891\u63a5\u53e3\u3002\u5148\u5efa\u6e20\u9053\uff0c\u518d\u6309\u5b9e\u9645\u6a21\u578b ID \u8865\u5145\u6a21\u578b\u5373\u53ef\u3002'}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <label className="text-sm text-foreground/70">名称 *</label>
            <input
              type="text"
              value={channelForm.name}
              onChange={(e) => setChannelForm({ ...channelForm, name: e.target.value })}
              placeholder="Sora"
              className="w-full px-4 py-3 bg-card/60 border border-border/70 rounded-xl text-foreground placeholder:text-foreground/30 focus:outline-none focus:border-border"
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm text-foreground/70">类型 *</label>
            <select
              value={channelForm.type}
              onChange={(e) => setChannelForm({ ...channelForm, type: e.target.value as VideoChannelType })}
              className="w-full px-4 py-3 bg-card/60 border border-border/70 rounded-xl text-foreground focus:outline-none focus:border-border"
            >
              {CHANNEL_TYPES.map(t => (
                <option key={t.value} value={t.value} className="bg-card/95">{t.label}</option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <label className="text-sm text-foreground/70">Base URL</label>
            <input
              type="text"
              value={channelForm.baseUrl}
              onChange={(e) => setChannelForm({ ...channelForm, baseUrl: e.target.value })}
              placeholder="http://localhost:8000"
              className="w-full px-4 py-3 bg-card/60 border border-border/70 rounded-xl text-foreground placeholder:text-foreground/30 focus:outline-none focus:border-border"
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm text-foreground/70">API Key</label>
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
              className="w-4 h-4 rounded border-border/70 bg-card/60 text-sky-500 focus:ring-sky-500"
            />
            <span className="text-sm text-foreground/70">启用</span>
          </label>
        </div>

        <div className="flex items-center gap-3 pt-4">
          <button
            onClick={saveChannel}
            disabled={saving}
            className="flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-sky-500 to-emerald-500 text-foreground rounded-xl font-medium hover:opacity-90 disabled:opacity-50"
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

      {/* Model Form */}
      {modelChannelId && (
        <div className="bg-card/60 border border-border/70 rounded-2xl p-6 space-y-4">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 bg-blue-500/20 rounded-xl flex items-center justify-center">
              <Video className="w-5 h-5 text-blue-400" />
            </div>
            <h2 className="text-lg font-semibold text-foreground">
              {editingModel ? '编辑模型' : '添加模型'}
            </h2>
          </div>

          {selectedChannel && (
            <div className="rounded-xl border border-border/70 bg-card/50 p-4 text-sm text-foreground/60">
              {selectedChannel.type === 'flow2api' && '\u5df2\u77e5\u6a21\u578b ID \u65f6\u518d\u624b\u52a8\u6dfb\u52a0\uff1b\u5982\u679c\u53ea\u662f\u60f3\u628a\u8fdc\u7aef\u6a21\u578b\u62c9\u4e0b\u6765\uff0c\u4f18\u5148\u4f7f\u7528\u6e20\u9053\u5361\u7247\u91cc\u7684\u201c\u4e00\u952e\u5bfc\u5165\u201d\u6216\u5237\u65b0\u9009\u62e9\u5bfc\u5165\u3002'}
              {selectedChannel.type === 'grok2api' && `\u5df2\u6309 Grok \u6a21\u677f\u9884\u586b\uff0cvideo_length \u652f\u6301 5-${GROK_MAX_VIDEO_LENGTH_SECONDS} \u79d2\uff0c\u4fdd\u5b58\u540e\u4f1a\u539f\u6837\u900f\u4f20\u5230\u751f\u6210\u8bf7\u6c42\u3002`}
              {selectedChannel.type === 'sora' && '\u5df2\u6309 Sora \u5e38\u7528\u6a21\u677f\u9884\u586b\uff0c\u901a\u5e38\u53ea\u9700\u8981\u786e\u8ba4\u540d\u79f0\u3001\u9ed8\u8ba4\u65f6\u957f\u548c\u4ef7\u683c\u5373\u53ef\u4fdd\u5b58\u3002'}
              {selectedChannel.type === 'openai-compatible' && '\u6a21\u578b\u7ea7 Base URL / API Key \u53ef\u4ee5\u7559\u7a7a\uff0c\u4fdd\u5b58\u65f6\u4f1a\u81ea\u52a8\u7ee7\u627f\u6e20\u9053\u4e0a\u7684\u914d\u7f6e\u3002'}
            </div>
          )}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <label className="text-sm text-foreground/70">名称 *</label>
              <input
                type="text"
                value={modelForm.name}
                onChange={(e) => setModelForm({ ...modelForm, name: e.target.value })}
                placeholder="Sora Video"
                className="w-full px-4 py-3 bg-card/60 border border-border/70 rounded-xl text-foreground placeholder:text-foreground/30 focus:outline-none focus:border-border"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm text-foreground/70">模型 ID *</label>
              <input
                type="text"
                value={modelForm.apiModel}
                onChange={(e) => setModelForm({ ...modelForm, apiModel: e.target.value })}
                placeholder="sora-video"
                className="w-full px-4 py-3 bg-card/60 border border-border/70 rounded-xl text-foreground placeholder:text-foreground/30 focus:outline-none focus:border-border"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm text-foreground/70">描述</label>
              <input
                type="text"
                value={modelForm.description}
                onChange={(e) => setModelForm({ ...modelForm, description: e.target.value })}
                placeholder="高质量视频生成"
                className="w-full px-4 py-3 bg-card/60 border border-border/70 rounded-xl text-foreground placeholder:text-foreground/30 focus:outline-none focus:border-border"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-sm text-foreground/70">模型 Base URL 覆盖（可选）</label>
              <input
                type="text"
                value={modelForm.baseUrl}
                onChange={(e) => setModelForm({ ...modelForm, baseUrl: e.target.value })}
                placeholder="留空则继承渠道 Base URL"
                className="w-full px-4 py-3 bg-card/60 border border-border/70 rounded-xl text-foreground placeholder:text-foreground/30 focus:outline-none focus:border-border"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm text-foreground/70">模型 API Key 覆盖（可选）</label>
              <div className="relative">
                <input
                  type={showKeys['model'] ? 'text' : 'password'}
                  value={modelForm.apiKey}
                  onChange={(e) => setModelForm({ ...modelForm, apiKey: e.target.value })}
                  placeholder="留空则继承渠道 API Key（勿加 Bearer 前缀）"
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
          </div>

          <div className="flex items-center justify-between gap-3 text-xs text-foreground/40">
            <span>留空后保存即可使用渠道级 Base URL / API Key。</span>
            <button
              type="button"
              onClick={() => setModelForm({ ...modelForm, baseUrl: '', apiKey: '' })}
              className="px-3 py-1.5 rounded-lg border border-border/70 bg-card/60 hover:bg-card/70 text-foreground/70"
            >
              清空覆盖并继承渠道
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-sm text-foreground/70">画面比例</label>
                <button
                  type="button"
                  onClick={() => setAspectRatioRows((prev) => [...prev, { value: '', label: '' }])}
                  className="text-xs text-foreground/60 hover:text-foreground"
                >
                  添加比例
                </button>
              </div>
              <div className="space-y-2">
                {aspectRatioRows.map((row, index) => (
                  <div key={`${row.value}-${index}`} className="grid grid-cols-[120px_1fr_auto] gap-2">
                    <input
                      type="text"
                      value={row.value}
                      onChange={(e) => {
                        const next = [...aspectRatioRows];
                        next[index] = { ...next[index], value: e.target.value };
                        setAspectRatioRows(next);
                      }}
                      placeholder="landscape"
                      className="w-full px-3 py-2.5 bg-card/60 border border-border/70 rounded-xl text-foreground placeholder:text-foreground/30 focus:outline-none focus:border-border"
                    />
                    <input
                      type="text"
                      value={row.label}
                      onChange={(e) => {
                        const next = [...aspectRatioRows];
                        next[index] = { ...next[index], label: e.target.value };
                        setAspectRatioRows(next);
                      }}
                      placeholder="16:9"
                      className="w-full px-3 py-2.5 bg-card/60 border border-border/70 rounded-xl text-foreground placeholder:text-foreground/30 focus:outline-none focus:border-border"
                    />
                    <button
                      type="button"
                      onClick={() => setAspectRatioRows((prev) => prev.filter((_, i) => i !== index))}
                      className="px-3 py-2.5 text-foreground/40 hover:text-red-400 hover:bg-red-500/10 rounded-xl"
                    >
                      删除
                    </button>
                  </div>
                ))}
              </div>
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-sm text-foreground/70">时长与价格</label>
                <button
                  type="button"
                  onClick={() => setDurationRows((prev) => [...prev, { value: '', label: '', cost: 0 }])}
                  className="text-xs text-foreground/60 hover:text-foreground"
                >
                  添加时长
                </button>
              </div>
              <div className="space-y-2">
                {durationRows.map((row, index) => (
                  <div key={`${row.value}-${index}`} className="grid grid-cols-[120px_1fr_120px_auto] gap-2">
                    <input
                      type="text"
                      value={row.value}
                      onChange={(e) => {
                        const next = [...durationRows];
                        next[index] = { ...next[index], value: e.target.value };
                        setDurationRows(next);
                      }}
                      placeholder="10s"
                      className="w-full px-3 py-2.5 bg-card/60 border border-border/70 rounded-xl text-foreground placeholder:text-foreground/30 focus:outline-none focus:border-border"
                    />
                    <input
                      type="text"
                      value={row.label}
                      onChange={(e) => {
                        const next = [...durationRows];
                        next[index] = { ...next[index], label: e.target.value };
                        setDurationRows(next);
                      }}
                      placeholder="10 秒"
                      className="w-full px-3 py-2.5 bg-card/60 border border-border/70 rounded-xl text-foreground placeholder:text-foreground/30 focus:outline-none focus:border-border"
                    />
                    <input
                      type="number"
                      value={row.cost}
                      onChange={(e) => {
                        const next = [...durationRows];
                        next[index] = { ...next[index], cost: parseInt(e.target.value) || 0 };
                        setDurationRows(next);
                      }}
                      placeholder="100"
                      className="w-full px-3 py-2.5 bg-card/60 border border-border/70 rounded-xl text-foreground placeholder:text-foreground/30 focus:outline-none focus:border-border"
                    />
                    <button
                      type="button"
                      onClick={() => setDurationRows((prev) => prev.filter((_, i) => i !== index))}
                      className="px-3 py-2.5 text-foreground/40 hover:text-red-400 hover:bg-red-500/10 rounded-xl"
                    >
                      删除
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <label className="text-sm text-foreground/70">默认比例</label>
              <select
                value={modelForm.defaultAspectRatio}
                onChange={(e) => setModelForm({ ...modelForm, defaultAspectRatio: e.target.value })}
                className="w-full px-4 py-3 bg-card/60 border border-border/70 rounded-xl text-foreground focus:outline-none focus:border-border"
              >
                {aspectRatioRows.filter((row) => row.value.trim()).map((row) => (
                  <option key={row.value} value={row.value} className="bg-card/95">
                    {row.label || row.value}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <label className="text-sm text-foreground/70">默认时长</label>
              <select
                value={modelForm.defaultDuration}
                onChange={(e) => setModelForm({ ...modelForm, defaultDuration: e.target.value })}
                className="w-full px-4 py-3 bg-card/60 border border-border/70 rounded-xl text-foreground focus:outline-none focus:border-border"
              >
                {durationRows.filter((row) => row.value.trim()).map((row) => (
                  <option key={row.value} value={row.value} className="bg-card/95">
                    {row.label || row.value}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <label className="text-sm text-foreground/70">排序</label>
              <input
                type="number"
                value={modelForm.sortOrder}
                onChange={(e) => setModelForm({ ...modelForm, sortOrder: parseInt(e.target.value) || 0 })}
                className="w-full px-4 py-3 bg-card/60 border border-border/70 rounded-xl text-foreground focus:outline-none focus:border-border"
              />
            </div>
          </div>

          {(() => {
            const currentChannel = channels.find((channel) => channel.id === modelChannelId);
            if (currentChannel?.type !== 'grok2api') return null;

            return (
              <div className="space-y-3 pt-2">
                <label className="text-sm text-foreground/70">Video Config Object（Grok 专用）</label>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                  <div className="space-y-2">
                    <label className="text-xs text-foreground/60">aspect_ratio</label>
                    <select
                      value={modelForm.videoConfigObject.aspect_ratio || '16:9'}
                      onChange={(e) =>
                        setModelForm({
                          ...modelForm,
                          videoConfigObject: {
                            ...modelForm.videoConfigObject,
                            aspect_ratio: e.target.value as NonNullable<VideoConfigObject['aspect_ratio']>,
                          },
                        })
                      }
                      className="w-full px-4 py-3 bg-card/60 border border-border/70 rounded-xl text-foreground focus:outline-none focus:border-border"
                    >
                      {GROK_ASPECT_RATIO_OPTIONS.map((item) => (
                        <option key={item.value} value={item.value} className="bg-card/95">
                          {item.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-2">
                    <label className="text-xs text-foreground/60">video_length</label>
                    <input
                      type="number"
                      min={5}
                      max={GROK_MAX_VIDEO_LENGTH_SECONDS}
                      value={modelForm.videoConfigObject.video_length || 10}
                      onChange={(e) => {
                        const value = Number.parseInt(e.target.value, 10);
                        setModelForm({
                          ...modelForm,
                          videoConfigObject: {
                            ...modelForm.videoConfigObject,
                            video_length: Number.isFinite(value) ? Math.max(5, Math.min(GROK_MAX_VIDEO_LENGTH_SECONDS, value)) : 10,
                          },
                        });
                      }}
                      className="w-full px-4 py-3 bg-card/60 border border-border/70 rounded-xl text-foreground focus:outline-none focus:border-border"
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="text-xs text-foreground/60">resolution</label>
                    <select
                      value={modelForm.videoConfigObject.resolution || 'HD'}
                      onChange={(e) =>
                        setModelForm({
                          ...modelForm,
                          videoConfigObject: {
                            ...modelForm.videoConfigObject,
                            resolution: e.target.value as NonNullable<VideoConfigObject['resolution']>,
                          },
                        })
                      }
                      className="w-full px-4 py-3 bg-card/60 border border-border/70 rounded-xl text-foreground focus:outline-none focus:border-border"
                    >
                      <option value="HD" className="bg-card/95">HD</option>
                      <option value="SD" className="bg-card/95">SD</option>
                    </select>
                  </div>

                  <div className="space-y-2">
                    <label className="text-xs text-foreground/60">preset</label>
                    <select
                      value={modelForm.videoConfigObject.preset || 'normal'}
                      onChange={(e) =>
                        setModelForm({
                          ...modelForm,
                          videoConfigObject: {
                            ...modelForm.videoConfigObject,
                            preset: e.target.value as NonNullable<VideoConfigObject['preset']>,
                          },
                        })
                      }
                      className="w-full px-4 py-3 bg-card/60 border border-border/70 rounded-xl text-foreground focus:outline-none focus:border-border"
                    >
                      <option value="normal" className="bg-card/95">normal</option>
                      <option value="fun" className="bg-card/95">fun</option>
                      <option value="spicy" className="bg-card/95">spicy</option>
                    </select>
                  </div>
                </div>
                <p className="text-xs text-foreground/40">新增 Grok 渠道时会自动添加模板，默认分辨率为 HD。</p>
              </div>
            );
          })()}

          <div className="space-y-3 pt-2">
            <label className="text-sm text-foreground/70">功能特性</label>
            <div className="flex flex-wrap gap-4">
              {[
                { key: 'textToVideo', label: '文生视频' },
                { key: 'imageToVideo', label: '图生视频' },
                { key: 'videoToVideo', label: '视频转视频' },
              ].map(f => (
                <label key={f.key} className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={modelForm.features[f.key as keyof VideoModelFeatures]}
                    onChange={(e) => setModelForm({
                      ...modelForm,
                      features: { ...modelForm.features, [f.key]: e.target.checked }
                    })}
                    className="w-4 h-4 rounded border-border/70 bg-card/60 text-blue-500 focus:ring-blue-500"
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
                checked={modelForm.highlight}
                onChange={(e) => setModelForm({ ...modelForm, highlight: e.target.checked })}
                className="w-4 h-4 rounded border-border/70 bg-card/60 text-blue-500 focus:ring-blue-500"
              />
              <span className="text-sm text-foreground/70">高亮显示</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={modelForm.enabled}
                onChange={(e) => setModelForm({ ...modelForm, enabled: e.target.checked })}
                className="w-4 h-4 rounded border-border/70 bg-card/60 text-blue-500 focus:ring-blue-500"
              />
              <span className="text-sm text-foreground/70">启用</span>
            </label>
          </div>

          <div className="flex items-center gap-3 pt-4">
            <button
              onClick={saveModel}
              disabled={saving}
              className="flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-blue-500 to-cyan-500 text-foreground rounded-xl font-medium hover:opacity-90 disabled:opacity-50"
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
            <p>暂无渠道，请先添加或从旧配置迁移</p>
          </div>
        ) : (
          <div className="space-y-3">
            {channels.map(channel => {
              const channelModels = getChannelModels(channel.id);
              const isExpanded = expandedChannels.has(channel.id);
              const typeInfo = CHANNEL_TYPES.find(t => t.value === channel.type);

              return (
                <div key={channel.id} className="bg-card/60 border border-border/70 rounded-2xl overflow-hidden">
                  <div className="p-4 flex items-center justify-between">
                    <div className="flex items-center gap-4 cursor-pointer" onClick={() => toggleExpand(channel.id)}>
                      <div className="w-10 h-10 bg-sky-500/20 rounded-xl flex items-center justify-center">
                        <Layers className="w-5 h-5 text-sky-400" />
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
                      {channel.type === 'flow2api' && (
                        <button
                          onClick={() => quickImportFlow2ApiModels(channel)}
                          disabled={importingChannelId === channel.id || fetchingRemoteFlowModels}
                          title="\u4e00\u952e\u5bfc\u5165\u5168\u90e8\u53ef\u8bc6\u522b\u7684 Flow2API \u89c6\u9891\u6a21\u578b"
                          className="px-3 py-1.5 text-xs rounded-full bg-cyan-500/15 text-cyan-300 hover:bg-cyan-500/25 disabled:opacity-50"
                        >
                          {importingChannelId === channel.id ? '\u5bfc\u5165\u4e2d...' : '\u4e00\u952e\u5bfc\u5165'}
                        </button>
                      )}
                      {channel.type === 'flow2api' && (
                        <button
                          onClick={() => {
                            if (remoteFlowModelsChannelId === channel.id) {
                              closeRemoteFlow2ApiModels();
                            } else {
                              fetchRemoteFlow2ApiModels(channel);
                            }
                          }}
                          disabled={importingChannelId === channel.id || fetchingRemoteFlowModels}
                          title="拉取并选择 Flow2API 视频模型"
                          className="p-2 text-foreground/40 hover:text-cyan-400 hover:bg-cyan-500/10 rounded-lg disabled:opacity-50"
                        >
                          {fetchingRemoteFlowModels && remoteFlowModelsChannelId === channel.id ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <RefreshCw className="w-4 h-4" />
                          )}
                        </button>
                      )}
                      <button onClick={() => startAddModel(channel.id)} title="\u624b\u52a8\u6dfb\u52a0\u6a21\u578b" className="p-2 text-foreground/40 hover:text-green-400 hover:bg-green-500/10 rounded-lg">
                        <Plus className="w-4 h-4" />
                      </button>
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

                  {isExpanded && (
                    <div className="border-t border-border/70 p-4 space-y-2 bg-card/60">
                      {remoteFlowModelsChannelId === channel.id && (
                        <div className="mb-3 p-3 bg-card/70 border border-border/70 rounded-xl space-y-3">
                          <div className="flex items-center justify-between">
                            <div className="text-sm font-medium text-foreground">Flow2API 模型选择导入</div>
                            <button
                              type="button"
                              onClick={closeRemoteFlow2ApiModels}
                              className="text-xs text-foreground/40 hover:text-foreground"
                            >
                              关闭
                            </button>
                          </div>

                          {fetchingRemoteFlowModels ? (
                            <div className="flex items-center justify-center py-4 text-foreground/40">
                              <Loader2 className="w-4 h-4 animate-spin mr-2" />
                              拉取模型中...
                            </div>
                          ) : remoteFlowModels.length === 0 ? (
                            <p className="text-sm text-foreground/40 text-center py-2">未发现可识别的 Flow2API 视频模型</p>
                          ) : (
                            <>
                              <div className="rounded-xl border border-border/70 bg-card/50 px-3 py-2 text-xs text-foreground/50">
                                \u5df2\u62c9\u53d6 {remoteFlowModels.length} \u4e2a\u8fdc\u7aef\u6a21\u578b\uff0c\u5176\u4e2d {flowImportableCount} \u4e2a\u5c1a\u672a\u5bfc\u5165\u3002\u53ef\u76f4\u63a5\u5168\u9009\u5bfc\u5165\uff0c\u6216\u53ea\u52fe\u9009\u9700\u8981\u7684\u6a21\u578b\u3002
                              </div>
                              <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
                                {remoteFlowModels.map((item) => {
                                  const isSelected = selectedRemoteFlowModels.has(item.id);
                                  return (
                                    <button
                                      key={item.id}
                                      type="button"
                                      onClick={() => !item.alreadyImported && toggleRemoteFlowModelSelection(item.id)}
                                      disabled={item.alreadyImported}
                                      className={`w-full text-left p-3 rounded-xl border transition-all ${
                                        item.alreadyImported
                                          ? 'bg-card/50 border-border/50 opacity-60 cursor-not-allowed'
                                          : isSelected
                                            ? 'bg-cyan-500/10 border-cyan-500/30'
                                            : 'bg-card/50 border-border/70 hover:bg-card/70'
                                      }`}
                                    >
                                      <div className="flex items-center justify-between gap-2">
                                        <div className="flex items-center gap-2">
                                          <input
                                            type="checkbox"
                                            checked={isSelected || item.alreadyImported}
                                            readOnly
                                            className="w-4 h-4 rounded border-border/70 bg-card/60"
                                          />
                                          <span className="text-sm font-medium text-foreground">{item.displayName}</span>
                                        </div>
                                        <div className="flex items-center gap-2">
                                          <span className="px-2 py-0.5 text-xs rounded-full bg-card/80 text-foreground/60">
                                            {item.categoryLabel}
                                          </span>
                                          {item.alreadyImported && (
                                            <span className="px-2 py-0.5 text-xs rounded-full bg-green-500/20 text-green-400">
                                              已导入
                                            </span>
                                          )}
                                        </div>
                                      </div>
                                      <p className="text-xs text-foreground/40 mt-1">{item.description}</p>
                                      <p className="text-xs text-foreground/30 mt-1">
                                        {item.id} · 默认 {item.defaultAspectRatio} / {item.defaultDuration}
                                      </p>
                                    </button>
                                  );
                                })}
                              </div>

                              <div className="flex items-center gap-2 text-xs text-foreground/50">
                                <button onClick={selectAllRemoteFlowModels} className="hover:text-foreground">全选可导入</button>
                                <button onClick={deselectAllRemoteFlowModels} className="hover:text-foreground">清空选择</button>
                                <span className="ml-auto">{selectedRemoteFlowModels.size} 已选择</span>
                                <button
                                  onClick={importSelectedFlow2ApiModels}
                                  disabled={selectedRemoteFlowModels.size === 0 || importingChannelId === channel.id}
                                  className="px-3 py-1.5 text-xs rounded-lg bg-cyan-500/20 text-cyan-300 hover:bg-cyan-500/30 disabled:opacity-50"
                                >
                                  {importingChannelId === channel.id ? '导入中...' : `导入选中 (${selectedRemoteFlowModels.size})`}
                                </button>
                              </div>
                            </>
                          )}
                        </div>
                      )}

                      {channelModels.length === 0 ? (
                        <p className="text-center text-foreground/30 py-4">暂无模型</p>
                      ) : (
                        channelModels.map(model => (
                          <div key={model.id} className="flex items-center justify-between p-3 bg-card/60 rounded-xl hover:bg-card/70 transition-colors">
                            <div className="flex items-center gap-3">
                              <Video className="w-4 h-4 text-blue-400" />
                              <div>
                                <div className="flex items-center gap-2">
                                  <span className="text-foreground font-medium">{model.name}</span>
                                  {model.highlight && <span className="px-1.5 py-0.5 text-xs rounded bg-yellow-500/20 text-yellow-400">推荐</span>}
                                </div>
                                <p className="text-xs text-foreground/40">
                                  {model.apiModel} · {model.durations.map(d => `${d.label}=${d.cost}积分`).join(', ')}
                                </p>
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              <button
                                onClick={() => toggleModelEnabled(model)}
                                className={`px-2 py-0.5 text-xs rounded-full ${
                                  model.enabled ? 'bg-green-500/20 text-green-400' : 'bg-card/70 text-foreground/40'
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

