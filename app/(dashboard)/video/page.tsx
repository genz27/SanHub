'use client';
/* eslint-disable @next/next/no-img-element */

import { useState, useRef, useEffect, useCallback, useMemo, type ReactNode } from 'react';
import dynamic from 'next/dynamic';
import { useSession } from 'next-auth/react';
import {
  Video,
  Upload,
  Trash2,
  Sparkles,
  Loader2,
  AlertCircle,
  Wand2,
  Film,
  Link as LinkIcon,
  Dices,
  Info,
  User,
} from 'lucide-react';
import { cn, fileToBase64 } from '@/lib/utils';
import { toast } from '@/components/ui/toaster';
import type { Task } from '@/components/generator/result-gallery';
import type { Generation, CharacterCard, SafeVideoModel, DailyLimitConfig } from '@/types';

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

type OptionGroupProps = {
  label: string;
  children: ReactNode;
  className?: string;
  contentClassName: string;
};

function OptionGroup({ label, children, className, contentClassName }: OptionGroupProps) {
  return (
    <div className={cn('space-y-2', className)}>
      <label className="text-xs text-foreground/50 uppercase tracking-wider">{label}</label>
      <div className={cn(contentClassName)}>
        {children}
      </div>
    </div>
  );
}

export default function VideoGenerationPage() {
  const { update } = useSession();
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
  const [files, setFiles] = useState<Array<{ data: string; mimeType: string; preview: string }>>([]);

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
  };

  // 轮询任务状态
  const pollTaskStatus = useCallback(
    async (taskId: string, taskPrompt: string): Promise<void> => {
      if (abortControllersRef.current.has(taskId)) return;

      const controller = new AbortController();
      abortControllersRef.current.set(taskId, controller);

      const maxAttempts = 240;
      const maxConsecutiveErrors = 5;
      let attempts = 0;
      let consecutiveErrors = 0;

      const poll = async (): Promise<void> => {
        if (controller.signal.aborted) return;

        if (attempts >= maxAttempts) {
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

        attempts++;

        try {
          const res = await fetch(`/api/generate/status/${taskId}`, {
            signal: controller.signal,
          });
          const data = await res.json();

          if (!res.ok) {
            throw new Error(data.error || '查询任务状态失败');
          }

          // Reset error counter on success
          consecutiveErrors = 0;
          const status = data.data.status;
          const resultUrl = typeof data.data.url === 'string' ? data.data.url : '';
          const isCompletedStatus = status === 'completed' || status === 'succeeded';

          if (isCompletedStatus && resultUrl) {
            await update();

            const generation: Generation = {
              id: data.data.id,
              userId: '',
              type: data.data.type,
              prompt: taskPrompt,
              params: {},
              resultUrl,
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
          } else if (status === 'failed' || status === 'cancelled') {
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
          } else if (isCompletedStatus && !resultUrl) {
            setTasks((prev) =>
              prev.map((t) =>
                t.id === taskId
                  ? {
                      ...t,
                      status: 'processing' as const,
                      progress: typeof data.data.progress === 'number' ? data.data.progress : t.progress,
                    }
                  : t
              )
            );
            setTimeout(poll, 10000);
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
            setTimeout(poll, 10000);
          }
        } catch (err) {
          if ((err as Error).name === 'AbortError') return;
          consecutiveErrors++;
          const errMsg = (err as Error).message || '网络错误';
          // Retry on transient network errors
          const isTransientError =
            errMsg.includes('socket') ||
            errMsg.includes('Socket') ||
            errMsg.includes('ECONNRESET') ||
            errMsg.includes('ETIMEDOUT') ||
            errMsg.includes('network') ||
            errMsg.includes('fetch');
          if (isTransientError && consecutiveErrors < maxConsecutiveErrors) {
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
                    errorMessage: errMsg,
                  }
                : t
            )
          );
          abortControllersRef.current.delete(taskId);
        }
      };

      await poll();
    },
    [update]
  );

  // 加载 pending 任务
  useEffect(() => {
    const abortControllers = abortControllersRef.current;
    const loadPendingTasks = async () => {
      try {
        const res = await fetch('/api/user/tasks');
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
      const data = await fileToBase64(file);
      setFiles((prev) => [
        ...prev,
        { data, mimeType: file.type, preview: URL.createObjectURL(file) },
      ]);
    }
    e.target.value = '';
  };

  const clearFiles = () => {
    files.forEach((f) => URL.revokeObjectURL(f.preview));
    setFiles([]);
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

  // 构建files数组
  const buildFiles = (): { mimeType: string; data: string }[] => {
    return files.map((f) => ({ mimeType: f.mimeType, data: f.data }));
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
        break;
      case 'storyboard':
        if (!storyboardPrompt.trim()) return '请输入分镜提示词';
        if (!storyboardPrompt.includes('[') || !storyboardPrompt.includes(']')) {
          return '分镜格式错误，请使用 [时长]描述 格式，如 [5.0s]猫猫跳舞';
        }
        break;
      default:
        if (!prompt.trim() && files.length === 0) return '请输入提示词或上传参考素材';
    }
    return null;
  };

  // 构建模型 ID（用于 Sora 类型）
  const buildModelId = (ratio: string, dur: string): string => {
    return `sora2-${ratio}-${dur}`;
  };

  // 单次提交任务的核心函数
  const submitSingleTask = async (
    taskPrompt: string,
    taskModel: string,
    taskFiles: { mimeType: string; data: string }[],
    options?: { remixTargetId?: string; styleId?: string }
  ) => {
    const res = await fetch('/api/generate/sora', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: taskModel,
        prompt: taskPrompt,
        files: taskFiles,
        remix_target_id: options?.remixTargetId,
        style_id: options?.styleId,
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
    const taskModel = buildModelId(aspectRatio, duration);
    const taskFiles = buildFiles();

    const remixTargetId = extractRemixTargetId();
    // 仅普通模式可用风格
    const styleId = creationMode === 'normal' ? selectedStyle || undefined : undefined;

    try {
      await submitSingleTask(taskPrompt, taskModel, taskFiles, { remixTargetId, styleId });

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
    const taskModel = buildModelId(aspectRatio, duration);
    const taskFiles = buildFiles();
    const remixTargetId = extractRemixTargetId();
    const styleId = creationMode === 'normal' ? selectedStyle || undefined : undefined;

    try {
      // 连续提交3个任务
      for (let i = 0; i < 3; i++) {
        await submitSingleTask(taskPrompt, taskModel, taskFiles, { remixTargetId, styleId });
      }

      toast({
        title: '抽卡模式已启动',
        description: '已提交 3 个相同任务，等待结果中...',
      });

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
    }
  };


  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-3xl font-light text-foreground">视频生成</h1>
          <p className="text-foreground/50 mt-1 font-light">
            支持普通生成、Remix、分镜等多种创作模式
          </p>
        </div>
        {dailyLimits.videoLimit > 0 && (
          <div className={cn(
            "px-4 py-2 rounded-xl border text-sm",
            isVideoLimitReached
              ? "bg-red-500/10 border-red-500/30 text-red-400"
              : "bg-card/60 border-border/70 text-foreground/60"
          )}>
            今日: {dailyUsage.videoCount} / {dailyLimits.videoLimit}
          </div>
        )}
      </div>

      {/* 无可用模型提示 */}
      {modelsLoaded && availableModels.length === 0 && (
        <div className="p-4 bg-yellow-500/10 border border-yellow-500/30 rounded-xl flex items-center gap-3">
          <AlertCircle className="w-5 h-5 text-yellow-400 flex-shrink-0" />
          <p className="text-sm text-yellow-200">视频生成功能已被管理员禁用</p>
        </div>
      )}

      {/* 每日限制达到提示 */}
      {isVideoLimitReached && (
        <div className="p-4 bg-red-500/10 border border-red-500/30 rounded-xl flex items-center gap-3">
          <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0" />
          <p className="text-sm text-red-300">今日视频生成次数已达上限，请明天再试</p>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-[360px_minmax(0,1fr)] xl:grid-cols-[400px_minmax(0,1fr)] gap-6">
        <div>
          <div className={cn(
            "surface overflow-hidden backdrop-blur-sm",
            (availableModels.length === 0 || isVideoLimitReached) && "opacity-50 pointer-events-none"
          )}>
            {/* Header */}
            <div className="px-5 py-4 border-b border-border/70 bg-gradient-to-r from-sky-500/10 to-emerald-500/10">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 bg-card/60 border border-border/70 rounded-lg flex items-center justify-center">
                  <Sparkles className="w-4 h-4 text-sky-300" />
                </div>
                <div>
                  <h2 className="text-base font-medium text-foreground">Sora 视频</h2>
                  <p className="text-xs text-foreground/40">AI 视频创作</p>
                </div>
              </div>
            </div>

            <div className="px-5 py-4 space-y-4">
              {/* Creation Mode Selection */}
              <OptionGroup label="创作模式" contentClassName="grid grid-cols-1 sm:grid-cols-3 gap-2">
                {CREATION_MODES.map((mode) => (
                  <button
                    key={mode.id}
                    onClick={() => setCreationMode(mode.id as CreationMode)}
                    className={cn(
                      'flex w-full flex-col items-center gap-1.5 px-2 py-2.5 rounded-lg border transition-all',
                      creationMode === mode.id
                        ? 'bg-foreground text-background border-transparent'
                        : 'bg-card/60 text-foreground/70 border-border/70 hover:bg-card/80 hover:text-foreground'
                    )}
                  >
                    <mode.icon className="w-4 h-4" />
                    <span className="text-xs font-medium">{mode.label}</span>
                  </button>
                ))}
              </OptionGroup>

              {/* Model Selection */}
              <OptionGroup
                label="模型"
                contentClassName="flex gap-2 overflow-x-auto no-scrollbar pb-1 -mx-1 px-1"
              >
                {availableModels.map((model) => (
                  <button
                    key={model.id}
                    type="button"
                    title={model.description || model.name}
                    onClick={() => setSelectedModelId(model.id)}
                    className={cn(
                      'px-3 py-2 rounded-lg border text-xs font-medium transition-all shrink-0',
                      selectedModelId === model.id
                        ? 'bg-foreground text-background border-white'
                        : 'bg-card/60 text-foreground/70 border-border/70 hover:bg-card/80 hover:text-foreground'
                    )}
                  >
                    <span className="max-w-[140px] truncate">{model.name}</span>
                  </button>
                ))}
              </OptionGroup>

              {/* Aspect Ratio */}
              {currentModel && (
              <OptionGroup label="画面比例" contentClassName="grid grid-cols-2 gap-2">
                {currentModel.aspectRatios.map((r) => (
                  <button
                    key={r.value}
                    onClick={() => setAspectRatio(r.value)}
                    className={cn(
                      'flex items-center gap-1.5 px-3 py-2 rounded-lg border transition-all text-xs font-medium',
                      aspectRatio === r.value
                        ? 'bg-foreground text-background border-white'
                        : 'bg-card/60 text-foreground/70 border-border/70 hover:bg-card/80 hover:text-foreground'
                    )}
                  >
                    <span className="text-sm">{r.value === 'landscape' ? '▬' : '▮'}</span>
                    <span className="text-xs font-medium">{r.label}</span>
                  </button>
                ))}
              </OptionGroup>
              )}

              {/* Duration */}
              {currentModel && (
              <OptionGroup label="视频时长" contentClassName="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {currentModel.durations.map((d) => (
                  <button
                    key={d.value}
                    onClick={() => setDuration(d.value)}
                    className={cn(
                      'px-3 py-2 rounded-lg border transition-all text-xs font-medium',
                      duration === d.value
                        ? 'bg-foreground text-background border-white'
                        : 'bg-card/60 text-foreground/70 border-border/70 hover:bg-card/80 hover:text-foreground'
                    )}
                  >
                    {d.label}
                  </button>
                ))}
              </OptionGroup>
              )}

              {/* Mode-specific inputs */}
              {creationMode === 'normal' && (
                <>
                  {/* 视频风格选择 */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                    <label className="text-xs text-foreground/50 uppercase tracking-wider">视频风格</label>
                      {selectedStyle && (
                        <button
                          onClick={() => setSelectedStyle(null)}
                          className="text-xs text-foreground/40 hover:text-foreground/70"
                        >
                          取消选择
                        </button>
                      )}
                    </div>
                    <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1 -mx-1 px-1">
                      {VIDEO_STYLES.map((style) => (
                        <button
                          key={style.id}
                          onClick={() => setSelectedStyle(selectedStyle === style.id ? null : style.id)}
                          className={cn(
                            'relative w-20 h-12 rounded-md overflow-hidden border-2 transition-all shrink-0',
                            selectedStyle === style.id
                              ? 'border-sky-400 ring-2 ring-sky-400/30'
                              : 'border-border/70 hover:border-border'
                          )}
                        >
                          <img
                            src={style.image}
                            alt={style.name}
                            className="w-full h-full object-cover"
                          />
                          <div className={cn(
                            'absolute inset-0 flex items-end justify-center pb-1.5 bg-gradient-to-t from-black/80 to-transparent',
                            selectedStyle === style.id && 'from-sky-900/70'
                          )}>
                            <span className="text-[10px] font-medium text-foreground">{style.name}</span>
                          </div>
                          {selectedStyle === style.id && (
                            <div className="absolute top-1 right-1 w-3.5 h-3.5 bg-sky-500 rounded-full flex items-center justify-center">
                              <svg className="w-2 h-2 text-white" fill="currentColor" viewBox="0 0 20 20">
                                <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                              </svg>
                            </div>
                          )}
                        </button>
                      ))}
                    </div>
                    <p className="text-[10px] text-foreground/40">可选：点选一个风格应用到生成</p>
                  </div>

                  {currentModel?.features.imageToVideo && (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <label className="text-xs text-foreground/50 uppercase tracking-wider">参考素材</label>
                        {files.length > 0 && (
                          <button
                            onClick={clearFiles}
                            className="text-xs text-red-400 hover:text-red-300 flex items-center gap-1"
                          >
                            <Trash2 className="w-3 h-3" /> 清除
                          </button>
                        )}
                      </div>
                      <input
                        type="file"
                        ref={fileInputRef}
                        className="hidden"
                        multiple
                        accept="image/*"
                        onChange={handleFileUpload}
                      />
                      {files.length === 0 ? (
                        <div
                          onClick={() => fileInputRef.current?.click()}
                          className="border border-dashed border-border/70 rounded-lg p-5 text-center cursor-pointer hover:bg-card/70 hover:border-border transition-all"
                        >
                          <Upload className="w-6 h-6 mx-auto text-foreground/40 mb-2" />
                          <p className="text-sm text-foreground/60">点击上传图片</p>
                          <p className="text-xs text-foreground/40 mt-0.5">支持 JPG, PNG</p>
                        </div>
                      ) : (
                        <div className="grid grid-cols-4 gap-2">
                          {files.map((f: { data: string; mimeType: string; preview: string }, i) => (
                            <div key={i} className="aspect-square rounded-lg overflow-hidden border border-border/70">
                              {f.mimeType.startsWith('video') ? (
                                <video src={f.preview} className="w-full h-full object-cover" />
                              ) : (
                                <img src={f.preview} className="w-full h-full object-cover" alt="" />
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                  <div className="space-y-2 relative">
                    <div className="flex items-center justify-between">
                      <label className="text-xs text-foreground/50 uppercase tracking-wider">创作描述</label>
                      <button
                        type="button"
                        onClick={handleEnhancePrompt}
                        disabled={enhancing || !prompt.trim()}
                        className={cn(
                          'flex items-center gap-1 px-2 py-1 rounded text-xs transition-all',
                          enhancing || !prompt.trim()
                            ? 'text-foreground/40 cursor-not-allowed'
                            : 'text-sky-300 hover:text-sky-200 hover:bg-sky-500/10'
                        )}
                      >
                        {enhancing ? (
                          <Loader2 className="w-3 h-3 animate-spin" />
                        ) : (
                          <Wand2 className="w-3 h-3" />
                        )}
                        <span>增强</span>
                      </button>
                    </div>
                    <textarea
                      ref={promptTextareaRef}
                      value={prompt}
                      onChange={(e) => handlePromptChange(e, setPrompt)}
                      placeholder="描述你想要生成的内容，越详细效果越好..."
                      className="w-full h-20 px-3 py-2.5 bg-input/70 border border-border/70 text-foreground rounded-lg resize-none focus:outline-none focus:border-border focus:ring-2 focus:ring-ring/30 placeholder:text-muted-foreground/60 text-sm"
                    />
                    {characterCards.length > 0 && (
                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] text-foreground/50 uppercase tracking-wider">角色卡</span>
                          <span className="text-[10px] text-foreground/40">点击添加到描述</span>
                        </div>
                        <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
                          {characterCards.map((card) => (
                          <button
                            key={card.id}
                            type="button"
                            onClick={() => handleAddCharacter(card.characterName)}
                            className="flex items-center gap-2 px-2 py-1.5 bg-card/60 hover:bg-card/80 border border-border/70 hover:border-emerald-400/30 rounded-full text-xs text-foreground/80 transition-all shrink-0"
                          >
                            <div className="w-5 h-5 rounded-full overflow-hidden bg-gradient-to-br from-emerald-500/20 to-sky-500/20 shrink-0">
                              {card.avatarUrl ? (
                                <img src={card.avatarUrl} alt="" className="w-full h-full object-cover" />
                              ) : (
                                <div className="w-full h-full flex items-center justify-center">
                                  <User className="w-3 h-3 text-emerald-300/60" />
                                </div>
                              )}
                            </div>
                              <span className="max-w-[120px] truncate">@{card.characterName}</span>
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </>
              )}

              {creationMode === 'remix' && (
                <>
                  <div className="space-y-2">
                    <label className="text-xs text-foreground/50 uppercase tracking-wider flex items-center gap-2">
                      <LinkIcon className="w-3 h-3" />
                      视频分享链接
                    </label>
                    <input
                      type="text"
                      value={remixUrl}
                      onChange={(e) => setRemixUrl(e.target.value)}
                      placeholder="https://sora.chatgpt.com/p/s_xxx 或 s_xxx"
                      className="w-full px-3 py-2.5 bg-input/70 border border-border/70 text-foreground rounded-lg focus:outline-none focus:border-border focus:ring-2 focus:ring-ring/30 placeholder:text-muted-foreground/60 text-sm"
                    />
                      <p className="text-xs text-foreground/40">
                        输入 Sora 视频分享链接或ID，基于该视频继续创作
                      </p>
                  </div>
                  <div className="space-y-2 relative">
                    <div className="flex items-center justify-between">
                      <label className="text-xs text-foreground/50 uppercase tracking-wider flex items-center gap-2">
                        修改描述
                      </label>
                      <button
                        type="button"
                        onClick={handleEnhancePrompt}
                        disabled={enhancing || !prompt.trim()}
                        className={cn(
                          'flex items-center gap-1 px-2 py-1 rounded text-xs transition-all',
                          enhancing || !prompt.trim()
                            ? 'text-foreground/40 cursor-not-allowed'
                            : 'text-sky-300 hover:text-sky-200 hover:bg-sky-500/10'
                        )}
                      >
                        {enhancing ? (
                          <Loader2 className="w-3 h-3 animate-spin" />
                        ) : (
                          <Wand2 className="w-3 h-3" />
                        )}
                        <span>增强</span>
                      </button>
                    </div>
                    <textarea
                      ref={remixPromptRef}
                      value={prompt}
                      onChange={(e) => handlePromptChange(e, setPrompt)}
                      placeholder="描述你想要的修改，如：改成水墨画风格"
                      className="w-full h-20 px-3 py-2.5 bg-input/70 border border-border/70 text-foreground rounded-lg resize-none focus:outline-none focus:border-border focus:ring-2 focus:ring-ring/30 placeholder:text-muted-foreground/60 text-sm"
                    />
                  </div>
                </>
              )}

              {creationMode === 'storyboard' && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-xs text-foreground/50 uppercase tracking-wider flex items-center gap-2">
                      <Film className="w-3 h-3" />
                      分镜脚本
                    </label>
                    <button
                      type="button"
                      onClick={handleEnhancePrompt}
                      disabled={enhancing || !storyboardPrompt.trim()}
                      className={cn(
                        'flex items-center gap-1 px-2 py-1 rounded text-xs transition-all',
                          enhancing || !storyboardPrompt.trim()
                            ? 'text-foreground/40 cursor-not-allowed'
                            : 'text-sky-300 hover:text-sky-200 hover:bg-sky-500/10'
                        )}
                    >
                      {enhancing ? (
                        <Loader2 className="w-3 h-3 animate-spin" />
                      ) : (
                        <Wand2 className="w-3 h-3" />
                      )}
                      <span>增强</span>
                    </button>
                  </div>
                  <textarea
                    value={storyboardPrompt}
                    onChange={(e) => setStoryboardPrompt(e.target.value)}
                    placeholder={`[5.0s]猫猫从飞机上跳伞\n[5.0s]猫猫降落\n[10.0s]猫猫在田野奔跑`}
                    className="w-full h-28 px-3 py-2.5 bg-input/70 border border-border/70 text-foreground rounded-lg resize-none focus:outline-none focus:border-border focus:ring-2 focus:ring-ring/30 placeholder:text-muted-foreground/60 text-sm font-mono"
                  />
                  <p className="text-xs text-foreground/40">
                    格式：[时长]描述，每行一个镜头，如 [5.0s]描述内容
                  </p>
                </div>
              )}

              {/* Keep Prompt Checkbox */}
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={keepPrompt}
                  onChange={(e) => setKeepPrompt(e.target.checked)}
                  className="w-4 h-4 rounded border-border/70 bg-card/60 text-foreground accent-sky-400 cursor-pointer"
                />
                <span className="text-sm text-foreground/50">保留提示词</span>
              </label>

              {/* Error */}
              {error && (
                <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                  <p className="text-sm text-red-400">{error}</p>
                </div>
              )}

              {/* Generate Buttons */}
              <div className="flex flex-col sm:flex-row gap-2">
                <button
                  onClick={handleGenerate}
                  disabled={submitting}
                  className={cn(
                    'w-full sm:flex-1 flex items-center justify-center gap-2 px-5 py-3 rounded-lg font-medium transition-all',
                    submitting
                      ? 'bg-card/60 text-foreground/40 cursor-not-allowed'
                      : 'bg-gradient-to-r from-sky-500 to-emerald-500 text-white hover:opacity-90'
                  )}
                >
                  {submitting ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>提交中...</span>
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-4 h-4" />
                      <span>开始生成</span>
                    </>
                  )}
                </button>
                <div className="relative group">
                  <button
                    onClick={handleGachaMode}
                    disabled={submitting}
                    className={cn(
                      'h-[46px] w-full sm:w-[46px] flex items-center justify-center rounded-lg font-medium transition-all',
                      submitting
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
                      <p>提高出好图的概率</p>
                      <div className="absolute bottom-0 right-4 translate-y-full">
                        <div className="border-8 border-transparent border-t-card/90"></div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="min-w-0">
          <ResultGallery
            generations={generations}
            tasks={tasks}
            onRemoveTask={handleRemoveTask}
          />
        </div>
      </div>

    </div>
  );
}
