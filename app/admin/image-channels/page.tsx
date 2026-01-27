'use client';

import { useState, useEffect, useMemo } from 'react';
import {
  Loader2, Save, Plus, Trash2, Edit2, Eye, EyeOff,
  Layers, ChevronDown, ChevronUp, Image as ImageIcon, RefreshCw, Download, Check
} from 'lucide-react';
import { toast } from '@/components/ui/toaster';
import type { ImageChannel, ImageModel, ChannelType, ImageModelFeatures } from '@/types';

const CHANNEL_TYPES: { value: ChannelType; label: string; description: string }[] = [
  { value: 'openai-compatible', label: 'OpenAI Images', description: 'OpenAI /v1/images/generations API' },
  { value: 'openai-chat', label: 'OpenAI Chat', description: 'OpenAI /v1/chat/completions API' },
  { value: 'gemini', label: 'Gemini', description: 'Google Gemini Native API' },
  { value: 'modelscope', label: 'ModelScope', description: 'ModelScope API' },
  { value: 'gitee', label: 'Gitee AI', description: 'Gitee AI API' },
  { value: 'sora', label: 'Sora', description: 'OpenAI Sora API' },
];

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
  // Extract base name, e.g. "gemini-3.0-pro-image" from "gemini-3.0-pro-image-square"
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
  
  return sizes.map(size => ({
    size,
    rows: Object.entries(ratioToSuffix).map(([ratio, suffix]) => ({
      ratio,
      resolution: `${baseName}-${suffix}${sizeSuffixes[size]}`,
    })),
  }));
};

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
  const [channelForm, setChannelForm] = useState({
    name: '',
    type: 'openai-compatible' as ChannelType,
    baseUrl: '',
    apiKey: '',
    enabled: true,
  });

  // Model form
  const [editingModel, setEditingModel] = useState<string | null>(null);
  const [modelChannelId, setModelChannelId] = useState<string | null>(null);

  // Remote models
  const [remoteModels, setRemoteModels] = useState<{ id: string; owned_by: string }[]>([]);
  const [groupedModels, setGroupedModels] = useState<Array<{
    baseName: string;
    displayName: string;
    apiModel: string;
    aspectRatios: string[];
    imageSizes: string[];
    resolutions: Record<string, string | Record<string, string>>;
    features: { textToImage: boolean; imageToImage: boolean; imageSize: boolean };
  }>>([]);
  const [remoteModelsChannelId, setRemoteModelsChannelId] = useState<string | null>(null);
  const [fetchingRemoteModels, setFetchingRemoteModels] = useState(false);
  const [selectedRemoteModels, setSelectedRemoteModels] = useState<Set<string>>(new Set());
  const [selectedGroupedModels, setSelectedGroupedModels] = useState<Set<string>>(new Set());
  const [addingRemoteModels, setAddingRemoteModels] = useState(false);
  const [groupedModelOverrides, setGroupedModelOverrides] = useState<Record<string, { displayName: string; description: string }>>({});

  const [modelForm, setModelForm] = useState({
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
  });
  const [ratioRows, setRatioRows] = useState<RatioResolutionRow[]>([...DEFAULT_RATIO_ROWS]);
  const [sizeGroups, setSizeGroups] = useState<SizeResolutionGroup[]>([
    { size: '1K', rows: [...DEFAULT_RATIO_ROWS] },
  ]);
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
    setChannelForm({ name: '', type: 'openai-compatible', baseUrl: '', apiKey: '', enabled: true });
    setEditingChannel(null);
  };

  const resetModelForm = () => {
    setModelForm({
      name: '', description: '', apiModel: '', baseUrl: '', apiKey: '',
      features: { ...DEFAULT_FEATURES },
      defaultAspectRatio: '1:1',
      defaultImageSize: '',
      requiresReferenceImage: false, allowEmptyPrompt: false, highlight: false,
      enabled: true, costPerGeneration: 10, sortOrder: 0,
    });
    setRatioRows([...DEFAULT_RATIO_ROWS]);
    setSizeGroups([{ size: '1K', rows: [...DEFAULT_RATIO_ROWS] }]);
    setEditingModel(null);
    setModelChannelId(null);
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

  const startEditChannel = (channel: ImageChannel) => {
    setChannelForm({
      name: channel.name,
      type: channel.type,
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
      setSizeGroups([{ size: '1K', rows: [...DEFAULT_RATIO_ROWS] }]);
    }
    setEditingModel(model.id);
    setModelChannelId(model.channelId);
  };

  const startAddModel = (channelId: string) => {
    resetModelForm();
    setModelChannelId(channelId);
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
        .filter((row) => row.ratio && row.resolution);

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

  const getChannelModels = (channelId: string) => models.filter(m => m.channelId === channelId);

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
        throw new Error(data.error || 'Failed to fetch models');
      }
      setGroupedModels(data.data?.grouped || []);
      setRemoteModels(data.data?.ungrouped || []);
    } catch (err) {
      toast({ title: 'Failed to fetch remote models', description: err instanceof Error ? err.message : 'Unknown error', variant: 'destructive' });
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
    const existingApiModels = new Set(models.filter(m => m.channelId === remoteModelsChannelId).map(m => m.apiModel));
    const available = groupedModels.filter(g => !existingApiModels.has(g.apiModel));
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

      // Add grouped models
      for (const baseName of Array.from(selectedGroupedModels)) {
        const group = groupedModels.find(g => g.baseName === baseName);
        if (!group) continue;
        const override = groupedModelOverrides[baseName];
        const name = (override?.displayName || group.displayName).trim() || group.displayName;
        const description = (override?.description || '').trim();

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
            sortOrder: 0,
          }),
        });
        if (res.ok) added++;
      }

      // Add ungrouped models
      for (const modelId of Array.from(selectedRemoteModels)) {
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
            sortOrder: 0,
          }),
        });
        if (res.ok) added++;
      }

      toast({ title: `Added ${added} model(s)` });
      closeRemoteModels();
      loadData();
    } catch (err) {
      toast({ title: 'Failed to add models', description: err instanceof Error ? err.message : 'Unknown error', variant: 'destructive' });
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
              onChange={(e) => setChannelForm({ ...channelForm, type: e.target.value as ChannelType })}
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
                      <button onClick={() => startAddModel(channel.id)} className="p-2 text-foreground/40 hover:text-green-400 hover:bg-green-500/10 rounded-lg" title="Add model manually">
                        <Plus className="w-4 h-4" />
                      </button>
                      {(channel.type === 'openai-chat' || channel.type === 'openai-compatible') && (
                        <button
                          onClick={() => fetchRemoteModels(channel.id)}
                          disabled={fetchingRemoteModels}
                          className="p-2 text-foreground/40 hover:text-blue-400 hover:bg-blue-500/10 rounded-lg"
                          title="Fetch models from /v1/models"
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
                              <span className="text-sm font-medium text-foreground">Remote Models</span>
                              {fetchingRemoteModels && <Loader2 className="w-4 h-4 animate-spin text-foreground/40" />}
                            </div>
                            <button onClick={closeRemoteModels} className="text-xs text-foreground/40 hover:text-foreground">
                              Close
                            </button>
                          </div>

                          {/* Grouped Models Section */}
                          {groupedModels.length > 0 && (
                            <div className="space-y-2">
                              <div className="flex items-center justify-between">
                                <span className="text-xs text-foreground/60 font-medium">Smart Grouped ({groupedModels.length})</span>
                                <button onClick={selectAllGroupedModels} className="text-xs text-blue-400 hover:text-blue-300">Select all</button>
                              </div>
                              <div className="max-h-40 overflow-y-auto space-y-2">
                                {groupedModels.map(group => {
                                  const existingApiModels = new Set(channelModels.map(m => m.apiModel));
                                  const alreadyExists = existingApiModels.has(group.apiModel);
                                  const isSelected = selectedGroupedModels.has(group.baseName);
                                  const override = groupedModelOverrides[group.baseName];
                                  const displayName = override?.displayName ?? group.displayName;
                                  const description = override?.description ?? '';
                                  const displayLabel = displayName.trim() || group.displayName;

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
                                        </div>
                                        {alreadyExists && <span className="text-xs text-foreground/40">Added</span>}
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
                                                  description: prev[group.baseName]?.description || '',
                                                },
                                              }));
                                            }}
                                            placeholder="显示名称"
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
                                                  displayName: prev[group.baseName]?.displayName ?? group.displayName,
                                                  description: nextValue,
                                                },
                                              }));
                                            }}
                                            placeholder="模型介绍"
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
                                <span className="text-xs text-foreground/60 font-medium">Other Models ({remoteModels.length})</span>
                                <button onClick={selectAllRemoteModels} className="text-xs text-blue-400 hover:text-blue-300">Select all</button>
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
                                      {alreadyExists && <span className="text-xs text-foreground/40 ml-auto">Added</span>}
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          )}

                          {(groupedModels.length > 0 || remoteModels.length > 0) && (
                            <>
                              <div className="flex items-center gap-2 text-xs pt-2 border-t border-border/50">
                                <button onClick={deselectAllRemoteModels} className="text-foreground/50 hover:text-foreground">Deselect all</button>
                                <span className="text-foreground/30 ml-auto">{selectedGroupedModels.size + selectedRemoteModels.size} selected</span>
                              </div>
                              <button
                                onClick={addSelectedRemoteModels}
                                disabled={selectedRemoteModels.size === 0 && selectedGroupedModels.size === 0 || addingRemoteModels}
                                className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-gradient-to-r from-blue-500 to-cyan-500 text-foreground rounded-lg font-medium hover:opacity-90 disabled:opacity-50"
                              >
                                {addingRemoteModels ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                                Add {selectedGroupedModels.size + selectedRemoteModels.size} model(s)
                              </button>
                            </>
                          )}
                          {!fetchingRemoteModels && groupedModels.length === 0 && remoteModels.length === 0 && (
                            <p className="text-sm text-foreground/40 text-center py-2">No models found</p>
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

