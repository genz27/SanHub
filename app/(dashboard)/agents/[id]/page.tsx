'use client';
/* eslint-disable @next/next/no-img-element */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Bot, Send, Loader2, Image as ImageIcon, X, Plus, MessageSquare, Trash2 } from 'lucide-react';
import { Markdown } from '@/components/ui/markdown';
import { toast } from '@/components/ui/toaster';
import { AGENT_PRESETS } from '@/agent/presets';

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'tool_call' | 'tool_result';
  content: string;
  toolName?: string;
  toolArgs?: string;
  toolResultUrl?: string;
  sentImages?: string[];
  createdAt: number;
}

interface SessionSummary {
  id: string;
  title: string;
  updatedAt: number;
}

export default function AgentChatPage() {
  const params = useParams();
  const router = useRouter();
  const agentId = params.id as string;
  const preset = AGENT_PRESETS.find((a) => a.id === agentId);

  const [sessionId, setSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState('');
  const [pendingImages, setPendingImages] = useState<string[]>([]);
  const [loadingSessions, setLoadingSessions] = useState(false);
  const [showSessions, setShowSessions] = useState(false);
  const streamRef = useRef<AbortController | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Load sessions on mount
  useEffect(() => {
    loadSessions();
  }, [agentId]);

  // Auto-scroll on new messages
  useEffect(() => {
    if (listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [messages]);

  // Load session messages when switching session
  const loadSessionMessages = useCallback(async (sid: string) => {
    try {
      const res = await fetch(`/api/chat/sessions/${sid}/messages`);
      if (!res.ok) return;
      const data = await res.json();
      const dbMessages = data.data || [];
      const converted: ChatMessage[] = dbMessages.map((m: any) => ({
        id: m.id,
        role: m.role,
        content: m.content || '',
        sentImages: m.images ? (typeof m.images === 'string' ? JSON.parse(m.images) : m.images) : undefined,
        createdAt: m.createdAt,
      }));
      setMessages(converted);
      setSessionId(sid);
      setError('');
    } catch {
      // ignore
    }
  }, []);

  const loadSessions = useCallback(async () => {
    setLoadingSessions(true);
    try {
      const res = await fetch(`/api/agents/sessions?agentId=${agentId}`);
      if (res.ok) {
        const data = await res.json();
        setSessions(data.data || []);
      }
    } catch {
      // ignore
    } finally {
      setLoadingSessions(false);
    }
  }, [agentId]);

  const deleteSession = useCallback(async (sid: string) => {
    try {
      await fetch(`/api/chat/sessions/${sid}`, { method: 'DELETE' });
      setSessions((prev) => prev.filter((s) => s.id !== sid));
      if (sessionId === sid) {
        setSessionId(null);
        setMessages([]);
      }
    } catch {}
  }, [sessionId]);

  const newSession = useCallback(() => {
    setSessionId(null);
    setMessages([]);
    setError('');
    setPendingImages([]);
  }, []);

  const handleImageSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    const total = pendingImages.length + files.length;
    if (total > 5) {
      toast({ title: '最多上传 5 张图片', variant: 'destructive' });
      return;
    }
    Array.from(files).forEach((file) => {
      const reader = new FileReader();
      reader.onload = () => {
        setPendingImages((prev) => [...prev, reader.result as string]);
      };
      reader.readAsDataURL(file);
    });
    e.target.value = '';
  }, [pendingImages.length]);

  const removePendingImage = useCallback((index: number) => {
    setPendingImages((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const sendMessage = useCallback(async () => {
    const text = input.trim();
    if ((!text && pendingImages.length === 0) || streaming) return;
    setInput('');

    const userMsg: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content: text || '[图片]',
      sentImages: pendingImages.length > 0 ? [...pendingImages] : undefined,
      createdAt: Date.now(),
    };
    setMessages((prev) => [...prev, userMsg]);
    const imagesToSend = [...pendingImages];
    setPendingImages([]);
    setStreaming(true);
    setError('');

    const controller = new AbortController();
    streamRef.current = controller;

    const assistantId = crypto.randomUUID();
    setMessages((prev) => [...prev, { id: assistantId, role: 'assistant', content: '', createdAt: Date.now() }]);

    try {
      const body: Record<string, unknown> = { sessionId, agentId, message: text };
      if (imagesToSend.length > 0) body.images = imagesToSend;

      const res = await fetch('/api/agents/chat', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body), signal: controller.signal,
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
          let event: any;
          try { event = JSON.parse(dataMatch[1]); } catch { continue; }

          if (event.type === 'error') throw new Error(event.error || 'Agent 返回错误');

          if (event.type === 'text') {
            fullContent += event.content || '';
            setMessages((prev) =>
              prev.map((m) => (m.id === assistantId ? { ...m, content: fullContent } : m))
            );
          } else if (event.type === 'tool_call') {
            setMessages((prev) => [...prev, {
              id: crypto.randomUUID(), role: 'tool_call', content: '',
              toolName: event.toolCall?.function?.name,
              toolArgs: event.toolCall?.function?.arguments, createdAt: Date.now(),
            }]);
          } else if (event.type === 'tool_result') {
            setMessages((prev) => {
              const result = event.toolResult;
              let url = '';
              let displayContent = '';
              if (result?.content) {
                const raw = result.content;
                if (typeof raw === 'string') { displayContent = raw; try { const parsed = JSON.parse(raw); url = parsed.url || ''; } catch {} }
                else if (typeof raw === 'object') { displayContent = JSON.stringify(raw); url = raw.url || ''; }
              }
              return [...prev, {
                id: crypto.randomUUID(), role: 'tool_result', content: displayContent,
                toolName: result?.name, toolResultUrl: url, createdAt: Date.now(),
              }];
            });
          } else if (event.type === 'done') {
            if (event.sessionId) { setSessionId(event.sessionId); loadSessions(); }
          }
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
  }, [input, pendingImages, streaming, sessionId, agentId, loadSessions]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  };

  if (!preset) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-foreground/50">未知的 Agent</p>
      </div>
    );
  }

  const PRESET_NAMES: Record<string, string> = {
    'creative-assistant': '全能创作',
    'image-specialist': '图像专家',
    'video-specialist': '视频专家',
  };

  return (
    <div className="flex h-[calc(100vh-4rem)]">
      {/* Session list panel */}
      <div className={`${showSessions ? 'block' : 'hidden'} lg:block w-64 bg-card/60 border-r border-border/70 flex flex-col shrink-0`}>
        <div className="p-3 border-b border-border/70">
          <select
            value={agentId}
            onChange={(e) => router.push(`/agents/${e.target.value}`)}
            className="w-full text-sm bg-card/60 border border-border/70 rounded-lg px-3 py-2 text-foreground focus:outline-none"
          >
            {AGENT_PRESETS.map((a) => (
              <option key={a.id} value={a.id}>{a.name}</option>
            ))}
          </select>
        </div>
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {sessions.map((s) => (
            <div
              key={s.id}
              onClick={() => loadSessionMessages(s.id)}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg cursor-pointer text-sm group ${
                sessionId === s.id ? 'bg-accent/80 text-foreground' : 'text-foreground/60 hover:bg-card/70 hover:text-foreground'
              }`}
            >
              <MessageSquare className="w-3.5 h-3.5 shrink-0" />
              <span className="truncate flex-1">{s.title.replace(/^Agent:/, '').slice(0, 20)}</span>
              <button
                onClick={(e) => { e.stopPropagation(); deleteSession(s.id); }}
                className="opacity-0 group-hover:opacity-100 p-1 hover:text-red-400"
              >
                <Trash2 className="w-3 h-3" />
              </button>
            </div>
          ))}
          {!loadingSessions && sessions.length === 0 && (
            <p className="text-xs text-foreground/30 text-center py-4">暂无历史会话</p>
          )}
        </div>
        <div className="p-2 border-t border-border/70">
          <button onClick={newSession} className="w-full flex items-center gap-2 px-3 py-2 text-sm text-foreground/60 hover:text-foreground hover:bg-card/70 rounded-lg transition-colors">
            <Plus className="w-4 h-4" /> 新对话
          </button>
        </div>
      </div>

      {/* Mobile toggle */}
      <button
        onClick={() => setShowSessions(!showSessions)}
        className="lg:hidden fixed bottom-20 right-4 z-50 p-3 bg-card/90 backdrop-blur-sm rounded-full border border-border/70 shadow-lg"
      >
        <MessageSquare className="w-5 h-5 text-foreground/70" />
      </button>

      {/* Main chat area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <div className="flex items-center gap-3 px-4 py-4 border-b border-border/70 shrink-0">
          <button onClick={() => setShowSessions(!showSessions)} className="lg:hidden p-1 text-foreground/50 hover:text-foreground">
            <MessageSquare className="w-5 h-5" />
          </button>
          <div className="w-10 h-10 rounded-xl bg-sky-500/20 flex items-center justify-center">
            <Bot className="w-5 h-5 text-sky-400" />
          </div>
          <div>
            <h1 className="text-lg font-semibold text-foreground">{preset.name}</h1>
            <p className="text-xs text-foreground/50">{preset.description}</p>
          </div>
          <div className="ml-auto hidden sm:flex items-center gap-2">
            {AGENT_PRESETS.filter(a => a.id !== agentId).map(a => (
              <button
                key={a.id}
                onClick={() => router.push(`/agents/${a.id}`)}
                className="px-3 py-1.5 text-xs text-foreground/50 hover:text-foreground bg-card/70 rounded-lg hover:bg-card"
              >
                {a.name}
              </button>
            ))}
          </div>
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
                    {msg.sentImages && msg.sentImages.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {msg.sentImages.map((img, i) => (
                          <img key={i} src={img} alt={`图片 ${i + 1}`} className="w-20 h-20 object-cover rounded-lg border border-border/50" />
                        ))}
                      </div>
                    )}
                    {msg.content && msg.content !== '[图片]' && (
                      <p className="text-foreground whitespace-pre-wrap text-sm">{msg.content}</p>
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
                      <span className="inline-flex gap-1 py-2">
                        <span className="w-2 h-2 rounded-full bg-foreground/40 animate-bounce" style={{ animationDelay: '0ms' }} />
                        <span className="w-2 h-2 rounded-full bg-foreground/40 animate-bounce" style={{ animationDelay: '150ms' }} />
                        <span className="w-2 h-2 rounded-full bg-foreground/40 animate-bounce" style={{ animationDelay: '300ms' }} />
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
                      {msg.toolName === 'image-generation' ? '🎨 生成图片...' : msg.toolName === 'video-generation' ? '🎬 生成视频...' : `🔧 ${msg.toolName}`}
                    </span>
                  </div>
                </div>
              )}

              {msg.role === 'tool_result' && (
                <div className="flex justify-center">
                  {msg.toolResultUrl ? (
                    <div className="bg-card/60 border border-border/70 rounded-xl overflow-hidden max-w-sm">
                      <img src={msg.toolResultUrl} alt="生成结果" className="w-full rounded-lg" loading="lazy" />
                    </div>
                  ) : (
                    <div className="bg-card/60 border border-border/70 rounded-xl px-4 py-2 text-xs text-foreground/50">
                      {msg.content || (msg.toolName ? `${msg.toolName} 已完成` : '工具执行完成')}
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}

          {error && (
            <div className="text-center space-y-2">
              <div className="text-sm text-red-400 bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3 inline-block">
                {error}
              </div>
              <div>
                <button
                  onClick={sendMessage}
                  className="text-xs text-foreground/50 hover:text-foreground underline"
                >
                  重试
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Input */}
        <div className="shrink-0 border-t border-border/70 px-4 py-4">
          {/* Pending images */}
          {pendingImages.length > 0 && (
            <div className="mb-3 flex flex-wrap gap-2">
              {pendingImages.map((img, i) => (
                <div key={i} className="relative w-16 h-16 rounded-lg overflow-hidden border border-border/70 bg-card/60 group">
                  <img src={img} alt={`待发送 ${i + 1}`} className="w-full h-full object-cover" />
                  <button
                    onClick={() => removePendingImage(i)}
                    className="absolute top-0.5 right-0.5 p-0.5 bg-background/80 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ))}
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
            <input type="file" accept="image/*" multiple hidden ref={fileInputRef} onChange={handleImageSelect} />
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={streaming}
              className="p-2 text-foreground/40 hover:text-foreground disabled:opacity-30 rounded-xl hover:bg-card/70 transition-colors"
              title="上传图片（最多5张）"
            >
              <ImageIcon className="w-5 h-5" />
            </button>
            <button
              onClick={sendMessage}
              disabled={(!input.trim() && pendingImages.length === 0) || streaming}
              className="p-2 text-foreground/40 hover:text-foreground disabled:opacity-30 rounded-xl hover:bg-card/70 transition-colors"
            >
              {streaming ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
            </button>
          </div>
          <p className="text-xs text-foreground/30 mt-2 text-center">Enter 发送 · Shift+Enter 换行</p>
        </div>
      </div>
    </div>
  );
}
