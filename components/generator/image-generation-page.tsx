'use client';
/* eslint-disable @next/next/no-img-element */

import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import {
  Upload,
  Loader2,
  AlertCircle,
  Sparkles,
  Dices,
  Info,
  X,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { compressImageToWebP, fileToBase64 } from '@/lib/image-compression';
import type { Generation, SafeImageModel, DailyLimitConfig } from '@/types';
import { toast } from '@/components/ui/toaster';
import type { Task } from '@/components/generator/result-gallery';
import { CustomSelect } from '@/components/ui/select-custom';
import {
  deleteGenerationRecord,
  fetchPendingGenerationTasks,
  fetchRecentUserGenerations,
  filterGenerationsByKind,
  filterTasksByKind,
  isTerminalGenerationStatus,
  mergeGenerationsById,
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
  externalReference = null,
  onClearExternalReference,
  onReuseGeneration,
  onGenerationDeleted,
  isActive = true,
}: ImageGenerationPageProps) {
  const router = useRouter();
  const { update } = useSession();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const abortControllersRef = useRef<Map<string, AbortController>>(new Map());
  const refreshGenerationFeedRef = useRef<() => Promise<void>>(async () => {});
  const imagesRef = useRef<Array<{ file: File; preview: string }>>([]);

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
  const [prompt, setPrompt] = useState('');
  const [images, setImages] = useState<Array<{ file: File; preview: string }>>([]);
  const [generations, setGenerations] = useState<Generation[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [compressing, setCompressing] = useState(false);
  const [compressedCache, setCompressedCache] = useState<Map<File, string>>(new Map());
  const [busyGenerationId, setBusyGenerationId] = useState<string | null>(null);
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
    return () => {
      imagesRef.current.forEach((img) => URL.revokeObjectURL(img.preview));
      imagesRef.current = [];
    };
  }, []);

  useEffect(() => {
    const loadModels = async () => {
      try {
        const res = await fetch('/api/image-models');
        if (!res.ok) return;

        const data = await res.json();
        const models = data.data?.models || [];
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
  }, []);

  useEffect(() => {
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
  }, []);

  useEffect(() => {
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

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = Array.from(e.target.files || []);
    const nextImages: Array<{ file: File; preview: string }> = [];

    for (const file of selectedFiles) {
      if (!file.type.startsWith('image/')) continue;

      if (file.size > 15 * 1024 * 1024) {
        setError('图片大小不能超过 15MB');
        continue;
      }

      nextImages.push({
        file,
        preview: URL.createObjectURL(file),
      });
    }

    if (nextImages.length > 0) {
      setError('');
      onClearExternalReference?.();
      setImages((prev) => [...prev, ...nextImages]);
    }

    e.target.value = '';
  };

  const loadRecentGenerations = useCallback(async () => {
    try {
      const recentGenerations = await fetchRecentUserGenerations(24);
      const completedImageGenerations = filterGenerationsByKind(
        recentGenerations.filter(
          (generation) =>
            generation.resultUrl &&
            generation.status === 'completed' &&
            isTerminalGenerationStatus(generation.status)
        ),
        'image'
      );

      setGenerations((prev) => mergeGenerationsById(prev, completedImageGenerations));
    } catch (err) {
      console.error('Failed to load recent image generations:', err);
    }
  }, []);

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
              shouldResyncAfterPoll = true;
              return;
            }

            setTasks((prev) =>
              prev.map((task) =>
                task.id === taskId
                  ? {
                      ...task,
                      status: 'failed' as const,
                      errorMessage,
                    }
                  : task
              )
            );
          },
          onTimeout: async () => {
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
    [loadRecentGenerations, update]
  );

  const loadPendingTasks = useCallback(async () => {
    try {
      const imageTasks = filterTasksByKind(
        await fetchPendingGenerationTasks(200),
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
    compressedImages?: Array<{ mimeType: string; data: string }>
  ) => {
    if (!currentModel) throw new Error('请选择模型');

    const res = await fetch('/api/generate/image', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        modelId: currentModel.id,
        prompt: taskPrompt,
        aspectRatio,
        imageSize: currentModel.features.imageSize ? imageSize : undefined,
        images: compressedImages || [],
        referenceImageUrl: externalReference?.sourceUrl,
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

    setTasks((prev) => [newTask, ...prev]);
    void pollTaskStatus(data.data.id, taskPrompt);

    return data.data.id;
  };

  const handleGenerate = async () => {
    const validationError = validateInput();
    if (validationError) {
      setError(validationError);
      return;
    }

    setError('');
    setSubmitting(true);

    const taskPrompt = prompt.trim();

    try {
      const compressedImages = await compressImagesIfNeeded();
      await submitSingleTask(taskPrompt, compressedImages);

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
      setSubmitting(false);
    }
  };

  const handleGachaMode = async () => {
    const validationError = validateInput();
    if (validationError) {
      setError(validationError);
      return;
    }

    setError('');
    setSubmitting(true);

    const taskPrompt = prompt.trim();

    try {
      const compressedImages = await compressImagesIfNeeded();

      for (let index = 0; index < 3; index += 1) {
        await submitSingleTask(taskPrompt, compressedImages);
      }

      toast({
        title: '已提交 3 个任务',
        description: '抽卡模式启动，等待结果中...',
      });

      setDailyUsage((prev) => ({ ...prev, imageCount: prev.imageCount + 3 }));

      if (!keepPrompt) {
        setPrompt('');
        clearImages();
        onClearExternalReference?.();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '生成失败');
    } finally {
      setSubmitting(false);
    }
  };

  const getCurrentResolutionDisplay = () => {
    if (!currentModel) return '';
    return getImageResolution(currentModel, aspectRatio, imageSize);
  };

  const previewUrl = images[0]?.preview || externalReference?.previewUrl || '';
  const isUsingExternalReference = Boolean(externalReference) && images.length === 0;

  return (
    <div
      className={cn(
        'flex flex-col max-w-7xl mx-auto',
        embedded ? 'min-h-0' : 'lg:h-[calc(100vh-100px)]'
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
          'surface shrink-0 overflow-visible mb-4 lg:mb-0 lg:order-2',
          (availableModels.length === 0 || isImageLimitReached) && 'opacity-50 pointer-events-none'
        )}
      >
        <div className="p-4">
          <div className="flex gap-4 mb-4">
            {currentModel?.features.imageToImage && (
              <div
                onClick={() => fileInputRef.current?.click()}
                className={cn(
                  'w-24 h-20 shrink-0 border-2 border-dashed rounded-lg flex flex-col items-center justify-center cursor-pointer transition-all',
                  previewUrl
                    ? 'border-border/70 bg-card/60'
                    : 'border-border/70 hover:border-border hover:bg-card/60'
                )}
              >
                <input
                  type="file"
                  ref={fileInputRef}
                  className="hidden"
                  multiple
                  accept="image/*"
                  onChange={handleFileUpload}
                />
                {previewUrl ? (
                  <div className="relative w-full h-full">
                    <img src={previewUrl} alt="" className="w-full h-full object-cover rounded-md" />
                    {images.length > 1 && (
                      <div className="absolute bottom-1 right-1 px-1.5 py-0.5 bg-black/70 rounded text-[10px] text-white">
                        +{images.length - 1}
                      </div>
                    )}
                    {isUsingExternalReference && (
                      <div className="absolute left-1 bottom-1 px-1.5 py-0.5 bg-black/70 rounded text-[10px] text-white">
                        生成结果
                      </div>
                    )}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        if (images.length > 0) {
                          clearImages();
                          return;
                        }
                        onClearExternalReference?.();
                      }}
                      className="absolute -top-2 -right-2 w-5 h-5 bg-red-500 rounded-full flex items-center justify-center hover:bg-red-600"
                    >
                      <X className="w-3 h-3 text-white" />
                    </button>
                  </div>
                ) : (
                  <>
                    <Upload className="w-5 h-5 text-foreground/40 mb-1" />
                    <span className="text-[10px] text-foreground/40">参考图</span>
                  </>
                )}
              </div>
            )}

            <div className="flex-1 relative">
              <textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="描述你想要生成的图像..."
                className="w-full h-20 px-3 py-2 bg-input/70 border border-border/70 text-foreground rounded-lg resize-none text-sm focus:outline-none focus:border-border focus:ring-2 focus:ring-ring/30"
              />
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="min-w-[160px]">
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
              <div className="w-[100px]">
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
              <div className="w-[100px]">
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

            {currentModel && (
              <span className="text-xs text-foreground/40">{getCurrentResolutionDisplay()}</span>
            )}

            <label className="flex items-center gap-1.5 cursor-pointer select-none text-xs text-foreground/50">
              <input
                type="checkbox"
                checked={keepPrompt}
                onChange={(e) => setKeepPrompt(e.target.checked)}
                className="w-3.5 h-3.5 rounded border-border/70 bg-card/60 accent-sky-400 cursor-pointer"
              />
              <span>保留</span>
            </label>

            {error && (
              <div className="flex items-center gap-1.5 text-xs text-red-400">
                <AlertCircle className="w-3 h-3" />
                <span>{error}</span>
              </div>
            )}

            <div className="flex-1" />

            <div className="relative group">
              <button
                onClick={handleGachaMode}
                disabled={submitting || compressing}
                className={cn(
                  'w-9 h-9 flex items-center justify-center rounded-lg transition-all',
                  submitting || compressing
                    ? 'bg-card/60 text-foreground/40 cursor-not-allowed'
                    : 'bg-gradient-to-r from-amber-500 to-orange-500 text-white hover:opacity-90'
                )}
                title="抽卡模式"
              >
                {compressing || submitting ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Dices className="w-4 h-4" />
                )}
              </button>
              <div className="absolute bottom-full right-0 mb-2 hidden group-hover:block z-20">
                <div className="bg-card/90 border border-border/70 rounded-lg px-3 py-2 text-xs text-foreground/80 whitespace-nowrap shadow-lg">
                  <div className="flex items-center gap-1.5 mb-1">
                    <Info className="w-3 h-3 text-amber-300" />
                    <span className="font-medium text-foreground">抽卡模式</span>
                  </div>
                  <p>一次性提交 3 个相同参数的任务</p>
                </div>
              </div>
            </div>

            <button
              onClick={handleGenerate}
              disabled={submitting || compressing}
              className={cn(
                'flex items-center gap-2 px-5 py-2 rounded-lg font-medium text-sm transition-all',
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

      <div className="flex-1 min-h-0 lg:order-1 pb-20 lg:pb-4">
        <ResultGallery
          generations={generations}
          tasks={tasks}
          onRemoveTask={handleRemoveTask}
          onRemoveGeneration={handleRemoveGeneration}
          onReuseGeneration={handleReuseCompletedGeneration}
          busyGenerationId={busyGenerationId}
        />
      </div>
    </div>
  );
}

export default function ImagePage() {
  return <ImageGenerationPage />;
}
