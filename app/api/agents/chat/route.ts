/* eslint-disable no-console */
import { NextRequest } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { generateText, tool } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';
import { z } from 'zod';
import {
  getChatModels,
  getChatSession,
  getSessionMessages,
  createChatSession,
  saveChatMessage,
  updateChatSession,
  getUserById,
  updateUserBalance,
  getImageModels,
} from '@/lib/db';
import { generateImage as generateImageFromLib } from '@/lib/image-generator';
import { generateVideo } from '@/lib/sora-api';
import { processVideoPrompt } from '@/lib/prompt-processor';
import { assertPromptsAllowed, isPromptBlockedError } from '@/lib/prompt-blocklist';
import { generateId } from '@/lib/utils';
import { saveMediaAsync } from '@/lib/media-storage';
import type { ChatMessage, ChatSession, ChatModel, User } from '@/types';

export const maxDuration = 600;
export const dynamic = 'force-dynamic';

// ========================================
// Agent Configuration
// ========================================

interface AgentConfig {
  id: string;
  name: string;
  modelId: string;
  systemPrompt: string;
  tools: string[];
  maxSteps: number;
  temperature: number;
  costPerMessage: number;
}

/**
 * Load agent config and resolve the underlying chat model.
 *
 * The agentId identifies which personality / tool-set to use:
 *   'creative-assistant' – general-purpose (image, video, text)
 *   'image-specialist'   – image-generation only
 *   'video-specialist'   – video-generation only
 *
 * The LLM behind every agent is picked from the chat_models table.
 */
async function resolveAgentConfig(agentId: string): Promise<{
  agent: AgentConfig;
  chatModel: ChatModel;
}> {
  const systemPrompts: Record<string, string> = {
    'creative-assistant': `你是一个名为 "SanHub Creative Assistant" 的智能助手。

你可以使用以下工具：
1. **image-generation** — 根据文字描述生成图片。支持宽高比和分辨率参数。
2. **video-generation** — 根据文字描述生成视频。支持宽高比和时长参数。
3. **text-transform** — 对文字进行内置操作（裁剪、截断、替换、转大小写、首字母大写）。

工作原则：
- 调用工具前先向用户说明计划。
- 根据用户意图选择合适的工具。
- 工具执行后向用户展示结果。
- 用中文与用户交流。
- 保持创意、友好和高效。`,

    'image-specialist': `你是一个专注于图片生成的 AI 助手。

你可以使用以下工具：
1. **image-generation** — 根据文字描述生成图片。

工作原则：
- 生成前先与用户确认画面内容和风格方向。
- 用中文与用户交流。`,

    'video-specialist': `你是一个专注于视频生成的 AI 助手。

你可以使用以下工具：
1. **video-generation** — 根据文字描述生成视频。

工作原则：
- 生成前先与用户确认视频内容和风格方向。
- 用中文与用户交流。`,
  };

  const toolSets: Record<string, string[]> = {
    'creative-assistant': ['image-generation', 'video-generation', 'text-transform'],
    'image-specialist': ['image-generation'],
    'video-specialist': ['video-generation'],
  };

  const systemPrompt = systemPrompts[agentId] || systemPrompts['creative-assistant'];
  const enabledTools = toolSets[agentId] || toolSets['creative-assistant'];

  // Find an enabled chat model to power this agent
  const models = await getChatModels(true);
  if (models.length === 0) {
    throw new Error('没有可用的聊天模型，请先在管理后台配置');
  }

  // Try to pick the first model; prefer gpt-4o or equivalent
  const chatModel =
    models.find((m) => m.modelId.toLowerCase().includes('gpt-4o')) ||
    models.find((m) => m.supportsVision) ||
    models[0];

  const agent: AgentConfig = {
    id: agentId,
    name: agentId
      .replace(/-/g, ' ')
      .replace(/\b\w/g, (c) => c.toUpperCase()),
    modelId: chatModel.id,
    systemPrompt,
    tools: enabledTools,
    maxSteps: 10,
    temperature: 0.7,
    costPerMessage: chatModel.costPerMessage,
  };

  return { agent, chatModel };
}

// ========================================
// SSE Streaming Helpers
// ========================================

/**
 * Create a manual SSE stream. Returns the `ReadableStream` plus helpers
 * to send events and close the stream.
 */
function createSSEStream() {
  const encoder = new TextEncoder();
  let controller: ReadableStreamDefaultController<Uint8Array>;
  let streamClosed = false;

  const stream = new ReadableStream<Uint8Array>({
    start(c) {
      controller = c;
    },
    cancel() {
      streamClosed = true;
    },
  });

  const send = (event: string, data: unknown) => {
    if (streamClosed) return;
    try {
      controller.enqueue(
        encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`),
      );
    } catch {
      streamClosed = true;
    }
  };

  const close = () => {
    if (streamClosed) return;
    streamClosed = true;
    try {
      controller.close();
    } catch {
      // already closed
    }
  };

  return { stream, send, close };
}

// ========================================
// Message Conversion
// ========================================

/**
 * Convert a DB ChatMessage into the AI SDK "model message" format.
 */
function toModelMessage(msg: ChatMessage): Record<string, unknown> {
  if (msg.role === 'system') {
    return { role: 'system', content: msg.content };
  }

  const images =
    msg.images && msg.images.length > 0
      ? msg.images.filter(Boolean)
      : [];

  if (images.length > 0 && msg.role === 'user') {
    return {
      role: 'user',
      content: [
        { type: 'text' as const, text: msg.content },
        ...images.map((img: string) => ({
          type: 'image' as const,
          image: img.startsWith('data:') ? img : `data:image/png;base64,${img}`,
        })),
      ],
    };
  }

  return { role: msg.role, content: msg.content };
}

// ========================================
// Tool Executors
// ========================================

async function execImageGeneration(args: {
  prompt: string;
  aspectRatio?: string;
  imageSize?: string;
}): Promise<Record<string, unknown>> {
  const models = await getImageModels(true);
  if (models.length === 0) {
    throw new Error('没有可用的图片生成模型');
  }
  const targetModel = models[0];

  const result = await generateImageFromLib({
    modelId: targetModel.id,
    prompt: args.prompt,
    aspectRatio: args.aspectRatio || targetModel.defaultAspectRatio,
    imageSize: args.imageSize,
    idempotencyKey: `agent-img-${generateId()}`,
  });

  const savedUrl = await saveMediaAsync(
    `agent-img-${generateId()}`,
    result.url,
  );

  return {
    url: savedUrl,
    revised_prompt: result.revised_prompt,
  };
}

async function execVideoGeneration(args: {
  prompt: string;
  aspectRatio?: string;
  duration?: string;
}): Promise<Record<string, unknown>> {
  const processed = args.prompt
    ? await processVideoPrompt(args.prompt)
    : undefined;

  const effectivePrompt = processed?.processedPrompt || args.prompt;

  const result = await generateVideo(
    {
      prompt: effectivePrompt,
      model: 'sora-2',
      orientation:
        args.aspectRatio === '9:16'
          ? 'portrait'
          : args.aspectRatio === '1:1'
            ? 'landscape'
            : 'landscape',
      seconds: args.duration,
    },
    undefined,
    {},
  );

  const videoUrl = result.data?.[0]?.url;
  let savedUrl = '';
  if (videoUrl) {
    savedUrl = await saveMediaAsync(
      `agent-vid-${generateId()}`,
      videoUrl,
    );
  }

  return {
    taskId: result.id,
    url: savedUrl,
    message: savedUrl
      ? `视频已生成: ${savedUrl}`
      : '视频生成任务已提交，正在后台处理中',
  };
}

function execTextTransform(args: {
  text: string;
  operation: 'trim' | 'truncate' | 'replace' | 'uppercase' | 'lowercase' | 'capitalize';
  maxLength?: number;
  search?: string;
  replacement?: string;
}): Record<string, unknown> {
  let result = args.text;

  switch (args.operation) {
    case 'trim':
      result = result.trim();
      break;
    case 'truncate':
      if (args.maxLength && result.length > args.maxLength) {
        result = result.slice(0, args.maxLength) + '...';
      }
      break;
    case 'replace':
      if (args.search !== undefined && args.replacement !== undefined) {
        result = result.split(args.search).join(args.replacement);
      }
      break;
    case 'uppercase':
      result = result.toUpperCase();
      break;
    case 'lowercase':
      result = result.toLowerCase();
      break;
    case 'capitalize':
      result = result.replace(/\b\w/g, (c) => c.toUpperCase());
      break;
  }

  return { result };
}

/**
 * Dispatch a tool call to the correct executor.
 */
async function dispatchToolCall(
  toolName: string,
  args: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  switch (toolName) {
    case 'image-generation':
      return execImageGeneration(args as Parameters<typeof execImageGeneration>[0]);
    case 'video-generation':
      return execVideoGeneration(args as Parameters<typeof execVideoGeneration>[0]);
    case 'text-transform':
      return execTextTransform(args as Parameters<typeof execTextTransform>[0]);
    default:
      throw new Error(`未知工具: ${toolName}`);
  }
}

// ========================================
// AI SDK Tool Definitions
// ========================================

function buildToolRegistry(enabledTools: string[]): Record<string, any> {
  const registry: Record<string, any> = {};

  if (enabledTools.includes('image-generation')) {
    registry['image-generation'] = tool({
      description: '根据文字描述生成图片。支持指定宽高比和分辨率档位。',
      inputSchema: z.object({
        prompt: z
          .string()
          .describe('图片内容描述，应详细描述画面内容、风格、色调等'),
        aspectRatio: z
          .enum(['1:1', '16:9', '9:16', '4:3', '3:4', '3:2', '2:3'])
          .optional()
          .describe('画面宽高比，如 16:9、1:1'),
        imageSize: z
          .string()
          .optional()
          .describe('图片分辨率档位，如 1K、2K、4K'),
      }),
    });
  }

  if (enabledTools.includes('video-generation')) {
    registry['video-generation'] = tool({
      description: '根据文字描述生成视频。支持指定宽高比和时长。',
      inputSchema: z.object({
        prompt: z.string().describe('视频内容描述'),
        aspectRatio: z
          .enum(['16:9', '9:16', '1:1'])
          .optional()
          .describe('视频宽高比'),
        duration: z
          .string()
          .optional()
          .describe('视频时长，如 10s、15s'),
      }),
    });
  }

  if (enabledTools.includes('text-transform')) {
    registry['text-transform'] = tool({
      description:
        '对文字执行内置操作：裁剪空白、截断、查找替换、转大写、转小写、首字母大写',
      inputSchema: z.object({
        text: z.string().describe('要处理的文字'),
        operation: z
          .enum([
            'trim',
            'truncate',
            'replace',
            'uppercase',
            'lowercase',
            'capitalize',
          ])
          .describe('要执行的操作'),
        maxLength: z
          .number()
          .optional()
          .describe('truncate 操作的最大长度'),
        search: z
          .string()
          .optional()
          .describe('replace 操作的搜索文字'),
        replacement: z
          .string()
          .optional()
          .describe('replace 操作的替换文字'),
      }),
    });
  }

  return registry;
}

// ========================================
// POST /api/agents/chat
// ========================================

export async function POST(request: NextRequest) {
  try {
    // ---- 1. Auth ----
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return new Response(JSON.stringify({ error: '请先登录' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // ---- 2. Parse request ----
    const body: Record<string, unknown> = await request.json().catch(() => ({}));
    const agentId = String(body.agentId || 'creative-assistant').trim();
    const userMessage = String(body.message || '').trim();
    const incomingSessionId = body.sessionId
      ? String(body.sessionId).trim()
      : '';
    const images: unknown[] = Array.isArray(body.images) ? body.images : [];

    if (!userMessage && images.length === 0) {
      return new Response(JSON.stringify({ error: '请输入消息' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Prompt blocklist check
    await assertPromptsAllowed([userMessage]);

    // ---- 3. Resolve agent ----
    const { agent: agentConfig, chatModel } = await resolveAgentConfig(agentId);

    // ---- 4. Session management ----
    let chatSession: ChatSession | null = null;
    let dbMessages: ChatMessage[] = [];

    if (incomingSessionId) {
      chatSession = await getChatSession(incomingSessionId);
      // Ensure session belongs to the authenticated user
      if (chatSession && chatSession.userId !== session.user.id) {
        chatSession = null;
      }
      if (chatSession) {
        dbMessages = await getSessionMessages(chatSession.id);
      }
    }

    if (!chatSession) {
      chatSession = await createChatSession(
        session.user.id,
        agentConfig.modelId,
        `Agent: ${agentConfig.name}`,
      );
    } else {
      // Bump updated_at
      await updateChatSession(chatSession.id, {}).catch(() => {});
    }

    const currentSessionId = chatSession.id;

    // ---- 5. Save user message ----
    await saveChatMessage({
      sessionId: currentSessionId,
      role: 'user',
      content: userMessage,
      images: images.length > 0 ? images.map(String) : undefined,
      tokenCount: estimateTokens(userMessage, images),
    });

    // ---- 6. Build AI SDK input messages ----
    const systemMsg = {
      role: 'system' as const,
      content: agentConfig.systemPrompt,
    };

    const historyModelMessages = dbMessages.map(toModelMessage);

    // Construct the user message (may include images for vision models)
    let userContent:
      | string
      | Array<{ type: 'text'; text: string } | { type: 'image'; image: string }>;
    if (images.length > 0) {
      userContent = [
        { type: 'text' as const, text: userMessage },
        ...images.map((img) => {
          const raw = String(img);
          return {
            type: 'image' as const,
            image: raw.startsWith('data:') ? raw : `data:image/png;base64,${raw}`,
          };
        }),
      ];
    } else {
      userContent = userMessage;
    }

    const userMsg = { role: 'user' as const, content: userContent };

    // ---- 7. Balance check ----
    const user = await getUserById(session.user.id);
    if (!user) {
      return new Response(JSON.stringify({ error: '用户不存在' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    if (user.disabled) {
      return new Response(JSON.stringify({ error: '账号已被禁用' }), {
        status: 403,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const estimatedCost = agentConfig.costPerMessage;
    if (user.balance < estimatedCost) {
      return new Response(
        JSON.stringify({ error: `余额不足，需要至少 ${estimatedCost} 积分` }),
        { status: 402, headers: { 'Content-Type': 'application/json' } },
      );
    }

    // ---- 8. Build LLM ----
    const customProvider = createOpenAI({
      baseURL: chatModel.apiUrl.replace(/\/$/, '') + '/',
      apiKey: chatModel.apiKey,
    });
    const llm = customProvider.chat(chatModel.modelId);

    // ---- 9. Tool registry ----
    const toolRegistry = buildToolRegistry(agentConfig.tools);
    const hasTools = Object.keys(toolRegistry).length > 0;

    // ---- 10. SSE stream setup ----
    const { stream, send, close } = createSSEStream();

    // The agent loop runs in the background (since `send` writes into the
    // already-returned ReadableStream).
    runAgentLoop({
      llm,
      messages: [systemMsg, ...historyModelMessages, userMsg],
      tools: hasTools ? toolRegistry : undefined,
      agentConfig,
      sessionId: currentSessionId,
      user,
      estimatedCost,
      abortSignal: request.signal,
      send,
      close,
    }).catch((err) => {
      console.error('[Agent] Unhandled loop error:', err);
      try {
        send('error', {
          type: 'error',
          error: err instanceof Error ? err.message : 'Agent 执行失败',
        });
      } catch {
        /* ignore */
      }
      close();
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
        'X-Accel-Buffering': 'no',
      },
    });
  } catch (error) {
    console.error('[Agent API] Error:', error);

    if (isPromptBlockedError(error)) {
      return new Response(
        JSON.stringify({
          error:
            error instanceof Error ? error.message : 'Prompt blocked by safety policy',
        }),
        { status: 400, headers: { 'Content-Type': 'application/json' } },
      );
    }

    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : '请求处理失败',
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } },
    );
  }
}

// ========================================
// Agent Loop
// ========================================

async function runAgentLoop(ctx: {
  llm: ReturnType<ReturnType<typeof createOpenAI>['chat']>;
  messages: any[];
  tools: Record<string, any> | undefined;
  agentConfig: AgentConfig;
  sessionId: string;
  user: User;
  estimatedCost: number;
  abortSignal: AbortSignal;
  send: (event: string, data: unknown) => void;
  close: () => void;
}): Promise<void> {
  const {
    llm,
    messages: initialMessages,
    tools,
    agentConfig,
    sessionId,
    user,
    estimatedCost,
    abortSignal,
    send,
    close,
  } = ctx;

  // The full message history we pass to generateText.
  // Starts with the initial user turn and grows as the tool loop proceeds.
  let allMessages = [...initialMessages];
  const maxSteps = agentConfig.maxSteps;
  let finalText = '';

  try {
    for (let step = 0; step < maxSteps; step++) {
      // ---- Check abort ----
      if (abortSignal.aborted) {
        send('error', { type: 'error', error: '请求已取消' });
        return;
      }

      // ---- Call LLM ----
      const result = await generateText({
        model: llm,
        messages: allMessages,
        tools,
        temperature: agentConfig.temperature,
        abortSignal,
      });

      const stepText = result.text || '';
      if (stepText) {
        finalText = stepText;
        send('text', { type: 'text', content: stepText });
      }

      // ---- Check for tool calls ----
      const toolCalls = result.toolCalls;
      if (!toolCalls || toolCalls.length === 0) {
        // Generation complete — no more tools to call
        break;
      }

      // ---- Replace allMessages with the full conversation from responseMessages ----
      // responseMessages includes all input messages + the new assistant message(s).
      // This preserves the full conversation history for the next turn.
      allMessages = [...(result as any).responseMessages];

      // ---- Execute each tool call ----
      for (let i = 0; i < toolCalls.length; i++) {
        const tc = toolCalls[i];
        const toolName: string = tc.toolName;
        const args: Record<string, unknown> =
          (tc as any).input || (tc as any).args || {};

        // Stream tool_call event
        send('tool_call', {
          type: 'tool_call',
          toolCall: {
            id: tc.toolCallId,
            function: {
              name: toolName,
              arguments: JSON.stringify(args),
            },
          },
        });

        // Execute
        let toolOutput: Record<string, unknown>;
        try {
          toolOutput = await dispatchToolCall(toolName, args);
        } catch (execErr) {
          const errMsg =
            execErr instanceof Error ? execErr.message : '工具执行失败';
          toolOutput = { error: errMsg };

          send('tool_result', {
            type: 'tool_result',
            toolResult: { name: toolName, content: toolOutput },
          });

          // Push error result so the LLM can explain
          allMessages.push({
            role: 'tool',
            content: [
              {
                type: 'tool-result' as const,
                toolCallId: tc.toolCallId,
                toolName,
                output: { error: errMsg },
              },
            ],
          });
          continue;
        }

        // Stream tool_result event
        send('tool_result', {
          type: 'tool_result',
          toolResult: { name: toolName, content: toolOutput },
        });

        // Push tool result so the LLM can continue the conversation
        allMessages.push({
          role: 'tool',
          content: [
            {
              type: 'tool-result' as const,
              toolCallId: tc.toolCallId,
              toolName,
              output: toolOutput,
            },
          ],
        });
      }
    }

    // ---- Save assistant message to DB ----
    if (finalText) {
      try {
        await saveChatMessage({
          sessionId,
          role: 'assistant',
          content: finalText,
          tokenCount: estimateTokens(finalText),
        });
      } catch (saveErr) {
        console.error('[Agent] Failed to save assistant message:', saveErr);
      }
    }

    // ---- Deduct balance ----
    try {
      await updateUserBalance(user.id, -estimatedCost, 'strict');
    } catch (balanceErr) {
      console.error('[Agent] Balance deduction failed:', balanceErr);
    }

    // ---- Update session title from first user message ----
    const firstUserContent = initialMessages.find(
      (m) => m.role === 'user',
    )?.content;
    if (firstUserContent) {
      const raw =
        typeof firstUserContent === 'string'
          ? firstUserContent
          : Array.isArray(firstUserContent)
            ? firstUserContent
                .filter((p) => p.type === 'text')
                .map((p) => p.text)
                .join(' ')
            : '';
      const shortTitle = raw.slice(0, 50).replace(/\n/g, ' ');
      if (shortTitle) {
        await updateChatSession(sessionId, {
          title: `Agent: ${shortTitle}`,
        }).catch(() => {});
      }
    }

    // ---- Done ----
    send('done', {
      type: 'done',
      sessionId,
      content: finalText,
    });
  } catch (error) {
    console.error('[Agent Loop] Error:', error);
    const errMsg =
      error instanceof Error ? error.message : 'Agent 执行异常';

    if (finalText) {
      try {
        await saveChatMessage({
          sessionId,
          role: 'assistant',
          content: `${finalText}\n\n[错误: ${errMsg}]`,
          tokenCount: estimateTokens(finalText),
        });
      } catch {
        /* ignore */
      }
    }

    send('error', { type: 'error', error: errMsg });
  } finally {
    close();
  }
}

// ========================================
// Utility
// ========================================

/**
 * Rough token count estimation.
 * ~1 token per 2 CJK characters; ~1000 tokens per image.
 */
function estimateTokens(text: string, images?: unknown[]): number {
  const charCount = text ? text.length : 0;
  const imageTokens = (images?.length || 0) * 1000;
  return Math.ceil(charCount / 2) + imageTokens;
}
