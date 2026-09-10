/* eslint-disable no-console */
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import type { ImageGenerateRequest } from '@/lib/image-generator';
import { resolveImageTarget } from '@/lib/image-target';
import { getGenerationByClientRequestId } from '@/lib/db/generation-client-request';
import {
  refundGenerationBalance,
  updateGeneration,
  updateGenerationProgress,
} from '@/lib/db/generation-mutations';
import { saveGeneration } from '@/lib/db/generation-writes';
import { getImageModelWithChannel } from '@/lib/db/image-catalog-runtime';
import { getRateLimitConfig } from '@/lib/db/system-config-rate-limit';
import { updateUserBalance } from '@/lib/db/user-balance';
import { getUserById } from '@/lib/db/user-session';
import { checkRateLimit } from '@/lib/rate-limit';
import { assertPromptsAllowed, isPromptBlockedError } from '@/lib/prompt-blocklist';
import { inferImageSizeLabel as inferNormalizedImageSizeLabel, normalizeAspectRatio, resolveImageSize } from '@/lib/image-sizing';
import { persistGenerationReferenceImages } from '@/lib/generation-reference-media';
import { isRegionEditPrompt } from '@/lib/region-edit-document';
import type { ChannelType, Generation, GenerationType } from '@/types';

export const maxDuration = 600;
export const dynamic = 'force-dynamic';

const MAX_REFERENCE_IMAGE_BYTES = 10 * 1024 * 1024;
const CLIENT_REQUEST_ID_PATTERN = /^[A-Za-z0-9._:-]{1,128}$/;
const IMAGE_CLIENT_REQUEST_HIT_MS = 15 * 60 * 1000;
const imageTaskCreationPromises = new Map<string, Promise<Generation>>();
const IMAGE_TYPE_BY_CHANNEL: Record<ChannelType, GenerationType> = {
  apexerapi: 'gemini-image',
  'openai-compatible': 'gemini-image',
  'openai-chat': 'gemini-image',
  gemini: 'gemini-image',
  modelscope: 'zimage-image',
  gitee: 'gitee-image',
  sora: 'sora-image',
  flow2api: 'gemini-image',
  grok2api: 'gemini-image',
};
class RouteResponseError extends Error {
  constructor(public response: NextResponse) {
    super('Route response');
  }
}

function buildTaskResponse(generation: Pick<Generation, 'id' | 'status' | 'type'>, message: string) {
  return NextResponse.json({
    success: true,
    data: {
      id: generation.id,
      status: generation.status,
      type: generation.type,
      message,
    },
  });
}

function throwRouteResponse(response: NextResponse): never {
  throw new RouteResponseError(response);
}

function firstString(...values: unknown[]): string | undefined {
  for (const value of values) {
    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (trimmed) return trimmed;
    }
  }
  return undefined;
}

function getGoogleImageConfig(body: Record<string, unknown>): Record<string, unknown> {
  const extraBody = body.extra_body;
  if (!extraBody || typeof extraBody !== 'object') return {};
  const google = (extraBody as Record<string, unknown>).google;
  if (!google || typeof google !== 'object') return {};
  const imageConfig = (google as Record<string, unknown>).image_config;
  return imageConfig && typeof imageConfig === 'object'
    ? imageConfig as Record<string, unknown>
    : {};
}

function isInlineImageInput(value: unknown): value is { mimeType: string; data: string } {
  if (!value || typeof value !== 'object') return false;
  const record = value as Record<string, unknown>;
  return typeof record.data === 'string' && typeof record.mimeType === 'string';
}

// 后台处理任务
async function processGenerationTask(
  generationId: string,
  userId: string,
  request: ImageGenerateRequest,
  prechargedCost: number,
  generationParams: Generation['params'],
  publicBaseUrl?: string
) {
  try {
    console.log(`[Task ${generationId}] 开始处理图像生成任务`);

    const generateImagePromise = import('@/lib/image-generator').then((mod) => mod.generateImage);
    const saveMediaPromise = import('@/lib/media-storage');
    void updateGeneration(generationId, {
      status: 'processing',
      params: {
        ...generationParams,
        progress: 10,
      },
    }, userId).catch((err) => {
      console.error(`[Task ${generationId}] 更新状态失败:`, err);
    });

    const generateImage = await generateImagePromise;
    const result = await generateImage(request);

    void updateGenerationProgress(generationId, 80).catch((err) => {
      console.error(`[Task ${generationId}] 更新进度失败:`, err);
    });

    // 保存到图床或本地
    const { saveMediaAsync } = await saveMediaPromise;
    const savedUrl = await saveMediaAsync(generationId, result.url, { publicBaseUrl });

    console.log(`[Task ${generationId}] 生成成功`);

    await updateGeneration(generationId, {
      status: 'completed',
      resultUrl: savedUrl,
      params: {
        ...generationParams,
        progress: 100,
      },
    }, userId);

    console.log(`[Task ${generationId}] 任务完成`);
  } catch (error) {
    console.error(`[Task ${generationId}] 任务失败:`, error);

    await updateGeneration(generationId, {
      status: 'failed',
      errorMessage: error instanceof Error ? error.message : '生成失败',
    }, userId);

    try {
      await refundGenerationBalance(generationId, userId, prechargedCost);
    } catch (refundErr) {
      console.error(`[Task ${generationId}] Refund failed:`, refundErr);
    }
  }
}

export async function POST(request: NextRequest) {
  try {
    const [rateLimitConfig, session, body] = await Promise.all([
      getRateLimitConfig(),
      getServerSession(authOptions),
      request.json(),
    ]);
    const imageMaxRequests = Math.max(1, Number(rateLimitConfig.imageMaxRequests) || 30);
    const imageWindowSeconds = Math.max(1, Number(rateLimitConfig.imageWindowSeconds) || 60);
    const rateLimit = checkRateLimit(
      request,
      { maxRequests: imageMaxRequests, windowSeconds: imageWindowSeconds },
      'generate-image'
    );
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: 'Too many requests' },
        { status: 429, headers: rateLimit.headers }
      );
    }

    if (!session?.user) {
      return NextResponse.json({ error: '请先登录' }, { status: 401 });
    }

    const userPromise = getUserById(session.user.id);
    const payload = body && typeof body === 'object' ? body as Record<string, unknown> : {};
    const googleImageConfig = getGoogleImageConfig(payload);
    const modelId = firstString(payload.modelId, payload.model_id);
    const prompt = firstString(payload.prompt) || '';
    const size = firstString(payload.size, googleImageConfig.size);
    const quality = firstString(payload.quality, googleImageConfig.quality);
    const images = payload.images;
    const referenceImages = payload.referenceImages || payload.reference_images;
    const referenceImageUrl = firstString(payload.referenceImageUrl, payload.reference_image_url);
    const aspectRatio = normalizeAspectRatio(firstString(
      payload.aspectRatio,
      payload.aspect_ratio,
      googleImageConfig.aspectRatio,
      googleImageConfig.aspect_ratio
    ));
    const imageSize = firstString(
      payload.imageSize,
      payload.image_size,
      googleImageConfig.imageSize,
      googleImageConfig.image_size
    );
    const clientRequestId = firstString(payload.clientRequestId, payload.client_request_id) || '';
    const sourceGenerationIdRaw = firstString(payload.sourceGenerationId, payload.source_generation_id);
    const sourceGenerationId = sourceGenerationIdRaw && sourceGenerationIdRaw.length <= 80
      ? sourceGenerationIdRaw
      : undefined;
    const resolvedInputSize = resolveImageSize(size);
    const effectiveAspectRatio = aspectRatio || resolvedInputSize.aspectRatio;
    const effectiveImageSize = inferNormalizedImageSizeLabel(imageSize) || imageSize || inferNormalizedImageSizeLabel(size);
    const effectiveSize = resolvedInputSize.size || size;

    if (clientRequestId && !CLIENT_REQUEST_ID_PATTERN.test(clientRequestId)) {
      return NextResponse.json({ error: 'Invalid client request id' }, { status: 400 });
    }

    const creationKey = clientRequestId ? `${session.user.id}:${clientRequestId}` : '';
    const pendingCreation = creationKey ? imageTaskCreationPromises.get(creationKey) : undefined;
    if (pendingCreation) {
      try {
        const generation = await pendingCreation;
        return buildTaskResponse(generation, '任务已存在，已复用当前任务');
      } catch (error) {
        if (error instanceof RouteResponseError) {
          return error.response;
        }
        throw error;
      }
    }

    const modelPromise = modelId ? getImageModelWithChannel(modelId) : null;
    const existingByClientRequestIdPromise = clientRequestId
      ? getGenerationByClientRequestId(session.user.id, clientRequestId)
      : Promise.resolve(null);
    const origin = new URL(request.url).origin;
    const referenceFetchOptions = {
      origin,
      userId: session.user.id,
      userRole: session.user.role,
      maxBytes: MAX_REFERENCE_IMAGE_BYTES,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
    };
    const remoteReferenceUrls = Array.isArray(referenceImages)
      ? referenceImages.filter(
          (img): img is string => typeof img === 'string' && !img.startsWith('data:')
        )
      : [];
    const referenceImageModPromise =
      referenceImageUrl || remoteReferenceUrls.length > 0
        ? import('@/lib/reference-image')
        : null;
    const referenceImagePromise = referenceImageUrl && referenceImageModPromise
      ? referenceImageModPromise.then(({ fetchReferenceImage }) =>
          fetchReferenceImage(referenceImageUrl, referenceFetchOptions)
        )
      : null;
    const assertPromise = assertPromptsAllowed([prompt]);

    if (!modelId || !modelPromise) {
      await assertPromise;
      return NextResponse.json({ error: '缺少模型 ID' }, { status: 400 });
    }

    void import('@/lib/image-generator');
    void import('@/lib/media-storage');

    const [modelConfig, user, existingByClientRequestId] = await Promise.all([
      modelPromise,
      userPromise,
      existingByClientRequestIdPromise,
      assertPromise,
    ]);
    if (!modelConfig) {
      return NextResponse.json({ error: '模型不存在' }, { status: 404 });
    }
    const { model, channel } = modelConfig;
    if (!model.enabled) {
      return NextResponse.json({ error: '模型已禁用' }, { status: 400 });
    }

    const resolvedTarget = resolveImageTarget(
      model.apiModel,
      model.resolutions,
      effectiveAspectRatio,
      effectiveImageSize
    );

    if (!user) {
      return NextResponse.json({ error: '用户不存在' }, { status: 401 });
    }
    if (user.disabled) {
      return NextResponse.json({ error: '账号已被禁用' }, { status: 403 });
    }

    const pendingCreationAfterAuth = creationKey
      ? imageTaskCreationPromises.get(creationKey)
      : undefined;
    if (pendingCreationAfterAuth) {
      try {
        const generation = await pendingCreationAfterAuth;
        return buildTaskResponse(generation, '任务已存在，已复用当前任务');
      } catch (error) {
        if (error instanceof RouteResponseError) {
          return error.response;
        }
        throw error;
      }
    }

    if (existingByClientRequestId) {
      return buildTaskResponse(existingByClientRequestId, '任务已存在，已复用当前任务');
    }

    const pendingCreationAfterLookup = creationKey
      ? imageTaskCreationPromises.get(creationKey)
      : undefined;
    if (pendingCreationAfterLookup) {
      try {
        const generation = await pendingCreationAfterLookup;
        return buildTaskResponse(generation, '任务已存在，已复用当前任务');
      } catch (error) {
        if (error instanceof RouteResponseError) {
          return error.response;
        }
        throw error;
      }
    }

    const createTask = async (): Promise<Generation> => {
      // 检查余额
      if (user.balance < model.costPerGeneration) {
        throwRouteResponse(
          NextResponse.json(
            { error: `余额不足，需要至少 ${model.costPerGeneration} 积分` },
            { status: 402 }
          )
        );
      }

      // 处理参考图
      const imageList: Array<{ mimeType: string; data: string }> = [];

      if (Array.isArray(images)) {
        imageList.push(...images.filter(isInlineImageInput));
      }

      if (referenceImagePromise) {
        const referenceImage = await referenceImagePromise;
        imageList.push({
          mimeType: referenceImage.mimeType,
          data: referenceImage.dataUrl,
        });
      }

      if (Array.isArray(referenceImages)) {
        for (const img of referenceImages) {
          if (typeof img !== 'string' || !img.startsWith('data:')) continue;
          const match = img.match(/^data:([^;]+);base64,(.+)$/);
          if (match) {
            imageList.push({ mimeType: match[1], data: img });
          }
        }
        if (remoteReferenceUrls.length > 0) {
          const { fetchReferenceImage } = await (referenceImageModPromise ?? import('@/lib/reference-image'));
          const fetched = await Promise.all(
            remoteReferenceUrls.map((img) => fetchReferenceImage(img, referenceFetchOptions))
          );
          for (const referenceImage of fetched) {
            imageList.push({
              mimeType: referenceImage.mimeType,
              data: referenceImage.dataUrl,
            });
          }
        }
      }

      // 验证必须参考图
      if (model.requiresReferenceImage && imageList.length === 0) {
        throwRouteResponse(
          NextResponse.json({ error: '该模型需要上传参考图' }, { status: 400 })
        );
      }

      // 验证提示词
      if (!model.allowEmptyPrompt && !prompt && imageList.length === 0) {
        throwRouteResponse(
          NextResponse.json({ error: '请输入提示词或上传参考图' }, { status: 400 })
        );
      }

      // 构建请求
      const generateRequest: ImageGenerateRequest = {
        modelId,
        prompt: prompt || '',
        size: resolvedTarget.size || effectiveSize,
        aspectRatio: effectiveAspectRatio,
        imageSize: effectiveImageSize,
        quality,
        images: imageList.length > 0 ? imageList : undefined,
      };

      try {
        await updateUserBalance(user.id, -model.costPerGeneration, 'strict');
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Insufficient balance';
        if (message.includes('Insufficient balance')) {
          throwRouteResponse(
            NextResponse.json(
              { error: `余额不足，需要至少 ${model.costPerGeneration} 积分` },
              { status: 402 }
            )
          );
        }
        throw err;
      }

      // 保存生成记录
      let generation: Generation;
      const generationParams: Generation['params'] = {
        model: model.apiModel,
        modelId,
        modelName: model.name || undefined,
        aspectRatio: effectiveAspectRatio,
        imageSize: effectiveImageSize,
        size: resolvedTarget.size || effectiveSize,
        quality,
        imageCount: imageList.length,
        progress: 0,
        clientRequestId: clientRequestId || undefined,
        sourceGenerationId: sourceGenerationId || undefined,
        kind: sourceGenerationId || isRegionEditPrompt(prompt) ? 'region-edit' : undefined,
      };

      try {
        generation = await saveGeneration({
          userId: user.id,
          type: IMAGE_TYPE_BY_CHANNEL[channel.type] || 'gemini-image',
          prompt: prompt || '',
          params: generationParams,
          resultUrl: '',
          cost: model.costPerGeneration,
          status: 'pending',
          balancePrecharged: true,
          balanceRefunded: false,
        });
      } catch (saveErr) {
        await updateUserBalance(user.id, model.costPerGeneration, 'strict').catch(refundErr => {
          console.error('[API] Precharge rollback failed:', refundErr);
        });
        throw saveErr;
      }

      if (imageList.length > 0 || sourceGenerationId) {
        const storedReferences = await persistGenerationReferenceImages(
          generation.id,
          imageList,
          origin
        );
        if (storedReferences.length > 0) {
          generationParams.referenceImages = storedReferences;
          generationParams.imageCount = storedReferences.length;
        } else if (sourceGenerationId) {
          generationParams.imageCount = 1;
        }
        if (storedReferences.length > 0 || sourceGenerationId) {
          generation.params = generationParams;
          await updateGeneration(generation.id, { params: generationParams }, user.id);
        }
      }

      console.log('[API] 图像生成任务已创建:', {
        id: generation.id,
        modelId,
        model: model.apiModel,
        resolvedModel: resolvedTarget.model,
        resolvedSize: resolvedTarget.size,
      });

      // 后台处理
      processGenerationTask(
        generation.id,
        user.id,
        {
          ...generateRequest,
          idempotencyKey: `sanhub-image-${clientRequestId || generation.id}`,
        },
        model.costPerGeneration,
        generationParams,
        origin
      ).catch((err) => {
        console.error('[API] 后台任务启动失败:', err);
      });

      return generation;
    };

    const creationPromise = createTask();
    if (creationKey) {
      imageTaskCreationPromises.set(creationKey, creationPromise);
    }

    try {
      const generation = await creationPromise;
      return buildTaskResponse(generation, '任务已创建，正在后台处理中');
    } catch (error) {
      if (creationKey && imageTaskCreationPromises.get(creationKey) === creationPromise) {
        imageTaskCreationPromises.delete(creationKey);
      }
      if (error instanceof RouteResponseError) {
        return error.response;
      }
      throw error;
    } finally {
      if (creationKey && imageTaskCreationPromises.get(creationKey) === creationPromise) {
        const timeout = setTimeout(() => {
          if (imageTaskCreationPromises.get(creationKey) === creationPromise) {
            imageTaskCreationPromises.delete(creationKey);
          }
        }, IMAGE_CLIENT_REQUEST_HIT_MS);
        timeout.unref?.();
      }
    }
  } catch (error) {
    console.error('[API] Image generation error:', error);

    if (isPromptBlockedError(error)) {
      return NextResponse.json(
        { error: error instanceof Error ? error.message : 'Prompt blocked by safety policy' },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : '生成失败' },
      { status: 500 }
    );
  }
}
