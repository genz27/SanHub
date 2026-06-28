'use client';
/* eslint-disable @next/next/no-img-element */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import {
  Bot,
  Send,
  Plus,
  Trash2,
  Loader2,
  MessageSquare,
  User,
  Image as ImageIcon,
  Video,
  ChevronDown,
  ChevronRight,
} from 'lucide-react';
import { Markdown } from '@/components/ui/markdown';
import { toast } from '@/components/ui/toaster';
import { cn, formatDate } from '@/lib/utils';
import type { Generation } from '@/types';

// ──────────────────────────────────────────────
// Local types for the Agent Chat
// ──────────────────────────────────────────────

interface ToolCallData {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

interface ToolResultData {
  toolCallId: string;
  name: string;
  content: string;
}

interface AgentMessage {
  id: string;
  role: 'user' | 'assistant' | 'tool_call' | 'tool_result';
  content: string;
  toolCall?: ToolCallData;
  toolResult?: ToolResultData;
  createdAt: number;
}

interface AgentSession {
  id: string;
  title: string;
  updatedAt: number;
}

// Pre-create a new session ID (not yet persisted)
function makeSessionId(): string {
  return crypto.randomUUID();
}

// ──────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────

function relativeTime(ts: number): string {
  const diff = Date.now() - ts;
  const min = Math.floor(diff / 60000);
  const hr = Math.floor(diff / 3600000);
  const day = Math.floor(diff / 86400000);
  if (min < 1) return '刚刚';
  if (min < 60) return `${min}分钟前`;
  if (hr < 24) return `${hr}小时前`;
  if (day < 7) return `${day}天前`;
  return formatDate(ts);
}

function isJsonWithUrl(content: string): boolean {
  try {
    const obj = JSON.parse(content);
    return typeof obj === 'object' && obj !== null && typeof obj.url === 'string';
  } catch {
    return false;
  }
}

function renderToolResultContent(content: string) {
  if (!isJsonWithUrl(content)) return null;

  try {
    const obj = JSON.parse(content);
    const url = obj.url as string;
    const isVideo = /\.(mp4|webm|mov|avi)$/i.test(url) || obj.type === 'video';
    const isImage = /\.(png|jpg|jpeg|gif|webp|svg)$/i.test(url) || obj.type === 'image';

    return (
      <div className="mt-2">
        {isVideo ? (
          <video
            src={url}
            controls
            className="max-w-full rounded-lg border border-border/70"
            style={{ maxHeight: 320 }}
          />
        ) : isImage ? (
          <img
            src={url}
            alt=""
            className="max-w-full rounded-lg border border-border/70"
            style={{ maxHeight: 320 }}
          />
        ) : null}
      </div>
    );
  } catch {
    return null;
  }
}

// ──────────────────────────────────────────────
// Component
// ──────────────────────────────────────────────

const INPUT_MAX = 4000;

export default function AgentChatPage() {
  const params = useParams();
  const agentId = params?.id as string;

  // ─── State ──────────────────────────────────
  const [sessions, setSessions] = useState<AgentSession[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<AgentMessage[]>([]);
  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [loadingSessions, setLoadingSessions] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);

  // Track tool-calls that are in-flight (tool_call received but not yet tool_result)
  const pendingToolCallsRef = useRef<Set<string>>(new Set());
  // Abort controller for the active stream
  const abortRef = useRef<AbortController | null>(null);

  // Refs
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // ─── Load sessions on mount ─────────────────
  const loadSessions = useCallback(async () => {
    setLoadingSessions(true);
    try {
      const res = await fetch('/api/agents/sessions');
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '加载会话列表失败');
      const list: AgentSession[] = data.data || [];
      setSessions(list);
      return list;
    } catch (err) {
      toast({
        title: '加载会话列表失败',
        description: err instanceof Error ? err.message : '网络错误',
      });
      return [] as AgentSession[];
    } finally {
      setLoadingSessions(false);
    }
  }, []);

  useEffect(() => {
    loadSessions();
  }, [loadSessions]);

  // ─── Load messages for a session ────────────
  const loadMessages = useCallback(async (sessionId: string) => {
    setLoadingMessages(true);
    try {
      const res = await fetch(`/api/agents/sessions/${sessionId}/messages`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '加载消息失败');
      setMessages((data.data || []) as AgentMessage[]);
    } catch (err) {
      toast({
        title: '加载消息失败',
        description: err instanceof Error ? err.message : '网络错误',
      });
    } finally {
      setLoadingMessages(false);
    }
  }, []);

  // ─── Switch session ─────────────────────────
  const switchSession = useCallback(
    (sessionId: string) => {
      if (streaming) return; // Don't switch while streaming
      abortRef.current?.abort();
      setCurrentSessionId(sessionId);
      setMessages([]);
      if (sessionId) {
        loadMessages(sessionId);
      }
    },
    [streaming, loadMessages]
  );

  // ─── Create new session ─────────────────────
  const createSession = useCallback(async () => {
    if (streaming) return;
    abortRef.current?.abort();
    const id = makeSessionId();
    const optimistic: AgentSession = {
      id,
      title: '新会话',
      updatedAt: Date.now(),
    };
    setSessions((prev) => [optimistic, ...prev]);
    setCurrentSessionId(id);
    setMessages([]);

    try {
      const res = await fetch('/api/agents/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agentId, sessionId: id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '创建会话失败');
      // Update with server response
      setSessions((prev) =>
        prev.map((s) => (s.id === id ? { ...s, ...data.data } : s))
      );
    } catch (err) {
      toast({
        title: '创建会话失败',
        description: err instanceof Error ? err.message : '网络错误',
      });
    }
  }, [streaming, agentId]);

  // ─── Delete session ─────────────────────────
  const deleteSession = useCallback(
    async (sessionId: string, e: React.MouseEvent) => {
      e.stopPropagation();
      if (streaming) return;
      try {
        const res = await fetch(`/api/agents/sessions/${sessionId}`, {
          method: 'DELETE',
        });
        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.error || '删除失败');
        }
        setSessions((prev) => prev.filter((s) => s.id !== sessionId));
        if (currentSessionId === sessionId) {
          setCurrentSessionId(null);
          setMessages([]);
        }
      } catch (err) {
        toast({
          title: '删除会话失败',
          description: err instanceof Error ? err.message : '网络错误',
        });
      }
    },
    [streaming, currentSessionId]
  );

  // ─── Scroll to bottom on new messages ───────
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // ─── Auto-resize textarea ───────────────────
  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = 'auto';
    ta.style.height = Math.min(ta.scrollHeight, 160) + 'px';
  }, [input]);

  // ─── Send message ───────────────────────────
  const sendMessage = useCallback(async () => {
    const text = input.trim();
    if (!text || streaming || !currentSessionId) return;

    // Reset textarea height
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }

    // ── Optimistic user message ──
    const userMsg: AgentMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content: text,
      createdAt: Date.now(),
    };
    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    setStreaming(true);
    pendingToolCallsRef.current.clear();

    const controller = new AbortController();
    abortRef.current = controller;

    // ── Placeholder assistant message ──
    const assistantId = crypto.randomUUID();
    const assistantMsg: AgentMessage = {
      id: assistantId,
      role: 'assistant',
      content: '',
      createdAt: Date.now(),
    };
    setMessages((prev) => [...prev, assistantMsg]);

    try {
      const response = await fetch('/api/agents/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: currentSessionId,
          agentId,
          message: text,
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error || `请求失败 (${response.status})`);
      }

      const reader = response.body?.getReader();
      if (!reader) throw new Error('响应体不可读');

      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        // Parse SSE events: "event: xxx\ndata: {...}\n\n"
        const lines = buffer.split('\n\n');
        buffer = lines.pop() || '';

        for (const block of lines) {
          if (!block.trim()) continue;
          const eventMatch = block.match(/event: (.+)\n/);
          const dataMatch = block.match(/data: ([\s\S]+)/);
          if (!eventMatch || !dataMatch) continue;

          try {
            const event = JSON.parse(dataMatch[1]);

            switch (event.type) {
              case 'text': {
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === assistantId
                      ? { ...m, content: m.content + (event.content || '') }
                      : m
                  )
                );
                break;
              }
              case 'tool_call': {
                const tc = event.toolCall as ToolCallData;
                if (tc?.id) pendingToolCallsRef.current.add(tc.id);
                const toolCallMsg: AgentMessage = {
                  id: `toolcall-${tc.id}`,
                  role: 'tool_call',
                  content: '',
                  toolCall: tc,
                  createdAt: Date.now(),
                };
                setMessages((prev) => {
                  // Avoid duplicate
                  if (prev.some((m) => m.id === toolCallMsg.id)) return prev;
                  return [...prev, toolCallMsg];
                });
                break;
              }
              case 'tool_result': {
                const tr = event.toolResult as ToolResultData;
                if (tr?.toolCallId) pendingToolCallsRef.current.delete(tr.toolCallId);
                const toolResultMsg: AgentMessage = {
                  id: `toolresult-${tr.toolCallId}`,
                  role: 'tool_result',
                  content: typeof tr.content === 'string' ? tr.content : JSON.stringify(tr.content),
                  toolResult: tr,
                  createdAt: Date.now(),
                };
                setMessages((prev) => {
                  if (prev.some((m) => m.id === toolResultMsg.id)) return prev;
                  return [...prev, toolResultMsg];
                });
                break;
              }
              case 'done': {
                const finalContent = event.content || '';
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === assistantId
                      ? { ...m, content: m.content || finalContent }
                      : m
                  )
                );
                // Update session title from response if provided
                if (event.sessionId) {
                  setSessions((prev) =>
                    prev.map((s) =>
                      s.id === currentSessionId
                        ? { ...s, updatedAt: Date.now() }
                        : s
                    )
                  );
                }
                break;
              }
              case 'error': {
                toast({
                  title: '出错',
                  description: event.error || '未知错误',
                });
                break;
              }
            }
          } catch (parseErr) {
            console.warn('Failed to parse SSE event:', parseErr);
          }
        }
      }
    } catch (err: unknown) {
      if ((err as Error)?.name === 'AbortError') {
        // Aborted by user switching session, ignore
      } else {
        toast({
          title: '发送失败',
          description: err instanceof Error ? err.message : '网络错误',
        });
      }
    } finally {
      setStreaming(false);
      abortRef.current = null;
    }
  }, [input, streaming, currentSessionId, agentId]);

  // ─── Keyboard shortcut ──────────────────────
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
      }
    },
    [sendMessage]
  );

  // ─── Current session title ──────────────────
  const currentSessionTitle = useMemo(() => {
    if (!currentSessionId) return '';
    const s = sessions.find((x) => x.id === currentSessionId);
    return s?.title || '';
  }, [sessions, currentSessionId]);

  // ─── Render ─────────────────────────────────
  return (
    <div className="h-full w-full min-w-0 flex">
      {/* ─── Left Sidebar ─────────────────────── */}
      <aside className="hidden md:flex flex-col w-72 shrink-0 border-r border-border/70 bg-card/40">
        {/* Header + New session */}
        <div className="shrink-0 p-3 border-b border-border/70">
          <button
            onClick={createSession}
            disabled={streaming}
            className={cn(
              'w-full inline-flex items-center justify-center gap-2 px-3 py-2 rounded-lg font-medium transition',
              streaming
                ? 'bg-card/70 text-foreground/40 cursor-not-allowed'
                : 'bg-foreground text-background hover:bg-foreground/90'
            )}
          >
            <Plus className="w-4 h-4" />
            新建会话
          </button>
        </div>

        {/* Session list */}
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {loadingSessions && sessions.length === 0 ? (
            <div className="flex items-center justify-center py-8 text-foreground/40 text-sm">
              <Loader2 className="w-4 h-4 animate-spin mr-2" />
              加载中...
            </div>
          ) : sessions.length === 0 ? (
            <div className="text-center py-8 text-foreground/40 text-sm">
              暂无会话
            </div>
          ) : (
            sessions.map((session) => (
              <div
                key={session.id}
                onClick={() => switchSession(session.id)}
                className={cn(
                  'group flex items-center gap-2 px-3 py-2.5 rounded-lg cursor-pointer transition text-sm',
                  currentSessionId === session.id
                    ? 'bg-foreground/10 text-foreground'
                    : 'text-foreground/60 hover:text-foreground hover:bg-foreground/5'
                )}
              >
                <MessageSquare className="w-4 h-4 shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="truncate">{session.title}</div>
                  <div className="text-[10px] text-foreground/40 mt-0.5">
                    {relativeTime(session.updatedAt)}
                  </div>
                </div>
                <button
                  onClick={(e) => deleteSession(session.id, e)}
                  className="shrink-0 opacity-0 group-hover:opacity-100 text-foreground/30 hover:text-red-400 transition"
                  title="删除会话"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))
          )}
        </div>
      </aside>

      {/* ─── Right Panel ──────────────────────── */}
      <div className="flex-1 flex flex-col min-w-0 h-full">
        {!currentSessionId ? (
          /* Empty state */
          <div className="flex-1 flex flex-col items-center justify-center gap-4 text-foreground/40">
            <Bot className="w-12 h-12" />
            <p className="text-sm">选择或新建一个会话开始聊天</p>
            <button
              onClick={createSession}
              disabled={streaming}
              className={cn(
                'inline-flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition text-sm',
                streaming
                  ? 'bg-card/70 text-foreground/40 cursor-not-allowed'
                  : 'bg-foreground text-background hover:bg-foreground/90'
              )}
            >
              <Plus className="w-4 h-4" />
              新建会话
            </button>
          </div>
        ) : loadingMessages ? (
          <div className="flex-1 flex items-center justify-center text-foreground/40">
            <Loader2 className="w-5 h-5 animate-spin mr-2" />
            加载中...
          </div>
        ) : (
          <>
            {/* ── Messages ───────────────────── */}
            <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
              {messages.length === 0 && (
                <div className="flex flex-col items-center justify-center py-16 text-foreground/30">
                  <Bot className="w-10 h-10 mb-2" />
                  <p className="text-sm">开始和 Agent 对话吧</p>
                </div>
              )}

              {messages.map((msg) => {
                if (msg.role === 'user') {
                  return (
                    <div key={msg.id} className="flex justify-end">
                      <div className="max-w-[80%] sm:max-w-[70%] bg-foreground/10 rounded-2xl rounded-br-md px-4 py-2.5 text-sm text-foreground whitespace-pre-wrap break-words">
                        {msg.content}
                      </div>
                    </div>
                  );
                }

                if (msg.role === 'assistant') {
                  return (
                    <div key={msg.id} className="flex gap-3">
                      <div className="shrink-0 w-8 h-8 rounded-full bg-foreground/10 flex items-center justify-center mt-0.5">
                        <Bot className="w-4 h-4 text-foreground/60" />
                      </div>
                      <div className="min-w-0 flex-1 text-sm text-foreground leading-relaxed">
                        {msg.content ? (
                          <Markdown content={msg.content} />
                        ) : streaming && !msg.content ? (
                          <span className="inline-flex gap-1">
                            <span className="w-1.5 h-1.5 rounded-full bg-foreground/40 animate-bounce" style={{ animationDelay: '0ms' }} />
                            <span className="w-1.5 h-1.5 rounded-full bg-foreground/40 animate-bounce" style={{ animationDelay: '150ms' }} />
                            <span className="w-1.5 h-1.5 rounded-full bg-foreground/40 animate-bounce" style={{ animationDelay: '300ms' }} />
                          </span>
                        ) : null}
                      </div>
                    </div>
                  );
                }

                if (msg.role === 'tool_call') {
                  return (
                    <div key={msg.id} className="flex justify-start pl-11">
                      <details className="group w-full max-w-[80%] sm:max-w-[70%]">
                        <summary className="flex items-center gap-2 px-3 py-2 rounded-lg bg-card/60 border border-border/70 cursor-pointer text-sm text-foreground/70 hover:text-foreground transition list-none [&::-webkit-details-marker]:hidden">
                          <ChevronRight className="w-3.5 h-3.5 text-foreground/40 group-open:rotate-90 transition-transform shrink-0" />
                          <span className="text-sm">🔧 调用工具: {msg.toolCall?.name || 'unknown'}</span>
                        </summary>
                        <div className="mt-2 px-3 py-2 bg-card/40 border border-border/60 rounded-lg text-xs text-foreground/60 font-mono whitespace-pre-wrap break-words">
                          {msg.toolCall?.arguments
                            ? JSON.stringify(msg.toolCall.arguments, null, 2)
                            : msg.content || '(无参数)'}
                        </div>
                      </details>
                    </div>
                  );
                }

                if (msg.role === 'tool_result') {
                  const mediaEl = renderToolResultContent(msg.content);
                  return (
                    <div key={msg.id} className="flex justify-start pl-11">
                      <div className="w-full max-w-[80%] sm:max-w-[70%] px-3 py-2 rounded-lg bg-card/40 border border-border/60 text-sm text-foreground/70">
                        <div className="flex items-center gap-1.5 text-xs text-foreground/50 mb-1">
                          <span className="text-sm">🔧</span>
                          <span className="font-medium">{msg.toolResult?.name || '工具结果'}</span>
                        </div>
                        {mediaEl ? (
                          mediaEl
                        ) : (
                          <pre className="whitespace-pre-wrap break-words text-xs font-mono text-foreground/60 max-h-48 overflow-auto">
                            {msg.content}
                          </pre>
                        )}
                      </div>
                    </div>
                  );
                }

                return null;
              })}

              {/* Streaming indicator while waiting for first token */}
              <div ref={messagesEndRef} />
            </div>

            {/* ── Input Area ──────────────────── */}
            <div className="shrink-0 border-t border-border/70 bg-card/40 px-4 py-3">
              <div className="max-w-2xl mx-auto flex items-end gap-2">
                <div className="flex-1 relative">
                  <textarea
                    ref={textareaRef}
                    value={input}
                    onChange={(e) => {
                      if (e.target.value.length <= INPUT_MAX) {
                        setInput(e.target.value);
                      }
                    }}
                    onKeyDown={handleKeyDown}
                    placeholder={streaming ? '等待回复中...' : '输入消息，Enter 发送，Shift+Enter 换行'}
                    disabled={streaming}
                    rows={1}
                    className={cn(
                      'w-full resize-none bg-background border border-border/70 rounded-xl px-3 py-2.5 pr-12 text-sm text-foreground placeholder:text-foreground/30 focus:outline-none focus:border-border transition',
                      streaming && 'opacity-50 cursor-not-allowed'
                    )}
                  />
                  <div className="absolute right-2 bottom-2.5 flex items-center gap-1.5">
                    <span
                      className={cn(
                        'text-[10px] tabular-nums',
                        input.length >= INPUT_MAX
                          ? 'text-red-400'
                          : 'text-foreground/30'
                      )}
                    >
                      {input.length}/{INPUT_MAX}
                    </span>
                  </div>
                </div>
                <button
                  onClick={sendMessage}
                  disabled={streaming || !input.trim() || !currentSessionId}
                  className={cn(
                    'shrink-0 w-10 h-10 inline-flex items-center justify-center rounded-xl transition',
                    streaming || !input.trim() || !currentSessionId
                      ? 'bg-card/70 text-foreground/30 cursor-not-allowed'
                      : 'bg-foreground text-background hover:bg-foreground/90'
                  )}
                  title="发送"
                >
                  {streaming ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Send className="w-4 h-4" />
                  )}
                </button>
              </div>
            </div>
          </>
        )}
      </div>

      {/* ─── Mobile session toggle ─────────────── */}
      {/* On mobile, show a floating button to create a new session */}
      {!currentSessionId && (
        <div className="md:hidden fixed bottom-6 right-4 z-40">
          <button
            onClick={createSession}
            disabled={streaming}
            className="w-12 h-12 rounded-full bg-foreground text-background shadow-lg flex items-center justify-center hover:opacity-90 transition"
          >
            <Plus className="w-5 h-5" />
          </button>
        </div>
      )}
    </div>
  );
}
