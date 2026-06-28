'use client';
/* eslint-disable @next/next/no-img-element */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import { Bot, Send, Loader2, User, Image as ImageIcon, Video } from 'lucide-react';
import { Markdown } from '@/components/ui/markdown';
import { toast } from '@/components/ui/toaster';
import { cn, formatDate } from '@/lib/utils';
import { AGENT_PRESETS, type AgentPreset } from '@/agent/presets';

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'tool_call' | 'tool_result';
  content: string;
  toolName?: string;
  toolArgs?: string;
  toolResultUrl?: string;
  createdAt: number;
}

export default function AgentChatPage() {
  const params = useParams();
  const agentId = params.id as string;
  const preset = AGENT_PRESETS.find((a) => a.id === agentId);

  const [sessionId, setSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState('');
  const streamRef = useRef<AbortController | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Auto-scroll on new messages
  useEffect(() => {
    if (listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [messages]);

  const sendMessage = useCallback(async () => {
    const text = input.trim();
    if (!text || streaming) return;
    setInput('');

    const userMsg: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content: text,
      createdAt: Date.now(),
    };
    setMessages((prev) => [...prev, userMsg]);
    setStreaming(true);
    setError('');

    const controller = new AbortController();
    streamRef.current = controller;

    // Optimistic: add a placeholder assistant message
    const assistantId = crypto.randomUUID();
    setMessages((prev) => [...prev, { id: assistantId, role: 'assistant', content: '', createdAt: Date.now() }]);

    try {
      const res = await fetch('/api/agents/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId, agentId, message: text }),
        signal: controller.signal,
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `请求失败 (${res.status})`);
      }

      const reader = res.body?.getReader();
      if (!reader) throw new Error('无法读取响应流');

      const decoder = new TextDecoder();
      let buffer = '';
      let fullContent = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        const blocks = buffer.split('\n\n');
        buffer = blocks.pop() || '';

        for (const block of blocks) {
          const dataMatch = block.match(/data: (.+)/);
          if (!dataMatch) continue;
          try {
            const event = JSON.parse(dataMatch[1]);
            switch (event.type) {
              case 'text':
                fullContent += event.content || '';
                setMessages((prev) =>
                  prev.map((m) => (m.id === assistantId ? { ...m, content: fullContent } : m))
                );
                break;
              case 'tool_call':
                setMessages((prev) => [
                  ...prev,
                  {
                    id: crypto.randomUUID(),
                    role: 'tool_call',
                    content: '',
                    toolName: event.toolCall?.function?.name,
                    toolArgs: event.toolCall?.function?.arguments,
                    createdAt: Date.now(),
                  },
                ]);
                break;
              case 'tool_result':
                setMessages((prev) => {
                  const result = event.toolResult;
                  let url = '';
                  let displayContent = '';
                  if (result?.content) {
                    const raw = result.content;
                    if (typeof raw === 'string') {
                      displayContent = raw;
                      try { const parsed = JSON.parse(raw); url = parsed.url || ''; } catch {}
                    } else if (typeof raw === 'object') {
                      displayContent = JSON.stringify(raw);
                      url = raw.url || '';
                    }
                  }
                  return [
                    ...prev,
                    {
                      id: crypto.randomUUID(),
                      role: 'tool_result',
                      content: displayContent,
                      toolName: result?.name,
                      toolResultUrl: url,
                      createdAt: Date.now(),
                    },
                  ];
                });
                break;
              case 'done':
                if (event.sessionId) setSessionId(event.sessionId);
                break;
              case 'error':
                throw new Error(event.error || 'Agent 返回错误');
            }
          } catch {}
        }
      }
    } catch (err: any) {
      if (err.name === 'AbortError') return;
      const msg = err instanceof Error ? err.message : '请求失败';
      setError(msg);
      toast({ title: 'Agent 响应错误', description: msg, variant: 'destructive' });
    } finally {
      setStreaming(false);
      streamRef.current = null;
    }
  }, [input, streaming, sessionId, agentId]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  if (!preset) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-foreground/50">未知的 Agent</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)] max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-4 border-b border-border/70 shrink-0">
        <div className="w-10 h-10 rounded-xl bg-sky-500/20 flex items-center justify-center">
          <Bot className="w-5 h-5 text-sky-400" />
        </div>
        <div>
          <h1 className="text-lg font-semibold text-foreground">{preset.name}</h1>
          <p className="text-xs text-foreground/50">{preset.description}</p>
        </div>
        <button
          onClick={() => { setMessages([]); setSessionId(null); setError(''); }}
          className="ml-auto px-3 py-1.5 text-xs text-foreground/50 hover:text-foreground bg-card/70 rounded-lg hover:bg-card"
        >
          新对话
        </button>
      </div>

      {/* Messages */}
      <div ref={listRef} className="flex-1 overflow-y-auto px-4 py-6 space-y-4">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-center text-foreground/40">
            <Bot className="w-16 h-16 mb-4 opacity-30" />
            <p className="text-lg">开始对话</p>
            <p className="text-sm mt-1">向 {preset.name} 描述你想要创作的内容</p>
          </div>
        )}

        {messages.map((msg) => (
          <div key={msg.id}>
            {msg.role === 'user' && (
              <div className="flex justify-end">
                <div className="max-w-[80%] bg-foreground/10 rounded-2xl rounded-br-md px-4 py-3">
                  <p className="text-foreground whitespace-pre-wrap">{msg.content}</p>
                </div>
              </div>
            )}

            {msg.role === 'assistant' && (
              <div className="flex gap-3">
                <div className="w-8 h-8 rounded-lg bg-sky-500/20 flex items-center justify-center shrink-0 mt-1">
                  <Bot className="w-4 h-4 text-sky-400" />
                </div>
                <div className="max-w-[80%] bg-card/60 border border-border/70 rounded-2xl rounded-bl-md px-4 py-3">
                  {msg.content ? (
                    <Markdown content={msg.content} />
                  ) : streaming ? (
                    <span className="text-foreground/40 animate-pulse">思考中...</span>
                  ) : null}
                </div>
              </div>
            )}

            {msg.role === 'tool_call' && (
              <div className="flex justify-center">
                <div className="bg-card/60 border border-border/70 rounded-xl px-4 py-2 flex items-center gap-2 text-sm">
                  <Loader2 className="w-4 h-4 animate-spin text-sky-400" />
                  <span className="text-foreground/60">
                    调用工具：{msg.toolName === 'image-generation' ? '图像生成' : msg.toolName === 'video-generation' ? '视频生成' : msg.toolName}
                  </span>
                </div>
              </div>
            )}

            {msg.role === 'tool_result' && msg.toolResultUrl && (
              <div className="flex justify-center">
                <div className="bg-card/60 border border-border/70 rounded-xl overflow-hidden max-w-sm">
                  {(msg.toolResultUrl.endsWith('.mp4') || msg.toolName === 'video-generation') ? (
                    <video src={msg.toolResultUrl} controls className="w-full rounded-lg" />
                  ) : (
                    <img src={msg.toolResultUrl} alt="生成结果" className="w-full rounded-lg" />
                  )}
                </div>
              </div>
            )}
          </div>
        ))}

        {error && (
          <div className="text-center text-sm text-red-400 bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3">
            {error}
          </div>
        )}
      </div>

      {/* Input */}
      <div className="shrink-0 border-t border-border/70 px-4 py-4">
        <div className="flex items-end gap-3 bg-card/60 border border-border/70 rounded-2xl px-4 py-3">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="描述你想要创作的内容..."
            rows={1}
            className="flex-1 bg-transparent text-foreground placeholder:text-foreground/30 resize-none focus:outline-none text-sm py-1 max-h-32"
            style={{ height: 'auto', minHeight: '24px' }}
            onInput={(e) => {
              const target = e.target as HTMLTextAreaElement;
              target.style.height = 'auto';
              target.style.height = `${Math.min(target.scrollHeight, 128)}px`;
            }}
          />
          <button
            onClick={sendMessage}
            disabled={!input.trim() || streaming}
            className="p-2 text-foreground/40 hover:text-foreground disabled:opacity-30 rounded-xl hover:bg-card/70 transition-colors"
          >
            {streaming ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
          </button>
        </div>
        <p className="text-xs text-foreground/30 mt-2 text-center">Enter 发送 · Shift+Enter 换行</p>
      </div>
    </div>
  );
}
