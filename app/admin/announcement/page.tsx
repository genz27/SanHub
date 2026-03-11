'use client';

import { useState, useEffect } from 'react';
import { Megaphone, Loader2, Save, Eye, EyeOff } from 'lucide-react';
import { toast } from '@/components/ui/toaster';
import type { SystemConfig } from '@/types';

type AnnouncementTemplate = {
  id: string;
  label: string;
  title: string;
  description: string;
  content: string;
};

type AnnouncementSnippet = {
  label: string;
  value: string;
};

const ANNOUNCEMENT_TEMPLATES: AnnouncementTemplate[] = [
  {
    id: 'maintenance',
    label: '维护通知',
    title: '系统维护通知',
    description: '适合停机升级、故障修复、机房切换等需要明确时间窗口的场景。',
    content:
      '<p><b>维护时间</b>：今晚 <span style="color:#f59e0b">22:00 - 23:30</span></p>\n<p><b>影响范围</b>：视频生成、图像生成和历史记录页可能短暂不可用。</p>\n<p>维护完成后会自动恢复，如有异常请联系客服反馈。</p>',
  },
  {
    id: 'release',
    label: '功能上线',
    title: '新功能已上线',
    description: '适合发布新模型、新页面和交互升级，强调“新增了什么”。',
    content:
      '<p><b>本次更新</b>：新增 <span style="color:#38bdf8">多渠道视频生成</span> 与更稳定的任务轮询。</p>\n<p>现在可以在视频页直接切换模型，并在历史页统一查看结果。</p>\n<p><a href="/video">立即体验</a></p>',
  },
  {
    id: 'campaign',
    label: '活动福利',
    title: '限时活动公告',
    description: '适合积分福利、卡密发放、邀请码活动、节日运营等场景。',
    content:
      '<p><b>活动时间</b>：即日起至 <span style="color:#34d399">3 月 31 日</span></p>\n<p>活动期间输入卡密可领取额外积分，新用户注册也会获得专属奖励。</p>\n<p><b>参与方式</b>：前往设置页兑换卡密，或分享邀请码邀请好友。</p>',
  },
  {
    id: 'policy',
    label: '规则提醒',
    title: '使用规则提醒',
    description: '适合安全策略、限流说明、内容规范和系统规则更新通知。',
    content:
      '<p>为保证服务稳定，平台已启用 <b>提示词处理</b> 与 <b>请求限流</b>。</p>\n<p>请避免提交违规内容；若频繁触发限制，请稍后再试。</p>\n<p>如有误判，可通过站内联系方式反馈具体提示词与时间。</p>',
  },
];

const ANNOUNCEMENT_SNIPPETS: AnnouncementSnippet[] = [
  { label: '时间高亮', value: '<span style="color:#f59e0b">今晚 22:00</span>' },
  { label: '重点加粗', value: '<b>立即查看</b>' },
  { label: '插入链接', value: '<a href="/settings">前往设置页</a>' },
  { label: '分段换行', value: '<br />' },
];

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
      toast({
        title: '保存失败',
        description: err instanceof Error ? err.message : '未知错误',
        variant: 'destructive',
      });
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

  const updateAnnouncement = (updates: Partial<SystemConfig['announcement']>) => {
    setConfig({
      ...config,
      announcement: {
        ...config.announcement,
        ...updates,
      },
    });
  };

  const applyTemplate = (template: AnnouncementTemplate) => {
    updateAnnouncement({
      title: template.title,
      content: template.content,
    });
    setShowPreview(false);
    toast({ title: `已套用「${template.label}」模板` });
  };

  const appendSnippet = (snippet: AnnouncementSnippet) => {
    const nextContent = config.announcement.content
      ? `${config.announcement.content}\n${snippet.value}`
      : snippet.value;
    updateAnnouncement({ content: nextContent });
    setShowPreview(false);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extralight text-foreground">公告管理</h1>
          <p className="text-foreground/50 mt-1 font-light text-sm sm:text-base">
            发布系统公告，支持 HTML 格式，并提供可直接套用的模板。
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowPreview(!showPreview)}
            className="flex items-center gap-2 px-3 sm:px-4 py-2 bg-card/70 text-foreground rounded-lg font-medium hover:bg-card/80 transition-colors text-sm sm:text-base"
          >
            {showPreview ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            <span className="hidden sm:inline">{showPreview ? '返回编辑' : '预览公告'}</span>
          </button>
          <button
            onClick={saveConfig}
            disabled={saving}
            className="flex items-center gap-2 px-3 sm:px-4 py-2 bg-foreground text-background rounded-lg font-medium hover:bg-foreground/90 transition-colors disabled:opacity-50 text-sm sm:text-base"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            <span className="hidden sm:inline">保存</span>
          </button>
        </div>
      </div>

      <div className="bg-card/60 border border-border/70 rounded-xl overflow-hidden">
        <div className="p-4 border-b border-border/70 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-yellow-500/20 rounded-lg flex items-center justify-center">
              <Megaphone className="w-4 h-4 text-yellow-400" />
            </div>
            <div>
              <h2 className="font-medium text-foreground">系统公告</h2>
              <p className="text-xs text-foreground/40 mt-0.5">建议先选模板，再微调标题、时间、影响范围和链接。</p>
            </div>
          </div>
          <label className="flex items-center gap-2 cursor-pointer">
            <span className="text-sm text-foreground/50">启用公告</span>
            <div
              onClick={() => updateAnnouncement({ enabled: !config.announcement.enabled })}
              className={`w-10 h-6 rounded-full transition-colors relative ${
                config.announcement.enabled ? 'bg-green-500' : 'bg-card/80'
              }`}
            >
              <div
                className={`absolute top-1 w-4 h-4 bg-foreground rounded-full transition-transform ${
                  config.announcement.enabled ? 'translate-x-5' : 'translate-x-1'
                }`}
              />
            </div>
          </label>
        </div>

        <div className="p-4 space-y-4">
          <div className="rounded-xl border border-border/70 bg-card/50 p-4 space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
              <div>
                <h3 className="text-sm font-medium text-foreground">常用模板</h3>
                <p className="text-xs text-foreground/40 mt-1">点击“套用模板”会同时填充标题和正文，适合快速起稿。</p>
              </div>
              <span className="text-xs text-foreground/30">模板只写入当前编辑区，不会自动保存。</span>
            </div>
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
              {ANNOUNCEMENT_TEMPLATES.map((template) => (
                <div key={template.id} className="rounded-xl border border-border/70 bg-card/60 p-4 space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium text-foreground">{template.label}</p>
                      <p className="text-xs text-foreground/40 mt-1">{template.description}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => applyTemplate(template)}
                      className="px-3 py-1.5 rounded-lg bg-foreground text-background text-xs font-medium hover:bg-foreground/90 transition-colors"
                    >
                      套用模板
                    </button>
                  </div>
                  <div className="rounded-lg border border-border/70 bg-card/70 px-3 py-2">
                    <p className="text-xs text-foreground/40">标题示例</p>
                    <p className="text-sm text-foreground mt-1">{template.title}</p>
                  </div>
                  <textarea
                    value={template.content}
                    readOnly
                    rows={5}
                    className="w-full px-3 py-2 bg-card/70 border border-border/70 rounded-lg text-foreground/70 text-xs font-mono resize-none"
                  />
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-xl border border-border/70 bg-card/50 p-4 space-y-3">
            <div>
              <h3 className="text-sm font-medium text-foreground">常用 HTML 片段</h3>
              <p className="text-xs text-foreground/40 mt-1">用于快速插入高亮时间、链接和换行，减少手写标签成本。</p>
            </div>
            <div className="flex flex-wrap gap-2">
              {ANNOUNCEMENT_SNIPPETS.map((snippet) => (
                <button
                  key={snippet.label}
                  type="button"
                  onClick={() => appendSnippet(snippet)}
                  className="px-3 py-1.5 rounded-lg border border-border/70 bg-card/60 text-xs text-foreground/70 hover:bg-card/80 hover:text-foreground transition-colors"
                >
                  {snippet.label}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-sm text-foreground/50">公告标题</label>
            <input
              type="text"
              value={config.announcement.title}
              onChange={(e) => updateAnnouncement({ title: e.target.value })}
              placeholder="例如：系统维护通知 / 限时活动公告"
              className="w-full px-4 py-3 bg-card/60 border border-border/70 rounded-lg text-foreground placeholder:text-foreground/30 focus:outline-none focus:border-border"
            />
            <p className="text-xs text-foreground/30">建议标题直接说明“发生了什么”，用户能一眼判断是否需要关注。</p>
          </div>

          <div className="space-y-2">
            <label className="text-sm text-foreground/50">公告内容（支持 HTML）</label>
            {showPreview ? (
              <div
                className="w-full min-h-[240px] px-4 py-3 bg-card/60 border border-border/70 rounded-lg text-foreground prose prose-invert max-w-none"
                dangerouslySetInnerHTML={{
                  __html: config.announcement.content || '<p class="text-foreground/30">暂无内容</p>',
                }}
              />
            ) : (
              <textarea
                value={config.announcement.content}
                onChange={(e) => updateAnnouncement({ content: e.target.value })}
                placeholder="建议先套用上方模板，再按需修改时间、影响范围、用户下一步动作等内容。"
                rows={10}
                className="w-full px-4 py-3 bg-card/60 border border-border/70 rounded-lg text-foreground placeholder:text-foreground/30 focus:outline-none focus:border-border font-mono text-sm resize-none"
              />
            )}
          </div>

          <div className="rounded-xl border border-border/70 bg-card/50 px-4 py-3 text-xs text-foreground/40 space-y-1">
            <p>支持常见 HTML 标签：&lt;b&gt;、&lt;i&gt;、&lt;u&gt;、&lt;a&gt;、&lt;br&gt;、&lt;p&gt;、&lt;span&gt; 等。</p>
            <p>推荐结构：先写结论，再写时间 / 影响范围 / 用户该怎么做，最后再补充入口链接或说明。</p>
            <p>示例：&lt;b&gt;重要通知&lt;/b&gt;：系统将于今晚 &lt;span style=&quot;color:#ef4444&quot;&gt;22:00&lt;/span&gt; 进行维护。</p>
          </div>

          {config.announcement.updatedAt > 0 && (
            <div className="text-xs text-foreground/30 pt-2 border-t border-border/70">
              上次更新：{new Date(config.announcement.updatedAt).toLocaleString('zh-CN')}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
