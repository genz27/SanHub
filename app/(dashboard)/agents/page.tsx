'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  Bot,
  Loader2,
  Plus,
  X,
  Check,
  SlidersHorizontal,
  Sparkles,
  Wifi,
  WifiOff,
} from 'lucide-react';
import { toast } from '@/components/ui/toaster';
import { formatDate } from '@/lib/utils';
import { Modal } from '@/components/ui/modal';

/* ---------- types ---------- */

interface Agent {
  id: string;
  name: string;
  description: string;
  model: string;
  systemPrompt: string;
  tools: string[];
  temperature: number;
  maxTokens: number;
  maxRoundtrips: number;
  status: 'active' | 'inactive';
  createdAt: number;
  updatedAt: number;
}

interface ModelOption {
  id: string;
  name: string;
}

/* ---------- constants ---------- */

const TOOL_OPTIONS = [
  { id: 'image-generation', label: '图片生成', icon: '🎨' },
  { id: 'video-generation', label: '视频生成', icon: '🎬' },
  { id: 'text-transform', label: '文本转换', icon: '📝' },
] as const;

const INITIAL_FORM = {
  name: '',
  description: '',
  model: '',
  systemPrompt: '',
  tools: [] as string[],
  temperature: 0.7,
  maxTokens: 2048,
  maxRoundtrips: 3,
};

/* ---------- component ---------- */

export default function AgentListPage() {
  const router = useRouter();

  /* list state */
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);

  /* create-modal state */
  const [creating, setCreating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(INITIAL_FORM);

  /* models (fetched once) */
  const [models, setModels] = useState<ModelOption[]>([]);
  const [modelsLoading, setModelsLoading] = useState(false);
  const [modelsError, setModelsError] = useState(false);

  /* ---------- fetch agents ---------- */

  const fetchAgents = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/agents');
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '获取 Agent 列表失败');
      setAgents(data.data || []);
    } catch (err) {
      toast({
        title: '加载失败',
        description: err instanceof Error ? err.message : '获取 Agent 列表失败',
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAgents();
  }, [fetchAgents]);

  /* ---------- fetch models (lazy, on modal open) ---------- */

  const fetchModels = useCallback(async () => {
    setModelsLoading(true);
    setModelsError(false);
    try {
      const res = await fetch('/api/chat/models');
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '获取模型列表失败');
      const list: ModelOption[] = (data.data || data.models || []).map(
        (m: { id?: string; model?: string; name?: string }) => ({
          id: m.id || m.model || '',
          name: m.name || m.id || m.model || '',
        })
      );
      setModels(list.filter((m) => m.id));
      if (list.length > 0) {
        setForm((prev) => ({ ...prev, model: list[0].id }));
      }
    } catch {
      setModelsError(true);
    } finally {
      setModelsLoading(false);
    }
  }, []);

  /* ---------- create agent ---------- */

  const handleCreate = async () => {
    if (!form.name.trim()) {
      toast({ title: '请输入 Agent 名称' });
      return;
    }
    if (!form.model) {
      toast({ title: '请选择模型' });
      return;
    }

    setSaving(true);
    try {
      const res = await fetch('/api/agents/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: form.name.trim(),
          description: form.description.trim(),
          model: form.model,
          systemPrompt: form.systemPrompt,
          tools: form.tools,
          temperature: form.temperature,
          maxTokens: form.maxTokens,
          maxRoundtrips: form.maxRoundtrips,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '创建失败');

      toast({ title: 'Agent 创建成功' });
      setCreating(false);
      setForm(INITIAL_FORM);
      fetchAgents();
    } catch (err) {
      toast({
        title: '创建失败',
        description: err instanceof Error ? err.message : '创建 Agent 失败',
      });
    } finally {
      setSaving(false);
    }
  };

  /* ---------- open / close modal ---------- */

  const openCreateModal = () => {
    setForm(INITIAL_FORM);
    setCreating(true);
    fetchModels();
  };

  const closeCreateModal = () => {
    if (saving) return;
    setCreating(false);
    setForm(INITIAL_FORM);
  };

  /* ---------- helpers ---------- */

  const updateForm = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const toggleTool = (toolId: string) => {
    setForm((prev) => ({
      ...prev,
      tools: prev.tools.includes(toolId)
        ? prev.tools.filter((t) => t !== toolId)
        : [...prev.tools, toolId],
    }));
  };

  const modelLabel = (modelId: string) => {
    const found = models.find((m) => m.id === modelId);
    return found?.name || modelId;
  };

  const toolLabel = (toolId: string) => {
    const opt = TOOL_OPTIONS.find((t) => t.id === toolId);
    return opt?.label || toolId;
  };

  /* ---------- render ---------- */

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* ---- header ---- */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-extralight text-foreground">Agent</h1>
          <p className="text-foreground/50 mt-1 font-light">
            管理和配置您的 AI Agent，自定义行为和能力
          </p>
        </div>
        <button
          onClick={openCreateModal}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-foreground text-background font-medium hover:bg-foreground/90 transition"
        >
          <Plus className="w-4 h-4" />
          新建 Agent
        </button>
      </div>

      {/* ---- loading ---- */}
      {loading ? (
        <div className="flex items-center justify-center py-12 text-foreground/50">
          <Loader2 className="w-5 h-5 animate-spin mr-2" />
          正在加载...
        </div>
      ) : agents.length === 0 ? (
        /* ---- empty ---- */
        <div className="text-center py-16 bg-card/60 border border-border/70 rounded-2xl">
          <Bot className="w-12 h-12 mx-auto text-foreground/20 mb-3" />
          <p className="text-foreground/70">暂无可用的 Agent</p>
          <p className="text-foreground/30 text-sm mt-1">点击“新建 Agent”创建您的第一个 AI Agent</p>
        </div>
      ) : (
        /* ---- grid ---- */
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {agents.map((agent) => (
            <button
              key={agent.id}
              onClick={() => router.push(`/agents/${agent.id}`)}
              className="text-left bg-card/60 border border-border/70 rounded-2xl p-5 hover:border-border/70 hover:bg-card/80 transition text-foreground group"
            >
              {/* icon & status */}
              <div className="flex items-start justify-between mb-3">
                <div className="w-10 h-10 bg-blue-500/15 rounded-xl flex items-center justify-center border border-blue-500/30 shrink-0">
                  <Bot className="w-5 h-5 text-blue-400" />
                </div>
                <span
                  className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border ${
                    agent.status === 'active'
                      ? 'bg-emerald-500/10 border-emerald-500/25 text-emerald-400'
                      : 'bg-foreground/5 border-foreground/10 text-foreground/40'
                  }`}
                >
                  {agent.status === 'active' ? (
                    <>
                      <Wifi className="w-3 h-3" /> 启用
                    </>
                  ) : (
                    <>
                      <WifiOff className="w-3 h-3" /> 停用
                    </>
                  )}
                </span>
              </div>

              {/* name */}
              <h3 className="text-lg font-medium text-foreground group-hover:text-blue-400 transition-colors">
                {agent.name || '未命名 Agent'}
              </h3>

              {/* description */}
              {agent.description && (
                <p className="text-sm text-foreground/50 mt-1 line-clamp-2">{agent.description}</p>
              )}

              {/* model */}
              <p className="text-xs text-foreground/40 mt-2 font-mono">{agent.model}</p>

              {/* tool badges */}
              {agent.tools && agent.tools.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-3">
                  {agent.tools.map((tool) => (
                    <span
                      key={tool}
                      className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-card/70 border border-border/60 text-foreground/60"
                    >
                      {toolLabel(tool)}
                    </span>
                  ))}
                </div>
              )}

              {/* params hint & date */}
              <div className="flex items-center justify-between mt-4 pt-3 border-t border-border/50">
                <div className="flex items-center gap-2 text-[11px] text-foreground/40">
                  <SlidersHorizontal className="w-3 h-3" />
                  <span>t={agent.temperature}</span>
                  <span className="text-foreground/20">|</span>
                  <span>tk={agent.maxTokens}</span>
                </div>
                <span className="text-[11px] text-foreground/40">
                  {formatDate(agent.createdAt)}
                </span>
              </div>
            </button>
          ))}
        </div>
      )}

      {/* ============ Create Modal ============ */}
      <Modal open={creating} onClose={closeCreateModal} title="新建 Agent" size="xl">
        <div className="space-y-6">
          {/* name */}
          <div className="space-y-2">
            <label className="text-sm text-foreground/50 uppercase tracking-wider">名称</label>
            <input
              value={form.name}
              onChange={(e) => updateForm('name', e.target.value)}
              placeholder="输入 Agent 名称"
              className="w-full px-4 py-3 bg-input/70 border border-border/70 rounded-xl text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:border-border focus:ring-2 focus:ring-ring/30 transition-colors"
            />
          </div>

          {/* description */}
          <div className="space-y-2">
            <label className="text-sm text-foreground/50 uppercase tracking-wider">描述</label>
            <textarea
              value={form.description}
              onChange={(e) => updateForm('description', e.target.value)}
              placeholder="简要描述 Agent 的用途"
              rows={2}
              className="w-full px-4 py-3 bg-input/70 border border-border/70 rounded-xl text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:border-border focus:ring-2 focus:ring-ring/30 transition-colors resize-none"
            />
          </div>

          {/* model selector */}
          <div className="space-y-2">
            <label className="text-sm text-foreground/50 uppercase tracking-wider">
              模型
              {modelsLoading && <Loader2 className="w-3 h-3 animate-spin inline ml-1" />}
            </label>
            {modelsError ? (
              <p className="text-xs text-red-400">无法加载模型列表，请稍后重试</p>
            ) : (
              <select
                value={form.model}
                onChange={(e) => updateForm('model', e.target.value)}
                className="w-full px-4 py-3 bg-input/70 border border-border/70 rounded-xl text-foreground focus:outline-none focus:border-border focus:ring-2 focus:ring-ring/30 transition-colors"
              >
                {models.length === 0 ? (
                  <option value="">{modelsLoading ? '加载中...' : '暂无可选模型'}</option>
                ) : (
                  models.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                    </option>
                  ))
                )}
              </select>
            )}
          </div>

          {/* system prompt */}
          <div className="space-y-2">
            <label className="text-sm text-foreground/50 uppercase tracking-wider">系统提示词</label>
            <textarea
              value={form.systemPrompt}
              onChange={(e) => updateForm('systemPrompt', e.target.value)}
              placeholder="设置 Agent 的系统提示词，定义其行为、角色和约束..."
              rows={6}
              className="w-full px-4 py-3 bg-input/70 border border-border/70 rounded-xl text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:border-border focus:ring-2 focus:ring-ring/30 transition-colors resize-y font-mono text-sm"
            />
          </div>

          {/* tools toggles */}
          <div className="space-y-2">
            <label className="text-sm text-foreground/50 uppercase tracking-wider">工具</label>
            <div className="flex flex-wrap gap-2">
              {TOOL_OPTIONS.map((tool) => {
                const active = form.tools.includes(tool.id);
                return (
                  <button
                    key={tool.id}
                    type="button"
                    onClick={() => toggleTool(tool.id)}
                    className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl border text-sm font-medium transition-colors ${
                      active
                        ? 'bg-blue-500/15 border-blue-500/30 text-blue-400'
                        : 'bg-card/70 border-border/70 text-foreground/60 hover:text-foreground hover:border-border'
                    }`}
                  >
                    {active ? <Check className="w-4 h-4" /> : <Sparkles className="w-4 h-4" />}
                    {tool.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* params row */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="space-y-2">
              <label className="text-sm text-foreground/50 uppercase tracking-wider">
                Temperature
              </label>
              <div className="flex items-center gap-3">
                <input
                  type="range"
                  min="0"
                  max="2"
                  step="0.1"
                  value={form.temperature}
                  onChange={(e) => updateForm('temperature', parseFloat(e.target.value))}
                  className="flex-1 accent-foreground"
                />
                <span className="text-sm text-foreground/70 tabular-nums w-8 text-right">
                  {form.temperature.toFixed(1)}
                </span>
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm text-foreground/50 uppercase tracking-wider">
                Max Tokens
              </label>
              <input
                type="number"
                min="1"
                max="32768"
                step="1"
                value={form.maxTokens}
                onChange={(e) =>
                  updateForm('maxTokens', Math.max(1, parseInt(e.target.value) || 1))
                }
                className="w-full px-4 py-3 bg-input/70 border border-border/70 rounded-xl text-foreground focus:outline-none focus:border-border focus:ring-2 focus:ring-ring/30 transition-colors"
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm text-foreground/50 uppercase tracking-wider">
                Max Roundtrips
              </label>
              <input
                type="number"
                min="1"
                max="50"
                step="1"
                value={form.maxRoundtrips}
                onChange={(e) =>
                  updateForm('maxRoundtrips', Math.max(1, parseInt(e.target.value) || 1))
                }
                className="w-full px-4 py-3 bg-input/70 border border-border/70 rounded-xl text-foreground focus:outline-none focus:border-border focus:ring-2 focus:ring-ring/30 transition-colors"
              />
            </div>
          </div>

          {/* actions */}
          <div className="flex items-center justify-end gap-3 pt-2 border-t border-border/70">
            <button
              type="button"
              onClick={closeCreateModal}
              disabled={saving}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-card/70 border border-border/70 text-foreground/70 hover:text-foreground hover:border-border transition-colors disabled:opacity-50"
            >
              <X className="w-4 h-4" />
              取消
            </button>
            <button
              type="button"
              onClick={handleCreate}
              disabled={saving}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-foreground text-background font-medium hover:bg-foreground/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {saving ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  保存中...
                </>
              ) : (
                <>
                  <Check className="w-4 h-4" />
                  保存
                </>
              )}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
