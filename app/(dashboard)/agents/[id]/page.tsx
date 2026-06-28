'use client';
/* eslint-disable @next/next/no-img-element */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import { Bot, Send, Loader2, Image as ImageIcon, X } from 'lucide-react';
import { Markdown } from '@/components/ui/markdown';
import { toast } from '@/components/ui/toaster';
import { cn } from '@/lib/utils';
import { AGENT_PRESETS } from '@/agent/presets';

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'tool_call' | 'tool_result';
  content: string;
  imageUrl?: string;
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
  const [pendingImage, setPendingImage] = useState<string | null>(null);
  const streamRef = useRef<AbortController | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Auto-scroll on new messages
  useEffect(() => {
    if (listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [messages]);

  const handleImageSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      setPendingImage(reader.result as string);
    };
    reader.readAsDataURL(file);
    // Reset so the same file can be picked again
    e.target.value = '';
  }, []);

  const removePendingImage = useCallback(() => {
    setPendingImage(null);
  }, []);

  const sendMessage = useCallback(async () => {
    const text = input.trim();
    if ((!text && !pendingImage) || streaming) return;
    setInput('');

    const userMsg: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content: text || '[图片]',
      imageUrl: pendingImage ?? undefined,
      createdAt: Date.now(),
    };
    setMessages((prev) => [...prev, userMsg]);
    setPendingImage(null);
    setStreaming(true);
    setError('');

    const controller = new AbortController();
    streamRef.current = controller;

    // Optimistic: add a placeholder assistant message
    const assistantId = crypto.randomUUID();
    setMessages((prev) => [...prev, { id: assistantId, role: 'assistant', content: '', createdAt: Date.now() }]);

    try {
      const body: Record<string, unknown> = { sessionId, agentId, message: text };
      if (pendingImage) {
        body.images = [pendingImage];
      }

      const res = await fetch('/api/agents/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
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
  }, [input, pendingImage, streaming, sessionId, agentId]);

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
          onClick={() => { setMessages([]); setSessionId(null); setError(''); setPendingImage(null); }}
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
                <div className="max-w-[80%] bg-foreground/10 rounded-2xl rounded-br-md px-4 py-3 space-y-2">
                  {msg.content && <p className="text-foreground whitespace-pre-wrap">{msg.content}</p>}
                  {msg.imageUrl && (
                    <img src={msg.imageUrl} alt="用户图片" className="max-w-full max-h-48 rounded-lg object-cover" />
                  )}
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
                    <span className="inline-flex gap-1.5 items-center h-6">
                      <span className="w-2 h-2 rounded-full bg-foreground/40 animate-bounce" style={{animationDelay:'0ms'}} />
                      <span className="w-2 h-2 rounded-full bg-foreground/40 animate-bounce" style={{animationDelay:'150ms'}} />
                      <span className="w-2 h-2 rounded-full bg-foreground/40 animate-bounce" style={{animationDelay:'300ms'}} />
                    </span>
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
                    <div className="relative group">
                      <img src={msg.toolResultUrl} alt="生成结果" className="w-full rounded-lg" />
                      <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent p-3 pt-6 rounded-b-lg opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-between">
                        <span className="text-white text-xs">{msg.toolName === 'image-generation' ? '生成的图片' : '工具结果'}</span>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            navigator.clipboard.writeText(msg.toolResultUrl!);
                            toast({ title: '已复制图片 URL', description: '图片地址已复制到剪贴板' });
                          }}
                          className="px-2.5 py-1 text-xs bg-white/20 hover:bg-white/30 text-white rounded-md transition-colors"
                        >
                          使用此图片
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        ))}

        {error && (
          <div className="flex items-center justify-center gap-3 text-sm text-red-400 bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3">
            <span>{error}</span>
            <button
              onClick={sendMessage}
              disabled={streaming}
              className="px-3 py-1 text-xs bg-red-500/20 hover:bg-red-500/30 text-red-400 rounded-lg transition-colors disabled:opacity-50"
            >
              重试
            </button>
          </div>
        )}
      </div>

      {/* Input */}
      <div className="shrink-0 border-t border-border/70 px-4 py-4">
        {/* Pending image thumbnail */}
        {pendingImage && (
          <div className="mb-3 flex items-center gap-2">
            <div className="relative w-16 h-16 rounded-lg overflow-hidden border border-border/70 bg-card/60">
              <img src={pendingImage} alt="待发送图片" className="w-full h-full object-cover" />
            </div>
            <span className="text-xs text-foreground/50">图片已选择</span>
            <button
              onClick={removePendingImage}
              className="ml-auto p-1 text-foreground/40 hover:text-foreground hover:bg-card/70 rounded-lg transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}
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
          {/* Hidden file input for image selection */}
          <input
            type="file"
            accept="image/*"
            hidden
            ref={fileInputRef}
            onChange={handleImageSelect}
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={streaming}
            className="p-2 text-foreground/40 hover:text-foreground disabled:opacity-30 rounded-xl hover:bg-card/70 transition-colors"
            title="上传图片"
          >
            <ImageIcon className="w-5 h-5" />
          </button>
          <button
            onClick={sendMessage}
            disabled={(!input.trim() && !pendingImage) || streaming}
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
