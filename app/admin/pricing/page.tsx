'use client';

import { useState, useEffect } from 'react';
import { Video, Palette, Zap, Loader2, Save, Coins, AlertCircle } from 'lucide-react';
import { toast } from '@/components/ui/toaster';
import type { SystemConfig } from '@/types';

function PriceInput({ 
  label, 
  value, 
  onChange 
}: { 
  label: string; 
  value: number; 
  onChange: (v: number) => void;
}) {
  return (
    <div className="flex items-center justify-between py-4 border-b border-white/5 last:border-0">
      <span className="text-white/70">{label}</span>
      <div className="flex items-center gap-3">
        <input
          type="number"
          value={value}
          onChange={(e) => onChange(parseInt(e.target.value) || 0)}
          className="w-24 px-4 py-2 bg-white/5 border border-white/10 rounded-xl text-white text-right focus:outline-none focus:border-white/20 focus:ring-1 focus:ring-white/10 transition-all"
        />
        <span className="text-white/40 text-sm w-10">积分</span>
      </div>
    </div>
  );
}

export default function PricingPage() {
  const [config, setConfig] = useState<SystemConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);

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

  const handleChange = (key: string, value: number) => {
    if (!config) return;
    if (key === 'defaultBalance') {
      setConfig({ ...config, defaultBalance: value });
    } else {
      setConfig({ ...config, pricing: { ...config.pricing, [key]: value } });
    }
    setHasChanges(true);
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

      toast({ title: '✓ 配置已保存' });
      setHasChanges(false);
    } catch (err) {
      toast({ title: '保存失败', description: err instanceof Error ? err.message : '未知错误', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="w-8 h-8 animate-spin text-white/30" />
          <p className="text-sm text-white/40">加载配置中...</p>
        </div>
      </div>
    );
  }

  if (!config) {
    return (
      <div className="text-center text-white/50 py-12">
        <AlertCircle className="w-12 h-12 mx-auto mb-3 text-white/20" />
        <p>加载配置失败</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-light text-white">积分定价</h1>
          <p className="text-white/50 mt-1">配置各服务消耗的积分数量</p>
        </div>
        <button
          onClick={saveConfig}
          disabled={saving || !hasChanges}
          className={`flex items-center gap-2 px-5 py-2.5 rounded-xl font-medium transition-all duration-200 ${
            hasChanges 
              ? 'bg-gradient-to-r from-violet-500 to-fuchsia-500 text-white hover:opacity-90 shadow-lg shadow-violet-500/25' 
              : 'bg-white/10 text-white/50 cursor-not-allowed'
          }`}
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          {hasChanges ? '保存更改' : '已保存'}
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Sora */}
        <div className="bg-white/[0.03] backdrop-blur-sm border border-white/10 rounded-2xl overflow-hidden hover:border-white/20 transition-all">
          <div className="p-5 border-b border-white/10 flex items-center gap-4">
            <div className="w-12 h-12 bg-blue-500/20 rounded-xl flex items-center justify-center">
              <Video className="w-6 h-6 text-blue-400" />
            </div>
            <div>
              <h2 className="font-semibold text-white text-lg">Sora 视频</h2>
              <p className="text-sm text-white/40">视频生成服务</p>
            </div>
          </div>
          <div className="p-5">
            <PriceInput
              label="10 秒视频"
              value={config.pricing.soraVideo10s}
              onChange={(v) => handleChange('soraVideo10s', v)}
            />
            <PriceInput
              label="15 秒视频"
              value={config.pricing.soraVideo15s}
              onChange={(v) => handleChange('soraVideo15s', v)}
            />
          </div>
        </div>

        {/* Gemini */}
        <div className="bg-white/[0.03] backdrop-blur-sm border border-white/10 rounded-2xl overflow-hidden hover:border-white/20 transition-all">
          <div className="p-5 border-b border-white/10 flex items-center gap-4">
            <div className="w-12 h-12 bg-purple-500/20 rounded-xl flex items-center justify-center">
              <Palette className="w-6 h-6 text-purple-400" />
            </div>
            <div>
              <h2 className="font-semibold text-white text-lg">Gemini 图像</h2>
              <p className="text-sm text-white/40">Google AI 图像生成</p>
            </div>
          </div>
          <div className="p-5">
            <PriceInput
              label="Nano 极速"
              value={config.pricing.geminiNano}
              onChange={(v) => handleChange('geminiNano', v)}
            />
            <PriceInput
              label="Pro 4K"
              value={config.pricing.geminiPro}
              onChange={(v) => handleChange('geminiPro', v)}
            />
          </div>
        </div>

        {/* Z-Image */}
        <div className="bg-white/[0.03] backdrop-blur-sm border border-white/10 rounded-2xl overflow-hidden hover:border-white/20 transition-all">
          <div className="p-5 border-b border-white/10 flex items-center gap-4">
            <div className="w-12 h-12 bg-green-500/20 rounded-xl flex items-center justify-center">
              <Zap className="w-6 h-6 text-green-400" />
            </div>
            <div>
              <h2 className="font-semibold text-white text-lg">Z-Image 图像</h2>
              <p className="text-sm text-white/40">ModelScope / Gitee</p>
            </div>
          </div>
          <div className="p-5">
            <PriceInput
              label="ModelScope"
              value={config.pricing.zimageImage}
              onChange={(v) => handleChange('zimageImage', v)}
            />
            <PriceInput
              label="Gitee"
              value={config.pricing.giteeImage}
              onChange={(v) => handleChange('giteeImage', v)}
            />
          </div>
        </div>

        {/* System */}
        <div className="bg-white/[0.03] backdrop-blur-sm border border-white/10 rounded-2xl overflow-hidden hover:border-white/20 transition-all">
          <div className="p-5 border-b border-white/10 flex items-center gap-4">
            <div className="w-12 h-12 bg-orange-500/20 rounded-xl flex items-center justify-center">
              <Coins className="w-6 h-6 text-orange-400" />
            </div>
            <div>
              <h2 className="font-semibold text-white text-lg">系统设置</h2>
              <p className="text-sm text-white/40">新用户初始配置</p>
            </div>
          </div>
          <div className="p-5">
            <PriceInput
              label="新用户默认积分"
              value={config.defaultBalance}
              onChange={(v) => handleChange('defaultBalance', v)}
            />
          </div>
        </div>
      </div>

      {/* 底部提示 */}
      <div className="flex items-center gap-2 p-4 rounded-xl bg-white/5 border border-white/10">
        <AlertCircle className="w-4 h-4 text-white/40 flex-shrink-0" />
        <p className="text-xs text-white/40">
          积分定价修改后立即生效，已进行中的任务不受影响。
        </p>
      </div>
    </div>
  );
}
