'use client';
import { Eye, EyeOff } from 'lucide-react';

interface ChannelFormFieldsProps {
  name: string;
  onNameChange: (v: string) => void;
  type: string;
  onTypeChange: (v: string) => void;
  typeOptions: { value: string; label: string; description?: string }[];
  baseUrl: string;
  onBaseUrlChange: (v: string) => void;
  apiKey: string;
  onApiKeyChange: (v: string) => void;
  enabled: boolean;
  onEnabledChange: (v: boolean) => void;
  showKey: boolean;
  onToggleShowKey: () => void;
  keyLabel?: string;
  nameError?: boolean;
}

export function ChannelFormFields({
  name, onNameChange, type, onTypeChange, typeOptions,
  baseUrl, onBaseUrlChange, apiKey, onApiKeyChange,
  enabled, onEnabledChange, showKey, onToggleShowKey,
  keyLabel = 'API Key', nameError,
}: ChannelFormFieldsProps) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-2">
          <label className="text-sm text-foreground/70">名称 *</label>
          <input type="text" value={name} onChange={(e) => onNameChange(e.target.value)} placeholder="渠道名称" className={`w-full px-4 py-3 bg-card/60 border border-border/70 rounded-xl text-foreground placeholder:text-foreground/30 focus:outline-none transition-colors ${nameError ? 'border-red-500 focus:border-red-500' : 'border-border/70 focus:border-border'}`} />
        </div>
        <div className="space-y-2">
          <label className="text-sm text-foreground/70">类型 *</label>
          <select value={type} onChange={(e) => onTypeChange(e.target.value)} className="w-full px-4 py-3 bg-card/60 border border-border/70 rounded-xl text-foreground focus:outline-none focus:border-border">
            {typeOptions.map((t) => (
              <option key={t.value} value={t.value} className="bg-card/95">{t.label}{t.description ? ` - ${t.description}` : ''}</option>
            ))}
          </select>
        </div>
        <div className="space-y-2">
          <label className="text-sm text-foreground/70">Base URL</label>
          <input type="text" value={baseUrl} onChange={(e) => onBaseUrlChange(e.target.value)} placeholder="https://api.example.com" className="w-full px-4 py-3 bg-card/60 border border-border/70 rounded-xl text-foreground placeholder:text-foreground/30 focus:outline-none focus:border-border" />
        </div>
        <div className="space-y-2">
          <label className="text-sm text-foreground/70">{keyLabel}</label>
          <div className="relative">
            <input type={showKey ? 'text' : 'password'} value={apiKey} onChange={(e) => onApiKeyChange(e.target.value)} placeholder="sk-..." className="w-full px-4 py-3 pr-12 bg-card/60 border border-border/70 rounded-xl text-foreground placeholder:text-foreground/30 focus:outline-none focus:border-border" />
            <button type="button" onClick={onToggleShowKey} className="absolute right-3 top-1/2 -translate-y-1/2 text-foreground/40 hover:text-foreground/70">
              {showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
        </div>
      </div>
      <label className="flex items-center gap-2 cursor-pointer">
        <input type="checkbox" checked={enabled} onChange={(e) => onEnabledChange(e.target.checked)} className="w-4 h-4 rounded border-border/70 bg-card/60 text-blue-500 focus:ring-blue-500" />
        <span className="text-sm text-foreground/70">启用</span>
      </label>
    </div>
  );
}
