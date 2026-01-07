'use client';

import { useState, useEffect } from 'react';
import {
  Loader2, Save, Plus, Trash2, Edit2, Eye, EyeOff,
  Layers, ChevronDown, ChevronUp, Image as ImageIcon, RefreshCw
} from 'lucide-react';
import { toast } from '@/components/ui/toaster';
import type { ImageChannel, ImageModel, ChannelType, ImageModelFeatures } from '@/types';

const CHANNEL_TYPES: { value: ChannelType; label: string; description: string }[] = [
  { value: 'openai-compatible', label: 'OpenAI 兼容', description: 'OpenAI Images API 格式' },
  { value: 'gemini', label: 'Gemini', description: 'Google Gemini Native API' },
  { value: 'modelscope', label: 'ModelScope', description: '魔搭社区 API' },
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
  const [modelForm, setModelForm] = useState({
    name: '',
    description: '',
    apiModel: '',
    baseUrl: '',
    apiKey: '',
    features: { ...DEFAULT_FEATURES },
    aspectRatios: '1:1,16:9,9:16',
    resolutions: '{"1:1":"1024x1024","16:9":"1792x1024","9:16":"1024x1792"}',
    imageSizes: '',
    defaultAspectRatio: '1:1',
    defaultImageSize: '',
    requiresReferenceImage: false,
    allowEmptyPrompt: false,
    highlight: false,
    enabled: true,
    costPerGeneration: 10,
    sortOrder: 0,
  });

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
      aspectRatios: '1:1,16:9,9:16',
      resolutions: '{"1:1":"1024x1024","16:9":"1792x1024","9:16":"1024x1792"}',
      imageSizes: '', defaultAspectRatio: '1:1', defaultImageSize: '',
      requiresReferenceImage: false, allowEmptyPrompt: false, highlight: false,
      enabled: true, costPerGeneration: 10, sortOrder: 0,
    });
    setEditingModel(null);
    setModelChannelId(null);
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
      aspectRatios: model.aspectRatios.join(','),
      resolutions: JSON.stringify(model.resolutions),
      imageSizes: model.imageSizes?.join(',') || '',
      defaultAspectRatio: model.defaultAspectRatio,
      defaultImageSize: model.defaultImageSize || '',
      requiresReferenceImage: model.requiresReferenceImage || false,
      allowEmptyPrompt: model.allowEmptyPrompt || false,
      highlight: model.highlight || false,
      enabled: model.enabled,
      costPerGeneration: model.costPerGeneration,
      sortOrder: model.sortOrder,
    });
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
    setSaving(true);
    try {
      let resolutions: Record<string, string | Record<string, string>> = {};
      try {
        resolutions = JSON.parse(modelForm.resolutions);
      } catch {
        toast({ title: '分辨率 JSON 格式错误', variant: 'destructive' });
        setSaving(false);
        return;
      }

      const payload = {
        ...(editingModel ? { id: editingModel } : {}),
        channelId: modelChannelId,
        name: modelForm.name,
        description: modelForm.description,
        apiModel: modelForm.apiModel,
        baseUrl: modelForm.baseUrl || undefined,
        apiKey: modelForm.apiKey || undefined,
        features: modelForm.features,
        aspectRatios: modelForm.aspectRatios.split(',').map(s => s.trim()).filter(Boolean),
        resolutions,
        imageSizes: modelForm.imageSizes ? modelForm.imageSizes.split(',').map(s => s.trim()).filter(Boolean) : undefined,
        defaultAspectRatio: modelForm.defaultAspectRatio,
        defaultImageSize: modelForm.defaultImageSize || undefined,
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
        <Loader2 className="w-8 h-8 animate-spin text-white/30" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-light text-white">图像渠道管理</h1>
          <p className="text-white/50 mt-1">管理图像生成渠道和模型</p>
        </div>
        {channels.length === 0 && (
          <button
            onClick={migrateFromLegacy}
            disabled={migrating}
            className="flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-amber-500 to-orange-500 text-white rounded-xl font-medium hover:opacity-90 disabled:opacity-50"
          >
            {migrating ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
            从旧配置迁移
          </button>
        )}
      </div>

      {/* Channel Form */}
      <div className="bg-white/[0.03] border border-white/10 rounded-2xl p-6 space-y-4">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 bg-blue-500/20 rounded-xl flex items-center justify-center">
            <Layers className="w-5 h-5 text-blue-400" />
          </div>
          <h2 className="text-lg font-semibold text-white">
            {editingChannel ? '编辑渠道' : '添加渠道'}
          </h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <label className="text-sm text-white/70">名称 *</label>
            <input
              type="text"
              value={channelForm.name}
              onChange={(e) => setChannelForm({ ...channelForm, name: e.target.value })}
              placeholder="NEWAPI"
              className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder:text-white/30 focus:outline-none focus:border-white/30"
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm text-white/70">类型 *</label>
            <select
              value={channelForm.type}
              onChange={(e) => setChannelForm({ ...channelForm, type: e.target.value as ChannelType })}
              className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white focus:outline-none focus:border-white/30"
            >
              {CHANNEL_TYPES.map(t => (
                <option key={t.value} value={t.value} className="bg-zinc-900">{t.label} - {t.description}</option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <label className="text-sm text-white/70">Base URL</label>
            <input
              type="text"
              value={channelForm.baseUrl}
              onChange={(e) => setChannelForm({ ...channelForm, baseUrl: e.target.value })}
              placeholder="https://api.example.com"
              className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder:text-white/30 focus:outline-none focus:border-white/30"
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm text-white/70">API Key（多个用逗号分隔）</label>
            <div className="relative">
              <input
                type={showKeys['channel'] ? 'text' : 'password'}
                value={channelForm.apiKey}
                onChange={(e) => setChannelForm({ ...channelForm, apiKey: e.target.value })}
                placeholder="sk-..."
                className="w-full px-4 py-3 pr-12 bg-white/5 border border-white/10 rounded-xl text-white placeholder:text-white/30 focus:outline-none focus:border-white/30"
              />
              <button
                type="button"
                onClick={() => setShowKeys({ ...showKeys, channel: !showKeys['channel'] })}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-white/40 hover:text-white/70"
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
              className="w-4 h-4 rounded border-white/20 bg-white/5 text-blue-500 focus:ring-blue-500"
            />
            <span className="text-sm text-white/70">启用</span>
          </label>
        </div>

        <div className="flex items-center gap-3 pt-4">
          <button
            onClick={saveChannel}
            disabled={saving}
            className="flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-blue-500 to-cyan-500 text-white rounded-xl font-medium hover:opacity-90 disabled:opacity-50"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            {editingChannel ? '更新' : '添加'}
          </button>
          {editingChannel && (
            <button onClick={resetChannelForm} className="px-5 py-2.5 bg-white/10 text-white rounded-xl hover:bg-white/20">
              取消
            </button>
          )}
        </div>
      </div>

      {/* Model Form (shown when adding/editing) */}
      {modelChannelId && (
        <div className="bg-white/[0.03] border border-white/10 rounded-2xl p-6 space-y-4">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 bg-purple-500/20 rounded-xl flex items-center justify-center">
              <ImageIcon className="w-5 h-5 text-purple-400" />
            </div>
            <h2 className="text-lg font-semibold text-white">
              {editingModel ? '编辑模型' : '添加模型'}
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <label className="text-sm text-white/70">名称 *</label>
              <input
                type="text"
                value={modelForm.name}
                onChange={(e) => setModelForm({ ...modelForm, name: e.target.value })}
                placeholder="GPT-4o Image"
                className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder:text-white/30 focus:outline-none focus:border-white/30"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm text-white/70">模型 ID *</label>
              <input
                type="text"
                value={modelForm.apiModel}
                onChange={(e) => setModelForm({ ...modelForm, apiModel: e.target.value })}
                placeholder="gpt-4o-image"
                className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder:text-white/30 focus:outline-none focus:border-white/30"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm text-white/70">描述</label>
              <input
                type="text"
                value={modelForm.description}
                onChange={(e) => setModelForm({ ...modelForm, description: e.target.value })}
                placeholder="高质量图像生成"
                className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder:text-white/30 focus:outline-none focus:border-white/30"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm text-white/70">Base URL（可选，覆盖渠道）</label>
              <input
                type="text"
                value={modelForm.baseUrl}
                onChange={(e) => setModelForm({ ...modelForm, baseUrl: e.target.value })}
                placeholder="留空使用渠道默认"
                className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder:text-white/30 focus:outline-none focus:border-white/30"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm text-white/70">API Key（可选，覆盖渠道）</label>
              <div className="relative">
                <input
                  type={showKeys['model'] ? 'text' : 'password'}
                  value={modelForm.apiKey}
                  onChange={(e) => setModelForm({ ...modelForm, apiKey: e.target.value })}
                  placeholder="留空使用渠道默认"
                  className="w-full px-4 py-3 pr-12 bg-white/5 border border-white/10 rounded-xl text-white placeholder:text-white/30 focus:outline-none focus:border-white/30"
                />
                <button
                  type="button"
                  onClick={() => setShowKeys({ ...showKeys, model: !showKeys['model'] })}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-white/40 hover:text-white/70"
                >
                  {showKeys['model'] ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-sm text-white/70">每次消耗积分</label>
              <input
                type="number"
                value={modelForm.costPerGeneration}
                onChange={(e) => setModelForm({ ...modelForm, costPerGeneration: parseInt(e.target.value) || 10 })}
                className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white focus:outline-none focus:border-white/30"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-sm text-white/70">画面比例（逗号分隔）</label>
              <input
                type="text"
                value={modelForm.aspectRatios}
                onChange={(e) => setModelForm({ ...modelForm, aspectRatios: e.target.value })}
                placeholder="1:1,16:9,9:16"
                className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder:text-white/30 focus:outline-none focus:border-white/30"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm text-white/70">默认比例</label>
              <input
                type="text"
                value={modelForm.defaultAspectRatio}
                onChange={(e) => setModelForm({ ...modelForm, defaultAspectRatio: e.target.value })}
                placeholder="1:1"
                className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder:text-white/30 focus:outline-none focus:border-white/30"
              />
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-sm text-white/70">分辨率映射（JSON）</label>
            <textarea
              value={modelForm.resolutions}
              onChange={(e) => setModelForm({ ...modelForm, resolutions: e.target.value })}
              placeholder='{"1:1":"1024x1024","16:9":"1792x1024"}'
              className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder:text-white/30 focus:outline-none focus:border-white/30 h-20 font-mono text-sm"
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-sm text-white/70">分辨率档位（逗号分隔，如 1K,2K,4K）</label>
              <input
                type="text"
                value={modelForm.imageSizes}
                onChange={(e) => setModelForm({ ...modelForm, imageSizes: e.target.value })}
                placeholder="留空表示不支持"
                className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder:text-white/30 focus:outline-none focus:border-white/30"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm text-white/70">排序（数字越小越靠前）</label>
              <input
                type="number"
                value={modelForm.sortOrder}
                onChange={(e) => setModelForm({ ...modelForm, sortOrder: parseInt(e.target.value) || 0 })}
                className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white focus:outline-none focus:border-white/30"
              />
            </div>
          </div>

          <div className="space-y-3 pt-2">
            <label className="text-sm text-white/70">功能特性</label>
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
                    onChange={(e) => setModelForm({
                      ...modelForm,
                      features: { ...modelForm.features, [f.key]: e.target.checked }
                    })}
                    className="w-4 h-4 rounded border-white/20 bg-white/5 text-purple-500 focus:ring-purple-500"
                  />
                  <span className="text-sm text-white/70">{f.label}</span>
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
                className="w-4 h-4 rounded border-white/20 bg-white/5 text-purple-500 focus:ring-purple-500"
              />
              <span className="text-sm text-white/70">必须上传参考图</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={modelForm.allowEmptyPrompt}
                onChange={(e) => setModelForm({ ...modelForm, allowEmptyPrompt: e.target.checked })}
                className="w-4 h-4 rounded border-white/20 bg-white/5 text-purple-500 focus:ring-purple-500"
              />
              <span className="text-sm text-white/70">允许空提示词</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={modelForm.highlight}
                onChange={(e) => setModelForm({ ...modelForm, highlight: e.target.checked })}
                className="w-4 h-4 rounded border-white/20 bg-white/5 text-purple-500 focus:ring-purple-500"
              />
              <span className="text-sm text-white/70">高亮显示</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={modelForm.enabled}
                onChange={(e) => setModelForm({ ...modelForm, enabled: e.target.checked })}
                className="w-4 h-4 rounded border-white/20 bg-white/5 text-purple-500 focus:ring-purple-500"
              />
              <span className="text-sm text-white/70">启用</span>
            </label>
          </div>

          <div className="flex items-center gap-3 pt-4">
            <button
              onClick={saveModel}
              disabled={saving}
              className="flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-xl font-medium hover:opacity-90 disabled:opacity-50"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              {editingModel ? '更新' : '添加'}
            </button>
            <button onClick={resetModelForm} className="px-5 py-2.5 bg-white/10 text-white rounded-xl hover:bg-white/20">
              取消
            </button>
          </div>
        </div>
      )}

      {/* Channels List */}
      <div className="space-y-4">
        <h2 className="text-lg font-semibold text-white">渠道列表</h2>
        
        {channels.length === 0 ? (
          <div className="text-center py-12 text-white/40 bg-white/[0.03] border border-white/10 rounded-2xl">
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
                <div key={channel.id} className="bg-white/[0.03] border border-white/10 rounded-2xl overflow-hidden">
                  {/* Channel Header */}
                  <div className="p-4 flex items-center justify-between">
                    <div className="flex items-center gap-4 cursor-pointer" onClick={() => toggleExpand(channel.id)}>
                      <div className="w-10 h-10 bg-blue-500/20 rounded-xl flex items-center justify-center">
                        <Layers className="w-5 h-5 text-blue-400" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-white">{channel.name}</span>
                          <span className="px-2 py-0.5 text-xs rounded-full bg-white/10 text-white/60">
                            {typeInfo?.label || channel.type}
                          </span>
                          <span className="px-2 py-0.5 text-xs rounded-full bg-white/10 text-white/40">
                            {channelModels.length} 个模型
                          </span>
                        </div>
                        <p className="text-sm text-white/40 truncate max-w-md">{channel.baseUrl || '未配置 Base URL'}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => toggleChannelEnabled(channel)}
                        className={`px-2.5 py-1 text-xs rounded-full ${
                          channel.enabled
                            ? 'bg-green-500/20 text-green-400 border border-green-500/30'
                            : 'bg-white/10 text-white/40 border border-white/10'
                        }`}
                      >
                        {channel.enabled ? '启用' : '禁用'}
                      </button>
                      <button onClick={() => startAddModel(channel.id)} className="p-2 text-white/40 hover:text-green-400 hover:bg-green-500/10 rounded-lg">
                        <Plus className="w-4 h-4" />
                      </button>
                      <button onClick={() => startEditChannel(channel)} className="p-2 text-white/40 hover:text-white hover:bg-white/10 rounded-lg">
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button onClick={() => deleteChannel(channel.id)} className="p-2 text-white/40 hover:text-red-400 hover:bg-red-500/10 rounded-lg">
                        <Trash2 className="w-4 h-4" />
                      </button>
                      <button onClick={() => toggleExpand(channel.id)} className="p-2 text-white/40 hover:text-white hover:bg-white/10 rounded-lg">
                        {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>

                  {/* Models List */}
                  {isExpanded && (
                    <div className="border-t border-white/10 p-4 space-y-2 bg-white/[0.02]">
                      {channelModels.length === 0 ? (
                        <p className="text-center text-white/30 py-4">暂无模型</p>
                      ) : (
                        channelModels.map(model => (
                          <div key={model.id} className="flex items-center justify-between p-3 bg-white/5 rounded-xl hover:bg-white/10 transition-colors">
                            <div className="flex items-center gap-3">
                              <ImageIcon className="w-4 h-4 text-purple-400" />
                              <div>
                                <div className="flex items-center gap-2">
                                  <span className="text-white font-medium">{model.name}</span>
                                  {model.highlight && <span className="px-1.5 py-0.5 text-xs rounded bg-yellow-500/20 text-yellow-400">推荐</span>}
                                </div>
                                <p className="text-xs text-white/40">{model.apiModel} · {model.costPerGeneration} 积分</p>
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              <button
                                onClick={() => toggleModelEnabled(model)}
                                className={`px-2 py-0.5 text-xs rounded-full ${
                                  model.enabled
                                    ? 'bg-green-500/20 text-green-400'
                                    : 'bg-white/10 text-white/40'
                                }`}
                              >
                                {model.enabled ? '启用' : '禁用'}
                              </button>
                              <button onClick={() => startEditModel(model)} className="p-1.5 text-white/40 hover:text-white hover:bg-white/10 rounded-lg">
                                <Edit2 className="w-3.5 h-3.5" />
                              </button>
                              <button onClick={() => deleteModel(model.id)} className="p-1.5 text-white/40 hover:text-red-400 hover:bg-red-500/10 rounded-lg">
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
