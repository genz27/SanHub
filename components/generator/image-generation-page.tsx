'use client';
/* eslint-disable @next/next/no-img-element */

import { useState, useRef, useEffect, useCallback, useMemo, type ReactNode } from 'react';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import {
  Loader2,
  AlertCircle,
  Sparkles,
  Dices,
  Image as ImageIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { compressImageToWebP, fileToBase64 } from '@/lib/image-compression';
import type { Generation, SafeImageModel, DailyLimitConfig } from '@/types';
import { toast } from '@/components/ui/toaster';
import type { Task } from '@/components/generator/result-gallery';
import { InlineToggle } from '@/components/generator/inline-toggle';
import { ReferenceImageInput } from '@/components/generator/reference-image-input';
import { useSiteConfig } from '@/components/providers/site-config-provider';
import { CustomSelect } from '@/components/ui/select-custom';
import {
  buildTaskFromGeneration,
  deleteGenerationRecord,
  deleteGenerationRecords,
  fetchGenerationSubmit,
  fetchPendingGenerationTasks,
  fetchRecentUserGenerations,
  filterGenerationsByKind,
  filterTasksByKind,
  isFailedGenerationStatus,
  isTerminalGenerationStatus,
  mergeGenerationsById,
  mergeTasksById,
  pollGenerationTask,
  replaceActiveTasks,
  type ReusableImageReference,
} from '@/lib/generation-client';

const ResultGallery = dynamic(
  () => import('@/components/generator/result-gallery').then((mod) => mod.ResultGallery),
  {
    ssr: false,
    loading: () => (
      <div className="surface p-6 text-sm text-foreground/50">Loading results...</div>
    ),
  }
);

interface DailyUsage {
  imageCount: number;
  videoCount: number;
  characterCardCount: number;
}

export interface ImageGenerationPageProps {
  embedded?: boolean;
  createModeSwitcher?: ReactNode;
  externalReference?: ReusableImageReference | null;
  onClearExternalReference?: () => void;
  onReuseGeneration?: (generation: Generation, target: 'image' | 'video') => void;
  onGenerationDeleted?: (generationId: string) => void;
  isActive?: boolean;
}

function getImageResolution(
  model: SafeImageModel,
  aspectRatio: string,
  imageSize?: string
): string {
  if (model.features.imageSize && imageSize) {
    const sizeBucket = model.resolutions[imageSize];
    if (sizeBucket && typeof sizeBucket === 'object') {
      const resolved = (sizeBucket as Record<string, string>)[aspectRatio];
      if (typeof resolved === 'string') return resolved;
    }
  }

  const ratioBucket = model.resolutions[aspectRatio];
  if (typeof ratioBucket === 'string') return ratioBucket;
  if (ratioBucket && typeof ratioBucket === 'object' && imageSize) {
    const resolved = (ratioBucket as Record<string, string>)[imageSize];
    if (typeof resolved === 'string') return resolved;
  }

  return '';
}

export function ImageGenerationPage({
  embedded = false,
  createModeSwitcher,
  externalReference = null,
  onClearExternalReference,
  onReuseGeneration,
  onGenerationDeleted,
  isActive = true,
}: ImageGenerationPageProps) {
  const router = useRouter();
  const { update } = useSession();
  const siteConfig = useSiteConfig();
  const abortControllersRef = useRef<Map<string, AbortController>>(new Map());
  const refreshGenerationFeedRef = useRef<() => Promise<void>>(async () => {});
  const imagesRef = useRef<Array<{ file: File; preview: string }>>([]);
  const isActiveRef = useRef(isActive);
  const submissionLockRef = useRef(false);
  const promptTextareaRef = useRef<HTMLTextAreaElement>(null);

  const [availableModels, setAvailableModels] = useState<SafeImageModel[]>([]);
  const [modelsLoaded, setModelsLoaded] = useState(false);
  const [dailyUsage, setDailyUsage] = useState<DailyUsage>({
    imageCount: 0,
    videoCount: 0,
    characterCardCount: 0,
  });
  const [dailyLimits, setDailyLimits] = useState<DailyLimitConfig>({
    imageLimit: 0,
    videoLimit: 0,
    characterCardLimit: 0,
  });
  const [selectedModelId, setSelectedModelId] = useState<string>('');
  const [aspectRatio, setAspectRatio] = useState<string>('1:1');
  const [imageSize, setImageSize] = useState<string>('1K');
  const [quality, setQuality] = useState<string>('medium');
  const [prompt, setPrompt] = useState('');
  const [images, setImages] = useState<Array<{ file: File; preview: string }>>([]);
  const [generations, setGenerations] = useState<Generation[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [compressing, setCompressing] = useState(false);
  const [compressedCache, setCompressedCache] = useState<Map<File, string>>(new Map());
  const [busyGenerationId, setBusyGenerationId] = useState<string | null>(null);
  const [clearingFailedTasks, setClearingFailedTasks] = useState(false);
  const [error, setError] = useState('');
  const [keepPrompt, setKeepPrompt] = useState(false);

  const clearImages = useCallback(() => {
    setImages((prev) => {
      prev.forEach((img) => URL.revokeObjectURL(img.preview));
      return [];
    });
    setCompressedCache(new Map());
  }, []);

  const currentModel = useMemo(() => {
    return availableModels.find((model) => model.id === selectedModelId) || availableModels[0];
  }, [availableModels, selectedModelId]);

  const hasReferenceInput = images.length > 0 || Boolean(externalReference);

  useEffect(() => {
    imagesRef.current = images;
  }, [images]);

  useEffect(() => {
    isActiveRef.current = isActive;
  }, [isActive]);

  useEffect(() => {
    return () => {
      imagesRef.current.forEach((img) => URL.revokeObjectURL(img.preview));
      imagesRef.current = [];
    };
  }, []);

  // Auto-height textarea: grow as content grows
  useEffect(() => {
    const textarea = promptTextareaRef.current;
    if (!textarea) return;
    textarea.style.height = '0px';
    textarea.style.height = `${textarea.scrollHeight}px`;
  }, [prompt]);

  const modelsCacheRef = useRef<SafeImageModel[] | null>(null);

  useEffect(() => {
    if (!isActive || modelsLoaded) {
      return;
    }

    const loadModels = async () => {
      if (modelsCacheRef.current) {
        setAvailableModels(modelsCacheRef.current);
        setModelsLoaded(true);
        return;
      }
      try {
        const res = await fetch('/api/image-models');
        if (!res.ok) return;

        const data = await res.json();
        const models = data.data?.models || [];
        modelsCacheRef.current = models;
        setAvailableModels(models);

        if (models.length > 0) {
          setSelectedModelId((prev) => {
            if (prev) return prev;
            setAspectRatio(models[0].defaultAspectRatio);
            if (models[0].defaultImageSize) {
              setImageSize(models[0].defaultImageSize);
            }
            return models[0].id;
          });
        }
      } catch (err) {
        console.error('Failed to load models:', err);
      } finally {
        setModelsLoaded(true);
      }
    };

    void loadModels();
  }, [isActive, modelsLoaded]);

  useEffect(() => {
    if (!isActive) {
      return;
    }

    const loadDailyUsage = async () => {
      try {
        const res = await fetch('/api/user/daily-usage');
        if (!res.ok) return;

        const data = await res.json();
        setDailyUsage(data.data.usage);
        setDailyLimits(data.data.limits);
      } catch (err) {
        console.error('Failed to load daily usage:', err);
      }
    };

    void loadDailyUsage();
  }, [isActive]);

  useEffect(() => {
    if (!isActiveRef.current) {
      return;
    }

    const model = availableModels.find((item) => item.id === selectedModelId);
    if (!model) return;

    setAspectRatio(model.defaultAspectRatio);
    if (model.defaultImageSize) {
      setImageSize(model.defaultImageSize);
    }

    if (!model.features.imageToImage) {
      clearImages();
      onClearExternalReference?.();
    }
  }, [availableModels, clearImages, onClearExternalReference, selectedModelId]);

  useEffect(() => {
    if (!externalReference || images.length === 0) return;
    clearImages();
  }, [clearImages, externalReference, images.length]);

  const handleAddReferenceFiles = useCallback(
    (selectedFiles: File[]) => {
      const nextImages: Array<{ file: File; preview: string }> = [];
      let hasOversizedImage = false;

      for (const file of selectedFiles) {
        if (!file.type.startsWith('image/')) continue;

        if (file.size > 15 * 1024 * 1024) {
          hasOversizedImage = true;
          continue;
        }

        nextImages.push({
          file,
          preview: URL.createObjectURL(file),
        });
      }

      if (hasOversizedImage) {
        setError('图片大小不能超过 15MB');
        toast({
          title: '图片过大',
          description: '图片大小不能超过 15MB',
          variant: 'destructive',
        });
      }

      if (nextImages.length > 0) {
        setError('');
        onClearExternalReference?.();
        setImages((prev) => [...prev, ...nextImages]);
      }
    },
    [onClearExternalReference]
  );

  const handleRemoveReferenceImage = useCallback((index: number) => {
    setImages((prev) => {
      const target = prev[index];
      if (!target) return prev;

      URL.revokeObjectURL(target.preview);
      setCompressedCache((current) => {
        const nextCache = new Map(current);
        nextCache.delete(target.file);
        return nextCache;
      });

      return prev.filter((_, itemIndex) => itemIndex !== index);
    });
  }, []);

  const loadRecentGenerations = useCallback(async () => {
    try {
      const recentGenerations = await fetchRecentUserGenerations(12);
      const imageGenerations = filterGenerationsByKind(recentGenerations, 'image');
      const completedImageGenerations = imageGenerations.filter(
        (generation) =>
          generation.resultUrl &&
          generation.status === 'completed' &&
          isTerminalGenerationStatus(generation.status)
      );
      const failedImageTasks = imageGenerations
        .filter((generation) => isFailedGenerationStatus(generation.status))
        .map(
          (generation) =>
            ({
              ...buildTaskFromGeneration(generation),
              persisted: true,
            }) satisfies Task
        );

      setGenerations((prev) => mergeGenerationsById(prev, completedImageGenerations));
      if (failedImageTasks.length > 0) {
        setTasks((prev) => mergeTasksById(prev, failedImageTasks));
      }
    } catch (err) {
      console.error('Failed to load recent image generations:', err);
    }
  }, []);

  const markTaskAsFailed = useCallback((taskId: string, errorMessage: string, persisted = true) => {
    setTasks((prev) =>
      prev.map((task) =>
        task.id === taskId
          ? {
              ...task,
              status: 'failed' as const,
              errorMessage,
              persisted,
            }
          : task
      )
    );
  }, []);

  const handleClearFailedTasks = useCallback(async () => {
    if (clearingFailedTasks) return;

    const failedTasks = tasks.filter((task) => isFailedGenerationStatus(task.status));
    if (failedTasks.length === 0) return;

    const confirmed = window.confirm('确认清理当前生成页的错误记录吗？');
    if (!confirmed) return;

    const failedTaskIds = failedTasks
      .filter((task) => task.persisted !== false)
      .map((task) => task.id);
    const localOnlyCount = failedTasks.length - failedTaskIds.length;
    setClearingFailedTasks(true);
    setTasks((prev) => prev.filter((task) => !isFailedGenerationStatus(task.status)));

    try {
      const deletedCount = await deleteGenerationRecords(failedTaskIds);
      const description = [
        deletedCount > 0 ? `已删除 ${deletedCount} 条历史错误记录` : '',
        localOnlyCount > 0 ? `已移除 ${localOnlyCount} 条本地查询错误` : '',
      ]
        .filter(Boolean)
        .join('，') || '没有需要删除的历史错误记录';

      toast({
        title: '错误任务已清理',
        description,
      });
    } catch (err) {
      setTasks((prev) => mergeTasksById(prev, failedTasks));
      toast({
        title: '清理失败',
        description: err instanceof Error ? err.message : '清理错误任务失败',
        variant: 'destructive',
      });
    } finally {
      setClearingFailedTasks(false);
    }
  }, [clearingFailedTasks, tasks]);

  const pollTaskStatus = useCallback(
    async (taskId: string, taskPrompt: string): Promise<void> => {
      if (abortControllersRef.current.has(taskId)) return;

      const controller = new AbortController();
      let shouldResyncAfterPoll = false;
      abortControllersRef.current.set(taskId, controller);

      try {
        await pollGenerationTask({
          taskId,
          taskPrompt,
          taskType: 'image',
          signal: controller.signal,
          onProgress: (payload) => {
            const nextStatus = payload.status === 'processing' ? 'processing' : 'pending';
            setTasks((prev) =>
              prev.map((task) =>
                task.id === taskId
                  ? {
                      ...task,
                      status: nextStatus,
                      progress:
                        typeof payload.progress === 'number'
                          ? payload.progress
                          : task.progress,
                    }
                  : task
              )
            );
          },
          onCompleted: async (generation) => {
            await update();
            setTasks((prev) => prev.filter((task) => task.id !== taskId));
            setGenerations((prev) => mergeGenerationsById(prev, [generation]));
            void loadRecentGenerations();

            toast({
              title: '生成成功',
              description: `消耗 ${generation.cost} 积分`,
            });
          },
          onFailed: async (errorMessage, payload) => {
            if (!payload) {
              markTaskAsFailed(taskId, errorMessage, false);
              shouldResyncAfterPoll = true;
              return;
            }

            markTaskAsFailed(taskId, errorMessage, true);
          },
          onTimeout: async () => {
            markTaskAsFailed(taskId, '任务查询超时，请稍后刷新或到历史记录查看最终状态', false);
            shouldResyncAfterPoll = true;
          },
        });
      } finally {
        abortControllersRef.current.delete(taskId);
        if (shouldResyncAfterPoll) {
          await refreshGenerationFeedRef.current();
        }
      }
    },
    [loadRecentGenerations, markTaskAsFailed, update]
  );

  const loadPendingTasks = useCallback(async () => {
    try {
      const imageTasks = filterTasksByKind(
        await fetchPendingGenerationTasks(50),
        'image'
      ).map(
        (task) =>
          ({
            ...task,
            status: task.status === 'processing' ? 'processing' : 'pending',
            progress: typeof task.progress === 'number' ? task.progress : 0,
          }) satisfies Task
      );

      setTasks((prev) => replaceActiveTasks(prev, imageTasks));

      imageTasks.forEach((task) => {
        void pollTaskStatus(task.id, task.prompt);
      });
    } catch (err) {
      console.error('Failed to load pending image tasks:', err);
    }
  }, [pollTaskStatus]);

  const refreshGenerationFeed = useCallback(async () => {
    await Promise.allSettled([loadRecentGenerations(), loadPendingTasks()]);
  }, [loadPendingTasks, loadRecentGenerations]);

  useEffect(() => {
    refreshGenerationFeedRef.current = refreshGenerationFeed;
  }, [refreshGenerationFeed]);

  useEffect(() => {
    const abortControllers = abortControllersRef.current;
    if (!isActive) {
      abortControllers.forEach((controller) => controller.abort());
      abortControllers.clear();
      return;
    }

    const handleWindowFocus = () => {
      void refreshGenerationFeed();
    };
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        void refreshGenerationFeed();
      }
    };

    void refreshGenerationFeed();
    window.addEventListener('focus', handleWindowFocus);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      window.removeEventListener('focus', handleWindowFocus);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      abortControllers.forEach((controller) => controller.abort());
      abortControllers.clear();
    };
  }, [isActive, refreshGenerationFeed]);

  const handleRemoveTask = useCallback(async (taskId: string) => {
    const controller = abortControllersRef.current.get(taskId);
    if (controller) {
      controller.abort();
      abortControllersRef.current.delete(taskId);
    }

    try {
      await fetch(`/api/user/tasks/${taskId}`, { method: 'DELETE' });
    } catch (err) {
      console.error('取消任务请求失败:', err);
    }

    setTasks((prev) => prev.filter((task) => task.id !== taskId));
  }, []);

  const handleRemoveGeneration = useCallback(
    async (generation: Generation) => {
      if (busyGenerationId) return;

      const confirmed = window.confirm('确认删除这条已生成记录吗？删除后将无法在当前站点继续访问该作品。');
      if (!confirmed) return;

      setBusyGenerationId(generation.id);
      setGenerations((prev) => prev.filter((item) => item.id !== generation.id));

      try {
        await deleteGenerationRecord(generation.id);
        if (externalReference?.generationId === generation.id) {
          onClearExternalReference?.();
        }
        onGenerationDeleted?.(generation.id);
        toast({ title: '作品已删除' });
      } catch (err) {
        setGenerations((prev) => mergeGenerationsById(prev, [generation]));
        toast({
          title: '删除失败',
          description: err instanceof Error ? err.message : '删除作品失败',
          variant: 'destructive',
        });
      } finally {
        setBusyGenerationId(null);
      }
    },
    [busyGenerationId, externalReference?.generationId, onClearExternalReference, onGenerationDeleted]
  );

  const handleReuseCompletedGeneration = useCallback(
    (generation: Generation, target: 'image' | 'video') => {
      if (onReuseGeneration) {
        onReuseGeneration(generation, target);
        return;
      }

      router.push(`/create?mode=${target}&referenceId=${encodeURIComponent(generation.id)}`);
    },
    [onReuseGeneration, router]
  );

  const isImageLimitReached =
    dailyLimits.imageLimit > 0 && dailyUsage.imageCount >= dailyLimits.imageLimit;

  const validateInput = (): string | null => {
    if (!currentModel) return '请选择模型';

    if (isImageLimitReached) {
      return `今日图像生成次数已达上限 (${dailyLimits.imageLimit} 次)`;
    }

    if (currentModel.requiresReferenceImage && !hasReferenceInput) {
      return '请上传参考图';
    }

    if (currentModel.channelType === 'gemini') {
      if (!prompt.trim() && !hasReferenceInput) {
        return '请输入提示词或上传参考图片';
      }
    } else if (!currentModel.allowEmptyPrompt && !prompt.trim() && !hasReferenceInput) {
      return '请输入提示词或上传参考图';
    }

    return null;
  };

  const compressImagesIfNeeded = async (): Promise<Array<{ mimeType: string; data: string }>> => {
    if (images.length === 0) return [];

    setCompressing(true);
    setError('');

    try {
      const compressedImages = [];

      for (const img of images) {
        let base64 = compressedCache.get(img.file);

        if (!base64) {
          const compressedFile = await compressImageToWebP(img.file);
          base64 = await fileToBase64(compressedFile);
          setCompressedCache((prev) => new Map(prev).set(img.file, base64!));
        }

        compressedImages.push({
          mimeType: 'image/jpeg',
          data: `data:image/jpeg;base64,${base64}`,
        });
      }

      return compressedImages;
    } finally {
      setCompressing(false);
    }
  };

  const submitSingleTask = async (
    taskPrompt: string,
    compressedImages: Array<{ mimeType: string; data: string }> | undefined,
    clientRequestId: string
  ) => {
    if (!currentModel) throw new Error('请选择模型');

    const res = await fetchGenerationSubmit('/api/generate/image', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        modelId: currentModel.id,
        prompt: taskPrompt,
        aspectRatio,
        imageSize: currentModel.features.imageSize ? imageSize : undefined,
        quality: (currentModel.channelType === 'apexerapi' || currentModel.channelType === 'openai-compatible' || currentModel.channelType === 'openai-chat') && currentModel.apiModel.toLowerCase().includes('gpt-image-2') && (!currentModel.features.qualityOptions || currentModel.features.qualityOptions.length === 0 || currentModel.features.qualityOptions.includes(quality)) ? quality : undefined,
        images: compressedImages || [],
        referenceImageUrl: externalReference?.sourceUrl,
        clientRequestId,
      }),
    });

    const data = await res.json();

    if (!res.ok) {
      throw new Error(data.error || '生成失败');
    }

    const newTask: Task = {
      id: data.data.id,
      prompt: taskPrompt,
      type: data.data.type || 'image',
      status: 'pending',
      createdAt: Date.now(),
    };

    setTasks((prev) =>
      prev.some((task) => task.id === newTask.id) ? prev : [newTask, ...prev]
    );
    void pollTaskStatus(data.data.id, taskPrompt);

    return data.data.id;
  };

  const createClientRequestId = () => {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }
    return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  };

  const getSubmissionFailureMessage = (result: PromiseRejectedResult) => {
    return result.reason instanceof Error ? result.reason.message : '生成失败';
  };

  const handleGenerate = async () => {
    if (submissionLockRef.current) return;

    const validationError = validateInput();
    if (validationError) {
      setError(validationError);
      return;
    }

    submissionLockRef.current = true;
    setError('');
    setSubmitting(true);

    const taskPrompt = prompt.trim();

    try {
      const compressedImages = await compressImagesIfNeeded();
      await submitSingleTask(taskPrompt, compressedImages, createClientRequestId());

      toast({
        title: '任务已提交',
        description: '任务已加入队列，可继续提交新任务',
      });

      setDailyUsage((prev) => ({ ...prev, imageCount: prev.imageCount + 1 }));

      if (!keepPrompt) {
        setPrompt('');
        clearImages();
        onClearExternalReference?.();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '生成失败');
    } finally {
      submissionLockRef.current = false;
      setSubmitting(false);
    }
  };

  const handleGachaMode = async () => {
    if (submissionLockRef.current) return;

    const validationError = validateInput();
    if (validationError) {
      setError(validationError);
      return;
    }

    submissionLockRef.current = true;
    setError('');
    setSubmitting(true);

    const taskPrompt = prompt.trim();

    try {
      const compressedImages = await compressImagesIfNeeded();
      const batchRequestId = createClientRequestId();
      const results = await Promise.allSettled(
        Array.from({ length: 3 }, (_, index) =>
          submitSingleTask(taskPrompt, compressedImages, `${batchRequestId}-${index}`)
        )
      );
      const successfulCount = results.filter((result) => result.status === 'fulfilled').length;
      const failedResult = results.find(
        (result): result is PromiseRejectedResult => result.status === 'rejected'
      );

      if (successfulCount === 0) {
        throw new Error(failedResult ? getSubmissionFailureMessage(failedResult) : '生成失败');
      }

      toast({
        title: successfulCount === 3 ? '已提交 3 个任务' : `已提交 ${successfulCount} / 3 个任务`,
        description:
          successfulCount === 3
            ? '抽卡模式启动，等待结果中...'
            : failedResult
              ? getSubmissionFailureMessage(failedResult)
              : '部分任务提交失败，请稍后重试',
      });

      setDailyUsage((prev) => ({ ...prev, imageCount: prev.imageCount + successfulCount }));

      if (!keepPrompt) {
        setPrompt('');
        clearImages();
        onClearExternalReference?.();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '生成失败');
    } finally {
      submissionLockRef.current = false;
      setSubmitting(false);
    }
  };

  const getCurrentResolutionDisplay = () => {
    if (!currentModel) return '';
    return getImageResolution(currentModel, aspectRatio, imageSize);
  };

  return (
    <div
      className={cn(
        'flex w-full flex-col',
        embedded ? 'h-full min-h-0' : 'max-w-7xl mx-auto lg:h-[calc(100vh-100px)]'
      )}
    >
      {!embedded && (
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between mb-4 shrink-0">
          <div>
            <h1 className="text-2xl lg:text-3xl font-light text-foreground">图像生成</h1>
            <p className="text-foreground/50 text-sm lg:text-base mt-0.5 font-light">
              选择模型，生成高质量图像
            </p>
          </div>
          {dailyLimits.imageLimit > 0 && (
            <div
              className={cn(
                'px-3 py-1.5 rounded-lg border text-xs lg:text-sm',
                isImageLimitReached
                  ? 'bg-red-500/10 border-red-500/30 text-red-400'
                  : 'bg-card/60 border-border/70 text-foreground/60'
              )}
            >
              今日: {dailyUsage.imageCount} / {dailyLimits.imageLimit}
            </div>
          )}
        </div>
      )}

      {embedded && dailyLimits.imageLimit > 0 && (
        <div className="mb-4 flex justify-end">
          <div
            className={cn(
              'px-3 py-1.5 rounded-lg border text-xs',
              isImageLimitReached
                ? 'bg-red-500/10 border-red-500/30 text-red-400'
                : 'bg-card/60 border-border/70 text-foreground/60'
            )}
          >
            今日: {dailyUsage.imageCount} / {dailyLimits.imageLimit}
          </div>
        </div>
      )}

      {modelsLoaded && availableModels.length === 0 && (
        <div className="p-4 bg-yellow-500/10 border border-yellow-500/30 rounded-xl flex items-center gap-3 mb-4 shrink-0">
          <AlertCircle className="w-5 h-5 text-yellow-400 flex-shrink-0" />
          <p className="text-sm text-yellow-200">所有图像生成渠道已被管理员禁用</p>
        </div>
      )}

      {isImageLimitReached && (
        <div className="p-4 bg-red-500/10 border border-red-500/30 rounded-xl flex items-center gap-3 mb-4 shrink-0">
          <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0" />
          <p className="text-sm text-red-300">今日图像生成次数已达上限，请明天再试</p>
        </div>
      )}

      <div
        className={cn(
          'surface order-2 shrink-0 overflow-visible mt-4',
          embedded && 'min-h-[15rem]',
          (availableModels.length === 0 || isImageLimitReached) && 'opacity-50 pointer-events-none'
        )}
      >
        {embedded && (
          <div className="border-b border-border/70 px-3 py-3">
            {createModeSwitcher ?? (
              <div className="flex items-center gap-2 px-1 text-sm font-medium text-foreground">
                <ImageIcon className="w-4 h-4" />
                <span>图片创作</span>
              </div>
            )}
          </div>
        )}
        <div className="p-4">
          <div className="flex flex-col sm:flex-row gap-4 mb-4">
            {currentModel?.features.imageToImage && (
              <div className="flex justify-start">
                <ReferenceImageInput
                  images={images}
                  externalReference={externalReference}
                  emptyLabel="参考图"
                  externalBadge="生成结果"
                  onAddFiles={handleAddReferenceFiles}
                  onRemoveImage={handleRemoveReferenceImage}
                  onClearExternalReference={onClearExternalReference}
                />
              </div>
            )}

            <div className="flex-1 relative">
              <textarea
                ref={promptTextareaRef}
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="描述你想要生成的图像..."
                className="w-full min-h-[80px] px-3 py-2 bg-input/70 border border-border/70 text-foreground rounded-lg resize-none text-sm focus:outline-none focus:border-border focus:ring-2 focus:ring-ring/30 overflow-hidden"
              />
              <div className="absolute bottom-1.5 right-2 text-xs text-foreground/40 pointer-events-none select-none">
                {prompt.length}
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between w-full">
            {/* Left Parameter Group */}
            <div className="flex flex-wrap items-center gap-2.5 flex-1 min-w-0">
              <div className="w-full sm:w-[220px] flex-shrink-0">
                <CustomSelect
                  value={selectedModelId}
                  onValueChange={setSelectedModelId}
                  options={availableModels.map((model) => ({
                    value: model.id,
                    label: model.name,
                    description: model.description,
                    highlight: model.highlight,
                  }))}
                  placeholder="选择模型"
                />
              </div>

              {currentModel?.features.imageSize && currentModel.imageSizes && (
                <div className="w-[calc(50%-0.32rem)] sm:w-[100px] flex-initial">
                  <CustomSelect
                    value={imageSize}
                    onValueChange={setImageSize}
                    options={currentModel.imageSizes.map((size) => ({
                      value: size,
                      label: size,
                    }))}
                    placeholder="分辨率"
                  />
                </div>
              )}

              {currentModel && (
                <div className="w-[calc(50%-0.32rem)] sm:w-[100px] flex-initial">
                  <CustomSelect
                    value={aspectRatio}
                    onValueChange={setAspectRatio}
                    options={currentModel.aspectRatios.map((ratio) => ({
                      value: ratio,
                      label: ratio,
                    }))}
                    placeholder="比例"
                  />
                </div>
              )}

              {currentModel && getCurrentResolutionDisplay() && (
                <div className="inline-flex h-9 items-center justify-center px-2.5 rounded-lg border border-border/40 bg-card/30 text-foreground/50 text-[11px] font-mono whitespace-nowrap shadow-sm backdrop-blur-sm">
                  {getCurrentResolutionDisplay()}
                </div>
              )}

              <div className="hidden sm:block h-4 w-px bg-border/40" />

              {(() => {
                if (!currentModel) return null;
                if (currentModel.channelType !== 'apexerapi' && currentModel.channelType !== 'openai-compatible' && currentModel.channelType !== 'openai-chat') return null;
                if (!currentModel.apiModel.toLowerCase().includes('gpt-image-2')) return null;
                const qOpts = currentModel.features.qualityOptions;
                const allQualities = [
                  { value: 'low', label: '低' },
                  { value: 'medium', label: '中' },
                  { value: 'high', label: '高' },
                ];
                const available = qOpts && qOpts.length > 0
                  ? allQualities.filter(q => qOpts.includes(q.value))
                  : allQualities;
                if (available.length === 0) return null;
                const safeValue = available.some(q => q.value === quality) ? quality : available[0].value;
                if (safeValue !== quality) {
                  queueMicrotask(() => setQuality(safeValue));
                }
                return (
                  <div className="flex items-center gap-1.5 h-9">
                    <span className="text-xs text-foreground/50 whitespace-nowrap">质量</span>
                    <div className="w-[68px]">
                      <CustomSelect
                        value={safeValue}
                        onValueChange={setQuality}
                        options={available}
                        placeholder="画质"
                      />
                    </div>
                  </div>
                );
              })()}

              <InlineToggle
                checked={keepPrompt}
                onCheckedChange={setKeepPrompt}
                label="保留输入"
              />

              {error && (
                <div className="flex items-center gap-1.5 text-xs text-red-400">
                  <AlertCircle className="w-3 h-3" />
                  <span>{error}</span>
                </div>
              )}
            </div>

            {/* Right Action Group */}
            <div className="flex items-center gap-2 shrink-0 justify-end w-full lg:w-auto">
              {siteConfig.gachaEnabled && (
                <button
                  onClick={handleGachaMode}
                  disabled={submitting || compressing}
                  className={cn(
                    'inline-flex h-9 items-center gap-2 rounded-lg border px-3.5 text-xs font-medium transition-all',
                    submitting || compressing
                      ? 'cursor-not-allowed border-border/70 bg-card/50 text-foreground/40'
                      : 'border-amber-500/30 bg-amber-500/12 text-amber-200 hover:bg-amber-500/18'
                  )}
                  title="一次性提交 3 个相同参数的任务"
                >
                  {compressing || submitting ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Dices className="w-4 h-4" />
                  )}
                  <span>抽卡 x3</span>
                </button>
              )}

              <button
                onClick={handleGenerate}
                disabled={submitting || compressing}
                className={cn(
                  'inline-flex h-9 items-center justify-center gap-2 px-5 rounded-lg font-medium text-sm transition-all',
                  submitting || compressing
                    ? 'bg-card/60 text-foreground/40 cursor-not-allowed'
                    : 'bg-gradient-to-r from-sky-500 to-emerald-500 text-white hover:opacity-90'
                )}
              >
                {submitting || compressing ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>{compressing ? '处理图片中...' : '提交中...'}</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4" />
                    <span>立即生成</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="order-1 flex-1 min-h-0 overflow-hidden">
        <ResultGallery
          generations={generations}
          tasks={tasks}
          onRemoveTask={handleRemoveTask}
          onClearFailedTasks={handleClearFailedTasks}
          onRemoveGeneration={handleRemoveGeneration}
          onReuseGeneration={handleReuseCompletedGeneration}
          busyGenerationId={busyGenerationId}
          clearingFailedTasks={clearingFailedTasks}
        />
      </div>
    </div>
  );
}

export default function ImagePage() {
  return <ImageGenerationPage />;
}
