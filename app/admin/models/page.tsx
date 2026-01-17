'use client';

import { useState, useEffect } from 'react';
import {
  MessageSquare, Loader2, Save, Eye, EyeOff, Plus, Trash2, 
  AlertCircle, Check, X, Edit2, Power
} from 'lucide-react';
import { toast } from '@/components/ui/toaster';
import type { ChatModel } from '@/types';

export default function ModelsPage() {
  const [models, setModels] = useState<ChatModel[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showKeys, setShowKeys] = useState<Record<string, boolean>>({});
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [form, setForm] = useState({
    name: '',
    apiUrl: '',
    apiKey: '',
    modelId: '',
    supportsVision: false,
    maxTokens: 4096,
    costPerMessage: 1,
    enabled: true,
  });

  useEffect(() => {
    loadModels();
  }, []);

  const loadModels = async () => {
    try {
      const res = await fetch('/api/chat/models?all=true');
      if (res.ok) {
        const data = await res.json();
        setModels(data.data || []);
      }
    } catch (err) {
      console.error('Failed to load models:', err);
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setForm({
      name: '',
      apiUrl: '',
      apiKey: '',
      modelId: '',
      supportsVision: false,
      maxTokens: 4096,
      costPerMessage: 1,
      enabled: true,
    });
    setShowAdvanced(false);
    setEditingId(null);
  };

  const startEdit = (model: ChatModel) => {
    setForm({
      name: model.name,
      apiUrl: model.apiUrl,
      apiKey: model.apiKey,
      modelId: model.modelId,
      supportsVision: model.supportsVision,
      maxTokens: model.maxTokens,
      costPerMessage: model.costPerMessage,
      enabled: model.enabled,
    });
    setEditingId(model.id);
    setShowAdvanced(true);
  };


  const saveModel = async () => {
    if (!form.name || !form.apiUrl || !form.apiKey || !form.modelId) {
      toast({ title: '请填写所有必填项', variant: 'destructive' });
      return;
    }
    setSaving(true);
    try {
      const res = await fetch('/api/chat/models', {
        method: editingId ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editingId ? { id: editingId, ...form } : form),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error);
      }
      toast({ title: editingId ? '模型已更新' : '模型已创建' });
      resetForm();
      loadModels();
    } catch (err) {
      toast({ title: '保存失败', description: err instanceof Error ? err.message : '未知错误', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const deleteModel = async (id: string) => {
    if (!confirm('确定删除该模型？')) return;
    try {
      const res = await fetch(`/api/chat/models?id=${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('删除失败');
      toast({ title: '模型已删除' });
      loadModels();
    } catch (err) {
      toast({ title: '删除失败', variant: 'destructive' });
    }
  };

  const toggleEnabled = async (model: ChatModel) => {
    try {
      const res = await fetch('/api/chat/models', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: model.id, enabled: !model.enabled }),
      });
      if (!res.ok) throw new Error('更新失败');
      loadModels();
    } catch (err) {
      toast({ title: '更新失败', variant: 'destructive' });
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
      <div>
        <h1 className="text-3xl font-light text-foreground">聊天模型</h1>
        <p className="text-foreground/50 mt-1">配置 OpenAI 兼容的聊天模型</p>
      </div>

      {/* Form */}
      <div className="bg-card/60 border border-border/70 rounded-2xl p-6 space-y-4">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 bg-sky-500/20 rounded-xl flex items-center justify-center">
            <MessageSquare className="w-5 h-5 text-sky-400" />
          </div>
          <h2 className="text-lg font-semibold text-foreground">
            {editingId ? '编辑模型' : '添加模型'}
          </h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <label className="text-sm text-foreground/70">名称 *</label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="GPT-4o"
              className="w-full px-4 py-3 bg-card/60 border border-border/70 rounded-xl text-foreground placeholder:text-foreground/30 focus:outline-none focus:border-border"
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm text-foreground/70">模型 ID *</label>
            <input
              type="text"
              value={form.modelId}
              onChange={(e) => setForm({ ...form, modelId: e.target.value })}
              placeholder="gpt-4o"
              className="w-full px-4 py-3 bg-card/60 border border-border/70 rounded-xl text-foreground placeholder:text-foreground/30 focus:outline-none focus:border-border"
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm text-foreground/70">Base URL *</label>
            <input
              type="text"
              value={form.apiUrl}
              onChange={(e) => setForm({ ...form, apiUrl: e.target.value })}
              placeholder="https://api.openai.com/v1/chat/completions"
              className="w-full px-4 py-3 bg-card/60 border border-border/70 rounded-xl text-foreground placeholder:text-foreground/30 focus:outline-none focus:border-border"
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm text-foreground/70">API Key *</label>
            <div className="relative">
              <input
                type={showKeys['form'] ? 'text' : 'password'}
                value={form.apiKey}
                onChange={(e) => setForm({ ...form, apiKey: e.target.value })}
                placeholder="sk-..."
                className="w-full px-4 py-3 pr-12 bg-card/60 border border-border/70 rounded-xl text-foreground placeholder:text-foreground/30 focus:outline-none focus:border-border"
              />
              <button
                type="button"
                onClick={() => setShowKeys({ ...showKeys, form: !showKeys['form'] })}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-foreground/40 hover:text-foreground/70"
              >
                {showKeys['form'] ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-6 pt-2">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={form.supportsVision}
              onChange={(e) => setForm({ ...form, supportsVision: e.target.checked })}
              className="w-4 h-4 rounded border-border/70 bg-card/60 text-sky-500 focus:ring-sky-500"
            />
            <span className="text-sm text-foreground/70">支持图片输入</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={form.enabled}
              onChange={(e) => setForm({ ...form, enabled: e.target.checked })}
              className="w-4 h-4 rounded border-border/70 bg-card/60 text-sky-500 focus:ring-sky-500"
            />
            <span className="text-sm text-foreground/70">启用</span>
          </label>
          <button
            type="button"
            onClick={() => setShowAdvanced((prev) => !prev)}
            className="text-sm text-foreground/50 hover:text-foreground/80 transition-colors"
          >
            {showAdvanced ? '收起高级设置' : '高级设置'}
          </button>
        </div>

        {showAdvanced && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
            <div className="space-y-2">
              <label className="text-sm text-foreground/70">最大 Tokens</label>
              <input
                type="number"
                value={form.maxTokens}
                onChange={(e) => setForm({ ...form, maxTokens: parseInt(e.target.value) || 4096 })}
                className="w-full px-4 py-3 bg-card/60 border border-border/70 rounded-xl text-foreground focus:outline-none focus:border-border"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm text-foreground/70">每次消耗积分</label>
              <input
                type="number"
                value={form.costPerMessage}
                onChange={(e) => setForm({ ...form, costPerMessage: parseInt(e.target.value) || 1 })}
                className="w-full px-4 py-3 bg-card/60 border border-border/70 rounded-xl text-foreground focus:outline-none focus:border-border"
              />
            </div>
          </div>
        )}

        <div className="flex items-center gap-3 pt-4">
          <button
            onClick={saveModel}
            disabled={saving}
            className="flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-sky-500 to-emerald-500 text-foreground rounded-xl font-medium hover:opacity-90 disabled:opacity-50"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            {editingId ? '更新' : '添加'}
          </button>
          {editingId && (
            <button
              onClick={resetForm}
              className="px-5 py-2.5 bg-card/70 text-foreground rounded-xl hover:bg-card/80"
            >
              取消
            </button>
          )}
        </div>
      </div>

      {/* Models List */}
      <div className="bg-card/60 border border-border/70 rounded-2xl overflow-hidden">
        <div className="overflow-x-auto no-scrollbar">
          <table className="w-full min-w-[760px]">
          <thead>
            <tr className="border-b border-border/70">
              <th className="text-left text-sm font-medium text-foreground/50 px-5 py-4">名称</th>
              <th className="text-left text-sm font-medium text-foreground/50 px-5 py-4">模型 ID</th>
              <th className="text-left text-sm font-medium text-foreground/50 px-5 py-4">Base URL</th>
              <th className="text-center text-sm font-medium text-foreground/50 px-5 py-4">图片</th>
              <th className="text-center text-sm font-medium text-foreground/50 px-5 py-4">状态</th>
              <th className="text-right text-sm font-medium text-foreground/50 px-5 py-4">操作</th>
            </tr>
          </thead>
          <tbody>
            {models.map((model) => (
              <tr key={model.id} className="border-b border-border/70 hover:bg-card/60">
                <td className="px-5 py-4 text-foreground font-medium">{model.name}</td>
                <td className="px-5 py-4 text-foreground/60 font-mono text-sm">{model.modelId}</td>
                <td className="px-5 py-4 text-foreground/60 text-sm truncate max-w-[200px]">{model.apiUrl}</td>
                <td className="px-5 py-4 text-center">
                  {model.supportsVision ? (
                    <Check className="w-4 h-4 text-green-400 mx-auto" />
                  ) : (
                    <X className="w-4 h-4 text-foreground/30 mx-auto" />
                  )}
                </td>
                <td className="px-5 py-4 text-center">
                  <button
                    onClick={() => toggleEnabled(model)}
                    className={`px-2.5 py-1 text-xs rounded-full ${
                      model.enabled
                        ? 'bg-green-500/20 text-green-400 border border-green-500/30'
                        : 'bg-card/70 text-foreground/40 border border-border/70'
                    }`}
                  >
                    {model.enabled ? '启用' : '禁用'}
                  </button>
                </td>
                <td className="px-5 py-4 text-right">
                  <div className="flex items-center justify-end gap-2">
                    <button
                      onClick={() => startEdit(model)}
                      className="p-2 text-foreground/40 hover:text-foreground hover:bg-card/70 rounded-lg"
                    >
                      <Edit2 className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => deleteModel(model.id)}
                      className="p-2 text-foreground/40 hover:text-red-400 hover:bg-red-500/10 rounded-lg"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
          </table>
        </div>
        {models.length === 0 && (
          <div className="text-center py-12 text-foreground/40">
            <MessageSquare className="w-12 h-12 mx-auto mb-3 opacity-20" />
            <p>暂无聊天模型</p>
          </div>
        )}
      </div>
    </div>
  );
}

