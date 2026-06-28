/* eslint-disable no-console */
import { NextRequest } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getAgentPreset } from '@/agent/presets';
import { getChatModels, createChatSession, saveChatMessage, getUserById, updateUserBalance, getImageModels } from '@/lib/db';
import { generateImage as generateImageFromLib } from '@/lib/image-generator';
import { generateVideo } from '@/lib/sora-api';
import { processVideoPrompt } from '@/lib/prompt-processor';
import { assertPromptsAllowed, isPromptBlockedError } from '@/lib/prompt-blocklist';
import { generateId } from '@/lib/utils';
import { saveMediaAsync } from '@/lib/media-storage';
import type { ChatModel } from '@/types';

export const maxDuration = 600;
export const dynamic = 'force-dynamic';

// ========================================
// Tool Definitions (OpenAI-format JSON Schema)
// ========================================

const TOOL_DEFINITIONS: Record<string, any> = {
  'image-generation': {
    type: 'function',
    function: {
      name: 'image-generation',
      description: '根据文字描述生成图片。支持指定宽高比和分辨率档位。',
      parameters: {
        type: 'object',
        properties: {
          prompt: { type: 'string', description: '图片内容描述，应详细描述画面内容、风格、色调等' },
          aspectRatio: { type: 'string', enum: ['1:1', '16:9', '9:16', '4:3', '3:4', '3:2', '2:3'], description: '画面宽高比' },
          imageSize: { type: 'string', description: '图片分辨率档位，如 1K、2K、4K' },
        },
        required: ['prompt'],
      },
    },
  },
  'video-generation': {
    type: 'function',
    function: {
      name: 'video-generation',
      description: '根据文字描述生成视频。支持指定宽高比和时长。',
      parameters: {
        type: 'object',
        properties: {
          prompt: { type: 'string', description: '视频内容描述' },
          aspectRatio: { type: 'string', enum: ['16:9', '9:16', '1:1'], description: '视频宽高比' },
          duration: { type: 'string', description: '视频时长，如 10s、15s' },
        },
        required: ['prompt'],
      },
    },
  },
  'text-transform': {
    type: 'function',
    function: {
      name: 'text-transform',
      description: '对文字执行内置操作：裁剪空白、截断、查找替换、转大写、转小写、首字母大写',
      parameters: {
        type: 'object',
        properties: {
          text: { type: 'string', description: '要处理的文字' },
          operation: { type: 'string', enum: ['trim', 'truncate', 'replace', 'uppercase', 'lowercase', 'capitalize'], description: '要执行的操作' },
          maxLength: { type: 'number', description: 'truncate 操作的最大长度' },
          search: { type: 'string', description: 'replace 操作的搜索文字' },
          replacement: { type: 'string', description: 'replace 操作的替换文字' },
        },
        required: ['text', 'operation'],
      },
    },
  },
};

// ========================================
// Tool Executors
// ========================================

async function execImageGeneration(args: any): Promise<any> {
  const models = await getImageModels(true);
  if (models.length === 0) throw new Error('没有可用的图片生成模型');
  const targetModel = models[0];
  const result = await generateImageFromLib({
    modelId: targetModel.id, prompt: args.prompt,
    aspectRatio: args.aspectRatio || targetModel.defaultAspectRatio,
    imageSize: args.imageSize,
    idempotencyKey: `agent-img-${generateId()}`,
  });
  const savedUrl = await saveMediaAsync(`agent-img-${generateId()}`, result.url);
  return { url: savedUrl, revised_prompt: result.revised_prompt };
}

async function execVideoGeneration(args: any): Promise<any> {
  const processed = args.prompt ? await processVideoPrompt(args.prompt).catch(() => undefined) : undefined;
  const effectivePrompt = processed?.processedPrompt || args.prompt;
  const result = await generateVideo(
    { prompt: effectivePrompt, model: 'sora-2', orientation: args.aspectRatio === '9:16' ? 'portrait' : 'landscape', seconds: args.duration },
    undefined, {},
  );
  const videoUrl = result.data?.[0]?.url;
  let savedUrl = '';
  if (videoUrl) savedUrl = await saveMediaAsync(`agent-vid-${generateId()}`, videoUrl);
  return { taskId: result.id, url: savedUrl, message: savedUrl ? `视频已生成: ${savedUrl}` : '视频正在后台处理中' };
}

function execTextTransform(args: any): any {
  let result = args.text;
  switch (args.operation) {
    case 'trim': result = result.trim(); break;
    case 'truncate': if (args.maxLength && result.length > args.maxLength) result = result.slice(0, args.maxLength) + '...'; break;
    case 'replace': if (args.search !== undefined && args.replacement !== undefined) result = result.split(args.search).join(args.replacement); break;
    case 'uppercase': result = result.toUpperCase(); break;
    case 'lowercase': result = result.toLowerCase(); break;
    case 'capitalize': if (result.length > 0) result = result.charAt(0).toUpperCase() + result.slice(1); break;
  }
  return { result };
}

// ========================================
// POST /api/agents/chat
// ========================================

export async function POST(request: NextRequest) {
  try {
    // Auth
    const session = await getServerSession(authOptions);
    if (!session?.user) return new Response(JSON.stringify({ error: '请先登录' }), { status: 401, headers: { 'Content-Type': 'application/json' } });

    // Parse
    const body = await request.json().catch(() => ({}));
    const agentId = String(body.agentId || 'creative-assistant').trim();
    const userMessage = String(body.message || '').trim();
    const images: string[] = Array.isArray(body.images) ? body.images : [];
    if (!userMessage && images.length === 0) return new Response(JSON.stringify({ error: '请输入消息' }), { status: 400, headers: { 'Content-Type': 'application/json' } });

    await assertPromptsAllowed([userMessage]);

    // Load agent + model
    const preset = getAgentPreset(agentId);
    if (!preset) return new Response(JSON.stringify({ error: `未知 Agent: ${agentId}` }), { status: 404, headers: { 'Content-Type': 'application/json' } });
    const models = await getChatModels(true);
    if (models.length === 0) return new Response(JSON.stringify({ error: '没有可用的聊天模型' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
    const chatModel = models[0];

    // Balance check
    const user = await getUserById(session.user.id);
    if (!user) return new Response(JSON.stringify({ error: '用户不存在' }), { status: 401, headers: { 'Content-Type': 'application/json' } });
    if (user.disabled) return new Response(JSON.stringify({ error: '账号已被禁用' }), { status: 403, headers: { 'Content-Type': 'application/json' } });
    if (user.balance < chatModel.costPerMessage) return new Response(JSON.stringify({ error: `余额不足，需要 ${chatModel.costPerMessage} 积分` }), { status: 402, headers: { 'Content-Type': 'application/json' } });

    // Session
    const titlePrefix = userMessage.slice(0, 50).replace(/\n/g, ' ');
    const chatSession = await createChatSession(session.user.id, chatModel.modelId, `Agent: ${titlePrefix}`);
    const sessionId = chatSession.id;
    await saveChatMessage({ sessionId, role: 'user', content: userMessage, images: images.length > 0 ? images : undefined, tokenCount: Math.ceil(userMessage.length / 2) }).catch(() => {});

    // API config
    const apiUrl = chatModel.apiUrl.replace(/\/chat\/completions\/?$/i, '').replace(/\/$/, '') + '/chat/completions';
    const apiKey = chatModel.apiKey;
    const modelId = chatModel.modelId;

    // Build system + user messages
    let userContent: any = userMessage;
    if (images.length > 0) {
      userContent = [{ type: 'text', text: userMessage }];
      for (const img of images) {
        const raw = String(img);
        userContent.push({ type: 'image_url', image_url: { url: raw.startsWith('data:') ? raw : `data:image/png;base64,${raw}` } });
      }
    }

    const allMessages: any[] = [
      { role: 'system', content: preset.systemPrompt },
      { role: 'user', content: userContent },
    ];

    const enabledTools = preset.tools.map((t) => TOOL_DEFINITIONS[t]).filter(Boolean);

    // SSE setup
    const encoder = new TextEncoder();
    let streamClosed = false;
    let controller: ReadableStreamDefaultController<Uint8Array>;
    const stream = new ReadableStream<Uint8Array>({
      start(c) { controller = c; },
      cancel() { streamClosed = true; },
    });
    const send = (event: string, data: any) => {
      if (streamClosed) return;
      try { controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)); } catch { streamClosed = true; }
    };
    const close = () => { if (!streamClosed) { streamClosed = true; try { controller.close(); } catch {} } };

    // Background execution
    (async () => {
      try {
        let finalText = '';
        let currentMessages = [...allMessages];

        for (let step = 0; step < 8; step++) {
          if (request.signal.aborted) { send('error', { type: 'error', error: '请求已取消' }); close(); return; }

          // Call API
          const body: any = { model: modelId, messages: currentMessages, max_tokens: 2000 };
          if (enabledTools.length > 0) body.tools = enabledTools;

          const res = await fetch(apiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
            body: JSON.stringify(body),
          });

          if (!res.ok) { const t = await res.text(); send('error', { type: 'error', error: `API 错误 (${res.status}): ${t.slice(0, 200)}` }); break; }

          const data = await res.json();
          const choice = data.choices?.[0]?.message;
          if (!choice) { send('error', { type: 'error', error: 'API 返回空响应' }); break; }

          const content = choice.content || '';
          const toolCalls = choice.tool_calls;

          // Stream text
          if (content) {
            finalText += content;
            send('text', { type: 'text', content: finalText });
          }

          // Add assistant response to messages
          const assistantMsg: any = { role: 'assistant', content };
          if (toolCalls && toolCalls.length > 0) {
            assistantMsg.tool_calls = toolCalls;
          }
          currentMessages.push(assistantMsg);

          // No tool calls = done
          if (!toolCalls || toolCalls.length === 0) break;

          // Execute tool calls
          for (const tc of toolCalls) {
            const toolName = tc.function.name;
            let args: any = {};
            try { args = JSON.parse(tc.function.arguments); } catch {}

            send('tool_call', { type: 'tool_call', toolCall: { id: tc.id, function: { name: toolName, arguments: tc.function.arguments } } });

            let result: any;
            let isError = false;
            try {
              switch (toolName) {
                case 'image-generation': result = await execImageGeneration(args); break;
                case 'video-generation': result = await execVideoGeneration(args); break;
                case 'text-transform': result = execTextTransform(args); break;
                default: throw new Error(`未知工具: ${toolName}`);
              }
            } catch (err: any) {
              result = { error: err.message || '工具执行失败' };
              isError = true;
            }

            send('tool_result', { type: 'tool_result', toolResult: { name: toolName, content: result, isError } });

            // Push tool result for next LLM turn
            currentMessages.push({ role: 'tool', tool_call_id: tc.id, content: JSON.stringify(result) });
          }
        }

        // Save + deduct balance
        if (finalText) {
          await saveChatMessage({ sessionId, role: 'assistant', content: finalText, tokenCount: Math.ceil(finalText.length / 2) }).catch(() => {});
          await updateUserBalance(session.user.id, -chatModel.costPerMessage, 'strict').catch(() => {});
        }

        send('done', { type: 'done', sessionId, content: finalText });
      } catch (err: any) {
        console.error('[Agent] Error:', err);
        send('error', { type: 'error', error: err.message || '执行失败' });
      } finally {
        close();
      }
    })();

    return new Response(stream, {
      headers: { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-cache', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' },
    });

  } catch (error) {
    console.error('[Agent API] Error:', error);
    if (isPromptBlockedError(error)) return new Response(JSON.stringify({ error: error instanceof Error ? error.message : 'Prompt blocked' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : '请求处理失败' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
}
