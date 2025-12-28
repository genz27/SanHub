'use client';

import { useState, useEffect } from 'react';
import { Coins, Loader2, Save, Image, Video, MessageSquare } from 'lucide-react';
import { toast } from '@/components/ui/toaster';
import type { SystemConfig } from '@/types';

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
        body: JSON.stringify({ pricing: config.pricing }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error);
      }

      toast({ title: '定价配置已保存' });
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

  const updatePricing = (key: keyof typeof config.pricing, value: number) => {
    setConfig({
      ...config,
      pricing: { ...config.pricing, [key]: Math.max(0, value) }
    });
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extralight text-white">积分定价</h1>
          <p className="text-white/50 mt-1 font-light text-sm sm:text-base">配置各项服务消耗的积分数量</p>
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

      {/* 视频生成定价 */}
      <div className="bg-white/5 border border-white/10 rounded-xl overflow-hidden">
        <div className="p-4 border-b border-white/10 flex items-center gap-3">
          <div className="w-8 h-8 bg-violet-500/20 rounded-lg flex items-center justify-center">
            <Video className="w-4 h-4 text-violet-400" />
          </div>
          <h2 className="font-medium text-white">视频生成</h2>
        </div>

        <div className="p-4 grid grid-cols-1 sm:grid-cols-3 gap-4">
          <PricingInput
            label="Sora 10秒视频"
            value={config.pricing.soraVideo10s}
            onChange={(v) => updatePricing('soraVideo10s', v)}
          />
          <PricingInput
            label="Sora 15秒视频"
            value={config.pricing.soraVideo15s}
            onChange={(v) => updatePricing('soraVideo15s', v)}
          />
          <PricingInput
            label="Sora 25秒视频"
            value={config.pricing.soraVideo25s}
            onChange={(v) => updatePricing('soraVideo25s', v)}
          />
        </div>
      </div>

      {/* 图像生成定价 */}
      <div className="bg-white/5 border border-white/10 rounded-xl overflow-hidden">
        <div className="p-4 border-b border-white/10 flex items-center gap-3">
          <div className="w-8 h-8 bg-blue-500/20 rounded-lg flex items-center justify-center">
            <Image className="w-4 h-4 text-blue-400" />
          </div>
          <h2 className="font-medium text-white">图像生成</h2>
        </div>

        <div className="p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <PricingInput
            label="Sora 图像"
            value={config.pricing.soraImage}
            onChange={(v) => updatePricing('soraImage', v)}
          />
          <PricingInput
            label="Gemini Nano"
            value={config.pricing.geminiNano}
            onChange={(v) => updatePricing('geminiNano', v)}
          />
          <PricingInput
            label="Gemini Pro"
            value={config.pricing.geminiPro}
            onChange={(v) => updatePricing('geminiPro', v)}
          />
          <PricingInput
            label="Z-Image"
            value={config.pricing.zimageImage}
            onChange={(v) => updatePricing('zimageImage', v)}
          />
          <PricingInput
            label="Gitee 图像"
            value={config.pricing.giteeImage}
            onChange={(v) => updatePricing('giteeImage', v)}
          />
        </div>
      </div>

      {/* 聊天定价 */}
      <div className="bg-white/5 border border-white/10 rounded-xl overflow-hidden">
        <div className="p-4 border-b border-white/10 flex items-center gap-3">
          <div className="w-8 h-8 bg-green-500/20 rounded-lg flex items-center justify-center">
            <MessageSquare className="w-4 h-4 text-green-400" />
          </div>
          <h2 className="font-medium text-white">AI 聊天</h2>
        </div>

        <div className="p-4">
          <p className="text-xs text-white/40 mb-4">聊天模型的定价在「聊天模型」页面单独配置</p>
        </div>
      </div>
    </div>
  );
}

function PricingInput({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <div className="space-y-2">
      <label className="text-sm text-white/50">{label}</label>
      <div className="flex items-center gap-2">
        <Coins className="w-4 h-4 text-yellow-400" />
        <input
          type="number"
          min="0"
          value={value}
          onChange={(e) => onChange(parseInt(e.target.value) || 0)}
          className="flex-1 px-4 py-2.5 bg-white/5 border border-white/10 rounded-lg text-white placeholder:text-white/30 focus:outline-none focus:border-white/30"
        />
      </div>
    </div>
  );
}
