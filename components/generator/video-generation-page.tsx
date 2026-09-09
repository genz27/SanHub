'use client';
/* eslint-disable @next/next/no-img-element */

import { useState, useRef, useEffect, useCallback, useMemo, type ReactNode } from 'react';
import dynamic from 'next/dynamic';
import { useSession } from 'next-auth/react';
import {
  Sparkles,
  Loader2,
  AlertCircle,
  Dices,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from '@/components/ui/toaster';
import { CustomSelect } from '@/components/ui/select-custom';
import { GenerationAdvancedPanel } from '@/components/generator/generation-advanced-panel';
import { InlineToggle } from '@/components/generator/inline-toggle';
import { OptionChipGroup } from '@/components/generator/option-chip-group';
import { ReferenceImageInput } from '@/components/generator/reference-image-input';
import type { Task } from '@/components/generator/result-gallery';
import { useSiteConfig } from '@/components/providers/site-config-provider';
import type { Generation, SafeVideoModel, DailyLimitConfig } from '@/types';
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

const ResultGallery = dynamic(
  () => import('@/components/generator/result-gallery').then((mod) => mod.ResultGallery),
  {
    ssr: false,
    loading: () => (
      <div className="surface p-6 text-sm text-foreground/50">Loading results...</div>
    ),
  }
);

// 每日使用量类型
interface DailyUsage {
  imageCount: number;
  videoCount: number;
  characterCardCount: number;
}

export interface VideoGenerationPageProps {
  embedded?: boolean;
  createModeSwitcher?: ReactNode;
  externalReference?: ReusableImageReference | null;
  onExternalReferenceChange?: (reference: ReusableImageReference | null) => void;
  isActive?: boolean;
}

export function VideoGenerationView({
  embedded = false,
  createModeSwitcher,
  externalReference: controlledExternalReference,
  onExternalReferenceChange,
  isActive = true,
}: VideoGenerationPageProps = {}) {
  const { update } = useSession();
  const siteConfig = useSiteConfig();
  const abortControllersRef = useRef<Map<string, AbortController>>(new Map());
  const filesRef = useRef<Array<{ file: File; preview: string }>>([]);
  const refreshGenerationFeedRef = useRef<(includeUsage?: boolean) => Promise<void>>(async () => {});
  const lastFeedResyncAtRef = useRef(0);
  const isActiveRef = useRef(isActive);
  const submissionLockRef = useRef(false);
  const [localExternalReference, setLocalExternalReference] =
    useState<ReusableImageReference | null>(null);

  // 模型列表（从 API 获取）
  const [availableModels, setAvailableModels] = useState<SafeVideoModel[]>([]);
  const [modelsLoaded, setModelsLoaded] = useState(false);

  // 每日限制
  const [dailyUsage, setDailyUsage] = useState<DailyUsage>({ imageCount: 0, videoCount: 0, characterCardCount: 0 });
  const [dailyLimits, setDailyLimits] = useState<DailyLimitConfig>({ imageLimit: 0, videoLimit: 0, characterCardLimit: 0 });

  // 模型选择
  const [selectedModelId, setSelectedModelId] = useState<string>('');

  // 参数状态
  const [aspectRatio, setAspectRatio] = useState<string>('landscape');
  const [duration, setDuration] = useState<string>('8s');
  const [prompt, setPrompt] = useState('');
  const [files, setFiles] = useState<Array<{ file: File; preview: string }>>([]);
  const [compressing, setCompressing] = useState(false);
  const [compressedCache, setCompressedCache] = useState<Map<File, string>>(new Map());

  // 任务状态
  const [generations, setGenerations] = useState<Generation[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [busyGenerationId, setBusyGenerationId] = useState<string | null>(null);
  const [clearingFailedTasks, setClearingFailedTasks] = useState(false);
  const [error, setError] = useState('');
  const [keepPrompt, setKeepPrompt] = useState(false);
  const promptTextareaRef = useRef<HTMLTextAreaElement>(null);

  const activeExternalReference =
    controlledExternalReference !== undefined
      ? controlledExternalReference
      : localExternalReference;

  const setActiveExternalReference = useCallback(
    (reference: ReusableImageReference | null) => {
      if (onExternalReferenceChange) {
        onExternalReferenceChange(reference);
        return;
      }

      setLocalExternalReference(reference);
    },
    [onExternalReferenceChange]
  );

  const clearFiles = useCallback(() => {
    setFiles((prev) => {
      prev.forEach((file) => URL.revokeObjectURL(file.preview));
      return [];
    });
    setCompressedCache(new Map());
  }, []);

  useEffect(() => {
    filesRef.current = files;
  }, [files]);

  useEffect(() => {
    isActiveRef.current = isActive;
  }, [isActive]);

  // 获取当前选中的模型配置
  const currentModel = useMemo(() => {
    return availableModels.find(m => m.id === selectedModelId) || availableModels[0];
  }, [availableModels, selectedModelId]);
  const selectedDuration = currentModel?.durations.find((item) => item.value === duration);
  const modelsCacheRef = useRef<SafeVideoModel[] | null>(null);

  // 加载模型列表
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
        const res = await fetch('/api/video-models');
        if (res.ok) {
          const data = await res.json();
          const models = data.data?.models || [];
          modelsCacheRef.current = models;
          setAvailableModels(models);
          // 设置默认选中第一个模型
          if (models.length > 0) {
            setSelectedModelId((prev) => {
              if (prev) return prev;
              setAspectRatio(models[0].defaultAspectRatio);
              setDuration(models[0].defaultDuration);
              return models[0].id;
            });
          }
        }
      } catch (err) {
        console.error('Failed to load models:', err);
      } finally {
        setModelsLoaded(true);
      }
    };
    void loadModels();
  }, [isActive, modelsLoaded]);

  // 当模型改变时，重置参数到默认值
  useEffect(() => {
    if (!isActiveRef.current) {
      return;
    }

    const model = availableModels.find(m => m.id === selectedModelId);
    if (model) {
      setAspectRatio(model.defaultAspectRatio);
      setDuration(model.defaultDuration);
      if (!model.features.imageToVideo && files.length > 0) {
        clearFiles();
      }
      if (!model.features.imageToVideo && activeExternalReference) {
        setActiveExternalReference(null);
      }
    }
  }, [selectedModelId, availableModels, activeExternalReference, clearFiles, files.length, setActiveExternalReference]);

  useEffect(() => {
    if (!activeExternalReference) return;
    if (files.length > 0) {
      clearFiles();
    }
  }, [activeExternalReference, clearFiles, files.length]);

  // 检测是否包含中文字符（暂时禁用）
  // const containsChinese = (text: string): boolean => {
  //   return /[\u4e00-\u9fa5]/.test(text);
  // };

  // 实时计算是否包含中文（暂时禁用）
  // const hasChinese = containsChinese(prompt);
  const hasChinese = false; // 暂时禁用中文检测

  // 处理提示词输入
  const handlePromptChange = (
    e: React.ChangeEvent<HTMLTextAreaElement>,
    setter: (value: string) => void
  ) => {
    setter(e.target.value);
  };

  const handleAddReferenceFiles = useCallback(
    (selectedFiles: File[]) => {
      const nextFiles: Array<{ file: File; preview: string }> = [];
      let hasOversizedImage = false;

      for (const file of selectedFiles) {
        if (!file.type.startsWith('image/')) continue;

        if (file.size > 15 * 1024 * 1024) {
          hasOversizedImage = true;
          continue;
        }

        nextFiles.push({ file, preview: URL.createObjectURL(file) });
      }

      if (hasOversizedImage) {
        toast({ title: '图片过大', description: '图片大小不能超过 15MB', variant: 'destructive' });
        setError('图片大小不能超过 15MB');
      }

      if (nextFiles.length > 0) {
        setError('');
        if (activeExternalReference) {
          setActiveExternalReference(null);
        }
        setFiles((prev) => [...prev, ...nextFiles]);
      }
    },
    [activeExternalReference, setActiveExternalReference]
  );

  const handleRemoveReferenceImage = useCallback((index: number) => {
    setFiles((prev) => {
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


  const applyRecentGenerations = useCallback((recentGenerations: Generation[]) => {
    const videoGenerations = filterGenerationsByKind(recentGenerations, 'video');
    const completedVideoGenerations = videoGenerations.filter(
      (generation) =>
        generation.resultUrl &&
        generation.status === 'completed' &&
        isTerminalGenerationStatus(generation.status)
    );
    const failedVideoTasks = videoGenerations
      .filter((generation) => isFailedGenerationStatus(generation.status))
      .map(
        (generation) =>
          ({
            ...buildTaskFromGeneration(generation),
            persisted: true,
          }) satisfies Task
      );

    setGenerations((prev) => mergeGenerationsById(prev, completedVideoGenerations));
    if (failedVideoTasks.length > 0) {
      setTasks((prev) => mergeTasksById(prev, failedVideoTasks));
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
      const { deleteGenerationRecords } = await import('@/lib/generation-delete');
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

  // 轮询任务状态
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
          taskType: 'video',
          signal: controller.signal,
          onProgress: (payload) => {
            const nextStatus =
              payload.status === 'pending' || payload.status === 'processing'
                ? payload.status
                : 'processing';

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
      const videoTasks = filterTasksByKind(pendingTasks, 'video').map(
        (task) =>
          ({
            ...task,
            status: task.status === 'processing' ? 'processing' : 'pending',
            progress: typeof task.progress === 'number' ? task.progress : 0,
          }) satisfies Task
      );

      setTasks((prev) => replaceActiveTasks(prev, videoTasks));

      videoTasks.forEach((task) => {
        void pollTaskStatus(task.id, task.prompt);
      });
    },
    [pollTaskStatus]
  );

  const refreshGenerationFeed = useCallback(async (includeUsage = false) => {
    try {
      const feed = await fetchGenerationFeed(12, 'video', 50, { includeUsage });
      applyRecentGenerations(feed.generations);
      applyPendingTasks(feed.pending);
      if (feed.usage) setDailyUsage(feed.usage);
      if (feed.limits) setDailyLimits(feed.limits);
    } catch (err) {
      console.error('Failed to refresh video generation feed:', err);
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
  }, [isActive, refreshGenerationFeed]);

  useEffect(() => {
    return () => {
      filesRef.current.forEach((file) => URL.revokeObjectURL(file.preview));
      filesRef.current = [];
    };
  }, []);

  // Auto-resize textarea height when prompt changes, capped at 200px
  useEffect(() => {
    if (promptTextareaRef.current) {
      const maxH = 200;
      promptTextareaRef.current.style.height = 'auto';
      promptTextareaRef.current.style.height = Math.min(promptTextareaRef.current.scrollHeight, maxH) + 'px';
    }
  }, [prompt]);

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

    setTasks((prev) => prev.filter((t) => t.id !== taskId));
  }, []);

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
        if (activeExternalReference?.generationId === generation.id) {
          setActiveExternalReference(null);
        }
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
    [activeExternalReference, busyGenerationId, setActiveExternalReference]
  );

  // 构建提示词
  const buildPrompt = (): string => {
    return prompt.trim();
  };

  // 压缩并构建 files 数组
  const compressFilesIfNeeded = async (): Promise<{ mimeType: string; data: string }[]> => {
    if (files.length === 0 || !currentModel?.features.imageToVideo) {
      return [];
    }

    setCompressing(true);
    const results: { mimeType: string; data: string }[] = [];
    const nextCache = new Map(compressedCache);

    try {
      for (const { file } of files) {
        // Check cache first
        const cached = nextCache.get(file);
        if (cached) {
          results.push({
            mimeType: 'image/webp',
            data: cached,
          });
          continue;
        }

        try {
          const { compressImageToWebP, fileToBase64 } = await import('@/lib/image-compression');
          const compressedFile = await compressImageToWebP(file);
          const base64 = await fileToBase64(compressedFile);
          nextCache.set(file, base64);
          results.push({
            mimeType: 'image/webp',
            data: base64,
          });
        } catch {
          const { fileToBase64 } = await import('@/lib/image-compression');
          const base64 = await fileToBase64(file);
          results.push({
            mimeType: file.type || 'image/jpeg',
            data: base64,
          });
        }
      }
      setCompressedCache(nextCache);
      return results;
    } finally {
      setCompressing(false);
    }
  };

  // 检查是否达到每日限制
  const isVideoLimitReached = dailyLimits.videoLimit > 0 && dailyUsage.videoCount >= dailyLimits.videoLimit;

  // 验证输入
  const validateInput = (): string | null => {
    if (!currentModel) return '请选择模型';
    // 检查每日限制
    if (isVideoLimitReached) {
      return `今日视频生成次数已达上限 (${dailyLimits.videoLimit} 次)`;
    }
    if (activeExternalReference && !currentModel.features.imageToVideo) {
      return '当前模型不支持参考图，请切换支持图生视频的模型';
    }
    if (!prompt.trim() && files.length === 0 && !activeExternalReference) {
      return '请输入提示词或上传参考素材';
    }
    // 检测中文（暂时禁用）
    // if (containsChinese(prompt)) return '提示词禁止使用中文，请使用英文输入';
    return null;
  };

  const buildModelId = (ratio: string, dur: string): string => {
    return `sora2-${ratio}-${dur}`;
  };

  const getSubmissionFailureMessage = (result: PromiseRejectedResult) => {
    return result.reason instanceof Error ? result.reason.message : '生成失败';
  };

  // 单次提交任务的核心函数
  const submitSingleTask = async (
    taskPrompt: string,
    modelId: string,
    config: {
      aspectRatio: string;
      duration: string;
      files: { mimeType: string; data: string }[];
      referenceImageUrl?: string;
    }
  ) => {
    const fallbackModel = buildModelId(config.aspectRatio, config.duration);
    const { fetchGenerationSubmit } = await import('@/lib/generation-submit');
    const res = await fetchGenerationSubmit('/api/generate/sora', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: fallbackModel,
        modelId,
        aspectRatio: config.aspectRatio,
        duration: config.duration,
        prompt: taskPrompt,
        files: config.files,
        referenceImageUrl: config.referenceImageUrl,
      }),
    });

    const data = await res.json();

    if (!res.ok) {
      throw new Error(data.error || '生成失败');
    }

    const newTask: Task = {
      id: data.data.id,
      prompt: taskPrompt,
      model: currentModel?.name || fallbackModel,
      modelId,
      type: 'sora-video',
      status: 'pending',
      createdAt: Date.now(),
    };
    setTasks((prev) => [newTask, ...prev]);
    void pollTaskStatus(data.data.id, taskPrompt);

    return data.data.id;
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

    const taskPrompt = buildPrompt();

    try {
      // 处理图片压缩
      const taskFiles = await compressFilesIfNeeded();

      await submitSingleTask(taskPrompt, selectedModelId, {
        aspectRatio,
        duration,
        files: taskFiles,
        referenceImageUrl: activeExternalReference?.sourceUrl,
      });

      toast({
        title: '任务已提交',
        description: '任务已加入队列，可继续提交新任务',
      });

      // 更新今日使用量
      setDailyUsage(prev => ({ ...prev, videoCount: prev.videoCount + 1 }));

      // 清空输入（如果勾选了保留提示词则不清空）
      if (!keepPrompt) {
        setPrompt('');
        clearFiles();
        setActiveExternalReference(null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '生成失败');
    } finally {
      submissionLockRef.current = false;
      setSubmitting(false);
      setCompressing(false);
    }
  };

  // 抽卡模式：连续提交3个相同任务
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

    const taskPrompt = buildPrompt();

    try {
      // 处理图片压缩 (只执行一次)
      const taskFiles = await compressFilesIfNeeded();
      const results = await Promise.allSettled(
        Array.from({ length: 3 }, () =>
          submitSingleTask(taskPrompt, selectedModelId, {
            aspectRatio,
            duration,
            files: taskFiles,
            referenceImageUrl: activeExternalReference?.sourceUrl,
          })
        )
      );
      const successfulCount = results.filter((result) => result.status === 'fulfilled').length;
      const failedResult = results.find(
        (result): result is PromiseRejectedResult => result.status === 'rejected'
      );

      if (successfulCount === 0) {
        throw new Error(failedResult ? getSubmissionFailureMessage(failedResult) : '生成失败');
      }

      // 更新今日使用量
      setDailyUsage(prev => ({ ...prev, videoCount: prev.videoCount + successfulCount }));

      toast({
        title: successfulCount === 3 ? '已提交 3 个任务' : `已提交 ${successfulCount} / 3 个任务`,
        description:
          successfulCount === 3
            ? '抽卡模式启动，等待结果中...'
            : failedResult
              ? getSubmissionFailureMessage(failedResult)
              : '部分任务提交失败，请稍后重试',
      });

      // 清空输入（如果勾选了保留提示词则不清空）
      if (!keepPrompt) {
        setPrompt('');
        clearFiles();
        setActiveExternalReference(null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '生成失败');
    } finally {
      submissionLockRef.current = false;
      setSubmitting(false);
      setCompressing(false);
    }
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
            <h1 className="text-2xl lg:text-3xl font-light text-foreground">视频生成</h1>
            <p className="text-foreground/50 text-sm lg:text-base mt-0.5 font-light">
              支持文本与参考图生成视频
            </p>
          </div>
          {dailyLimits.videoLimit > 0 && (
            <div className={cn(
              "px-3 py-1.5 rounded-lg border text-xs lg:text-sm",
              isVideoLimitReached
                ? "bg-red-500/10 border-red-500/30 text-red-400"
                : "bg-card/60 border-border/70 text-foreground/60"
            )}>
              今日: {dailyUsage.videoCount} / {dailyLimits.videoLimit}
            </div>
          )}
        </div>
      )}

      {embedded && dailyLimits.videoLimit > 0 && (
        <div className="mb-4 flex justify-end">
          <div className={cn(
            "px-3 py-1.5 rounded-lg border text-xs",
            isVideoLimitReached
              ? "bg-red-500/10 border-red-500/30 text-red-400"
              : "bg-card/60 border-border/70 text-foreground/60"
          )}>
            今日: {dailyUsage.videoCount} / {dailyLimits.videoLimit}
          </div>
        </div>
      )}

      {/* 警告提示 */}
      {modelsLoaded && availableModels.length === 0 && (
        <div className="p-4 bg-yellow-500/10 border border-yellow-500/30 rounded-xl flex items-center gap-3 mb-4 shrink-0">
          <AlertCircle className="w-5 h-5 text-yellow-400 flex-shrink-0" />
          <p className="text-sm text-yellow-200">视频生成功能已被管理员禁用</p>
        </div>
      )}
      {isVideoLimitReached && (
        <div className="p-4 bg-red-500/10 border border-red-500/30 rounded-xl flex items-center gap-3 mb-4 shrink-0">
          <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0" />
          <p className="text-sm text-red-300">今日视频生成次数已达上限，请明天再试</p>
        </div>
      )}

      {/* 移动端：输入在上，结果在下 */}
      {/* 桌面端：结果在上，输入在下 */}
      
      {/* 底部创作面板 */}
      <div className={cn(
        "surface order-2 shrink-0 overflow-visible mt-4",
        embedded && "min-h-[15rem]",
        (availableModels.length === 0 || isVideoLimitReached) && "opacity-50 pointer-events-none"
      )}>
        {createModeSwitcher && (
          <div className="border-b border-border/70 px-3 py-3">
            {createModeSwitcher}
          </div>
        )}

        <div className="space-y-3 p-4">
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
            {(currentModel?.features.imageToVideo || activeExternalReference) && (
              <div className="flex justify-start">
                <ReferenceImageInput
                  images={files}
                  externalReference={activeExternalReference}
                  emptyLabel="参考图/视频帧"
                  externalBadge="已生成"
                  onAddFiles={handleAddReferenceFiles}
                  onRemoveImage={handleRemoveReferenceImage}
                  onClearExternalReference={() => setActiveExternalReference(null)}
                />
              </div>
            )}

            <div className="relative flex-1">
              <textarea
                ref={promptTextareaRef}
                value={prompt}
                onChange={(e) => handlePromptChange(e, setPrompt)}
                placeholder="描述视频动态，或拖入图片生成图生视频..."
                className="w-full min-h-[80px] max-h-[200px] resize-none overflow-y-auto rounded-lg border border-border/70 bg-input/70 px-3 py-2 text-sm text-foreground focus:border-border focus:outline-none focus:ring-2 focus:ring-ring/30"
              />
              <div className="mt-1 flex justify-end">
                <span className="text-xs text-foreground/50">{prompt.length} / 20000</span>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            {currentModel && (
              <OptionChipGroup
                label="比例"
                value={aspectRatio}
                onChange={setAspectRatio}
                options={currentModel.aspectRatios.map((ratio) => ({
                  value: ratio.value,
                  label: ratio.label,
                }))}
              />
            )}
            {currentModel && (
              <OptionChipGroup
                label="时长"
                value={duration}
                onChange={setDuration}
                options={currentModel.durations.map((item) => ({
                  value: item.value,
                  label: item.label,
                }))}
              />
            )}
            {typeof selectedDuration?.cost === 'number' && selectedDuration.cost > 0 && (
              <span className="inline-flex h-7 items-center rounded-md border border-border/60 px-2 text-[11px] text-muted-foreground">
                {selectedDuration.cost} 积分
              </span>
            )}
            <GenerationAdvancedPanel>
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
                  disabled={submitting || compressing || hasChinese}
                  className={cn(
                    'inline-flex h-9 items-center gap-2 rounded-lg border px-3.5 text-xs font-medium transition-all',
                    submitting || compressing || hasChinese
                      ? 'cursor-not-allowed border-border/70 bg-card/50 text-foreground/40'
                      : 'border-amber-500/30 bg-amber-500/12 text-amber-200 hover:bg-amber-500/18'
                  )}
                  title="一次性提交 3 个相同参数的视频任务"
                >
                  <Dices className="h-4 w-4" />
                  <span>抽卡 x3</span>
                </button>
              )}

              <button
                onClick={handleGenerate}
                disabled={submitting || compressing || hasChinese}
                className={cn(
                  'inline-flex h-9 items-center justify-center gap-2 rounded-lg px-5 text-sm font-medium transition-all',
                  submitting || compressing || hasChinese
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

      {/* 结果区域 - 移动端在下面，桌面端在上面 */}
      <div className="order-1 flex-1 min-h-0 overflow-hidden">
        <ResultGallery
          generations={generations}
          tasks={tasks}
          onRemoveTask={handleRemoveTask}
          onClearFailedTasks={handleClearFailedTasks}
          onRemoveGeneration={handleRemoveGeneration}
          busyGenerationId={busyGenerationId}
          clearingFailedTasks={clearingFailedTasks}
        />
      </div>
    </div>
  );
}

export default function VideoGenerationPage() {
  return <VideoGenerationView />;
}
