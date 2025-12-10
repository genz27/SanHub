import { getSystemConfig } from './db';
import type { SoraGenerateRequest, GenerateResult } from '@/types';
import { fetch as undiciFetch, Agent } from 'undici';

// ========================================
// Sora API 封装
// ========================================

// 创建自定义 Agent，禁用 body timeout
const soraAgent = new Agent({
  bodyTimeout: 0, // 禁用 body timeout
  headersTimeout: 240000, // 240 秒 headers timeout
  keepAliveTimeout: 60000, // 60 秒 keep-alive
  keepAliveMaxTimeout: 1200000, // 20 分钟
  pipelining: 0, // 禁用 HTTP 管道，避免连接复用问题
  connections: 30, // 最大连接数
  connect: {
    timeout: 120000, // 连接超时 120 秒
  },
});

// 检查是否是可重试的错误
function isRetryableError(error: unknown): boolean {
  if (error instanceof Error) {
    const msg = error.message.toLowerCase();
    return (
      msg.includes('terminated') ||
      msg.includes('socket') ||
      msg.includes('closed') ||
      msg.includes('econnreset') ||
      msg.includes('etimedout') ||
      msg.includes('enotfound') ||
      msg.includes('network')
    );
  }
  return false;
}

// 延迟函数
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// 从返回内容中提取视频 URL
function extractVideoUrl(content: string): string {
  if (!content) return '';

  let clean = content.trim();

  // 去掉 ```html 包裹
  if (clean.startsWith('```')) {
    const firstNewLine = clean.indexOf('\n');
    if (firstNewLine !== -1) {
      clean = clean.slice(firstNewLine + 1);
    }
    if (clean.endsWith('```')) {
      clean = clean.slice(0, -3);
    }
  }

  // 优先从 <video src="..."> 中取
  const videoMatch = clean.match(/<video[^>]*\s+src=['"]([^'"]+)['"][^>]*>/i);
  if (videoMatch) {
    return videoMatch[1];
  }

  // 次选：任意 http(s) 链接
  const urlMatch = clean.match(/https?:\/\/[^\s"'<>]+/);
  if (urlMatch) {
    return urlMatch[0];
  }

  return '';
}

// 获取生成类型和成本
function getTypeAndCost(
  model: string,
  pricing: { soraVideo10s: number; soraVideo15s: number }
): { type: 'sora-video'; cost: number } {
  if (model.includes('15s')) {
    return { type: 'sora-video', cost: pricing.soraVideo15s };
  }
  return { type: 'sora-video', cost: pricing.soraVideo10s };
}

// 生成内容
export async function generateWithSora(
  request: SoraGenerateRequest
): Promise<GenerateResult> {
  const config = await getSystemConfig();

  if (!config.soraApiKey) {
    throw new Error('Sora API Key 未配置，请在管理后台配置 API 密钥');
  }

  if (!config.soraBaseUrl) {
    throw new Error('Sora Base URL 未配置');
  }

  const baseUrl = config.soraBaseUrl.replace(/\/$/, '');
  const apiUrl = `${baseUrl}/v1/chat/completions`;

  console.log('[Sora] 请求配置:', {
    apiUrl,
    model: request.model,
    hasFiles: request.files && request.files.length > 0,
    filesCount: request.files?.length || 0,
  });

  // 构建 messages.content
  const content: Array<{ type: string; [key: string]: unknown }> = [];

  // 先添加文本
  if (request.prompt) {
    content.push({
      type: 'text',
      text: request.prompt,
    });
  }

  // 再添加图片/视频
  if (request.files && request.files.length > 0) {
    request.files.forEach((file) => {
      if (file.mimeType.startsWith('image/')) {
        content.push({
          type: 'image_url',
          image_url: {
            url: `data:${file.mimeType};base64,${file.data}`,
          },
        });
      } else if (file.mimeType.startsWith('video/')) {
        content.push({
          type: 'video_url',
          video_url: {
            url: `data:${file.mimeType};base64,${file.data}`,
          },
        });
      }
    });
  }

  const finalContent =
    content.length === 1 && content[0].type === 'text'
      ? content[0].text
      : content;

  const payload = {
    model: request.model,
    messages: [
      {
        role: 'user',
        content: finalContent,
      },
    ],
    stream: true,
  };

  let response: Awaited<ReturnType<typeof undiciFetch>>;
  const maxRetries = 3;
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      // 创建 AbortController 用于超时控制（20分钟）
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 20 * 60 * 1000);
      
      console.log(`[Sora] 请求尝试 ${attempt}/${maxRetries}`);
      
      // 使用 undici fetch，禁用 body timeout
      response = await undiciFetch(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${config.soraApiKey}`,
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
        dispatcher: soraAgent,
      });
      
      clearTimeout(timeoutId);
      break; // 成功，跳出重试循环
    } catch (fetchError) {
      lastError = fetchError instanceof Error ? fetchError : new Error(String(fetchError));
      console.error(`[Sora] 请求失败 (尝试 ${attempt}/${maxRetries}):`, lastError.message);
      
      // 检查是否是可重试的错误
      if (attempt < maxRetries && isRetryableError(fetchError)) {
        const retryDelay = attempt * 2000; // 递增延迟：2s, 4s, 6s
        console.log(`[Sora] ${retryDelay}ms 后重试...`);
        await delay(retryDelay);
        continue;
      }
      
      throw new Error(
        `无法连接到 Sora API 服务 (${baseUrl})，请检查：\n` +
        `1. Base URL 是否正确\n` +
        `2. 服务是否正在运行\n` +
        `3. 网络连接是否正常\n` +
        `错误详情: ${lastError.message}`
      );
    }
  }

  // 检查 response 是否被赋值
  if (!response!) {
    throw new Error(lastError?.message || '请求失败');
  }

  if (!response.ok) {
    const errorText = await response.text();
    console.error('[Sora] API 返回错误:', {
      status: response.status,
      statusText: response.statusText,
      body: errorText,
    });

    let errMsg = errorText;
    try {
      const errJson = JSON.parse(errorText);
      errMsg = errJson.error?.message || errJson.message || errorText;
    } catch {
      // ignore
    }
    throw new Error(`Sora API 错误 (${response.status}): ${errMsg}`);
  }

  // 解析 SSE 流
  const reader = response.body?.getReader();
  if (!reader) {
    throw new Error('无法读取响应流');
  }

  const decoder = new TextDecoder();
  let buffer = '';
  let fullContent = '';
  let chunkCount = 0;
  const rawChunks: string[] = []; // 保存原始数据用于调试

  try {
    // 添加超时保护（20分钟）
    const timeout = 20 * 60 * 1000;
    const startTime = Date.now();

    console.log('[Sora] 开始读取流式响应...');

    while (true) {
      if (Date.now() - startTime > timeout) {
        reader.cancel();
        throw new Error('请求超时，生成时间超过 20 分钟');
      }

      const { done, value } = await reader.read();
      if (done) {
        console.log('[Sora] 流式响应结束，共收到', chunkCount, '个数据块');
        break;
      }

      const chunk = decoder.decode(value, { stream: true });
      chunkCount++;
      buffer += chunk;
      
      // 保存前 10 个原始数据块用于调试
      if (rawChunks.length < 10) {
        rawChunks.push(chunk);
      }
      
      
      // 按行分割处理（支持 \n 和 \r\n）
      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop() || ''; // 保留最后一个不完整的行

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith('data:')) continue;

        const dataStr = trimmed.slice(5).trim();
        if (!dataStr || dataStr === '[DONE]') {
          if (dataStr === '[DONE]') {
            console.log('[Sora] 收到 [DONE] 信号');
          }
          continue;
        }

        try {
          const json = JSON.parse(dataStr);
          const delta = json?.choices?.[0]?.delta || {};
          
          // 同时检查 content 和 reasoning_content（Sora API 可能使用不同字段）
          const textContent = delta.content || delta.reasoning_content || '';
          if (textContent) {
            fullContent += textContent;
          }
        } catch (parseError) {
          // 忽略解析失败
        }
      }
    }
    
    console.log('[Sora] 流式响应完成，数据块数:', chunkCount, '内容长度:', fullContent.length);
    
    // 处理 buffer 中剩余的数据
    if (buffer.trim()) {
      const trimmed = buffer.trim();
      if (trimmed.startsWith('data:')) {
        const dataStr = trimmed.slice(5).trim();
        if (dataStr && dataStr !== '[DONE]') {
          try {
            const json = JSON.parse(dataStr);
            const delta = json?.choices?.[0]?.delta || {};
            const textContent = delta.content || delta.reasoning_content || '';
            if (textContent) {
              fullContent += textContent;
            }
          } catch {
            // ignore
          }
        }
      }
    }
  } catch (streamError) {
    console.error('[Sora] 流读取错误:', streamError);
    try {
      reader.cancel();
    } catch {
      // ignore cancel error
    }
    
    // 如果已经收集到了部分内容，尝试解析
    if (fullContent) {
      const partialUrl = extractVideoUrl(fullContent);
      if (partialUrl) {
        console.log('[Sora] 从部分响应中恢复结果:', partialUrl);
        const { type, cost } = getTypeAndCost(request.model, config.pricing);
        return { type, url: partialUrl, cost };
      }
    }
    
    // 检查是否是可重试的连接错误
    const errMsg = streamError instanceof Error ? streamError.message : String(streamError);
    if (errMsg.includes('terminated') || errMsg.includes('socket') || errMsg.includes('closed')) {
      throw new Error(
        '连接被远程服务器关闭，这通常是因为生成时间过长。请稍后在历史记录中查看结果，或重新尝试。'
      );
    }
    
    throw new Error(`读取响应流时出错: ${errMsg}`);
  }


  // 检测内容违规错误
  const contentViolationPatterns = [
    /sora_content_violation/i,
    /content_violation/i,
    /do not support.*photorealistic people/i,
    /violat(e|ion|ing)/i,
    /"kind"\s*:\s*"sora_/i,
  ];
  
  for (const pattern of contentViolationPatterns) {
    if (pattern.test(fullContent)) {
      // 尝试提取具体的错误原因
      let reasonStr = '内容违规';
      const reasonMatch = fullContent.match(/"reason_str"\s*:\s*"([^"]+)"/);
      if (reasonMatch) {
        reasonStr = reasonMatch[1];
      } else {
        const markdownMatch = fullContent.match(/"markdown_reason_str"\s*:\s*"([^"]+)"/);
        if (markdownMatch) {
          reasonStr = markdownMatch[1];
        }
      }
      console.error('[Sora] 检测到内容违规:', reasonStr);
      throw new Error(`Sora 内容审核未通过: ${reasonStr}`);
    }
  }

  const resultUrl = extractVideoUrl(fullContent);
  if (!resultUrl) {
    console.error('[Sora] 无法解析结果 URL，完整内容:', fullContent);
    throw new Error(
      '未能从返回内容中解析出结果 URL。\n' +
      `返回内容: ${fullContent.substring(0, 200)}...`
    );
  }

  const { type, cost } = getTypeAndCost(request.model, config.pricing);

  console.log('[Sora] 生成成功:', { type, url: resultUrl, cost });

  return {
    type,
    url: resultUrl,
    cost,
  };
}
