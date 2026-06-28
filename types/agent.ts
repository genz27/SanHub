// ========================================
// AI Agent 类型定义
// ========================================

export type AgentBuiltinTool =
  | 'image-generation'
  | 'video-generation'
  | 'chat-completion'
  | 'text-transform';

export interface AgentToolDefinition {
  name: string;
  description: string;
  enabled: boolean;
  config?: Record<string, unknown>;
}

export interface Agent {
  id: string;
  userId: string;
  name: string;
  description: string;
  systemPrompt: string;
  modelId: string;
  tools: AgentToolDefinition[];
  temperature: number;
  maxTokens: number;
  maxToolRoundtrips: number;
  enabled: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface AgentSession {
  id: string;
  userId: string;
  agentId: string;
  title: string;
  createdAt: number;
  updatedAt: number;
}

export type AgentMessageRole = 'user' | 'assistant' | 'tool_call' | 'tool_result' | 'system';

export interface AgentToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;
  };
}

export interface AgentMessage {
  id: string;
  sessionId: string;
  role: AgentMessageRole;
  content: string;
  toolCalls?: AgentToolCall[];
  toolCallId?: string;
  toolName?: string;
  isError?: boolean;
  tokenCount: number;
  createdAt: number;
}

export interface AgentSummary {
  id: string;
  name: string;
  description: string;
  toolCount: number;
  enabled: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface AgentChatRequest {
  sessionId?: string;
  agentId: string;
  message: string;
  images?: string[];
}

export interface AgentChunkEvent {
  type: 'text' | 'tool_call' | 'tool_result' | 'error' | 'done';
  content?: string;
  toolCall?: AgentToolCall;
  toolResult?: { name: string; content: string; isError?: boolean };
  error?: string;
  sessionId?: string;
}
