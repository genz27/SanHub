'use client';

import { useState, useEffect } from 'react';
import { Bot, Plus, Loader2, Save, Trash2, Edit2, ToggleLeft, ToggleRight } from 'lucide-react';
import { toast } from '@/components/ui/toaster';

interface AdminAgent {
  id: string;
  name: string;
  description: string;
  systemPrompt: string;
  modelId: string;
  tools: { name: string; description: string; enabled: boolean }[];
  temperature: number;
  maxTokens: number;
  enabled: boolean;
  createdAt: number;
}

export default function AdminAgentsPage() {
  const [agents, setAgents] = useState<AdminAgent[]>([]);
  const [models, setModels] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [form, setForm] = useState({
    name: '',
    description: '',
    systemPrompt: `你是 SanHub AI 助手，可以帮助用户生成图像、视频，以及处理文本。`,
    modelId: '',
    tools: [
      { name: 'image-generation', description: '图像生成', enabled: true },
      { name: 'video-generation', description: '视频生成', enabled: false },
      { name: 'text-transform', description: '文本转换', enabled: true },
    ],
    temperature: 0.7,
    maxTokens: 4096,
    enabled: true,
  });

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [agentsRes, modelsRes] = await Promise.all([
        fetch('/api/agents'),
        fetch('/api/chat/models?all=true'),
      ]);
      if (agentsRes.ok) {
        const data = await agentsRes.json();
        setAgents(data.data || []);
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

  const resetForm = () => {
    setForm({
      name: '',
      description: '',
      systemPrompt: `你是 SanHub AI 助手，可以帮助用户生成图像、视频，以及处理文本。`,
      modelId: models[0]?.id || '',
      tools: [
        { name: 'image-generation', description: '图像生成', enabled: true },
        { name: 'video-generation', description: '视频生成', enabled: false },
        { name: 'text-transform', description: '文本转换', enabled: true },
      ],
      temperature: 0.7,
      maxTokens: 4096,
      enabled: true,
    });
    setEditingId(null);
  };

  const startEdit = (agent: AdminAgent) => {
    setForm({
      name: agent.name,
      description: agent.description,
      systemPrompt: agent.systemPrompt,
      modelId: agent.modelId,
      tools: agent.tools.map(t => ({ ...t })),
      temperature: agent.temperature,
      maxTokens: agent.maxTokens,
      enabled: agent.enabled,
    });
    setEditingId(agent.id);
  };

  const save = async () => {
    if (!form.name || !form.modelId) {
      toast({ title: '请填写名称和选择模型', variant: 'destructive' });
      return;
    }
    setSaving(true);
    try {
      const res = await fetch('/api/agents', {
        method: editingId ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editingId ? { id: editingId, ...form } : form),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || '保存失败');
      }
      toast({ title: editingId ? 'Agent 已更新' : 'Agent 已创建' });
      resetForm();
      loadData();
    } catch (err) {
      toast({ title: '保存失败', description: err instanceof Error ? err.message : '未知错误', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const deleteAgent = async (id: string) => {
    if (!confirm('确定删除此 Agent？')) return;
    try {
      const res = await fetch(`/api/agents?id=${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('删除失败');
      toast({ title: 'Agent 已删除' });
      loadData();
    } catch {
      toast({ title: '删除失败', variant: 'destructive' });
    }
  };

  const toggleEnabled = async (agent: AdminAgent) => {
    try {
      const res = await fetch('/api/agents', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: agent.id, enabled: !agent.enabled }),
      });
      if (!res.ok) throw new Error('更新失败');
      loadData();
    } catch {
      toast({ title: '更新失败', variant: 'destructive' });
    }
  };

  const filteredAgents = agents.filter(a =>
    !searchQuery.trim() || a.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const toggleTool = (index: number) => {
    setForm(prev => {
      const tools = [...prev.tools];
      tools[index] = { ...tools[index], enabled: !tools[index].enabled };
      return { ...prev, tools };
    });
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
          <h1 className="text-3xl font-light text-foreground">AI Agent 管理</h1>
          <p className="text-foreground/50 mt-1">管理 AI 智能代理</p>
        </div>
        <button
          onClick={resetForm}
          className="flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-blue-500 to-cyan-500 text-foreground rounded-xl font-medium hover:opacity-90"
        >
          <Plus className="w-4 h-4" />
          新建 Agent
        </button>
      </div>

      {/* Form */}
      {(!editingId || form.name || editingId) && (
        <div className="bg-card/60 border border-border/70 rounded-2xl p-6 space-y-4">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 bg-sky-500/20 rounded-xl flex items-center justify-center">
              <Bot className="w-5 h-5 text-sky-400" />
            </div>
            <h2 className="text-lg font-semibold text-foreground">
              {editingId ? '编辑 Agent' : '新建 Agent'}
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-sm text-foreground/70">名称 *</label>
              <input type="text" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="我的 AI 助手" className="w-full px-4 py-3 bg-card/60 border border-border/70 rounded-xl text-foreground placeholder:text-foreground/30 focus:outline-none focus:border-border" />
            </div>
            <div className="space-y-2">
              <label className="text-sm text-foreground/70">使用模型 *</label>
              <select value={form.modelId} onChange={(e) => setForm({ ...form, modelId: e.target.value })} className="w-full px-4 py-3 bg-card/60 border border-border/70 rounded-xl text-foreground focus:outline-none focus:border-border">
                <option value="" className="bg-card/95">请选择模型</option>
                {models.map(m => (
                  <option key={m.id} value={m.id} className="bg-card/95">{m.name}</option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <label className="text-sm text-foreground/70">描述</label>
              <input type="text" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="智能 AI Agent" className="w-full px-4 py-3 bg-card/60 border border-border/70 rounded-xl text-foreground placeholder:text-foreground/30 focus:outline-none focus:border-border" />
            </div>
            <div className="space-y-2">
              <label className="text-sm text-foreground/70">温度 ({form.temperature})</label>
              <input type="range" min="0" max="2" step="0.1" value={form.temperature} onChange={(e) => setForm({ ...form, temperature: parseFloat(e.target.value) })} className="w-full" />
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-sm text-foreground/70">系统提示词</label>
            <textarea value={form.systemPrompt} onChange={(e) => setForm({ ...form, systemPrompt: e.target.value })} rows={4} className="w-full px-4 py-3 bg-card/60 border border-border/70 rounded-xl text-foreground placeholder:text-foreground/30 focus:outline-none focus:border-border" />
          </div>

          <div className="space-y-2">
            <label className="text-sm text-foreground/70">工具</label>
            <div className="flex flex-wrap gap-4">
              {form.tools.map((tool, i) => (
                <label key={tool.name} className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={tool.enabled} onChange={() => toggleTool(i)} className="w-4 h-4 rounded border-border/70 bg-card/60 text-sky-500 focus:ring-sky-500" />
                  <span className="text-sm text-foreground/70">{tool.description}</span>
                </label>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <label className="text-sm text-foreground/70">Max Tokens</label>
              <input type="number" value={form.maxTokens} onChange={(e) => setForm({ ...form, maxTokens: parseInt(e.target.value) || 4096 })} className="w-full px-4 py-3 bg-card/60 border border-border/70 rounded-xl text-foreground focus:outline-none focus:border-border" />
            </div>
            <div className="space-y-2">
              <label className="text-sm text-foreground/70">启用</label>
              <div className="pt-2">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={form.enabled} onChange={(e) => setForm({ ...form, enabled: e.target.checked })} className="w-4 h-4 rounded border-border/70 bg-card/60 text-blue-500 focus:ring-blue-500" />
                  <span className="text-sm text-foreground/70">已启用</span>
                </label>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3 pt-2">
            <button onClick={save} disabled={saving} className="flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-blue-500 to-cyan-500 text-foreground rounded-xl font-medium hover:opacity-90 disabled:opacity-50">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              {editingId ? '更新' : '创建'}
            </button>
            {editingId && (
              <button onClick={resetForm} className="px-5 py-2.5 bg-card/70 text-foreground rounded-xl hover:bg-card/80">取消</button>
            )}
          </div>
        </div>
      )}

      {/* Agent list */}
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-4">
          <h2 className="text-lg font-semibold text-foreground">Agent 列表</h2>
          <div className="relative">
            <input type="text" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="搜索名称..." className="w-64 pl-4 pr-4 py-2 bg-card/60 border border-border/70 rounded-xl text-foreground placeholder:text-foreground/30 text-sm focus:outline-none focus:border-border" />
          </div>
        </div>

        {filteredAgents.length === 0 ? (
          <div className="text-center py-12 text-foreground/40 bg-card/60 border border-border/70 rounded-2xl">
            <Bot className="w-12 h-12 mx-auto mb-3 opacity-20" />
            <p>暂无 Agent</p>
          </div>
        ) : (
          <div className="bg-card/60 border border-border/70 rounded-2xl overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border/70">
                  <th className="text-left text-sm font-medium text-foreground/50 px-5 py-4">名称</th>
                  <th className="text-left text-sm font-medium text-foreground/50 px-5 py-4">模型</th>
                  <th className="text-left text-sm font-medium text-foreground/50 px-5 py-4">工具</th>
                  <th className="text-center text-sm font-medium text-foreground/50 px-5 py-4">状态</th>
                  <th className="text-right text-sm font-medium text-foreground/50 px-5 py-4">操作</th>
                </tr>
              </thead>
              <tbody>
                {filteredAgents.map(agent => (
                  <tr key={agent.id} className="border-b border-border/70 last:border-0 hover:bg-card/60">
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-xl bg-sky-500/20 flex items-center justify-center">
                          <Bot className="w-5 h-5 text-sky-400" />
                        </div>
                        <div>
                          <span className="text-foreground font-medium">{agent.name}</span>
                          {agent.description && <p className="text-xs text-foreground/40">{agent.description}</p>}
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-4 text-foreground/60 text-sm">{models.find(m => m.id === agent.modelId)?.name || agent.modelId}</td>
                    <td className="px-5 py-4">
                      <div className="flex gap-1 flex-wrap">
                        {agent.tools.filter(t => t.enabled).map(t => (
                          <span key={t.name} className="px-2 py-0.5 text-xs rounded-full bg-card/70 text-foreground/60">{t.description}</span>
                        ))}
                      </div>
                    </td>
                    <td className="px-5 py-4 text-center">
                      <button onClick={() => toggleEnabled(agent)} className={`px-2.5 py-1 text-xs rounded-full ${agent.enabled ? 'bg-green-500/20 text-green-400 border border-green-500/30' : 'bg-card/70 text-foreground/40 border border-border/70'}`}>
                        {agent.enabled ? '启用' : '禁用'}
                      </button>
                    </td>
                    <td className="px-5 py-4 text-right">
                      <button onClick={() => startEdit(agent)} className="p-2 text-foreground/40 hover:text-foreground hover:bg-card/70 rounded-lg"><Edit2 className="w-4 h-4" /></button>
                      <button onClick={() => deleteAgent(agent.id)} className="p-2 text-foreground/40 hover:text-red-400 hover:bg-red-500/10 rounded-lg"><Trash2 className="w-4 h-4" /></button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
