'use client';
import { Eye, EyeOff } from 'lucide-react';
import type { ReactNode } from 'react';

interface ModelBasicFieldsProps {
  name: string;
  onNameChange: (v: string) => void;
  apiModel: string;
  onApiModelChange: (v: string) => void;
  description: string;
  onDescriptionChange: (v: string) => void;
  baseUrl: string;
  onBaseUrlChange: (v: string) => void;
  apiKey: string;
  onApiKeyChange: (v: string) => void;
  showKey: boolean;
  onToggleShowKey: () => void;
  children?: ReactNode;
}

export function ModelBasicFields({
  name, onNameChange, apiModel, onApiModelChange,
  description, onDescriptionChange,
  baseUrl, onBaseUrlChange, apiKey, onApiKeyChange,
  showKey, onToggleShowKey, children,
}: ModelBasicFieldsProps) {
  return (
    <>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="space-y-2">
          <label className="text-sm text-foreground/70">名称 *</label>
          <input type="text" value={name} onChange={(e) => onNameChange(e.target.value)} placeholder="模型名称" className="w-full px-4 py-3 bg-card/60 border border-border/70 rounded-xl text-foreground placeholder:text-foreground/30 focus:outline-none focus:border-border" />
        </div>
        <div className="space-y-2">
          <label className="text-sm text-foreground/70">模型 ID *</label>
          <input type="text" value={apiModel} onChange={(e) => onApiModelChange(e.target.value)} placeholder="model-id" className="w-full px-4 py-3 bg-card/60 border border-border/70 rounded-xl text-foreground placeholder:text-foreground/30 focus:outline-none focus:border-border" />
        </div>
        <div className="space-y-2">
          <label className="text-sm text-foreground/70">描述</label>
          <input type="text" value={description} onChange={(e) => onDescriptionChange(e.target.value)} placeholder="模型描述" className="w-full px-4 py-3 bg-card/60 border border-border/70 rounded-xl text-foreground placeholder:text-foreground/30 focus:outline-none focus:border-border" />
        </div>
        <div className="space-y-2">
          <label className="text-sm text-foreground/70">Base URL（可选，覆盖渠道）</label>
          <input type="text" value={baseUrl} onChange={(e) => onBaseUrlChange(e.target.value)} placeholder="留空使用渠道默认" className="w-full px-4 py-3 bg-card/60 border border-border/70 rounded-xl text-foreground placeholder:text-foreground/30 focus:outline-none focus:border-border" />
        </div>
        <div className="space-y-2">
          <label className="text-sm text-foreground/70">API Key（可选，覆盖渠道）</label>
          <div className="relative">
            <input type={showKey ? 'text' : 'password'} value={apiKey} onChange={(e) => onApiKeyChange(e.target.value)} placeholder="留空使用渠道默认" className="w-full px-4 py-3 pr-12 bg-card/60 border border-border/70 rounded-xl text-foreground placeholder:text-foreground/30 focus:outline-none focus:border-border" />
            <button type="button" onClick={onToggleShowKey} className="absolute right-3 top-1/2 -translate-y-1/2 text-foreground/40 hover:text-foreground/70">
              {showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
        </div>
        {children}
      </div>
    </>
  );
}

interface FeaturesCheckboxGroupProps {
  features: Record<string, unknown>;
  onToggle: (key: string, value: boolean) => void;
  options: { key: string; label: string }[];
}

export function FeaturesCheckboxGroup({ features, onToggle, options }: FeaturesCheckboxGroupProps) {
  return (
    <div className="flex flex-wrap gap-4">
      {options.map((opt) => (
        <label key={opt.key} className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={!!features[opt.key]}
            onChange={(e) => onToggle(opt.key, e.target.checked)}
            className="w-4 h-4 rounded border-border/70 bg-card/60 text-sky-500 focus:ring-sky-500"
          />
          <span className="text-sm text-foreground/70">{opt.label}</span>
        </label>
      ))}
    </div>
  );
}
