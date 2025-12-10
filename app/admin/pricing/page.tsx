'use client';

import { useState, useEffect } from 'react';
import { Video, Palette, Zap, Loader2, Save, Coins } from 'lucide-react';
import { toast } from '@/components/ui/toaster';
import type { SystemConfig } from '@/types';

// 将输入组件移到外部，避免每次渲染重新创建
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
    <div className="flex items-center justify-between py-3 border-b border-white/5 last:border-0">
      <span className="text-white/70">{label}</span>
      <div className="flex items-center gap-2">
        <input
          type="number"
          value={value}
          onChange={(e) => onChange(parseInt(e.target.value) || 0)}
          className="w-20 px-3 py-1.5 bg-white/5 border border-white/10 rounded-lg text-white text-right focus:outline-none focus:border-white/30"
        />
        <span className="text-white/40 text-sm w-12">积分</span>
      </div>
    </div>
  );
}

export default function PricingPage() {
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
          <h1 className="text-3xl font-extralight text-white">积分定价</h1>
          <p className="text-white/50 mt-1 font-light">配置各服务消耗的积分数量</p>
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

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Sora */}
        <div className="bg-white/5 border border-white/10 rounded-xl overflow-hidden">
          <div className="p-4 border-b border-white/10 flex items-center gap-3">
            <div className="w-8 h-8 bg-blue-500/20 rounded-lg flex items-center justify-center">
              <Video className="w-4 h-4 text-blue-400" />
            </div>
            <h2 className="font-medium text-white">Sora 视频</h2>
          </div>
          <div className="p-4">
            <PriceInput
              label="10 秒视频"
              value={config.pricing.soraVideo10s}
              onChange={(v) => setConfig({ ...config, pricing: { ...config.pricing, soraVideo10s: v } })}
            />
            <PriceInput
              label="15 秒视频"
              value={config.pricing.soraVideo15s}
              onChange={(v) => setConfig({ ...config, pricing: { ...config.pricing, soraVideo15s: v } })}
            />
          </div>
        </div>

        {/* Gemini */}
        <div className="bg-white/5 border border-white/10 rounded-xl overflow-hidden">
          <div className="p-4 border-b border-white/10 flex items-center gap-3">
            <div className="w-8 h-8 bg-purple-500/20 rounded-lg flex items-center justify-center">
              <Palette className="w-4 h-4 text-purple-400" />
            </div>
            <h2 className="font-medium text-white">Gemini 图像</h2>
          </div>
          <div className="p-4">
            <PriceInput
              label="Nano 极速"
              value={config.pricing.geminiNano}
              onChange={(v) => setConfig({ ...config, pricing: { ...config.pricing, geminiNano: v } })}
            />
            <PriceInput
              label="Pro 4K"
              value={config.pricing.geminiPro}
              onChange={(v) => setConfig({ ...config, pricing: { ...config.pricing, geminiPro: v } })}
            />
          </div>
        </div>

        {/* Z-Image */}
        <div className="bg-white/5 border border-white/10 rounded-xl overflow-hidden">
          <div className="p-4 border-b border-white/10 flex items-center gap-3">
            <div className="w-8 h-8 bg-green-500/20 rounded-lg flex items-center justify-center">
              <Zap className="w-4 h-4 text-green-400" />
            </div>
            <h2 className="font-medium text-white">Z-Image 图像</h2>
          </div>
          <div className="p-4">
            <PriceInput
              label="ModelScope"
              value={config.pricing.zimageImage}
              onChange={(v) => setConfig({ ...config, pricing: { ...config.pricing, zimageImage: v } })}
            />
            <PriceInput
              label="Gitee"
              value={config.pricing.giteeImage}
              onChange={(v) => setConfig({ ...config, pricing: { ...config.pricing, giteeImage: v } })}
            />
          </div>
        </div>

        {/* System */}
        <div className="bg-white/5 border border-white/10 rounded-xl overflow-hidden">
          <div className="p-4 border-b border-white/10 flex items-center gap-3">
            <div className="w-8 h-8 bg-orange-500/20 rounded-lg flex items-center justify-center">
              <Coins className="w-4 h-4 text-orange-400" />
            </div>
            <h2 className="font-medium text-white">系统设置</h2>
          </div>
          <div className="p-4">
            <PriceInput
              label="新用户默认积分"
              value={config.defaultBalance}
              onChange={(v) => setConfig({ ...config, defaultBalance: v })}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
