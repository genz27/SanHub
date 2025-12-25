'use client';

import { useState, useEffect } from 'react';
import { Globe, Loader2, Save } from 'lucide-react';
import { toast } from '@/components/ui/toaster';
import type { SystemConfig } from '@/types';

export default function SiteConfigPage() {
  const [config, setConfig] = useState<SystemConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadConfig();
  }, []);

  const loadConfig = async () => {
    try {
      const res = await fetch('/api/admin/settings');
      if (res.ok) {
        const data = await res.json();
        setConfig(data.data);
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
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error);
      }

      toast({ title: '网站配置已保存' });
    } catch (err) {
      toast({ title: '保存失败', description: err instanceof Error ? err.message : '未知错误', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-white/30" />
      </div>
    );
  }

  if (!config) {
    return (
      <div className="text-center text-white/50 py-12">
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

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extralight text-white">网站配置</h1>
          <p className="text-white/50 mt-1 font-light text-sm sm:text-base">自定义网站名称、标语、版权等信息</p>
        </div>
        <button
          onClick={saveConfig}
          disabled={saving}
          className="flex items-center gap-2 px-3 sm:px-4 py-2 bg-white text-black rounded-lg font-medium hover:bg-white/90 transition-colors disabled:opacity-50 text-sm sm:text-base"
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          <span className="hidden sm:inline">保存</span>
        </button>
      </div>

      <div className="bg-white/5 border border-white/10 rounded-xl overflow-hidden">
        <div className="p-4 border-b border-white/10 flex items-center gap-3">
          <div className="w-8 h-8 bg-blue-500/20 rounded-lg flex items-center justify-center">
            <Globe className="w-4 h-4 text-blue-400" />
          </div>
          <h2 className="font-medium text-white">基本信息</h2>
        </div>

        <div className="p-4 space-y-4">
          {/* 网站名称 */}
          <div className="space-y-2">
            <label className="text-sm text-white/50">网站名称</label>
            <input
              type="text"
              value={config.siteConfig.siteName}
              onChange={(e) => updateSiteConfig('siteName', e.target.value)}
              placeholder="SANHUB"
              className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-lg text-white placeholder:text-white/30 focus:outline-none focus:border-white/30"
            />
            <p className="text-xs text-white/30">显示在页面标题、Logo 等位置</p>
          </div>

          {/* 英文标语 */}
          <div className="space-y-2">
            <label className="text-sm text-white/50">英文标语</label>
            <input
              type="text"
              value={config.siteConfig.siteTagline}
              onChange={(e) => updateSiteConfig('siteTagline', e.target.value)}
              placeholder="Let Imagination Come Alive"
              className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-lg text-white placeholder:text-white/30 focus:outline-none focus:border-white/30"
            />
            <p className="text-xs text-white/30">首页大标题</p>
          </div>

          {/* 中文描述 */}
          <div className="space-y-2">
            <label className="text-sm text-white/50">中文描述</label>
            <input
              type="text"
              value={config.siteConfig.siteDescription}
              onChange={(e) => updateSiteConfig('siteDescription', e.target.value)}
              placeholder="「SANHUB」是专为 AI 创作打造的一站式平台"
              className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-lg text-white placeholder:text-white/30 focus:outline-none focus:border-white/30"
            />
          </div>

          {/* 中文副描述 */}
          <div className="space-y-2">
            <label className="text-sm text-white/50">中文副描述</label>
            <textarea
              value={config.siteConfig.siteSubDescription}
              onChange={(e) => updateSiteConfig('siteSubDescription', e.target.value)}
              placeholder="我们融合了 Sora 视频生成、Gemini 图像创作与多模型 AI 对话..."
              rows={3}
              className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-lg text-white placeholder:text-white/30 focus:outline-none focus:border-white/30 resize-none"
            />
          </div>

          {/* 联系邮箱 */}
          <div className="space-y-2">
            <label className="text-sm text-white/50">联系邮箱</label>
            <input
              type="email"
              value={config.siteConfig.contactEmail}
              onChange={(e) => updateSiteConfig('contactEmail', e.target.value)}
              placeholder="support@sanhub.com"
              className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-lg text-white placeholder:text-white/30 focus:outline-none focus:border-white/30"
            />
          </div>

          {/* 版权信息 */}
          <div className="space-y-2">
            <label className="text-sm text-white/50">版权信息</label>
            <input
              type="text"
              value={config.siteConfig.copyright}
              onChange={(e) => updateSiteConfig('copyright', e.target.value)}
              placeholder="Copyright © 2025 SANHUB"
              className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-lg text-white placeholder:text-white/30 focus:outline-none focus:border-white/30"
            />
          </div>

          {/* 技术支持信息 */}
          <div className="space-y-2">
            <label className="text-sm text-white/50">技术支持信息</label>
            <input
              type="text"
              value={config.siteConfig.poweredBy}
              onChange={(e) => updateSiteConfig('poweredBy', e.target.value)}
              placeholder="Powered by OpenAI Sora & Google Gemini"
              className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-lg text-white placeholder:text-white/30 focus:outline-none focus:border-white/30"
            />
          </div>
        </div>
      </div>
    </div>
  );
}
