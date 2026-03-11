'use client';

import { useState, useEffect } from 'react';
import { Globe, Loader2, Save, Upload, UserPlus, Coins, Zap, Shield, Languages, Gauge } from 'lucide-react';
import type { ChatModel } from '@/types';
import { toast } from '@/components/ui/toaster';
import { useSiteConfigRefresh } from '@/components/providers/site-config-provider';
import type { SystemConfig } from '@/types';
import { findBlockedWords } from '@/lib/prompt-blocklist-core';

export default function SiteConfigPage() {
  const [config, setConfig] = useState<SystemConfig | null>(null);
  const [chatModels, setChatModels] = useState<ChatModel[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [blocklistTestInput, setBlocklistTestInput] = useState('');
  const refreshSiteConfig = useSiteConfigRefresh();

  useEffect(() => {
    loadConfig();
  }, []);

  const loadConfig = async () => {
    try {
      const [settingsRes, modelsRes] = await Promise.all([
        fetch('/api/admin/settings'),
        fetch('/api/chat/models?all=true'),
      ]);

      if (settingsRes.ok) {
        const data = await settingsRes.json();
        setConfig(data.data);
      }

      if (modelsRes.ok) {
        const modelsData = await modelsRes.json();
        setChatModels(modelsData.data || []);
      }
    } catch (err) {
      console.error('Failed to load config:', err);
    } finally {
      setLoading(false);
    }
  };

  const saveConfig = async () => {
    if (!config) return;
    setSaving(true);

    try {
      const res = await fetch('/api/admin/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          siteConfig: config.siteConfig,
          picuiApiKey: config.picuiApiKey,
          picuiBaseUrl: config.picuiBaseUrl,
          videoProxyEnabled: config.videoProxyEnabled,
          videoProxyBaseUrl: config.videoProxyBaseUrl,
          rateLimit: config.rateLimit,
          promptProcessing: config.promptProcessing,
          registerEnabled: config.registerEnabled,
          defaultBalance: config.defaultBalance,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error);
      }

      // Refresh site config in provider so all pages get updated
      await refreshSiteConfig();
      toast({ title: '配置已保存' });
    } catch (err) {
      toast({ title: '保存失败', description: err instanceof Error ? err.message : '未知错误', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-foreground/30" />
      </div>
    );
  }

  if (!config) {
    return (
      <div className="text-center text-foreground/50 py-12">
        加载配置失败
      </div>
    );
  }

  const updateSiteConfig = (key: keyof typeof config.siteConfig, value: string) => {
    setConfig({
      ...config,
      siteConfig: { ...config.siteConfig, [key]: value }
    });
  };

  const updateRateLimitConfig = (key: keyof typeof config.rateLimit, value: number) => {
    setConfig({
      ...config,
      rateLimit: {
        ...config.rateLimit,
        [key]: Math.max(1, Math.floor(value) || 1),
      },
    });
  };

  const updatePromptProcessing = (
    updates: Partial<SystemConfig['promptProcessing']>
  ) => {
    setConfig({
      ...config,
      promptProcessing: {
        ...config.promptProcessing,
        ...updates,
      },
    });
  };

  const blocklistMatches = config.promptProcessing.blocklistEnabled
    ? findBlockedWords(blocklistTestInput, config.promptProcessing.blocklistWords)
    : [];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extralight text-foreground">网站配置</h1>
          <p className="text-foreground/50 mt-1 font-light text-sm sm:text-base">自定义网站名称、标语、版权等信息</p>
        </div>
        <button
          onClick={saveConfig}
          disabled={saving}
          className="flex items-center gap-2 px-3 sm:px-4 py-2 bg-foreground text-background rounded-lg font-medium hover:bg-foreground/90 transition-colors disabled:opacity-50 text-sm sm:text-base"
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          <span className="hidden sm:inline">保存</span>
        </button>
      </div>

      <div className="bg-card/60 border border-border/70 rounded-xl overflow-hidden">
        <div className="p-4 border-b border-border/70 flex items-center gap-3">
          <div className="w-8 h-8 bg-blue-500/20 rounded-lg flex items-center justify-center">
            <Globe className="w-4 h-4 text-blue-400" />
          </div>
          <h2 className="font-medium text-foreground">基本信息</h2>
        </div>

        <div className="p-4 space-y-4">
          {/* 网站名称 */}
          <div className="space-y-2">
            <label className="text-sm text-foreground/50">网站名称</label>
            <input
              type="text"
              value={config.siteConfig.siteName}
              onChange={(e) => updateSiteConfig('siteName', e.target.value)}
              placeholder="SANHUB"
              className="w-full px-4 py-3 bg-card/60 border border-border/70 rounded-lg text-foreground placeholder:text-foreground/30 focus:outline-none focus:border-border"
            />
            <p className="text-xs text-foreground/30">显示在页面标题、Logo 等位置</p>
          </div>

          {/* 英文标语 */}
          <div className="space-y-2">
            <label className="text-sm text-foreground/50">英文标语</label>
            <input
              type="text"
              value={config.siteConfig.siteTagline}
              onChange={(e) => updateSiteConfig('siteTagline', e.target.value)}
              placeholder="Let Imagination Come Alive"
              className="w-full px-4 py-3 bg-card/60 border border-border/70 rounded-lg text-foreground placeholder:text-foreground/30 focus:outline-none focus:border-border"
            />
            <p className="text-xs text-foreground/30">首页大标题</p>
          </div>

          {/* 中文描述 */}
          <div className="space-y-2">
            <label className="text-sm text-foreground/50">中文描述</label>
            <input
              type="text"
              value={config.siteConfig.siteDescription}
              onChange={(e) => updateSiteConfig('siteDescription', e.target.value)}
              placeholder="「SANHUB」是专为 AI 创作打造的一站式平台"
              className="w-full px-4 py-3 bg-card/60 border border-border/70 rounded-lg text-foreground placeholder:text-foreground/30 focus:outline-none focus:border-border"
            />
          </div>

          {/* 中文副描述 */}
          <div className="space-y-2">
            <label className="text-sm text-foreground/50">中文副描述</label>
            <textarea
              value={config.siteConfig.siteSubDescription}
              onChange={(e) => updateSiteConfig('siteSubDescription', e.target.value)}
              placeholder="我们融合了 Sora 视频生成、Gemini 图像创作与多模型 AI 对话..."
              rows={3}
              className="w-full px-4 py-3 bg-card/60 border border-border/70 rounded-lg text-foreground placeholder:text-foreground/30 focus:outline-none focus:border-border resize-none"
            />
          </div>

          {/* 联系邮箱 */}
          <div className="space-y-2">
            <label className="text-sm text-foreground/50">联系邮箱</label>
            <input
              type="email"
              value={config.siteConfig.contactEmail}
              onChange={(e) => updateSiteConfig('contactEmail', e.target.value)}
              placeholder="support@sanhub.com"
              className="w-full px-4 py-3 bg-card/60 border border-border/70 rounded-lg text-foreground placeholder:text-foreground/30 focus:outline-none focus:border-border"
            />
          </div>

          {/* 版权信息 */}
          <div className="space-y-2">
            <label className="text-sm text-foreground/50">版权信息</label>
            <input
              type="text"
              value={config.siteConfig.copyright}
              onChange={(e) => updateSiteConfig('copyright', e.target.value)}
              placeholder="Copyright © 2025 SANHUB"
              className="w-full px-4 py-3 bg-card/60 border border-border/70 rounded-lg text-foreground placeholder:text-foreground/30 focus:outline-none focus:border-border"
            />
          </div>

          {/* 技术支持信息 */}
          <div className="space-y-2">
            <label className="text-sm text-foreground/50">技术支持信息</label>
            <input
              type="text"
              value={config.siteConfig.poweredBy}
              onChange={(e) => updateSiteConfig('poweredBy', e.target.value)}
              placeholder="Powered by OpenAI Sora & Google Gemini"
              className="w-full px-4 py-3 bg-card/60 border border-border/70 rounded-lg text-foreground placeholder:text-foreground/30 focus:outline-none focus:border-border"
            />
          </div>
        </div>
      </div>

      {/* 图床配置 */}
      <div className="bg-card/60 border border-border/70 rounded-xl overflow-hidden">
        <div className="p-4 border-b border-border/70 flex items-center gap-3">
          <div className="w-8 h-8 bg-green-500/20 rounded-lg flex items-center justify-center">
            <Upload className="w-4 h-4 text-green-400" />
          </div>
          <div>
            <h2 className="font-medium text-foreground">图床配置</h2>
            <p className="text-xs text-foreground/40">用于上传和存储生成的图片</p>
          </div>
        </div>

        <div className="p-4 space-y-4">
          {/* PicUI Base URL */}
          <div className="space-y-2">
            <label className="text-sm text-foreground/50">PicUI 接口地址</label>
            <input
              type="text"
              value={config.picuiBaseUrl}
              onChange={(e) => setConfig({ ...config, picuiBaseUrl: e.target.value })}
              placeholder="https://picui.cn/api/v1"
              className="w-full px-4 py-3 bg-card/60 border border-border/70 rounded-lg text-foreground placeholder:text-foreground/30 focus:outline-none focus:border-border"
            />
            <p className="text-xs text-foreground/30">默认为 https://picui.cn/api/v1</p>
          </div>

          {/* PicUI API Key */}
          <div className="space-y-2">
            <label className="text-sm text-foreground/50">PicUI API Key</label>
            <input
              type="password"
              value={config.picuiApiKey}
              onChange={(e) => setConfig({ ...config, picuiApiKey: e.target.value })}
              placeholder="输入 PicUI API Key"
              className="w-full px-4 py-3 bg-card/60 border border-border/70 rounded-lg text-foreground placeholder:text-foreground/30 focus:outline-none focus:border-border"
            />
            <p className="text-xs text-foreground/30">
              从 <a href="https://picui.cn" target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:underline">picui.cn</a> 获取 API Key
            </p>
          </div>
        </div>
      </div>

      {/* Prompt processing configuration */}
      <div className="bg-card/60 border border-border/70 rounded-xl overflow-hidden">
        <div className="p-4 border-b border-border/70 flex items-center gap-3">
          <div className="w-8 h-8 bg-orange-500/20 rounded-lg flex items-center justify-center">
            <Shield className="w-4 h-4 text-orange-400" />
          </div>
          <div>
            <h2 className="font-medium text-foreground">提示词处理</h2>
            <p className="text-xs text-foreground/40">在视频生成前，对提示词执行净化、翻译和黑名单校验。</p>
          </div>
        </div>

        <div className="p-4 space-y-5">
          <div className="rounded-xl border border-border/70 bg-card/50 p-4">
            <p className="text-sm text-foreground">处理顺序</p>
            <p className="text-xs text-foreground/40 mt-1">
              先按需做提示词净化，再执行翻译，最后根据黑名单规则决定是否直接拦截请求。
            </p>
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <label className="text-sm text-foreground">启用提示词净化</label>
                <p className="text-xs text-foreground/30 mt-1">先用大模型重写提示词，尽量保留创作意图，同时移除高风险表达。</p>
              </div>
              <button
                onClick={() => updatePromptProcessing({ filterEnabled: !config.promptProcessing.filterEnabled })}
                className={`relative w-12 h-6 rounded-full transition-colors ${
                  config.promptProcessing.filterEnabled ? 'bg-orange-500' : 'bg-card/80'
                }`}
              >
                <div
                  className={`absolute top-1 w-4 h-4 rounded-full bg-foreground transition-transform ${
                    config.promptProcessing.filterEnabled ? 'left-7' : 'left-1'
                  }`}
                />
              </button>
            </div>

            <div className="space-y-2">
              <label className="text-sm text-foreground/50">净化模型</label>
              <select
                value={config.promptProcessing.filterModelId}
                onChange={(e) => updatePromptProcessing({ filterModelId: e.target.value })}
                className="w-full px-4 py-3 bg-card/60 border border-border/70 rounded-lg text-foreground focus:outline-none focus:border-border"
              >
                <option value="">请选择用于净化的模型</option>
                {chatModels.map((model) => (
                  <option key={model.id} value={model.id}>
                    {model.name} ({model.modelId})
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-2">
              <label className="text-sm text-foreground/50">净化指令</label>
              <textarea
                value={config.promptProcessing.filterPrompt}
                onChange={(e) => updatePromptProcessing({ filterPrompt: e.target.value })}
                rows={4}
                placeholder="告诉模型应该如何改写提示词，例如保留细节、去掉违规内容、只返回最终提示词。"
                className="w-full px-4 py-3 bg-card/60 border border-border/70 rounded-lg text-foreground placeholder:text-foreground/30 focus:outline-none focus:border-border resize-none"
              />
              <p className="text-xs text-foreground/30">建议要求模型“只返回处理后的提示词正文”，避免输出解释性说明。</p>
            </div>
          </div>

          <div className="h-px bg-border/70" />

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-start gap-2">
                <Languages className="w-4 h-4 text-sky-400 mt-0.5" />
                <div>
                  <label className="text-sm text-foreground">启用提示词翻译</label>
                  <p className="text-xs text-foreground/30 mt-1">将提示词翻译为更自然的英文，并对翻译结果再做一次净化。</p>
                </div>
              </div>
              <button
                onClick={() => updatePromptProcessing({ translateEnabled: !config.promptProcessing.translateEnabled })}
                className={`relative w-12 h-6 rounded-full transition-colors ${
                  config.promptProcessing.translateEnabled ? 'bg-sky-500' : 'bg-card/80'
                }`}
              >
                <div
                  className={`absolute top-1 w-4 h-4 rounded-full bg-foreground transition-transform ${
                    config.promptProcessing.translateEnabled ? 'left-7' : 'left-1'
                  }`}
                />
              </button>
            </div>

            <div className="space-y-2">
              <label className="text-sm text-foreground/50">翻译模型</label>
              <select
                value={config.promptProcessing.translateModelId}
                onChange={(e) => updatePromptProcessing({ translateModelId: e.target.value })}
                className="w-full px-4 py-3 bg-card/60 border border-border/70 rounded-lg text-foreground focus:outline-none focus:border-border"
              >
                <option value="">请选择用于翻译的模型</option>
                {chatModels.map((model) => (
                  <option key={model.id} value={model.id}>
                    {model.name} ({model.modelId})
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-2">
              <label className="text-sm text-foreground/50">翻译指令</label>
              <textarea
                value={config.promptProcessing.translatePrompt}
                onChange={(e) => updatePromptProcessing({ translatePrompt: e.target.value })}
                rows={4}
                placeholder="告诉模型如何翻译，例如保留风格、镜头语言、限制条件，并只返回英文提示词。"
                className="w-full px-4 py-3 bg-card/60 border border-border/70 rounded-lg text-foreground placeholder:text-foreground/30 focus:outline-none focus:border-border resize-none"
              />
              <p className="text-xs text-foreground/30">如果只想做净化、不想改语言，可关闭翻译开关。</p>
            </div>

            <div className="space-y-3 pt-2 border-t border-border/60">
              <div className="flex items-center justify-between">
                <div>
                  <label className="text-sm text-foreground">启用黑名单拦截</label>
                  <p className="text-xs text-foreground/30 mt-1">命中黑名单规则后立即拒绝请求，不再进入生成流程。</p>
                </div>
                <button
                  onClick={() => updatePromptProcessing({ blocklistEnabled: !config.promptProcessing.blocklistEnabled })}
                  className={`relative w-12 h-6 rounded-full transition-colors ${
                    config.promptProcessing.blocklistEnabled ? 'bg-red-500' : 'bg-card/80'
                  }`}
                >
                  <div
                    className={`absolute top-1 w-4 h-4 rounded-full bg-foreground transition-transform ${
                      config.promptProcessing.blocklistEnabled ? 'left-7' : 'left-1'
                    }`}
                  />
                </button>
              </div>

              <div className="space-y-2">
                <label className="text-sm text-foreground/50">黑名单规则（每行一条）</label>
                <textarea
                  value={config.promptProcessing.blocklistWords}
                  onChange={(e) => updatePromptProcessing({ blocklistWords: e.target.value })}
                  rows={6}
                  placeholder={'word:weapon\nsubstr:nude\nregex:/blood\\s+ritual/i'}
                  className="w-full px-4 py-3 bg-card/60 border border-border/70 rounded-lg text-foreground placeholder:text-foreground/30 focus:outline-none focus:border-border resize-none"
                />
                <p className="text-xs text-foreground/30">默认按整词匹配，不区分大小写；每一行就是一条独立规则。</p>
                <p className="text-xs text-foreground/30">可选前缀：`word:` 表示整词，`substr:` 表示包含匹配，`re:` / `regex:` 表示正则。</p>
              </div>

              <div className="space-y-2">
                <label className="text-sm text-foreground/50">黑名单测试器</label>
                <textarea
                  value={blocklistTestInput}
                  onChange={(e) => setBlocklistTestInput(e.target.value)}
                  rows={4}
                  placeholder="输入一段提示词，实时检查是否会命中当前黑名单规则。"
                  className="w-full px-4 py-3 bg-card/60 border border-border/70 rounded-lg text-foreground placeholder:text-foreground/30 focus:outline-none focus:border-border resize-none"
                />
                {config.promptProcessing.blocklistEnabled ? (
                  blocklistMatches.length > 0 ? (
                    <p className="text-xs text-red-400">命中规则：{blocklistMatches.join('，')}</p>
                  ) : (
                    <p className="text-xs text-emerald-400">未命中任何规则</p>
                  )
                ) : (
                  <p className="text-xs text-foreground/30">黑名单拦截当前未启用，测试结果仅供参考。</p>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
      {/* 视频加速配置 */}
      <div className="bg-card/60 border border-border/70 rounded-xl overflow-hidden">
        <div className="p-4 border-b border-border/70 flex items-center gap-3">
          <div className="w-8 h-8 bg-purple-500/20 rounded-lg flex items-center justify-center">
            <Zap className="w-4 h-4 text-purple-400" />
          </div>
          <div>
            <h2 className="font-medium text-foreground">视频加速</h2>
            <p className="text-xs text-foreground/40">配置视频 CDN 加速代理</p>
          </div>
        </div>

        <div className="p-4 space-y-4">
          {/* 开启视频加速 */}
          <div className="flex items-center justify-between">
            <div>
              <label className="text-sm text-foreground">开启视频加速</label>
              <p className="text-xs text-foreground/30 mt-1">开启后将 OpenAI 视频 URL 替换为加速域名</p>
            </div>
            <button
              onClick={() => setConfig({ ...config, videoProxyEnabled: !config.videoProxyEnabled })}
              className={`relative w-12 h-6 rounded-full transition-colors ${
                config.videoProxyEnabled ? 'bg-purple-500' : 'bg-card/80'
              }`}
            >
              <div
                className={`absolute top-1 w-4 h-4 rounded-full bg-foreground transition-transform ${
                  config.videoProxyEnabled ? 'left-7' : 'left-1'
                }`}
              />
            </button>
          </div>

          {/* 加速域名 */}
          <div className="space-y-2">
            <label className="text-sm text-foreground/50">加速域名</label>
            <input
              type="text"
              value={config.videoProxyBaseUrl}
              onChange={(e) => setConfig({ ...config, videoProxyBaseUrl: e.target.value })}
              placeholder="https://your-cdn.example.com/"
              className="w-full px-4 py-3 bg-card/60 border border-border/70 rounded-lg text-foreground placeholder:text-foreground/30 focus:outline-none focus:border-border"
            />
            <p className="text-xs text-foreground/30">将 videos.openai.com 替换为该域名，需配置反向代理</p>
          </div>
        </div>
      </div>

      {/* 生成限流配置 */}
      <div className="bg-card/60 border border-border/70 rounded-xl overflow-hidden">
        <div className="p-4 border-b border-border/70 flex items-center gap-3">
          <div className="w-8 h-8 bg-amber-500/20 rounded-lg flex items-center justify-center">
            <Gauge className="w-4 h-4 text-amber-400" />
          </div>
          <div>
            <h2 className="font-medium text-foreground">生成限流（Too many requests）</h2>
            <p className="text-xs text-foreground/40">按时间窗口限制图片和视频生成请求</p>
          </div>
        </div>

        <div className="p-4 space-y-6">
          <div className="space-y-4">
            <h3 className="text-sm font-medium text-foreground">图片生成</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm text-foreground/50">窗口内最大请求数</label>
                <input
                  type="number"
                  min="1"
                  value={config.rateLimit.imageMaxRequests}
                  onChange={(e) => updateRateLimitConfig('imageMaxRequests', parseInt(e.target.value, 10))}
                  className="w-full px-4 py-3 bg-card/60 border border-border/70 rounded-lg text-foreground focus:outline-none focus:border-border"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm text-foreground/50">时间窗口（秒）</label>
                <input
                  type="number"
                  min="1"
                  value={config.rateLimit.imageWindowSeconds}
                  onChange={(e) => updateRateLimitConfig('imageWindowSeconds', parseInt(e.target.value, 10))}
                  className="w-full px-4 py-3 bg-card/60 border border-border/70 rounded-lg text-foreground focus:outline-none focus:border-border"
                />
              </div>
            </div>
          </div>

          <div className="h-px bg-border/70" />

          <div className="space-y-4">
            <h3 className="text-sm font-medium text-foreground">视频生成</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm text-foreground/50">窗口内最大请求数</label>
                <input
                  type="number"
                  min="1"
                  value={config.rateLimit.videoMaxRequests}
                  onChange={(e) => updateRateLimitConfig('videoMaxRequests', parseInt(e.target.value, 10))}
                  className="w-full px-4 py-3 bg-card/60 border border-border/70 rounded-lg text-foreground focus:outline-none focus:border-border"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm text-foreground/50">时间窗口（秒）</label>
                <input
                  type="number"
                  min="1"
                  value={config.rateLimit.videoWindowSeconds}
                  onChange={(e) => updateRateLimitConfig('videoWindowSeconds', parseInt(e.target.value, 10))}
                  className="w-full px-4 py-3 bg-card/60 border border-border/70 rounded-lg text-foreground focus:outline-none focus:border-border"
                />
              </div>
            </div>
          </div>

          <p className="text-xs text-foreground/30">
            当用户在窗口内超过限制时，接口会返回 Too many requests（HTTP 429）。
          </p>
        </div>
      </div>

      {/* 注册设置 */}
      <div className="bg-card/60 border border-border/70 rounded-xl overflow-hidden">
        <div className="p-4 border-b border-border/70 flex items-center gap-3">
          <div className="w-8 h-8 bg-sky-500/20 rounded-lg flex items-center justify-center">
            <UserPlus className="w-4 h-4 text-sky-400" />
          </div>
          <div>
            <h2 className="font-medium text-foreground">注册设置</h2>
            <p className="text-xs text-foreground/40">控制用户注册和初始积分</p>
          </div>
        </div>

        <div className="p-4 space-y-4">
          {/* 开放注册开关 */}
          <div className="flex items-center justify-between">
            <div>
              <label className="text-sm text-foreground">开放注册</label>
              <p className="text-xs text-foreground/30 mt-1">关闭后新用户将无法注册</p>
            </div>
            <button
              onClick={() => setConfig({ ...config, registerEnabled: !config.registerEnabled })}
              className={`relative w-12 h-6 rounded-full transition-colors ${
                config.registerEnabled ? 'bg-green-500' : 'bg-card/80'
              }`}
            >
              <div
                className={`absolute top-1 w-4 h-4 rounded-full bg-foreground transition-transform ${
                  config.registerEnabled ? 'left-7' : 'left-1'
                }`}
              />
            </button>
          </div>

          {/* 注册送积分 */}
          <div className="space-y-2">
            <label className="text-sm text-foreground/50">注册送积分</label>
            <div className="flex items-center gap-2">
              <Coins className="w-4 h-4 text-yellow-400" />
              <input
                type="number"
                min="0"
                value={config.defaultBalance}
                onChange={(e) => setConfig({ ...config, defaultBalance: Math.max(0, parseInt(e.target.value) || 0) })}
                className="w-32 px-4 py-3 bg-card/60 border border-border/70 rounded-lg text-foreground placeholder:text-foreground/30 focus:outline-none focus:border-border"
              />
              <span className="text-foreground/50 text-sm">积分</span>
            </div>
            <p className="text-xs text-foreground/30">新用户注册时自动获得的积分数量</p>
          </div>
        </div>
      </div>
    </div>
  );
}
