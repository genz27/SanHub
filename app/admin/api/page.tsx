'use client';

import { useState, useEffect } from 'react';
import { Video, Palette, Zap, GitBranch, Loader2, Save, Eye, EyeOff, Image } from 'lucide-react';
import { toast } from '@/components/ui/toaster';
import type { SystemConfig } from '@/types';

// 将输入组件移到外部，避免每次渲染重新创建
function ApiKeyInput({ 
  label, 
  value, 
  onChange, 
  keyName,
  placeholder,
  showKey,
  onToggleShow,
}: { 
  label: string; 
  value: string; 
  onChange: (v: string) => void;
  keyName: string;
  placeholder?: string;
  showKey: boolean;
  onToggleShow: () => void;
}) {
  return (
    <div className="space-y-1.5">
      <label className="text-sm text-white/50">{label}</label>
      <div className="relative">
        <input
          type={showKey ? 'text' : 'password'}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="w-full px-3 py-2 pr-10 bg-white/5 border border-white/10 rounded-lg text-white placeholder:text-white/30 focus:outline-none focus:border-white/30"
        />
        <button
          type="button"
          onClick={onToggleShow}
          className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-white/40 hover:text-white/70"
        >
          {showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
        </button>
      </div>
    </div>
  );
}

function UrlInput({ 
  label, 
  value, 
  onChange, 
  placeholder 
}: { 
  label: string; 
  value: string; 
  onChange: (v: string) => void; 
  placeholder?: string;
}) {
  return (
    <div className="space-y-1.5">
      <label className="text-sm text-white/50">{label}</label>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white placeholder:text-white/30 focus:outline-none focus:border-white/30"
      />
    </div>
  );
}

export default function ApiConfigPage() {
  const [config, setConfig] = useState<SystemConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showKeys, setShowKeys] = useState<Record<string, boolean>>({});

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
        body: JSON.stringify(config),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error);
      }

      toast({ title: '配置已保存' });
    } catch (err) {
      toast({ title: '保存失败', description: err instanceof Error ? err.message : '未知错误', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const toggleShowKey = (key: string) => {
    setShowKeys(prev => ({ ...prev, [key]: !prev[key] }));
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

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-extralight text-white">API 配置</h1>
          <p className="text-white/50 mt-1 font-light">管理各服务的 API 密钥和接口地址</p>
        </div>
        <button
          onClick={saveConfig}
          disabled={saving}
          className="flex items-center gap-2 px-4 py-2 bg-white text-black rounded-lg font-medium hover:bg-white/90 transition-colors disabled:opacity-50"
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          保存
        </button>
      </div>

      {/* 系统设置 */}
      <div className="bg-white/5 border border-white/10 rounded-xl p-6 space-y-4">
        <h2 className="text-lg font-medium text-white">系统设置</h2>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label className="text-sm text-white/50">注册开关</label>
            <div className="flex items-center gap-3">
              <button
                onClick={() => setConfig({ ...config, registerEnabled: !config.registerEnabled })}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                  config.registerEnabled ? 'bg-green-500' : 'bg-white/20'
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                    config.registerEnabled ? 'translate-x-6' : 'translate-x-1'
                  }`}
                />
              </button>
              <span className="text-sm text-white/70">
                {config.registerEnabled ? '开放注册' : '禁止注册'}
              </span>
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-sm text-white/50">新用户默认积分</label>
            <input
              type="number"
              value={config.defaultBalance}
              onChange={(e) => setConfig({ ...config, defaultBalance: parseInt(e.target.value) || 0 })}
              className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white placeholder:text-white/30 focus:outline-none focus:border-white/30"
              min="0"
            />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Sora */}
        <div className="bg-white/5 border border-white/10 rounded-xl overflow-hidden">
          <div className="p-4 border-b border-white/10 flex items-center gap-3">
            <div className="w-8 h-8 bg-blue-500/20 rounded-lg flex items-center justify-center">
              <Video className="w-4 h-4 text-blue-400" />
            </div>
            <h2 className="font-medium text-white">Sora</h2>
          </div>
          <div className="p-4 space-y-4">
            <ApiKeyInput
              label="API Key"
              value={config.soraApiKey}
              onChange={(v) => setConfig({ ...config, soraApiKey: v })}
              keyName="sora"
              showKey={showKeys['sora'] || false}
              onToggleShow={() => toggleShowKey('sora')}
            />
            <UrlInput
              label="Base URL"
              value={config.soraBaseUrl}
              onChange={(v) => setConfig({ ...config, soraBaseUrl: v })}
              placeholder="http://localhost:8000"
            />
            <div className="pt-3 border-t border-white/10">
              <a
                href="/admin/tokens"
                className="text-sm text-blue-400 hover:text-blue-300 transition-colors"
              >
                后台管理 & Token 导入 →
              </a>
            </div>
          </div>
        </div>

        {/* Gemini */}
        <div className="bg-white/5 border border-white/10 rounded-xl overflow-hidden">
          <div className="p-4 border-b border-white/10 flex items-center gap-3">
            <div className="w-8 h-8 bg-purple-500/20 rounded-lg flex items-center justify-center">
              <Palette className="w-4 h-4 text-purple-400" />
            </div>
            <h2 className="font-medium text-white">Gemini</h2>
          </div>
          <div className="p-4 space-y-4">
            <ApiKeyInput
              label="API Key"
              value={config.geminiApiKey}
              onChange={(v) => setConfig({ ...config, geminiApiKey: v })}
              keyName="gemini"
              showKey={showKeys['gemini'] || false}
              onToggleShow={() => toggleShowKey('gemini')}
            />
            <UrlInput
              label="Base URL"
              value={config.geminiBaseUrl}
              onChange={(v) => setConfig({ ...config, geminiBaseUrl: v })}
              placeholder="https://generativelanguage.googleapis.com"
            />
          </div>
        </div>

        {/* Z-Image (ModelScope) */}
        <div className="bg-white/5 border border-white/10 rounded-xl overflow-hidden">
          <div className="p-4 border-b border-white/10 flex items-center gap-3">
            <div className="w-8 h-8 bg-green-500/20 rounded-lg flex items-center justify-center">
              <Zap className="w-4 h-4 text-green-400" />
            </div>
            <h2 className="font-medium text-white">Z-Image (ModelScope)</h2>
          </div>
          <div className="p-4 space-y-4">
            <ApiKeyInput
              label="API Key"
              value={config.zimageApiKey}
              onChange={(v) => setConfig({ ...config, zimageApiKey: v })}
              keyName="zimage"
              placeholder="ms-xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
              showKey={showKeys['zimage'] || false}
              onToggleShow={() => toggleShowKey('zimage')}
            />
            <UrlInput
              label="Base URL"
              value={config.zimageBaseUrl}
              onChange={(v) => setConfig({ ...config, zimageBaseUrl: v })}
              placeholder="https://api-inference.modelscope.cn/"
            />
          </div>
        </div>

        {/* Gitee */}
        <div className="bg-white/5 border border-white/10 rounded-xl overflow-hidden">
          <div className="p-4 border-b border-white/10 flex items-center gap-3">
            <div className="w-8 h-8 bg-orange-500/20 rounded-lg flex items-center justify-center">
              <GitBranch className="w-4 h-4 text-orange-400" />
            </div>
            <div>
              <h2 className="font-medium text-white">Gitee AI</h2>
              <p className="text-xs text-white/40">支持多 Key 轮询</p>
            </div>
          </div>
          <div className="p-4 space-y-4">
            <div className="space-y-1.5">
              <label className="text-sm text-white/50">API Keys（多个用逗号分隔）</label>
              <textarea
                value={config.giteeApiKey}
                onChange={(e) => setConfig({ ...config, giteeApiKey: e.target.value })}
                placeholder="key1,key2,key3"
                className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white placeholder:text-white/30 focus:outline-none focus:border-white/30 resize-none h-20"
              />
              <p className="text-xs text-white/30">多个 Key 将自动轮询使用</p>
            </div>
            <UrlInput
              label="Base URL"
              value={config.giteeBaseUrl}
              onChange={(v) => setConfig({ ...config, giteeBaseUrl: v })}
              placeholder="https://ai.gitee.com/"
            />
          </div>
        </div>

        {/* PicUI 图床 */}
        <div className="bg-white/5 border border-white/10 rounded-xl overflow-hidden">
          <div className="p-4 border-b border-white/10 flex items-center gap-3">
            <div className="w-8 h-8 bg-pink-500/20 rounded-lg flex items-center justify-center">
              <Image className="w-4 h-4 text-pink-400" />
            </div>
            <div>
              <h2 className="font-medium text-white">PicUI 图床</h2>
              <p className="text-xs text-white/40">生成图片和角色卡头像存储</p>
            </div>
          </div>
          <div className="p-4 space-y-4">
            <ApiKeyInput
              label="API Token"
              value={config.picuiApiKey}
              onChange={(v) => setConfig({ ...config, picuiApiKey: v })}
              keyName="picui"
              placeholder="1|1bJbwlqBfnggmOMEZqXT5XusaIwqiZjCDs7r1Ob5"
              showKey={showKeys['picui'] || false}
              onToggleShow={() => toggleShowKey('picui')}
            />
            <UrlInput
              label="Base URL"
              value={config.picuiBaseUrl}
              onChange={(v) => setConfig({ ...config, picuiBaseUrl: v })}
              placeholder="https://picui.cn/api/v1"
            />
            <p className="text-xs text-white/30">
              未配置时将使用本地文件存储。从 picui.cn 个人中心获取 Token。
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
