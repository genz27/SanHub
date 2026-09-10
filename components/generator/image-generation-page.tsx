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
  ScanSearch,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Generation, SafeImageModel, DailyLimitConfig } from '@/types';
import { toast } from '@/components/ui/toaster';
import type { Task } from '@/components/generator/result-gallery';
import { GenerationAdvancedPanel } from '@/components/generator/generation-advanced-panel';
import { InlineToggle } from '@/components/generator/inline-toggle';
import { OptionChipGroup } from '@/components/generator/option-chip-group';
import {
  ReferenceImageInput,
  type ReferenceImageItem,
} from '@/components/generator/reference-image-input';
import { useSiteConfig } from '@/components/providers/site-config-provider';
import { CustomSelect } from '@/components/ui/select-custom';
import type { ReusableImageReference } from '@/lib/generation-reference';
import { fetchGenerationFeed } from '@/lib/generation-feed';
import {
  buildTaskFromGeneration,
  filterGenerationsByKind,
  filterTasksByKind,
  isFailedGenerationStatus,
  isTerminalGenerationStatus,
  mergeGenerationsById,
  mergeTasksById,
  replaceActiveTasks,
  shouldResyncGenerationFeed,
} from '@/lib/generation-state';
import { useClearFailedTasks } from '@/components/generator/use-clear-failed-tasks';
import type { RegionEditResult } from '@/components/generator/image-region-editor';
import type { SketchElement } from '@/lib/sketch-document';
import {
  cloneRegionEditDraft,
  hasRegionDraft,
  readStoredRegionDrafts,
  writeStoredRegionDrafts,
  type RegionEditDraft,
} from '@/lib/region-edit-document';
import { requestExtractedPrompt } from '@/lib/extract-prompt';

const ResultGallery = dynamic(
  () => import('@/components/generator/result-gallery').then((mod) => mod.ResultGallery),
  {
    ssr: false,
    loading: () => (
      <div className="surface p-6 text-sm text-foreground/50">Loading results...</div>
    ),
  }
);

const SketchPad = dynamic(
  () => import('@/components/generator/sketch-pad').then((mod) => mod.SketchPad),
  { ssr: false }
);

const ImageRegionEditor = dynamic(
  () => import('@/components/generator/image-region-editor').then((mod) => mod.ImageRegionEditor),
  { ssr: false }
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

const GPT_IMAGE_QUALITY_OPTIONS = [
  { value: 'low', label: '低' },
  { value: 'medium', label: '中' },
  { value: 'high', label: '高' },
];

function getGptImageQualityOptions(model?: SafeImageModel) {
  if (!model) return [];
  if (
    model.channelType !== 'apexerapi' &&
    model.channelType !== 'openai-compatible' &&
    model.channelType !== 'openai-chat'
  ) {
    return [];
  }
  if (!model.apiModel.toLowerCase().includes('gpt-image-2')) return [];

  const allowed = model.features.qualityOptions;
  if (allowed && allowed.length > 0) {
    return GPT_IMAGE_QUALITY_OPTIONS.filter((option) => allowed.includes(option.value));
  }
  return GPT_IMAGE_QUALITY_OPTIONS;
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
  const refreshGenerationFeedRef = useRef<(includeUsage?: boolean) => Promise<void>>(async () => {});
  const lastFeedResyncAtRef = useRef(0);
  const imagesRef = useRef<ReferenceImageItem[]>([]);
  const isActiveRef = useRef(isActive);
  const submissionLockRef = useRef(false);
  const promptTextareaRef = useRef<HTMLTextAreaElement>(null);
  const extractInputRef = useRef<HTMLInputElement>(null);

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
  const [images, setImages] = useState<ReferenceImageItem[]>([]);
  const [generations, setGenerations] = useState<Generation[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const {
    clearingFailedTasks,
    clearFailedTasks,
    dismissFailedTaskIds,
    isClearingFailedTasks,
    rejectDismissedFailedTasks,
  } = useClearFailedTasks(setTasks);
  const tasksRef = useRef(tasks);
  tasksRef.current = tasks;
  const [submitting, setSubmitting] = useState(false);
  const [compressing, setCompressing] = useState(false);
  const [compressedCache, setCompressedCache] = useState<Map<File, string>>(new Map());
  const [busyGenerationId, setBusyGenerationId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [keepPrompt, setKeepPrompt] = useState(false);
  const [sketchOpen, setSketchOpen] = useState(false);
  const [sketchElements, setSketchElements] = useState<SketchElement[]>([]);
  const [sketchPreview, setSketchPreview] = useState<string | null>(null);
  const [editingGeneration, setEditingGeneration] = useState<Generation | null>(null);
  const [regionDrafts, setRegionDrafts] = useState<Record<string, RegionEditDraft>>({});
  const [extractingPrompt, setExtractingPrompt] = useState(false);

  useEffect(() => {
    setRegionDrafts(readStoredRegionDrafts());
  }, []);

  const saveRegionDraftToIds = useCallback((generationIds: string[], draft: RegionEditDraft) => {
    setRegionDrafts((current) => {
      const next = { ...current };
      const cloned = hasRegionDraft(draft) ? cloneRegionEditDraft(draft) : null;
      for (const generationId of generationIds) {
        if (cloned) {
          next[generationId] = cloned;
        } else {
          delete next[generationId];
        }
      }
      writeStoredRegionDrafts(next);
      return next;
    });
  }, []);

  const saveRegionDraft = useCallback(
    (generationId: string, draft: RegionEditDraft) => {
      saveRegionDraftToIds([generationId], draft);
    },
    [saveRegionDraftToIds]
  );

  const clearImages = useCallback(() => {
    setImages((prev) => {
      prev.forEach((img) => URL.revokeObjectURL(img.preview));
      return [];
    });
    setCompressedCache(new Map());
    setSketchPreview(null);
    setSketchElements([]);
  }, []);

  const currentModel = useMemo(() => {
    return availableModels.find((model) => model.id === selectedModelId) || availableModels[0];
  }, [availableModels, selectedModelId]);
  const qualityOptions = useMemo(() => getGptImageQualityOptions(currentModel), [currentModel]);

  const hasReferenceInput = images.length > 0 || Boolean(externalReference);

  useEffect(() => {
    if (qualityOptions.length === 0) return;
    if (!qualityOptions.some((option) => option.value === quality)) {
      setQuality(qualityOptions[0].value);
    }
  }, [quality, qualityOptions]);

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

  // Auto-height textarea: grow as content grows, capped at 200px
  useEffect(() => {
    const textarea = promptTextareaRef.current;
    if (!textarea) return;
    const maxH = 200;
    textarea.style.height = '0px';
    textarea.style.height = `${Math.min(textarea.scrollHeight, maxH)}px`;
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

  const externalReferenceId = externalReference?.generationId ?? null;

  useEffect(() => {
    if (!externalReferenceId) return;
    setImages((prev) => {
      if (prev.length === 0) return prev;
      prev.forEach((img) => URL.revokeObjectURL(img.preview));
      return [];
    });
    setCompressedCache(new Map());
    setSketchPreview(null);
  }, [externalReferenceId]);

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

      return nextImages.length;
    },
    [onClearExternalReference]
  );

  const handleSketchConfirm = useCallback(
    (file: File) => {
      const preview = URL.createObjectURL(file);
      setError('');
      onClearExternalReference?.();
      setImages((prev) => {
        const existingIndex = sketchPreview
          ? prev.findIndex((image) => image.preview === sketchPreview)
          : -1;
        if (existingIndex >= 0) {
          URL.revokeObjectURL(prev[existingIndex].preview);
          return prev.map((image, index) =>
            index === existingIndex ? { file, preview } : image
          );
        }
        return [...prev, { file, preview }];
      });
      setSketchPreview(preview);
      setSketchOpen(false);
    },
    [onClearExternalReference, sketchPreview]
  );

  const applyRegionEditToComposer = useCallback(
    (
      result: { files: File[]; prompt: string; aspectRatio?: string; imageSize?: string },
      options?: { closeEditor?: boolean }
    ) => {
      if (currentModel && !currentModel.features.imageToImage) {
        toast({
          title: '当前模型不支持图生图',
          description: '请先切换到支持参考图的模型，再做区域编辑',
          variant: 'destructive',
        });
        return false;
      }

      onClearExternalReference?.();
      setError('');
      setCompressedCache(new Map());
      setSketchPreview(null);
      setImages((prev) => {
        prev.forEach((img) => URL.revokeObjectURL(img.preview));
        return result.files.map((file, index) => ({
          file,
          preview: URL.createObjectURL(file),
          label: index === 0 ? '选区标注' : index === 1 ? '原图' : undefined,
        }));
      });
      setPrompt(result.prompt);
      if (result.aspectRatio) {
        setAspectRatio(result.aspectRatio);
      }
      if (result.imageSize) {
        setImageSize(result.imageSize);
      }
      if (options?.closeEditor !== false) {
        setEditingGeneration(null);
      }
      return true;
    },
    [currentModel, onClearExternalReference]
  );

  const handleRemoveReferenceImage = useCallback((index: number) => {
    setImages((prev) => {
      const target = prev[index];
      if (!target) return prev;

      if (target.preview === sketchPreview) {
        setSketchPreview(null);
      }

      URL.revokeObjectURL(target.preview);
      setCompressedCache((current) => {
        const nextCache = new Map(current);
        nextCache.delete(target.file);
        return nextCache;
      });

      return prev.filter((_, itemIndex) => itemIndex !== index);
    });
  }, [sketchPreview]);

  const handleClearImportedSketch = useCallback(() => {
    setImages((prev) => {
      if (!sketchPreview) return prev;
      const target = prev.find((image) => image.preview === sketchPreview);
      if (!target) return prev;

      URL.revokeObjectURL(target.preview);
      setCompressedCache((current) => {
        const nextCache = new Map(current);
        nextCache.delete(target.file);
        return nextCache;
      });

      return prev.filter((image) => image.preview !== sketchPreview);
    });
    setSketchPreview(null);
  }, [sketchPreview]);

  const handleDiscardSketchDraft = useCallback(() => {
    setSketchElements([]);
    handleClearImportedSketch();
    toast({
      title: '草图已清空',
      description: '画布和已导入的草图参考图都已去掉',
    });
  }, [handleClearImportedSketch]);

  const applyRecentGenerations = useCallback((recentGenerations: Generation[]) => {
    const imageGenerations = filterGenerationsByKind(recentGenerations, 'image');
    const completedImageGenerations = imageGenerations.filter(
      (generation) =>
        generation.resultUrl &&
        generation.status === 'completed' &&
        isTerminalGenerationStatus(generation.status)
    );
    const failedImageTasks = rejectDismissedFailedTasks(
      imageGenerations
        .filter((generation) => isFailedGenerationStatus(generation.status))
        .map(
          (generation) =>
            ({
              ...buildTaskFromGeneration(generation),
              persisted: true,
            }) satisfies Task
        )
    );

    setGenerations((prev) => mergeGenerationsById(prev, completedImageGenerations));
    if (failedImageTasks.length > 0) {
      setTasks((prev) => mergeTasksById(prev, failedImageTasks));
    }
  }, [rejectDismissedFailedTasks]);

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

  const handleClearFailedTasks = useCallback(() => {
    void clearFailedTasks(tasksRef.current);
  }, [clearFailedTasks]);

  const pollTaskStatus = useCallback(
    async (taskId: string, taskPrompt: string): Promise<void> => {
      if (abortControllersRef.current.has(taskId)) return;

      const controller = new AbortController();
      let shouldResyncAfterPoll = false;
      abortControllersRef.current.set(taskId, controller);

      try {
        const { pollGenerationTask } = await import('@/lib/generation-poll');
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
    [markTaskAsFailed, update]
  );

  const applyPendingTasks = useCallback(
    (pendingTasks: Awaited<ReturnType<typeof fetchGenerationFeed>>['pending']) => {
      const imageTasks = filterTasksByKind(pendingTasks, 'image').map(
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
    },
    [pollTaskStatus]
  );

  const refreshGenerationFeed = useCallback(async (includeUsage = false) => {
    try {
      const feed = await fetchGenerationFeed(12, 'image', 50, { includeUsage });
      applyRecentGenerations(feed.generations);
      applyPendingTasks(feed.pending);
      if (feed.usage) setDailyUsage(feed.usage);
      if (feed.limits) setDailyLimits(feed.limits);
    } catch (err) {
      console.error('Failed to refresh image generation feed:', err);
    }
  }, [applyPendingTasks, applyRecentGenerations]);

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

    const resyncGenerationFeed = (force = false, includeUsage = false) => {
      if (isClearingFailedTasks()) return;
      if (!force && !shouldResyncGenerationFeed(lastFeedResyncAtRef.current)) {
        return;
      }
      lastFeedResyncAtRef.current = Date.now();
      void refreshGenerationFeed(includeUsage);
    };
    const handleWindowFocus = () => {
      resyncGenerationFeed();
    };
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        resyncGenerationFeed();
      }
    };

    resyncGenerationFeed(true, true);
    window.addEventListener('focus', handleWindowFocus);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      window.removeEventListener('focus', handleWindowFocus);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      abortControllers.forEach((controller) => controller.abort());
      abortControllers.clear();
    };
  }, [isActive, isClearingFailedTasks, refreshGenerationFeed]);

  const handleRemoveTask = useCallback(async (taskId: string) => {
    const controller = abortControllersRef.current.get(taskId);
    if (controller) {
      controller.abort();
      abortControllersRef.current.delete(taskId);
    }

    dismissFailedTaskIds([taskId]);

    try {
      await fetch(`/api/user/tasks/${taskId}`, { method: 'DELETE' });
    } catch (err) {
      console.error('取消任务请求失败:', err);
    }

    setTasks((prev) => prev.filter((task) => task.id !== taskId));
  }, [dismissFailedTaskIds]);

  const handleRemoveGeneration = useCallback(
    async (generation: Generation) => {
      if (busyGenerationId) return;

      const confirmed = window.confirm('确认删除这条已生成记录吗？删除后将无法在当前站点继续访问该作品。');
      if (!confirmed) return;

      setBusyGenerationId(generation.id);
      setGenerations((prev) => prev.filter((item) => item.id !== generation.id));

      try {
        const { deleteGenerationRecord } = await import('@/lib/generation-delete');
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
          const { compressImageToWebP, fileToBase64 } = await import('@/lib/image-compression');
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

  const compressFileList = async (
    files: File[]
  ): Promise<Array<{ mimeType: string; data: string }>> => {
    if (files.length === 0) return [];

    setCompressing(true);
    setError('');
    try {
      const compressedImages = [];
      for (const file of files) {
        const { compressImageToWebP, fileToBase64 } = await import('@/lib/image-compression');
        const compressedFile = await compressImageToWebP(file);
        const base64 = await fileToBase64(compressedFile);
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

  const handleExtractUploadedImage = async (file: File) => {
    if (extractingPrompt) return;
    if (!file.type.startsWith('image/')) {
      toast({
        title: '反推失败',
        description: '请上传一张图片',
        variant: 'destructive',
      });
      return;
    }
    setExtractingPrompt(true);
    try {
      const { compressImageForVision, fileToBase64 } = await import('@/lib/image-compression');
      const compressedFile = await compressImageForVision(file);
      const base64 = await fileToBase64(compressedFile);
      const result = await requestExtractedPrompt({ image: `data:image/jpeg;base64,${base64}` });
      setPrompt(result.prompt);
      promptTextareaRef.current?.focus();
      toast({
        title: '已反推并填入提示词',
        description: result.cost ? `消耗 ${result.cost} 积分` : undefined,
      });
    } catch (error) {
      toast({
        title: '反推失败',
        description: error instanceof Error ? error.message : '请稍后重试',
        variant: 'destructive',
      });
    } finally {
      setExtractingPrompt(false);
    }
  };

  const submitSingleTask = async (
    taskPrompt: string,
    compressedImages: Array<{ mimeType: string; data: string }> | undefined,
    clientRequestId: string,
    options?: { aspectRatio?: string; imageSize?: string }
  ) => {
    if (!currentModel) throw new Error('请选择模型');

    const { fetchGenerationSubmit } = await import('@/lib/generation-submit');
    const res = await fetchGenerationSubmit('/api/generate/image', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        modelId: currentModel.id,
        prompt: taskPrompt,
        aspectRatio: options?.aspectRatio || aspectRatio,
        imageSize: currentModel.features.imageSize ? options?.imageSize || imageSize : undefined,
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

  const handleApplyRegionEdit = useCallback(
    (result: RegionEditResult) => {
      if (editingGeneration) {
        saveRegionDraft(editingGeneration.id, result.draft);
      }
      if (!applyRegionEditToComposer(result)) return;
      toast({
        title: '已填入输入栏',
        description: '可以改提示词后再点立即生成，或直接在编辑器里提交',
      });
    },
    [applyRegionEditToComposer, editingGeneration, saveRegionDraft]
  );

  const handleApplyRegionEditAndGenerate = useCallback(
    async (result: RegionEditResult) => {
      if (currentModel && !currentModel.features.imageToImage) {
        toast({
          title: '当前模型不支持图生图',
          description: '请先切换到支持参考图的模型，再做区域编辑',
          variant: 'destructive',
        });
        return;
      }
      if (submissionLockRef.current) return;

      const validationError = isImageLimitReached
        ? `今日图像生成次数已达上限 (${dailyLimits.imageLimit} 次)`
        : currentModel
          ? null
          : '请选择模型';
      if (validationError) {
        setError(validationError);
        toast({
          title: '无法提交',
          description: validationError,
          variant: 'destructive',
        });
        return;
      }

      submissionLockRef.current = true;
      setError('');
      setSubmitting(true);

      try {
        const compressedImages = await compressFileList(result.files);
        const sourceId = editingGeneration?.id;
        const taskId = await submitSingleTask(result.prompt, compressedImages, createClientRequestId(), {
          aspectRatio: result.aspectRatio,
          imageSize: result.imageSize,
        });
        if (sourceId) {
          saveRegionDraftToIds([sourceId, taskId], result.draft);
        }
        setEditingGeneration(null);
        toast({
          title: '区域编辑已提交',
          description: '已直接提交生成任务，再改时会带回这些框',
        });
        setDailyUsage((prev) => ({ ...prev, imageCount: prev.imageCount + 1 }));
        if (keepPrompt) {
          applyRegionEditToComposer(result, { closeEditor: false });
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : '生成失败';
        setError(message);
        toast({
          title: '提交失败',
          description: message,
          variant: 'destructive',
        });
      } finally {
        submissionLockRef.current = false;
        setSubmitting(false);
      }
    },
    [
      applyRegionEditToComposer,
      currentModel,
      dailyLimits.imageLimit,
      editingGeneration,
      isImageLimitReached,
      keepPrompt,
      saveRegionDraftToIds,
    ]
  );

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
          embedded && 'min-h-[15rem]'
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
        <div
          className={cn(
            'space-y-3 p-4',
            (availableModels.length === 0 || isImageLimitReached) && 'pointer-events-none opacity-50'
          )}
        >
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

          <div className="flex flex-col gap-4 sm:flex-row">
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
                  onOpenSketch={() => setSketchOpen(true)}
                  onDiscardSketch={handleDiscardSketchDraft}
                  hasSketchDraft={sketchElements.length > 0}
                  listenForPaste={!sketchOpen && !editingGeneration}
                />
              </div>
            )}

            <div className="relative flex-1">
              <textarea
                ref={promptTextareaRef}
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="描述你想要生成的图像..."
                className="w-full min-h-[80px] max-h-[200px] resize-none overflow-y-auto rounded-lg border border-border/70 bg-input/70 px-3 py-2 text-sm text-foreground focus:border-border focus:outline-none focus:ring-2 focus:ring-ring/30"
              />
              <div className="pointer-events-none absolute bottom-1.5 right-2 select-none text-xs text-foreground/40">
                {prompt.length}
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <input
              ref={extractInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.target.value = '';
                if (file) void handleExtractUploadedImage(file);
              }}
            />
            <button
              type="button"
              disabled={extractingPrompt}
              onClick={() => extractInputRef.current?.click()}
              title="单独上传一张图来反推提示词"
              className="inline-flex h-7 items-center gap-1.5 rounded-md border border-border/70 px-2 text-[11px] font-medium text-foreground/80 hover:bg-card disabled:opacity-60"
            >
              {extractingPrompt ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ScanSearch className="h-3.5 w-3.5" />}
              反推提示词
            </button>
            {currentModel && (
              <OptionChipGroup
                label="比例"
                value={aspectRatio}
                onChange={setAspectRatio}
                options={currentModel.aspectRatios.map((ratio) => ({
                  value: ratio,
                  label: ratio,
                }))}
              />
            )}
            {currentModel?.features.imageSize && currentModel.imageSizes && (
              <OptionChipGroup
                label="尺寸"
                value={imageSize}
                onChange={setImageSize}
                options={currentModel.imageSizes.map((size) => ({
                  value: size,
                  label: size,
                }))}
              />
            )}
            {currentModel && getCurrentResolutionDisplay() && (
              <span className="inline-flex h-7 items-center rounded-md border border-border/60 px-2 font-mono text-[11px] text-muted-foreground">
                {getCurrentResolutionDisplay()}
              </span>
            )}
            <GenerationAdvancedPanel>
              {qualityOptions.length > 0 && (
                <OptionChipGroup
                  label="质量"
                  value={quality}
                  onChange={setQuality}
                  options={qualityOptions}
                />
              )}
              <InlineToggle
                checked={keepPrompt}
                onCheckedChange={setKeepPrompt}
                label="保留输入"
              />
            </GenerationAdvancedPanel>
            {error && (
              <div className="flex items-center gap-1.5 text-xs text-red-400">
                <AlertCircle className="h-3 w-3" />
                <span>{error}</span>
              </div>
            )}

            <div className="ml-auto flex items-center gap-2">
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
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Dices className="h-4 w-4" />
                  )}
                  <span>抽卡 x3</span>
                </button>
              )}

              <button
                onClick={handleGenerate}
                disabled={submitting || compressing}
                className={cn(
                  'inline-flex h-9 items-center justify-center gap-2 rounded-lg px-5 text-sm font-medium transition-all',
                  submitting || compressing
                    ? 'cursor-not-allowed bg-card/60 text-foreground/40'
                    : 'bg-foreground text-background hover:opacity-90'
                )}
              >
                {submitting || compressing ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span>{compressing ? '处理图片中...' : '提交中...'}</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="h-4 w-4" />
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
          onEditGeneration={
            currentModel?.features.imageToImage ? setEditingGeneration : undefined
          }
          hasRegionDraft={(generationId) => hasRegionDraft(regionDrafts[generationId])}
          busyGenerationId={busyGenerationId}
          clearingFailedTasks={clearingFailedTasks}
        />
      </div>

      {sketchOpen && (
        <SketchPad
          open
          elements={sketchElements}
          onElementsChange={setSketchElements}
          onClose={() => setSketchOpen(false)}
          onConfirm={handleSketchConfirm}
          onClearImported={handleClearImportedSketch}
        />
      )}
      {editingGeneration && (
        <ImageRegionEditor
          key={editingGeneration.id}
          generation={editingGeneration}
          model={currentModel}
          draft={regionDrafts[editingGeneration.id] ?? null}
          submitting={submitting || compressing}
          onClose={() => setEditingGeneration(null)}
          onDraftChange={(draft) => saveRegionDraft(editingGeneration.id, draft)}
          onApply={handleApplyRegionEdit}
          onApplyAndGenerate={handleApplyRegionEditAndGenerate}
        />
      )}
    </div>
  );
}

export default function ImagePage() {
  return <ImageGenerationPage />;
}
