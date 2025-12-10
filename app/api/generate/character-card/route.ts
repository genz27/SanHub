import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { saveCharacterCard, updateCharacterCard, deleteCharacterCard, getUserById, getSystemConfig } from '@/lib/db';
import { fetch as undiciFetch, Agent } from 'undici';

// 创建自定义 Agent，禁用 body timeout，适用于长时间视频处理
const characterCardAgent = new Agent({
  bodyTimeout: 0, // 禁用 body timeout
  headersTimeout: 240000, // 240 秒 headers timeout
  keepAliveTimeout: 60000, // 60 秒 keep-alive
  keepAliveMaxTimeout: 1200000, // 20 分钟
  pipelining: 0, // 禁用 HTTP 管道
  connections: 30,
  connect: {
    timeout: 120000, // 连接超时 120 秒
  },
});

// 配置路由段选项
export const maxDuration = 300; // 5分钟超时
export const dynamic = 'force-dynamic';

interface CharacterCardRequest {
  videoBase64: string; // base64 编码的视频数据
  firstFrameBase64: string; // 视频第一帧的 base64 图片
}

// 从返回的文本中尽可能提取角色名（不带 @）
function extractCharacterNameFromText(text: string): string | null {
  if (!text) return null;

  // 1) 优先匹配中文提示：角色名@lotuswhisp719
  let m = text.match(/角色名\s*@([\w]+)/);
  if (m && m[1]) return m[1];

  // 2) 匹配括号内的 @id：Lotus Whisper (@lotuswhisp719)
  m = text.match(/\(@([\w]+)\)/);
  if (m && m[1]) return m[1];

  // 3) 通用：任意出现的 @id（取最后一次出现）
  const re = /@([\w]+)/g;
  let lastId: string | null = null;
  // 使用 exec 循环以兼容较低的 TS 目标配置
  while (true) {
    const match = re.exec(text);
    if (!match) break;
    if (match[1]) lastId = match[1];
  }
  if (lastId) return lastId;

  return null;
}

// 流式处理角色卡生成
async function processCharacterCardStream(
  videoBase64: string,
  onProgress: (message: string) => void,
  onComplete: (characterName: string) => void,
  onError: (error: string) => void
): Promise<void> {
  try {
    // 获取系统配置中的 Sora API 地址和密钥
    const config = await getSystemConfig();
    if (!config.soraBaseUrl) {
      throw new Error('Sora Base URL 未配置');
    }
    if (!config.soraApiKey) {
      throw new Error('Sora API Key 未配置');
    }
    const baseUrl = config.soraBaseUrl.replace(/\/$/, '');
    const apiUrl = `${baseUrl}/v1/chat/completions`;

    // 使用 undici fetch 支持长连接
    const response = await undiciFetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.soraApiKey}`,
      },
      body: JSON.stringify({
        model: 'sora-video-landscape-10s',
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'video_url',
                video_url: {
                  url: `data:video/mp4;base64,{${videoBase64}}`,
                },
              },
            ],
          },
        ],
        stream: true,
      }),
      dispatcher: characterCardAgent,
    });

    if (!response.ok) {
      throw new Error(`API 请求失败: ${response.status}`);
    }

    if (!response.body) {
      throw new Error('响应没有 body');
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let characterName = '';
    let finalContent = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6).trim();
          if (data === '[DONE]') {
            continue;
          }

          try {
            console.log('[SSE] RAW data:', data);
            const parsed = JSON.parse(data);
            console.log('[SSE] parsed:', JSON.stringify(parsed, null, 2));
            
            // 检测 error 块
            if (parsed.error) {
              const errorMsg = parsed.error.message || 'API 返回错误';
              console.log('[SSE] ERROR detected:', errorMsg);
              onError(errorMsg);
              return;
            }
            
            const choice = parsed.choices?.[0];
            if (choice) {
              console.log('[SSE] choice:', JSON.stringify(choice, null, 2));
              const reasoningContent = choice.delta?.reasoning_content;
              const content = choice.delta?.content;

              if (reasoningContent) {
                onProgress(reasoningContent);
                // 尝试从 reasoning_content 中提取角色名
                const extracted = extractCharacterNameFromText(reasoningContent);
                console.log('[SSE] reasoning_content:', reasoningContent.substring(0, 100));
                console.log('[SSE] extracted from reasoning:', extracted);
                if (extracted) {
                  characterName = extracted;
                }
              }

              if (content) {
                finalContent += content;
                // 从最终内容中提取角色名
                const extracted = extractCharacterNameFromText(content);
                console.log('[SSE] content:', content);
                console.log('[SSE] extracted from content:', extracted);
                if (extracted) {
                  characterName = extracted;
                }
              }

              if (choice.finish_reason === 'STOP' || choice.finish_reason === 'stop') {
                console.log('[SSE] FINAL characterName:', characterName);
                onComplete(characterName || '未命名角色');
                return;
              }
            }
          } catch (parseError) {
            // 忽略解析错误，继续处理
            console.error('解析 SSE 数据失败:', parseError);
          }
        }
      }
    }

    // 如果循环结束还没有完成（没有收到 STOP）
    console.log('[SSE] Stream ended without STOP, finalContent:', finalContent);
    console.log('[SSE] Stream ended, characterName:', characterName);
    
    // 如果没有获取到角色名，视为失败
    if (!characterName) {
      onError('角色卡生成失败：未能获取角色名，请重试');
      return;
    }
    
    onComplete(characterName);
  } catch (error) {
    console.error('角色卡生成失败:', error);
    onError(error instanceof Error ? error.message : '生成失败');
  }
}

export async function POST(request: NextRequest) {
  try {
    // 验证登录
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: '请先登录' }, { status: 401 });
    }

    const body: CharacterCardRequest = await request.json();

    if (!body.videoBase64) {
      return NextResponse.json(
        { error: '请上传视频文件' },
        { status: 400 }
      );
    }

    // 获取最新用户信息
    const user = await getUserById(session.user.id);
    if (!user) {
      return NextResponse.json({ error: '用户不存在' }, { status: 401 });
    }

    // 创建角色卡记录（状态为 processing，历史记录中可见）
    const card = await saveCharacterCard({
      userId: user.id,
      characterName: '',
      avatarUrl: body.firstFrameBase64,
      sourceVideoUrl: undefined,
      status: 'processing',
    });

    // 创建流式响应
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        const sendEvent = (event: string, data: any) => {
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({ event, data })}\n\n`)
          );
        };

        sendEvent('started', { id: card.id });

        await processCharacterCardStream(
          body.videoBase64,
          (message) => {
            sendEvent('progress', { message });
          },
          async (characterName) => {
            // 成功时更新为 completed
            await updateCharacterCard(card.id, {
              characterName,
              status: 'completed',
            });
            sendEvent('completed', { 
              id: card.id, 
              characterName,
              avatarUrl: body.firstFrameBase64,
            });
            controller.enqueue(encoder.encode('data: [DONE]\n\n'));
            controller.close();
          },
          async (error) => {
            // 失败时删除记录（刷新后消失）
            await deleteCharacterCard(card.id, user.id);
            sendEvent('error', { message: error });
            controller.enqueue(encoder.encode('data: [DONE]\n\n'));
            controller.close();
          }
        );
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    });
  } catch (error) {
    console.error('[API] Character card generation error:', error);
    
    const errorMessage = error instanceof Error ? error.message : '生成失败';
    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    );
  }
}
