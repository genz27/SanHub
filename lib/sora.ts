/* eslint-disable no-console */
import { getSystemConfig } from './db';
import type { SoraGenerateRequest, GenerateResult } from '@/types';
import { generateVideo, type VideoGenerationRequest } from './sora-api';

// ========================================
// Sora API 封装 (Non-Streaming)
// ========================================

// 获取生成类型和成本
function getTypeAndCost(
  model: string,
  pricing: { soraVideo10s: number; soraVideo15s: number; soraVideo25s: number }
): { type: 'sora-video'; cost: number } {
  if (model.includes('25s') || model.includes('25')) {
    return { type: 'sora-video', cost: pricing.soraVideo25s };
  }
  if (model.includes('15s') || model.includes('15')) {
    return { type: 'sora-video', cost: pricing.soraVideo15s };
  }
  return { type: 'sora-video', cost: pricing.soraVideo10s };
}

// 从模型名称解析方向、时长和分辨率
// 前端传入: sora2-landscape-10s, sora2-portrait-15s 等
// API 需要: model=sora-2, orientation=landscape, seconds=10
function parseModelParams(model: string): {
  apiModel: 'sora-2' | 'sora-2-pro';
  orientation: 'landscape' | 'portrait';
  seconds: '10' | '15' | '25';
  size?: string;
} {
  let apiModel: 'sora-2' | 'sora-2-pro' = 'sora-2';
  let orientation: 'landscape' | 'portrait' = 'landscape';
  let seconds: '10' | '15' | '25' = '10';

  // 检查是否使用 pro 模型
  if (model.includes('pro')) {
    apiModel = 'sora-2-pro';
  }

  // 解析方向
  if (model.includes('portrait')) {
    orientation = 'portrait';
  }

  // 解析时长
  if (model.includes('25s') || model.includes('25')) {
    seconds = '25';
  } else if (model.includes('15s') || model.includes('15')) {
    seconds = '15';
  }

  // 根据方向设置默认分辨率
  const size = orientation === 'portrait' ? '720x1280' : '1280x720';

  return { apiModel, orientation, seconds, size };
}

// 生成内容 (Non-Streaming)
export async function generateWithSora(
  request: SoraGenerateRequest,
  onProgress?: (progress: number) => void
): Promise<GenerateResult> {
  const config = await getSystemConfig();

  console.log('[Sora] 请求配置:', {
    model: request.model,
    prompt: request.prompt?.substring(0, 50),
    hasFiles: request.files && request.files.length > 0,
    filesCount: request.files?.length || 0,
  });

  // 解析模型参数
  const { apiModel, orientation, seconds, size } = parseModelParams(request.model);

  // 构建非流式 API 请求
  const videoRequest: VideoGenerationRequest = {
    prompt: request.prompt,
    model: apiModel, // 使用解析后的 API 模型名 (sora-2 或 sora-2-pro)
    orientation,
    seconds,
    size,
  };

  // 如果有参考图片，添加到请求
  if (request.files && request.files.length > 0) {
    const imageFile = request.files.find(f => f.mimeType.startsWith('image/'));
    if (imageFile) {
      videoRequest.input_image = imageFile.data;
    }
  }

  // 添加风格和 Remix 参数
  if (request.style_id) {
    videoRequest.style_id = request.style_id;
  }
  if (request.remix_target_id) {
    videoRequest.remix_target_id = request.remix_target_id;
  }

  // 调用非流式 API，传递进度回调
  const result = await generateVideo(videoRequest, onProgress ? (progress) => onProgress(progress) : undefined);

  if (!result.data || result.data.length === 0 || !result.data[0].url) {
    throw new Error('视频生成失败：未返回有效的视频 URL');
  }

  const first = result.data[0];

  const { type, cost } = getTypeAndCost(request.model, config.pricing);

  console.log('[Sora] 生成成功:', { type, url: result.data[0].url, cost });

  return {
    type,
    url: first.url,
    cost,
    permalink: typeof first.permalink === 'string' ? first.permalink : undefined,
    revised_prompt: typeof first.revised_prompt === 'string' ? first.revised_prompt : undefined,
  };
}
