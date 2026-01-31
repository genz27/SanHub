'use client';
/* eslint-disable @next/next/no-img-element */

import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import dynamic from 'next/dynamic';
import {
  Video,
  Sparkles,
  Loader2,
  AlertCircle,
  Wand2,
  Film,
  Dices,
  Info,
  User,
  ChevronDown,
  Palette,
  X,
  Plus,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { compressImageToWebP, fileToBase64 } from '@/lib/image-compression';
import { toast } from '@/components/ui/toaster';
import { CustomSelect } from '@/components/ui/select-custom';
import type { Task } from '@/components/generator/result-gallery';
import type { Generation, CharacterCard, SafeVideoModel, DailyLimitConfig } from '@/types';
import { getPollingInterval, shouldContinuePolling, isTransientError, getFriendlyErrorMessage } from '@/lib/polling-utils';

const ResultGallery = dynamic(
  () => import('@/components/generator/result-gallery').then((mod) => mod.ResultGallery),
  {
    ssr: false,
    loading: () => (
      <div className="surface p-6 text-sm text-foreground/50">Loading results...</div>
    ),
  }
);

type CreationMode = 'normal' | 'remix' | 'storyboard';

// 每日使用量类型
interface DailyUsage {
  imageCount: number;
  videoCount: number;
  characterCardCount: number;
}

const CREATION_MODES = [
  { id: 'normal', label: '普通生成', icon: Video, description: '文本/图片生成视频' },
  { id: 'remix', label: '视频Remix', icon: Wand2, description: '基于已有视频继续创作' },
  { id: 'storyboard', label: '视频分镜', icon: Film, description: '多镜头分段生成' },
] as const;

export default function VideoGenerationPage() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const abortControllersRef = useRef<Map<string, AbortController>>(new Map());

  // 模型列表（从 API 获取）
  const [availableModels, setAvailableModels] = useState<SafeVideoModel[]>([]);
  const [modelsLoaded, setModelsLoaded] = useState(false);

  // 每日限制
  const [dailyUsage, setDailyUsage] = useState<DailyUsage>({ imageCount: 0, videoCount: 0, characterCardCount: 0 });
  const [dailyLimits, setDailyLimits] = useState<DailyLimitConfig>({ imageLimit: 0, videoLimit: 0, characterCardLimit: 0 });

  // 创作模式
  const [creationMode, setCreationMode] = useState<CreationMode>('normal');

  // 模型选择
  const [selectedModelId, setSelectedModelId] = useState<string>('');

  // 参数状态
  const [aspectRatio, setAspectRatio] = useState<string>('landscape');
  const [duration, setDuration] = useState<string>('10s');
  const [prompt, setPrompt] = useState('');
  const [files, setFiles] = useState<Array<{ file: File; preview: string }>>([]);
  const [compressing, setCompressing] = useState(false);
  const [compressedCache, setCompressedCache] = useState<Map<File, string>>(new Map());

  // 视频风格选择 (仅普通模式可用)
  const [selectedStyle, setSelectedStyle] = useState<string | null>(null);
  const VIDEO_STYLES = [
    { id: 'anime', name: 'Anime', image: '/styles/Anime.jpg' },
    { id: 'comic', name: 'Comic', image: '/styles/Comic.jpg' },
    { id: 'festive', name: 'Festive', image: '/styles/Festive.jpg' },
    { id: 'golden', name: 'Golden', image: '/styles/Golden.jpg' },
    { id: 'handheld', name: 'Handheld', image: '/styles/Handheld.jpg' },
    { id: 'news', name: 'News', image: '/styles/News.jpg' },
    { id: 'retro', name: 'Retro', image: '/styles/Retro.jpg' },
    { id: 'selfie', name: 'Selfie', image: '/styles/Selfie.jpg' },
    { id: 'vintage', name: 'Vintage', image: '/styles/Vintage.jpg' },
  ];

  // Remix 模式
  const [remixUrl, setRemixUrl] = useState('');

  // 分镜模式
  const [storyboardPrompt, setStoryboardPrompt] = useState('');

  // 任务状态
  const [generations, setGenerations] = useState<Generation[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [keepPrompt, setKeepPrompt] = useState(false);
  const [enhancing, setEnhancing] = useState(false);

  // 角色卡选择
  const [characterCards, setCharacterCards] = useState<CharacterCard[]>([]);
  const promptTextareaRef = useRef<HTMLTextAreaElement>(null);
  const remixPromptRef = useRef<HTMLTextAreaElement>(null);

  // 新增：拖拽上传状态
  const [isDragging, setIsDragging] = useState(false);

  // 新增：角色卡弹出菜单
  const [showCharacterMenu, setShowCharacterMenu] = useState(false);

  // 新增：风格弹出面板
  const [showStylePanel, setShowStylePanel] = useState(false);

  // 获取当前选中的模型配置
  const currentModel = useMemo(() => {
    return availableModels.find(m => m.id === selectedModelId) || availableModels[0];
  }, [availableModels, selectedModelId]);

  // 加载模型列表
  useEffect(() => {
    const loadModels = async () => {
      try {
        const res = await fetch('/api/video-models');
        if (res.ok) {
          const data = await res.json();
          const models = data.data?.models || [];
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
    loadModels();
  }, []);

  // 加载每日使用量
  useEffect(() => {
    const loadDailyUsage = async () => {
      try {
        const res = await fetch('/api/user/daily-usage');
        if (res.ok) {
          const data = await res.json();
          setDailyUsage(data.data.usage);
          setDailyLimits(data.data.limits);
        }
      } catch (err) {
        console.error('Failed to load daily usage:', err);
      }
    };
    loadDailyUsage();
  }, []);

  // 当模型改变时，重置参数到默认值
  useEffect(() => {
    const model = availableModels.find(m => m.id === selectedModelId);
    if (model) {
      setAspectRatio(model.defaultAspectRatio);
      setDuration(model.defaultDuration);
      if (!model.features.imageToVideo) {
        setFiles((prev) => {
          prev.forEach((f) => URL.revokeObjectURL(f.preview));
          return [];
        });
        setCompressedCache(new Map());
      }
    }
  }, [selectedModelId, availableModels]);

  // 加载用户角色卡
  useEffect(() => {
    const loadCharacterCards = async () => {
      try {
        const res = await fetch('/api/user/character-cards');
        if (res.ok) {
          const data = await res.json();
          const completedCards = (data.data || []).filter(
            (c: CharacterCard) => c.status === 'completed' && c.characterName
          );
          setCharacterCards(completedCards);
        }
      } catch (err) {
        console.error('Failed to load character cards:', err);
      }
    };
    loadCharacterCards();
  }, []);

  // 检测是否包含中文字符
  const containsChinese = (text: string): boolean => {
    return /[\u4e00-\u9fa5]/.test(text);
  };

  // 实时计算是否包含中文（根据当前模式检测对应的提示词）
  const hasChinese = useMemo(() => {
    switch (creationMode) {
      case 'storyboard':
        return containsChinese(storyboardPrompt);
      case 'remix':
        return containsChinese(prompt);
      default:
        return containsChinese(prompt);
    }
  }, [creationMode, prompt, storyboardPrompt]);

  // 处理提示词输入
  const handlePromptChange = (
    e: React.ChangeEvent<HTMLTextAreaElement>,
    setter: (value: string) => void
  ) => {
    setter(e.target.value);
  };

  // 提示词增强
  const handleEnhancePrompt = async () => {
    const currentPrompt = creationMode === 'storyboard' ? storyboardPrompt : prompt;
    if (!currentPrompt.trim()) {
      toast({ title: '请先输入提示词', variant: 'destructive' });
      return;
    }

    setEnhancing(true);
    try {
      const durationNum = duration === '10s' ? 10 : duration === '15s' ? 15 : undefined;
      const res = await fetch('/api/enhance-prompt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: currentPrompt.trim(),
          expansion_level: 'medium',
          duration_s: durationNum,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || '提示词增强失败');
      }

      if (data.data?.enhanced_prompt) {
        if (creationMode === 'storyboard') {
          setStoryboardPrompt(data.data.enhanced_prompt);
        } else {
          setPrompt(data.data.enhanced_prompt);
        }
        toast({ title: '提示词已增强' });
      }
    } catch (err) {
      toast({
        title: '增强失败',
        description: err instanceof Error ? err.message : '请稍后重试',
        variant: 'destructive',
      });
    } finally {
      setEnhancing(false);
    }
  };

  const handleAddCharacter = (characterName: string) => {
    const mention = `@${characterName}`;
    setPrompt((prev) => (prev ? `${prev} ${mention}` : mention));
    promptTextareaRef.current?.focus();
    setShowCharacterMenu(false);
  };

  // 新增：拖拽上传处理
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    const droppedFiles = Array.from(e.dataTransfer.files);
    for (const file of droppedFiles) {
      if (!file.type.startsWith('image/')) continue;

      if (file.size > 15 * 1024 * 1024) {
        toast({ title: '图片过大', description: '图片大小不能超过 15MB', variant: 'destructive' });
        continue;
      }

      setFiles((prev) => [
        ...prev,
        { file, preview: URL.createObjectURL(file) },
      ]);
    }
  };

  // 新增：监听 @ 输入触发角色卡菜单
  const handlePromptKeyUp = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    const value = (e.target as HTMLTextAreaElement).value;
    const lastChar = value.slice(-1);
    if (lastChar === '@' && characterCards.length > 0) {
      setShowCharacterMenu(true);
    } else if (e.key === 'Escape') {
      setShowCharacterMenu(false);
    }
  };

  // 轮询任务状态
  const pollTaskStatus = useCallback(
    async (taskId: string, taskPrompt: string): Promise<void> => {
      if (abortControllersRef.current.has(taskId)) return;

      const controller = new AbortController();
      abortControllersRef.current.set(taskId, controller);

      const startTime = Date.now();
      const maxConsecutiveErrors = 5;
      let consecutiveErrors = 0;

      const poll = async (): Promise<void> => {
        if (controller.signal.aborted) return;

        const elapsed = Date.now() - startTime;
        if (!shouldContinuePolling(elapsed, 'video')) {
          setTasks((prev) =>
            prev.map((t) =>
              t.id === taskId
                ? { ...t, status: 'failed' as const, errorMessage: '任务超时' }
                : t
            )
          );
          abortControllersRef.current.delete(taskId);
          return;
        }

        try {
          const res = await fetch(`/api/generate/status/${taskId}`, {
            signal: controller.signal,
          });

          // 检查是否为 5xx 错误（可能返回 HTML）
          if (res.status >= 500) {
            throw new Error(`Server Error: ${res.status}`);
          }

          // 安全解析 JSON
          let data;
          const contentType = res.headers.get('content-type');
          if (contentType && contentType.includes('application/json')) {
            data = await res.json();
          } else {
            const text = await res.text();
            console.warn('[Poll] Non-JSON response:', text.slice(0, 100));
            throw new Error('Invalid response format');
          }

          if (!res.ok) {
            throw new Error(data.error || `Request failed: ${res.status}`);
          }

          // Reset error counter on success
          consecutiveErrors = 0;
          const status = data.data.status;
          const resultUrl = typeof data.data.url === 'string' ? data.data.url : '';
          const isCompletedStatus = status === 'completed' || status === 'succeeded';

          if (status === 'failed' || status === 'cancelled') {
            setTasks((prev) =>
              prev.map((t) =>
                t.id === taskId
                  ? {
                      ...t,
                      status: 'failed' as const,
                      errorMessage: data.data.errorMessage || '生成失败',
                    }
                  : t
              )
            );
            abortControllersRef.current.delete(taskId);
          } else if (isCompletedStatus || resultUrl) {
            const generation: Generation = {
              id: data.data.id,
              userId: '',
              type: data.data.type,
              prompt: taskPrompt,
              params: {},
              resultUrl: resultUrl || `/api/media/${data.data.id || taskId}`,
              cost: data.data.cost,
              status: 'completed',
              createdAt: data.data.createdAt,
              updatedAt: data.data.updatedAt,
            };

            setTasks((prev) => prev.filter((t) => t.id !== taskId));
            setGenerations((prev) => [generation, ...prev]);

            toast({
              title: '生成成功',
              description: `消耗 ${data.data.cost} 积分`,
            });

            abortControllersRef.current.delete(taskId);
          } else {
            const nextStatus =
              status === 'pending' || status === 'processing'
                ? status
                : 'processing';
            setTasks((prev) =>
              prev.map((t) =>
                t.id === taskId
                  ? { 
                      ...t, 
                      status: nextStatus as 'pending' | 'processing',
                      progress: typeof data.data.progress === 'number' ? data.data.progress : t.progress,
                    }
                  : t
              )
            );
            const interval = getPollingInterval(elapsed, 'video');
            setTimeout(poll, interval);
          }
        } catch (err) {
          if ((err as Error).name === 'AbortError') return;
          consecutiveErrors++;
          const errMsg = (err as Error).message || '网络错误';
          // Retry on transient network errors or JSON parse failures
          if (isTransientError(err) && consecutiveErrors < maxConsecutiveErrors) {
            console.warn(`[Poll] Transient error (${consecutiveErrors}/${maxConsecutiveErrors}), retrying...`, errMsg);
            const delay = Math.min(5000 * Math.pow(2, consecutiveErrors - 1), 60000);
            setTimeout(poll, delay);
            return;
          }
          setTasks((prev) =>
            prev.map((t) =>
              t.id === taskId
                ? {
                    ...t,
                    status: 'failed' as const,
                    errorMessage: getFriendlyErrorMessage(errMsg),
                  }
                : t
            )
          );
          abortControllersRef.current.delete(taskId);
        }
      };

      await poll();
    },
    []
  );

  // 加载 pending 任务
  useEffect(() => {
    const abortControllers = abortControllersRef.current;
    const loadPendingTasks = async () => {
      try {
        const res = await fetch('/api/user/tasks?limit=200');
        if (res.ok) {
          const data = await res.json();
          const videoTasks: Task[] = (data.data || [])
            .filter((t: any) => t.type?.includes('video') || t.type?.includes('sora'))
            .map((t: any) => ({
              id: t.id,
              prompt: t.prompt,
              type: t.type,
              status: t.status as 'pending' | 'processing',
              createdAt: t.createdAt,
            }));

          if (videoTasks.length > 0) {
            setTasks(videoTasks);
            videoTasks.forEach((task) => {
              pollTaskStatus(task.id, task.prompt);
            });
          }
        }
      } catch (err) {
        console.error('Failed to load pending tasks:', err);
      }
    };

    loadPendingTasks();

    return () => {
      abortControllers.forEach((controller) => controller.abort());
      abortControllers.clear();
    };
  }, [pollTaskStatus]);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = Array.from(e.target.files || []);
    for (const file of selectedFiles) {
      // 只允许图片，禁止视频
      if (!file.type.startsWith('image/')) continue;

      // 15MB limit check
      if (file.size > 15 * 1024 * 1024) {
        toast({ title: '图片过大', description: '图片大小不能超过 15MB', variant: 'destructive' });
        continue;
      }

      setFiles((prev) => [
        ...prev,
        { file, preview: URL.createObjectURL(file) },
      ]);
    }
    e.target.value = '';
  };

  const clearFiles = () => {
    files.forEach((f) => URL.revokeObjectURL(f.preview));
    setFiles([]);
    setCompressedCache(new Map());
  };

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

  // 构建提示词
  const buildPrompt = (): string => {
    switch (creationMode) {
      case 'remix':
        return prompt.trim(); // remix_target_id 单独传递
      case 'storyboard':
        return storyboardPrompt.trim();
      default:
        return prompt.trim();
    }
  };

  // 提取 Remix Target ID
  const extractRemixTargetId = (): string | undefined => {
    if (creationMode !== 'remix' || !remixUrl.trim()) return undefined;
    const url = remixUrl.trim();
    // 支持完整 URL 或纯 ID
    const match = url.match(/s_[a-f0-9]+/i);
    return match ? match[0] : url;
  };

  // 压缩并构建 files 数组
  const compressFilesIfNeeded = async (): Promise<{ mimeType: string; data: string }[]> => {
    if (files.length === 0 || creationMode !== 'normal' || !currentModel?.features.imageToVideo) {
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
          const compressedFile = await compressImageToWebP(file);
          const base64 = await fileToBase64(compressedFile);
          nextCache.set(file, base64);
          results.push({
            mimeType: 'image/webp',
            data: base64,
          });
        } catch {
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
    switch (creationMode) {
      case 'remix':
        if (!remixUrl.trim()) return '请输入视频分享链接或ID';
        // 检测中文
        if (containsChinese(prompt)) return '提示词禁止使用中文，请使用英文输入';
        break;
      case 'storyboard':
        if (!storyboardPrompt.trim()) return '请输入分镜提示词';
        if (!storyboardPrompt.includes('[') || !storyboardPrompt.includes(']')) {
          return '分镜格式错误，请使用 [时长]描述 格式，如 [5.0s]猫猫跳舞';
        }
        // 检测中文
        if (containsChinese(storyboardPrompt)) return '提示词禁止使用中文，请使用英文输入';
        break;
      default:
        if (!prompt.trim() && files.length === 0) return '请输入提示词或上传参考素材';
        // 检测中文
        if (containsChinese(prompt)) return '提示词禁止使用中文，请使用英文输入';
    }
    return null;
  };

  const buildModelId = (ratio: string, dur: string): string => {
    return `sora2-${ratio}-${dur}`;
  };

  // 单次提交任务的核心函数
  const submitSingleTask = async (
    taskPrompt: string,
    modelId: string,
    config: {
      aspectRatio: string;
      duration: string;
      files: { mimeType: string; data: string }[];
      remixTargetId?: string;
      styleId?: string;
    }
  ) => {
    const taskModel = buildModelId(config.aspectRatio, config.duration);
    const res = await fetch('/api/generate/sora', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: taskModel,
        prompt: taskPrompt,
        files: config.files,
        remix_target_id: config.remixTargetId,
        style_id: config.styleId,
      }),
    });

    const data = await res.json();

    if (!res.ok) {
      throw new Error(data.error || '生成失败');
    }

    const newTask: Task = {
      id: data.data.id,
      prompt: taskPrompt,
      model: taskModel,
      modelId,
      type: 'sora-video',
      status: 'pending',
      createdAt: Date.now(),
    };
    setTasks((prev) => [newTask, ...prev]);
    pollTaskStatus(data.data.id, taskPrompt);

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

    const taskPrompt = buildPrompt();
    const remixTargetId = extractRemixTargetId();
    // 仅普通模式可用风格
    const styleId = creationMode === 'normal' ? selectedStyle || undefined : undefined;

    try {
      // 处理图片压缩
      const taskFiles = await compressFilesIfNeeded();

      await submitSingleTask(taskPrompt, selectedModelId, {
        aspectRatio,
        duration,
        files: taskFiles,
        remixTargetId,
        styleId,
      });

      toast({
        title: '任务已提交',
        description: '任务已加入队列，可继续提交新任务',
      });

      // 更新今日使用量
      setDailyUsage(prev => ({ ...prev, videoCount: prev.videoCount + 1 }));

      // 清空输入（如果勾选了保留提示词则不清空）
      if (!keepPrompt) {
        switch (creationMode) {
          case 'remix':
            setRemixUrl('');
            setPrompt('');
            break;
          case 'storyboard':
            setStoryboardPrompt('');
            break;
          default:
            setPrompt('');
            clearFiles();
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '生成失败');
    } finally {
      setSubmitting(false);
      setCompressing(false);
    }
  };

  // 抽卡模式：连续提交3个相同任务
  const handleGachaMode = async () => {
    const validationError = validateInput();
    if (validationError) {
      setError(validationError);
      return;
    }

    setError('');
    setSubmitting(true);

    const taskPrompt = buildPrompt();
    const remixTargetId = extractRemixTargetId();
    const styleId = creationMode === 'normal' ? selectedStyle || undefined : undefined;

    try {
      // 处理图片压缩 (只执行一次)
      const taskFiles = await compressFilesIfNeeded();

      // 连续提交3个任务
      for (let i = 0; i < 3; i++) {
        await submitSingleTask(taskPrompt, selectedModelId, {
          aspectRatio,
          duration,
          files: taskFiles,
          remixTargetId,
          styleId,
        });
      }

      // 更新今日使用量
      setDailyUsage(prev => ({ ...prev, videoCount: prev.videoCount + 3 }));

      // 清空输入（如果勾选了保留提示词则不清空）
      if (!keepPrompt) {
        switch (creationMode) {
          case 'remix':
            setRemixUrl('');
            setPrompt('');
            break;
          case 'storyboard':
            setStoryboardPrompt('');
            break;
          default:
            setPrompt('');
            clearFiles();
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '生成失败');
    } finally {
      setSubmitting(false);
      setCompressing(false);
    }
  };


  return (
    <div className="flex flex-col lg:h-[calc(100vh-100px)] max-w-7xl mx-auto">
      {/* 页面标题 */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between mb-4 shrink-0">
        <div>
          <h1 className="text-2xl lg:text-3xl font-light text-foreground">视频生成</h1>
          <p className="text-foreground/50 text-sm lg:text-base mt-0.5 font-light">
            支持普通生成、Remix、分镜等多种创作模式
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
        "surface shrink-0 overflow-visible mb-4 lg:mb-0 lg:order-2",
        (availableModels.length === 0 || isVideoLimitReached) && "opacity-50 pointer-events-none"
      )}>
        {/* Tab 切换创作模式 */}
        <div className="flex border-b border-border/70">
          {CREATION_MODES.map((mode) => (
            <button
              key={mode.id}
              onClick={() => setCreationMode(mode.id as CreationMode)}
              className={cn(
                'flex items-center gap-2 px-4 py-3 text-sm font-medium transition-all border-b-2 -mb-[1px]',
                creationMode === mode.id
                  ? 'border-sky-500 text-foreground'
                  : 'border-transparent text-foreground/50 hover:text-foreground/70'
              )}
            >
              <mode.icon className="w-4 h-4" />
              <span>{mode.label}</span>
            </button>
          ))}
        </div>

        <div className="p-4">
          {/* 输入区域：图片上传 + 文本输入 */}
          <div className="flex gap-4 mb-4">
            {/* 图片上传区 - 仅普通模式显示 */}
            {creationMode === 'normal' && currentModel?.features.imageToVideo && (
              <div
                onClick={() => fileInputRef.current?.click()}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                className={cn(
                  'w-24 h-20 shrink-0 border-2 border-dashed rounded-lg flex flex-col items-center justify-center cursor-pointer transition-all',
                  isDragging
                    ? 'border-sky-500 bg-sky-500/10'
                    : files.length > 0
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
                {files.length > 0 ? (
                  <div className="relative w-full h-full">
                    <img src={files[0].preview} alt="" className="w-full h-full object-cover rounded-md" />
                    {files.length > 1 && (
                      <div className="absolute bottom-1 right-1 px-1.5 py-0.5 bg-black/70 rounded text-[10px] text-white">
                        +{files.length - 1}
                      </div>
                    )}
                    <button
                      onClick={(e) => { e.stopPropagation(); clearFiles(); }}
                      className="absolute -top-2 -right-2 w-5 h-5 bg-red-500 rounded-full flex items-center justify-center hover:bg-red-600"
                    >
                      <X className="w-3 h-3 text-white" />
                    </button>
                  </div>
                ) : (
                  <>
                    <Plus className="w-5 h-5 text-foreground/40 mb-1" />
                    <span className="text-[10px] text-foreground/40">参考图/视频帧</span>
                  </>
                )}
              </div>
            )}

            {/* 文本输入区 */}
            <div className="flex-1 relative">
              {creationMode === 'remix' ? (
                <div className="space-y-2">
                  <input
                    type="text"
                    value={remixUrl}
                    onChange={(e) => setRemixUrl(e.target.value)}
                    placeholder="输入视频分享链接或ID (如 s_xxx)"
                    className="w-full px-3 py-2 bg-input/70 border border-border/70 text-foreground rounded-lg text-sm focus:outline-none focus:border-border focus:ring-2 focus:ring-ring/30"
                  />
                  <textarea
                    ref={remixPromptRef}
                    value={prompt}
                    onChange={(e) => handlePromptChange(e, setPrompt)}
                    onKeyUp={handlePromptKeyUp}
                    placeholder="描述你想要的修改，如：改成水墨画风格"
                    className="w-full h-14 px-3 py-2 bg-input/70 border border-border/70 text-foreground rounded-lg resize-none text-sm focus:outline-none focus:border-border focus:ring-2 focus:ring-ring/30"
                  />
                </div>
              ) : creationMode === 'storyboard' ? (
                <textarea
                  value={storyboardPrompt}
                  onChange={(e) => handlePromptChange(e, setStoryboardPrompt)}
                  placeholder="[5.0s]A cat skydiving from plane&#10;[5.0s]Cat landing"
                  className="w-full h-20 px-3 py-2 bg-input/70 border border-border/70 text-foreground rounded-lg resize-none text-sm font-mono focus:outline-none focus:border-border focus:ring-2 focus:ring-ring/30"
                />
              ) : (
                <textarea
                  ref={promptTextareaRef}
                  value={prompt}
                  onChange={(e) => handlePromptChange(e, setPrompt)}
                  onKeyUp={handlePromptKeyUp}
                  placeholder="描述视频动态，或拖入图片生成图生视频... 输入 @ 引用角色卡"
                  className="w-full h-20 px-3 py-2 bg-input/70 border border-border/70 text-foreground rounded-lg resize-none text-sm focus:outline-none focus:border-border focus:ring-2 focus:ring-ring/30"
                />
              )}

              {/* @ 触发的角色卡弹出菜单 */}
              {showCharacterMenu && characterCards.length > 0 && (
                <div className="absolute bottom-full left-0 mb-2 w-64 max-h-48 overflow-auto bg-card border border-border/70 rounded-lg shadow-lg z-20">
                  <div className="p-2 border-b border-border/70 text-xs text-foreground/50">选择角色卡</div>
                  {characterCards.map((card) => (
                    <button
                      key={card.id}
                      onClick={() => handleAddCharacter(card.characterName)}
                      className="w-full flex items-center gap-2 px-3 py-2 hover:bg-card/80 transition-colors text-left"
                    >
                      <div className="w-6 h-6 rounded-full overflow-hidden bg-gradient-to-br from-emerald-500/20 to-sky-500/20 shrink-0">
                        {card.avatarUrl ? (
                          <img src={card.avatarUrl} alt="" className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center">
                            <User className="w-3 h-3 text-emerald-300/60" />
                          </div>
                        )}
                      </div>
                      <span className="text-sm text-foreground">@{card.characterName}</span>
                    </button>
                  ))}
                  <button onClick={() => setShowCharacterMenu(false)} className="w-full px-3 py-2 text-xs text-foreground/50 hover:bg-card/80 border-t border-border/70">关闭</button>
                </div>
              )}

              {/* 增强按钮 */}
              <button
                type="button"
                onClick={handleEnhancePrompt}
                disabled={enhancing || !(creationMode === 'storyboard' ? storyboardPrompt.trim() : prompt.trim())}
                className={cn(
                  'absolute top-2 right-2 flex items-center gap-1 px-2 py-1 rounded text-xs transition-all',
                  enhancing || !(creationMode === 'storyboard' ? storyboardPrompt.trim() : prompt.trim())
                    ? 'text-foreground/30 cursor-not-allowed'
                    : 'text-sky-400 hover:text-sky-300 hover:bg-sky-500/10'
                )}
              >
                {enhancing ? <Loader2 className="w-3 h-3 animate-spin" /> : <Wand2 className="w-3 h-3" />}
                <span>增强</span>
              </button>
            </div>
          </div>

          {/* 参数行：选择器 + 按钮 */}
          <div className="flex flex-wrap items-center gap-2">
            {/* 模型选择 */}
            <div className="min-w-[160px]">
              <CustomSelect
                value={selectedModelId}
                onValueChange={setSelectedModelId}
                options={availableModels.map((m) => ({
                  value: m.id,
                  label: m.name,
                  description: m.description,
                  highlight: m.highlight,
                }))}
                placeholder="选择模型"
              />
            </div>

            {/* 时长选择 */}
            {currentModel && (
              <div className="w-[100px]">
                <CustomSelect
                  value={duration}
                  onValueChange={setDuration}
                  options={currentModel.durations.map((d) => ({
                    value: d.value,
                    label: d.label,
                  }))}
                  placeholder="时长"
                />
              </div>
            )}

            {/* 比例选择 */}
            {currentModel && (
              <div className="w-[120px]">
                <CustomSelect
                  value={aspectRatio}
                  onValueChange={setAspectRatio}
                  options={currentModel.aspectRatios.map((r) => ({
                    value: r.value,
                    label: r.label,
                  }))}
                  placeholder="比例"
                />
              </div>
            )}

            {/* 风格选择按钮 - 仅普通模式 */}
            {creationMode === 'normal' && (
              <div className="relative">
                <button
                  onClick={() => setShowStylePanel(!showStylePanel)}
                  className={cn(
                    'flex items-center gap-1.5 px-3 py-1.5 bg-card/60 border border-border/70 rounded-lg text-xs transition-all hover:bg-card/80',
                    selectedStyle ? 'text-sky-400' : 'text-foreground'
                  )}
                >
                  <Palette className="w-3 h-3" />
                  <span>{selectedStyle ? VIDEO_STYLES.find(s => s.id === selectedStyle)?.name : '风格'}</span>
                  <ChevronDown className="w-3 h-3 text-foreground/50" />
                </button>

                {/* 风格弹出面板 */}
                {showStylePanel && (
                  <div className="absolute bottom-full left-0 mb-2 p-4 w-[420px] bg-card border border-border/70 rounded-lg shadow-lg z-20">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs text-foreground/50">选择风格</span>
                      {selectedStyle && (
                        <button
                          onClick={() => { setSelectedStyle(null); setShowStylePanel(false); }}
                          className="text-xs text-foreground/40 hover:text-foreground/70"
                        >
                          清除
                        </button>
                      )}
                    </div>
                    <div className="grid grid-cols-4 gap-3">
                      {VIDEO_STYLES.map((style) => (
                        <button
                          key={style.id}
                          onClick={() => { setSelectedStyle(style.id); setShowStylePanel(false); }}
                          className={cn(
                            'relative w-24 h-16 rounded-lg overflow-hidden border-2 transition-all',
                            selectedStyle === style.id
                              ? 'border-sky-400 ring-2 ring-sky-400/30'
                              : 'border-border/70 hover:border-border'
                          )}
                        >
                          <img src={style.image} alt={style.name} className="w-full h-full object-cover" />
                          <div className="absolute inset-0 flex items-end justify-center pb-1 bg-gradient-to-t from-black/80 to-transparent">
                            <span className="text-xs font-medium text-white">{style.name}</span>
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* 保留提示词 */}
            <label className="flex items-center gap-1.5 cursor-pointer select-none text-xs text-foreground/50">
              <input
                type="checkbox"
                checked={keepPrompt}
                onChange={(e) => setKeepPrompt(e.target.checked)}
                className="w-3.5 h-3.5 rounded border-border/70 bg-card/60 accent-sky-400 cursor-pointer"
              />
              <span>保留</span>
            </label>

            {/* 中文警告提示 */}
            {hasChinese && (
              <div className="flex items-center gap-1.5 text-xs text-amber-400">
                <AlertCircle className="w-3 h-3" />
                <span>提示词中包含中文字符，请使用英文输入</span>
              </div>
            )}

            {/* 错误提示 */}
            {error && (
              <div className="flex items-center gap-1.5 text-xs text-red-400">
                <AlertCircle className="w-3 h-3" />
                <span>{error}</span>
              </div>
            )}

            <div className="flex-1" />

            {/* 抽卡按钮 */}
            <div className="relative group">
              <button
                onClick={handleGachaMode}
                disabled={submitting || compressing || hasChinese}
                className={cn(
                  'w-9 h-9 flex items-center justify-center rounded-lg transition-all',
                  submitting || compressing || hasChinese
                    ? 'bg-card/60 text-foreground/40 cursor-not-allowed'
                    : 'bg-gradient-to-r from-amber-500 to-orange-500 text-white hover:opacity-90'
                )}
                title="抽卡模式"
              >
                <Dices className="w-4 h-4" />
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

            {/* 生成按钮 */}
            <button
              onClick={handleGenerate}
              disabled={submitting || compressing || hasChinese}
              className={cn(
                'flex items-center gap-2 px-5 py-2 rounded-lg font-medium text-sm transition-all',
                submitting || compressing || hasChinese
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

      {/* 结果区域 - 移动端在下面，桌面端在上面 */}
      <div className="flex-1 min-h-0 lg:order-1 pb-20 lg:pb-4">
        <ResultGallery
          generations={generations}
          tasks={tasks}
          onRemoveTask={handleRemoveTask}
        />
      </div>
    </div>
  );
}
