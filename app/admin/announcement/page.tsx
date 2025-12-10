'use client';

import { useState, useEffect } from 'react';
import { Megaphone, Loader2, Save, Eye, EyeOff } from 'lucide-react';
import { toast } from '@/components/ui/toaster';
import type { SystemConfig } from '@/types';

export default function AnnouncementPage() {
  const [config, setConfig] = useState<SystemConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showPreview, setShowPreview] = useState(false);

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
          announcement: config.announcement,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error);
      }

      toast({ title: '公告已保存' });
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
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extralight text-white">公告管理</h1>
          <p className="text-white/50 mt-1 font-light text-sm sm:text-base">发布系统公告，支持 HTML 格式</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowPreview(!showPreview)}
            className="flex items-center gap-2 px-3 sm:px-4 py-2 bg-white/10 text-white rounded-lg font-medium hover:bg-white/20 transition-colors text-sm sm:text-base"
          >
            {showPreview ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            <span className="hidden sm:inline">{showPreview ? '编辑' : '预览'}</span>
          </button>
          <button
            onClick={saveConfig}
            disabled={saving}
            className="flex items-center gap-2 px-3 sm:px-4 py-2 bg-white text-black rounded-lg font-medium hover:bg-white/90 transition-colors disabled:opacity-50 text-sm sm:text-base"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            <span className="hidden sm:inline">保存</span>
          </button>
        </div>
      </div>

      <div className="bg-white/5 border border-white/10 rounded-xl overflow-hidden">
        <div className="p-4 border-b border-white/10 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-yellow-500/20 rounded-lg flex items-center justify-center">
              <Megaphone className="w-4 h-4 text-yellow-400" />
            </div>
            <h2 className="font-medium text-white">系统公告</h2>
          </div>
          <label className="flex items-center gap-2 cursor-pointer">
            <span className="text-sm text-white/50">启用公告</span>
            <div
              onClick={() => setConfig({
                ...config,
                announcement: { ...config.announcement, enabled: !config.announcement.enabled }
              })}
              className={`w-10 h-6 rounded-full transition-colors relative ${
                config.announcement.enabled ? 'bg-green-500' : 'bg-white/20'
              }`}
            >
              <div
                className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-transform ${
                  config.announcement.enabled ? 'translate-x-5' : 'translate-x-1'
                }`}
              />
            </div>
          </label>
        </div>

        <div className="p-4 space-y-4">
          {/* 标题 */}
          <div className="space-y-2">
            <label className="text-sm text-white/50">公告标题</label>
            <input
              type="text"
              value={config.announcement.title}
              onChange={(e) => setConfig({
                ...config,
                announcement: { ...config.announcement, title: e.target.value }
              })}
              placeholder="输入公告标题"
              className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-lg text-white placeholder:text-white/30 focus:outline-none focus:border-white/30"
            />
          </div>

          {/* 内容 */}
          <div className="space-y-2">
            <label className="text-sm text-white/50">公告内容（支持 HTML）</label>
            {showPreview ? (
              <div
                className="w-full min-h-[200px] px-4 py-3 bg-white/5 border border-white/10 rounded-lg text-white prose prose-invert max-w-none"
                dangerouslySetInnerHTML={{ __html: config.announcement.content || '<p class="text-white/30">暂无内容</p>' }}
              />
            ) : (
              <textarea
                value={config.announcement.content}
                onChange={(e) => setConfig({
                  ...config,
                  announcement: { ...config.announcement, content: e.target.value }
                })}
                placeholder="输入公告内容，支持 HTML 标签，如 <b>加粗</b>、<a href='#'>链接</a> 等"
                rows={8}
                className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-lg text-white placeholder:text-white/30 focus:outline-none focus:border-white/30 font-mono text-sm resize-none"
              />
            )}
          </div>

          {/* 提示 */}
          <div className="text-xs text-white/40 space-y-1">
            <p>支持的 HTML 标签：&lt;b&gt;、&lt;i&gt;、&lt;u&gt;、&lt;a&gt;、&lt;br&gt;、&lt;p&gt;、&lt;span&gt; 等</p>
            <p>示例：&lt;b&gt;重要通知&lt;/b&gt;：系统将于今晚 &lt;span style=&quot;color:#ef4444&quot;&gt;22:00&lt;/span&gt; 进行维护</p>
          </div>

          {/* 更新时间 */}
          {config.announcement.updatedAt > 0 && (
            <div className="text-xs text-white/30 pt-2 border-t border-white/5">
              上次更新：{new Date(config.announcement.updatedAt).toLocaleString('zh-CN')}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
