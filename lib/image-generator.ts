/**
 * Unified image generator entry. Channel adapters load on demand.
 */

import type { GenerateResult } from '@/types';
import type { ImageGenerateRequest } from './image-generator-shared';
import { resolveImageTarget, type ResolutionMap, type ResolvedImageTarget } from './image-target';

function isGoogleGeminiNativeBaseUrl(baseUrl: string): boolean {
  return baseUrl.toLowerCase().includes('generativelanguage.googleapis.com');
}

export type { ImageGenerateRequest } from './image-generator-shared';
export { resolveImageTarget };
export type { ResolutionMap, ResolvedImageTarget };

export async function generateImage(request: ImageGenerateRequest): Promise<GenerateResult> {
  const { getImageModelWithChannel } = await import('./db/image-catalog-runtime');
  const modelConfig = await getImageModelWithChannel(request.modelId);
  if (!modelConfig) {
    throw new Error('模型不存在或未配置');
  }

  const { model, channel, effectiveBaseUrl, effectiveApiKey } = modelConfig;

  if (!model.enabled) {
    throw new Error('模型已禁用');
  }
  if (!channel.enabled) {
    throw new Error('渠道已禁用');
  }
  if (!effectiveBaseUrl) {
    throw new Error('未配置 Base URL');
  }
  if (!effectiveApiKey) {
    throw new Error('未配置 API Key');
  }

  const resolvedTarget = resolveImageTarget(
    model.apiModel,
    model.resolutions as ResolutionMap | undefined,
    request.aspectRatio,
    request.imageSize
  );

  let result: GenerateResult;

  switch (channel.type) {
    case 'apexerapi':
    case 'openai-compatible': {
      const { generateWithOpenAI } = await import('./image-openai');
      result = await generateWithOpenAI(
        request,
        effectiveBaseUrl,
        effectiveApiKey,
        resolvedTarget,
        channel.id
      );
      break;
    }

    case 'openai-chat': {
      const { generateWithOpenAIChat } = await import('./image-openai-chat');
      result = await generateWithOpenAIChat(
        request,
        effectiveBaseUrl,
        effectiveApiKey,
        resolvedTarget.model,
        channel.id
      );
      break;
    }

    case 'gemini': {
      if (isGoogleGeminiNativeBaseUrl(effectiveBaseUrl)) {
        const { generateWithGemini } = await import('./image-gemini');
        result = await generateWithGemini(
          request,
          effectiveBaseUrl,
          effectiveApiKey,
          resolvedTarget.model,
          channel.id
        );
      } else {
        const { generateWithOpenAI } = await import('./image-openai');
        result = await generateWithOpenAI(
          request,
          effectiveBaseUrl,
          effectiveApiKey,
          resolvedTarget,
          channel.id
        );
      }
      break;
    }

    case 'modelscope': {
      const { generateWithModelScope } = await import('./image-modelscope');
      result = await generateWithModelScope(
        request,
        effectiveBaseUrl,
        effectiveApiKey,
        model.apiModel,
        channel.id,
        resolvedTarget.size
      );
      break;
    }

    case 'gitee': {
      const { generateWithGitee } = await import('./image-gitee');
      result = await generateWithGitee(
        request,
        effectiveBaseUrl,
        effectiveApiKey,
        model.apiModel,
        channel.id,
        resolvedTarget.size
      );
      break;
    }

    case 'sora': {
      const { generateWithSoraImage } = await import('./image-sora-channel');
      result = await generateWithSoraImage(
        request,
        effectiveBaseUrl,
        effectiveApiKey,
        model.apiModel,
        channel.id
      );
      break;
    }

    default:
      throw new Error(`不支持的渠道类型: ${channel.type}`);
  }

  result.cost = model.costPerGeneration;
  return result;
}
