'use client';

import { useState, useEffect } from 'react';
import { 
  Video, Palette, Zap, GitBranch, Loader2, Save, Eye, EyeOff, Image, 
  Plus, Trash2, ChevronDown, ChevronUp, Settings2, Power, AlertCircle,
  GripVertical, Check, X, Edit2, Copy, ExternalLink
} from 'lucide-react';
import { toast } from '@/components/ui/toaster';
import type { SystemConfig } from '@/types';

// API 服务类型
type ApiServiceType = 'sora' | 'gemini' | 'zimage' | 'gitee' | 'picui';

interface ApiServiceConfig {
  id: ApiServiceType;
  name: string;
  description: string;
  icon: React.ElementType;
  color: string;
  bgColor: string;
  fields: ApiField[];
}

interface ApiField {
  key: string;
  label: string;
  type: 'text' | 'password' | 'textarea' | 'url' | 'number' | 'toggle';
  placeholder?: string;
  description?: string;
  configKey: keyof SystemConfig;
}

// API 服务配置定义
const apiServices: ApiServiceConfig[] = [
  {
    id: 'sora',
    name: 'Sora',
    description: 'OpenAI 视频/图像生成',
    icon: Video,
    color: 'text-blue-400',
    bgColor: 'bg-blue-500/20',
    fields: [
      { key: 'apiKey', label: 'API Key', type: 'password', configKey: 'soraApiKey' },
      { key: 'baseUrl', label: 'Base URL', type: 'url', placeholder: 'http://localhost:8000', configKey: 'soraBaseUrl' },
    ]
  },
  {
    id: 'gemini',
    name: 'Gemini',
    description: 'Google AI 图像生成',
    icon: Palette,
    color: 'text-purple-400',
    bgColor: 'bg-purple-500/20',
    fields: [
      { key: 'apiKey', label: 'API Key', type: 'password', configKey: 'geminiApiKey' },
      { key: 'baseUrl', label: 'Base URL', type: 'url', placeholder: 'https://generativelanguage.googleapis.com', configKey: 'geminiBaseUrl' },
    ]
  },
  {
    id: 'zimage',
    name: 'Z-Image',
    description: 'ModelScope 图像生成',
    icon: Zap,
    color: 'text-green-400',
    bgColor: 'bg-green-500/20',
    fields: [
      { key: 'apiKey', label: 'API Key', type: 'password', placeholder: 'ms-xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx', configKey: 'zimageApiKey' },
      { key: 'baseUrl', label: 'Base URL', type: 'url', placeholder: 'https://api-inference.modelscope.cn/', configKey: 'zimageBaseUrl' },
    ]
  },
  {
    id: 'gitee',
    name: 'Gitee AI',
    description: '支持多 Key 轮询',
    icon: GitBranch,
    color: 'text-orange-400',
    bgColor: 'bg-orange-500/20',
    fields: [
      { key: 'freeApiKey', label: '免费 Key', type: 'password', placeholder: '免费 key（失败时才会使用付费 keys）', configKey: 'giteeFreeApiKey' },
      { key: 'apiKeys', label: 'API Keys（多个用逗号分隔）', type: 'textarea', placeholder: 'key1,key2,key3', description: '多个 Key 将自动轮询使用', configKey: 'giteeApiKey' },
      { key: 'baseUrl', label: 'Base URL', type: 'url', placeholder: 'https://ai.gitee.com/', configKey: 'giteeBaseUrl' },
    ]
  },
  {
    id: 'picui',
    name: 'PicUI 图床',
    description: '图片和头像存储',
    icon: Image,
    color: 'text-pink-400',
    bgColor: 'bg-pink-500/20',
    fields: [
      { key: 'apiKey', label: 'API Token', type: 'password', placeholder: '1|1bJbwlqBfnggmOMEZqXT5XusaIwqiZjCDs7r1Ob5', configKey: 'picuiApiKey' },
      { key: 'baseUrl', label: 'Base URL', type: 'url', placeholder: 'https://picui.cn/api/v1', configKey: 'picuiBaseUrl' },
    ]
  },
];

// API 卡片组件
function ApiCard({ 
  service, 
  config, 
  onConfigChange,
  expanded,
  onToggleExpand,
  showKeys,
  onToggleShowKey,
}: {
  service: ApiServiceConfig;
  config: SystemConfig;
  onConfigChange: (key: keyof SystemConfig, value: string | number | boolean) => void;
  expanded: boolean;
  onToggleExpand: () => void;
  showKeys: Record<string, boolean>;
  onToggleShowKey: (key: string) => void;
}) {
  const Icon = service.icon;
  
  // 检查是否已配置
  const isConfigured = service.fields.some(field => {
    const value = config[field.configKey];
    return value && String(value).length > 0;
  });

  return (
    <div className="bg-white/[0.03] backdrop-blur-sm border border-white/10 rounded-2xl overflow-hidden transition-all duration-300 hover:border-white/20">
      {/* Header */}
      <div 
        className="p-5 flex items-center justify-between cursor-pointer group"
        onClick={onToggleExpand}
      >
        <div className="flex items-center gap-4">
          <div className={`w-12 h-12 ${service.bgColor} rounded-xl flex items-center justify-center`}>
            <Icon className={`w-6 h-6 ${service.color}`} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-semibold text-white text-lg">{service.name}</h3>
              {isConfigured ? (
                <span className="px-2 py-0.5 text-xs rounded-full bg-green-500/20 text-green-400 border border-green-500/30">
                  已配置
                </span>
              ) : (
                <span className="px-2 py-0.5 text-xs rounded-full bg-white/10 text-white/40 border border-white/10">
                  未配置
                </span>
              )}
            </div>
            <p className="text-sm text-white/50 mt-0.5">{service.description}</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className={`p-2 rounded-lg transition-colors ${expanded ? 'bg-white/10' : 'bg-white/5 group-hover:bg-white/10'}`}>
            {expanded ? (
              <ChevronUp className="w-5 h-5 text-white/60" />
            ) : (
              <ChevronDown className="w-5 h-5 text-white/60" />
            )}
          </div>
        </div>
      </div>

      {/* Content */}
      {expanded && (
        <div className="px-5 pb-5 pt-2 border-t border-white/10 space-y-4">
          {service.fields.map((field) => (
            <div key={field.key} className="space-y-2">
              <label className="text-sm font-medium text-white/70">{field.label}</label>
              
              {field.type === 'textarea' ? (
                <div className="space-y-1.5">
                  <textarea
                    value={String(config[field.configKey] || '')}
                    onChange={(e) => onConfigChange(field.configKey, e.target.value)}
                    placeholder={field.placeholder}
                    className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder:text-white/30 focus:outline-none focus:border-white/30 focus:ring-1 focus:ring-white/20 resize-none h-24 transition-all"
                  />
                  {field.description && (
                    <p className="text-xs text-white/40">{field.description}</p>
                  )}
                </div>
              ) : field.type === 'password' ? (
                <div className="relative">
                  <input
                    type={showKeys[`${service.id}-${field.key}`] ? 'text' : 'password'}
                    value={String(config[field.configKey] || '')}
                    onChange={(e) => onConfigChange(field.configKey, e.target.value)}
                    placeholder={field.placeholder}
                    className="w-full px-4 py-3 pr-12 bg-white/5 border border-white/10 rounded-xl text-white placeholder:text-white/30 focus:outline-none focus:border-white/30 focus:ring-1 focus:ring-white/20 transition-all"
                  />
                  <button
                    type="button"
                    onClick={() => onToggleShowKey(`${service.id}-${field.key}`)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 p-1.5 text-white/40 hover:text-white/70 rounded-lg hover:bg-white/10 transition-colors"
                  >
                    {showKeys[`${service.id}-${field.key}`] ? (
                      <EyeOff className="w-4 h-4" />
                    ) : (
                      <Eye className="w-4 h-4" />
                    )}
                  </button>
                </div>
              ) : (
                <input
                  type={field.type === 'url' ? 'text' : field.type}
                  value={String(config[field.configKey] || '')}
                  onChange={(e) => onConfigChange(field.configKey, e.target.value)}
                  placeholder={field.placeholder}
                  className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder:text-white/30 focus:outline-none focus:border-white/30 focus:ring-1 focus:ring-white/20 transition-all"
                />
              )}
            </div>
          ))}
          
          {/* Sora 特殊链接 */}
          {service.id === 'sora' && (
            <div className="pt-3 border-t border-white/10">
              <a
                href="/admin/tokens"
                className="inline-flex items-center gap-2 text-sm text-blue-400 hover:text-blue-300 transition-colors"
              >
                <Settings2 className="w-4 h-4" />
                后台管理 & Token 导入
                <ExternalLink className="w-3 h-3" />
              </a>
            </div>
          )}
          
          {/* PicUI 提示 */}
          {service.id === 'picui' && (
            <div className="flex items-start gap-2 p-3 rounded-xl bg-white/5 border border-white/10">
              <AlertCircle className="w-4 h-4 text-white/40 mt-0.5 flex-shrink-0" />
              <p className="text-xs text-white/40">
                未配置时将使用本地文件存储。从 picui.cn 个人中心获取 Token。
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function ApiConfigPage() {
  const [config, setConfig] = useState<SystemConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showKeys, setShowKeys] = useState<Record<string, boolean>>({});
  const [expandedCards, setExpandedCards] = useState<Record<string, boolean>>({});
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
        // 默认展开已配置的卡片
        const expanded: Record<string, boolean> = {};
        apiServices.forEach(service => {
          const isConfigured = service.fields.some(field => {
            const value = data.data[field.configKey];
            return value && String(value).length > 0;
          });
          expanded[service.id] = isConfigured;
        });
        setExpandedCards(expanded);
      }
    } catch (err) {
      console.error('Failed to load config:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleConfigChange = (key: keyof SystemConfig, value: string | number | boolean) => {
    if (!config) return;
    setConfig({ ...config, [key]: value });
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

  const toggleShowKey = (key: string) => {
    setShowKeys(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const toggleExpand = (id: string) => {
    setExpandedCards(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const expandAll = () => {
    const expanded: Record<string, boolean> = {};
    apiServices.forEach(service => { expanded[service.id] = true; });
    setExpandedCards(expanded);
  };

  const collapseAll = () => {
    setExpandedCards({});
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
          <h1 className="text-3xl font-light text-white">API 配置</h1>
          <p className="text-white/50 mt-1">管理各服务的 API 密钥和接口地址</p>
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

      {/* 系统设置 */}
      <div className="bg-white/[0.03] backdrop-blur-sm border border-white/10 rounded-2xl p-6 space-y-5">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-white/10 rounded-xl flex items-center justify-center">
            <Settings2 className="w-5 h-5 text-white/70" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-white">系统设置</h2>
            <p className="text-sm text-white/40">全局配置选项</p>
          </div>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5 pt-2">
          <div className="space-y-2">
            <label className="text-sm font-medium text-white/70">注册开关</label>
            <div className="flex items-center gap-3 p-4 bg-white/5 rounded-xl border border-white/10">
              <button
                onClick={() => handleConfigChange('registerEnabled', !config.registerEnabled)}
                className={`relative inline-flex h-7 w-12 items-center rounded-full transition-colors ${
                  config.registerEnabled ? 'bg-green-500' : 'bg-white/20'
                }`}
              >
                <span
                  className={`inline-block h-5 w-5 transform rounded-full bg-white transition-transform shadow-sm ${
                    config.registerEnabled ? 'translate-x-6' : 'translate-x-1'
                  }`}
                />
              </button>
              <span className={`text-sm ${config.registerEnabled ? 'text-green-400' : 'text-white/50'}`}>
                {config.registerEnabled ? '开放注册' : '禁止注册'}
              </span>
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-white/70">新用户默认积分</label>
            <input
              type="number"
              value={config.defaultBalance}
              onChange={(e) => handleConfigChange('defaultBalance', parseInt(e.target.value) || 0)}
              className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder:text-white/30 focus:outline-none focus:border-white/30 focus:ring-1 focus:ring-white/20 transition-all"
              min="0"
            />
          </div>
        </div>
      </div>

      {/* API 服务列表 */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-white">API 服务</h2>
          <div className="flex items-center gap-2">
            <button
              onClick={expandAll}
              className="px-3 py-1.5 text-xs text-white/50 hover:text-white/80 hover:bg-white/10 rounded-lg transition-colors"
            >
              全部展开
            </button>
            <button
              onClick={collapseAll}
              className="px-3 py-1.5 text-xs text-white/50 hover:text-white/80 hover:bg-white/10 rounded-lg transition-colors"
            >
              全部收起
            </button>
          </div>
        </div>

        <div className="space-y-3">
          {apiServices.map((service) => (
            <ApiCard
              key={service.id}
              service={service}
              config={config}
              onConfigChange={handleConfigChange}
              expanded={expandedCards[service.id] || false}
              onToggleExpand={() => toggleExpand(service.id)}
              showKeys={showKeys}
              onToggleShowKey={toggleShowKey}
            />
          ))}
        </div>
      </div>

      {/* 底部提示 */}
      <div className="flex items-center gap-2 p-4 rounded-xl bg-white/5 border border-white/10">
        <AlertCircle className="w-4 h-4 text-white/40 flex-shrink-0" />
        <p className="text-xs text-white/40">
          API 密钥将安全存储在服务器端，请勿在客户端暴露。修改后请点击保存按钮生效。
        </p>
      </div>
    </div>
  );
}
