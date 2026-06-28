'use client';

import { useRouter } from 'next/navigation';
import { Sparkles, Image, Video, Bot } from 'lucide-react';
import { AGENT_PRESETS } from '@/agent/presets';

const ICON_MAP: Record<string, typeof Sparkles> = { sparkles: Sparkles, image: Image, video: Video };

export default function AgentListPage() {
  const router = useRouter();

  return (
    <div className="max-w-4xl mx-auto py-12 px-4">
      <div className="text-center mb-12">
        <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-sky-500/25 to-emerald-500/25 border border-border/70 flex items-center justify-center mx-auto mb-4">
          <Bot className="w-8 h-8 text-foreground/80" />
        </div>
        <h1 className="text-3xl font-light text-foreground">Agent</h1>
        <p className="text-foreground/50 mt-2">选择一个 AI Agent 开始对话</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {AGENT_PRESETS.map((agent) => {
          const Icon = ICON_MAP[agent.icon] || Bot;
          return (
            <button
              key={agent.id}
              onClick={() => router.push(`/agents/${agent.id}`)}
              className="bg-card/60 border border-border/70 rounded-2xl p-6 text-left hover:bg-card/70 hover:border-border transition-all group text-left"
            >
              <div className="w-12 h-12 rounded-xl bg-sky-500/20 flex items-center justify-center mb-4">
                <Icon className="w-6 h-6 text-sky-400" />
              </div>
              <h3 className="text-lg font-semibold text-foreground mb-1">{agent.name}</h3>
              <p className="text-sm text-foreground/50">{agent.description}</p>
              <div className="flex flex-wrap gap-2 mt-4">
                {agent.tools.map((t) => (
                  <span key={t} className="px-2 py-0.5 text-xs rounded-full bg-card/70 text-foreground/50">
                    {t === 'image-generation' ? '图像生成' : t === 'video-generation' ? '视频生成' : '文本处理'}
                  </span>
                ))}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
