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
  ChannelType,
  VideoModelFeatures,
  VideoDuration,
  VideoConfigObject,
} from '@/types';

const CHANNEL_TYPES: { value: ChannelType; label: string }[] = [
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

const DEFAULT_ASPECT_RATIOS: AspectRatioRow[] = [
  { value: 'landscape', label: '16:9' },
  { value: 'portrait', label: '9:16' },
];

const DEFAULT_DURATIONS: VideoDuration[] = [
  { value: '10s', label: '10 秒', cost: 100 },
  { value: '15s', label: '15 秒', cost: 150 },
  { value: '25s', label: '25 秒', cost: 200 },
];

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
  { value: '5s', label: '5 秒', cost: 100 },
  { value: '10s', label: '10 秒', cost: 100 },
  { value: '15s', label: '15 秒', cost: 150 },
];

const GROK_TEMPLATE_VIDEO_CONFIG_OBJECT: VideoConfigObject = {
  aspect_ratio: '16:9',
  video_length: 10,
  resolution: 'HD',
  preset: 'normal',
};

function parseDurationToSeconds(duration: string): number {
  const matched = (duration || '').match(/(\d+)/);
  const value = matched ? Number.parseInt(matched[1], 10) : 10;
  if (!Number.isFinite(value) || value <= 0) return 10;
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
  const videoLengthRaw = typeof input.video_length === 'number' ? input.video_length : 10;
  const videoLength = Math.max(5, Math.min(15, Math.floor(videoLengthRaw)));
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
    description: 'Grok video generation template',
    apiModel: 'grok-imagine-1.0-video',
    features: {
      textToVideo: true,
      imageToVideo: true,
      videoToVideo: false,
      supportStyles: true,
    },
    aspectRatios: GROK_TEMPLATE_ASPECT_RATIOS,
    durations: GROK_TEMPLATE_DURATIONS,
    defaultAspectRatio: '16:9',
    defaultDuration: '10s',
    videoConfigObject: GROK_TEMPLATE_VIDEO_CONFIG_OBJECT,
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
  const [expandedChannels, setExpandedChannels] = useState<Set<string>>(new Set());
  const [showKeys, setShowKeys] = useState<Record<string, boolean>>({});

  // Channel form
  const [editingChannel, setEditingChannel] = useState<string | null>(null);
  const [channelForm, setChannelForm] = useState({
    name: '',
    type: 'sora' as ChannelType,
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
    defaultDuration: '10s',
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
      defaultAspectRatio: 'landscape', defaultDuration: '10s',
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
          video_length: Math.max(5, Math.min(15, parseDurationToSeconds(model.defaultDuration))),
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
    if (channel?.type === 'grok2api') {
      setModelForm({
        name: 'Grok Imagine Video',
        description: 'Grok video generation template',
        apiModel: 'grok-imagine-1.0-video',
        baseUrl: '',
        apiKey: '',
        features: {
          textToVideo: true,
          imageToVideo: true,
          videoToVideo: false,
          supportStyles: true,
        },
        defaultAspectRatio: '16:9',
        defaultDuration: '10s',
        videoConfigObject: {
          ...GROK_TEMPLATE_VIDEO_CONFIG_OBJECT,
        },
        highlight: false,
        enabled: true,
        sortOrder: 0,
      });
      setAspectRatioRows([...GROK_TEMPLATE_ASPECT_RATIOS]);
      setDurationRows([...GROK_TEMPLATE_DURATIONS]);
      setEditingModel(null);
    } else {
      resetModelForm();
    }
    setModelChannelId(channelId);
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
      toast({ title: editingChannel ? '渠道已更新' : '渠道已创建' });

      if (!editingChannel && channelForm.type === 'grok2api') {
        const createdChannelId = channelData?.data?.id as string | undefined;
        if (createdChannelId) {
          const modelListRes = await fetch('/api/admin/video-models');
          const modelListJson = modelListRes.ok ? await modelListRes.json() : null;
          const allModels = (modelListJson?.data || []) as VideoModel[];
          const existingForChannel = allModels.filter((item) => item.channelId === createdChannelId);
          if (existingForChannel.length === 0) {
            const templatePayload = {
              ...buildGrokTemplateModelPayload(createdChannelId),
              sortOrder: existingForChannel.length,
            };
            const templateRes = await fetch('/api/admin/video-models', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(templatePayload),
            });
            if (!templateRes.ok) {
              const templateData = await templateRes.json().catch(() => ({}));
              throw new Error(templateData.error || 'Grok 模板模型创建失败');
            }
            toast({ title: '已自动添加 Grok 视频模板（默认 HD）' });
          }
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
                Math.max(5, Math.min(15, parseDurationToSeconds(defaultDuration))),
            })
          : undefined;

      const payload = {
        ...(editingModel ? { id: editingModel } : {}),
        channelId: modelChannelId,
        name: modelForm.name,
        description: modelForm.description,
        apiModel: modelForm.apiModel,
        baseUrl: modelForm.baseUrl || undefined,
        apiKey: modelForm.apiKey || undefined,
        features: modelForm.features,
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
              onChange={(e) => setChannelForm({ ...channelForm, type: e.target.value as ChannelType })}
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
                      max={15}
                      value={modelForm.videoConfigObject.video_length || 10}
                      onChange={(e) => {
                        const value = Number.parseInt(e.target.value, 10);
                        setModelForm({
                          ...modelForm,
                          videoConfigObject: {
                            ...modelForm.videoConfigObject,
                            video_length: Number.isFinite(value) ? Math.max(5, Math.min(15, value)) : 10,
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
                { key: 'supportStyles', label: '支持风格' },
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
                      <button onClick={() => startAddModel(channel.id)} className="p-2 text-foreground/40 hover:text-green-400 hover:bg-green-500/10 rounded-lg">
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

