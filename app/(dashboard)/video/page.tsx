'use client';
/* eslint-disable @next/next/no-img-element */

import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { useSession } from 'next-auth/react';
import {
  Video,
  Upload,
  Trash2,
  Sparkles,
  Loader2,
  AlertCircle,
  ChevronDown,
  Wand2,
  Film,
  Link as LinkIcon,
  Dices,
  Info,
  User,
  X,
} from 'lucide-react';
import { cn, fileToBase64 } from '@/lib/utils';
import { toast } from '@/components/ui/toaster';
import { ResultGallery, type Task } from '@/components/generator/result-gallery';
import type { Generation, CharacterCard, SafeVideoModel, DailyLimitConfig } from '@/types';

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
  const [showModelDropdown, setShowModelDropdown] = useState(false);

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

  // 角色卡选择
  const [characterCards, setCharacterCards] = useState<CharacterCard[]>([]);
  const [showCharacterLibrary, setShowCharacterLibrary] = useState(false);
  const [librarySearchQuery, setLibrarySearchQuery] = useState('');
  const [displayLimit, setDisplayLimit] = useState(20);
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

          if (status === 'completed') {
            await update();

            const generation: Generation = {
              id: data.data.id,
              userId: '',
              type: data.data.type,
              prompt: taskPrompt,
              params: {},
              resultUrl: data.data.url,
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
          } else if (status === 'failed') {
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
          } else {
            setTasks((prev) =>
              prev.map((t) =>
                t.id === taskId
                  ? { 
                      ...t, 
                      status: status as 'pending' | 'processing',
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
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-extralight text-white">视频生成</h1>
          <p className="text-white/50 mt-1 font-light">
            支持普通生成、Remix、分镜等多种创作模式
          </p>
        </div>
        {dailyLimits.videoLimit > 0 && (
          <div className={cn(
            "px-4 py-2 rounded-xl border text-sm",
            isVideoLimitReached
              ? "bg-red-500/10 border-red-500/30 text-red-400"
              : "bg-white/5 border-white/10 text-white/60"
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

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-1">
          <div className={cn(
            "bg-white/5 border border-white/10 rounded-2xl overflow-hidden backdrop-blur-sm",
            (availableModels.length === 0 || isVideoLimitReached) && "opacity-50 pointer-events-none"
          )}>
            {/* Header */}
            <div className="px-5 py-4 border-b border-white/10 bg-gradient-to-r from-purple-500/5 to-blue-500/5">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 bg-gradient-to-br from-purple-500/30 to-blue-500/30 rounded-lg flex items-center justify-center">
                  <Sparkles className="w-4 h-4 text-purple-400" />
                </div>
                <div>
                  <h2 className="text-base font-medium text-white">Sora 视频</h2>
                  <p className="text-xs text-white/40">AI 视频创作</p>
                </div>
              </div>
            </div>

            <div className="px-5 py-4 space-y-4">
              {/* Creation Mode Selection */}
              <div className="space-y-2">
                <label className="text-xs text-white/50 uppercase tracking-wider">创作模式</label>
                <div className="grid grid-cols-3 gap-2">
                  {CREATION_MODES.map((mode) => (
                    <button
                      key={mode.id}
                      onClick={() => setCreationMode(mode.id as CreationMode)}
                      className={cn(
                        'flex flex-col items-center gap-1.5 px-2 py-2.5 rounded-lg border transition-all',
                        creationMode === mode.id
                          ? 'bg-white text-black border-white'
                          : 'bg-white/5 text-white/70 border-white/10 hover:bg-white/10 hover:text-white'
                      )}
                    >
                      <mode.icon className="w-4 h-4" />
                      <span className="text-xs font-medium">{mode.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Model Selection */}
              <div className="space-y-2">
                <label className="text-xs text-white/50 uppercase tracking-wider">模型</label>
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setShowModelDropdown(!showModelDropdown)}
                    className="w-full flex items-center justify-between px-3 py-2.5 bg-white/5 border border-white/10 text-white rounded-lg focus:outline-none focus:border-white/30"
                  >
                    <div className="flex flex-col items-start">
                      <span className="text-sm font-medium">{currentModel?.name || '选择模型'}</span>
                      <span className="text-xs text-white/50">{currentModel?.description || ''}</span>
                    </div>
                    <ChevronDown className={`w-4 h-4 transition-transform ${showModelDropdown ? 'rotate-180' : ''}`} />
                  </button>
                  {showModelDropdown && (
                    <div className="absolute z-10 w-full mt-1 bg-zinc-900 border border-white/10 rounded-lg shadow-lg overflow-hidden">
                      {availableModels.map((model) => (
                        <button
                          key={model.id}
                          type="button"
                          onClick={() => {
                            setSelectedModelId(model.id);
                            setShowModelDropdown(false);
                          }}
                          className={`w-full flex flex-col items-start px-3 py-2.5 hover:bg-white/10 transition-colors ${
                            selectedModelId === model.id ? 'bg-white/10' : ''
                          }`}
                        >
                          <span className="text-sm font-medium text-white">{model.name}</span>
                          <span className="text-xs text-white/50">{model.description}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Aspect Ratio */}
              {currentModel && (
              <div className="space-y-2">
                <label className="text-xs text-white/50 uppercase tracking-wider">画面比例</label>
                <div className="grid grid-cols-3 gap-2">
                  {currentModel.aspectRatios.map((r) => (
                    <button
                      key={r.value}
                      onClick={() => setAspectRatio(r.value)}
                      className={cn(
                        'flex flex-col items-center gap-1.5 px-3 py-3 rounded-lg border transition-all',
                        aspectRatio === r.value
                          ? 'bg-white text-black border-white'
                          : 'bg-white/5 text-white/70 border-white/10 hover:bg-white/10 hover:text-white'
                      )}
                    >
                      <span className="text-base">{r.value === 'landscape' ? '▬' : '▮'}</span>
                      <span className="text-xs font-medium">{r.label}</span>
                    </button>
                  ))}
                </div>
              </div>
              )}

              {/* Duration */}
              {currentModel && (
              <div className="space-y-2">
                <label className="text-xs text-white/50 uppercase tracking-wider">视频时长</label>
                <div className="grid grid-cols-3 gap-2">
                  {currentModel.durations.map((d) => (
                    <button
                      key={d.value}
                      onClick={() => setDuration(d.value)}
                      className={cn(
                        'px-3 py-2.5 rounded-lg border transition-all text-sm font-medium',
                        duration === d.value
                          ? 'bg-white text-black border-white'
                          : 'bg-white/5 text-white/70 border-white/10 hover:bg-white/10 hover:text-white'
                      )}
                    >
                      {d.label}
                    </button>
                  ))}
                </div>
              </div>
              )}

              {/* Mode-specific inputs */}
              {creationMode === 'normal' && (
                <>
                  {/* 视频风格选择 */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <label className="text-xs text-white/50 uppercase tracking-wider">视频风格</label>
                      {selectedStyle && (
                        <button
                          onClick={() => setSelectedStyle(null)}
                          className="text-xs text-white/40 hover:text-white/60"
                        >
                          取消选择
                        </button>
                      )}
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      {VIDEO_STYLES.map((style) => (
                        <button
                          key={style.id}
                          onClick={() => setSelectedStyle(selectedStyle === style.id ? null : style.id)}
                          className={cn(
                            'relative aspect-video rounded-lg overflow-hidden border-2 transition-all',
                            selectedStyle === style.id
                              ? 'border-purple-500 ring-2 ring-purple-500/30'
                              : 'border-white/10 hover:border-white/30'
                          )}
                        >
                          <img
                            src={style.image}
                            alt={style.name}
                            className="w-full h-full object-cover"
                          />
                          <div className={cn(
                            'absolute inset-0 flex items-end justify-center pb-1.5 bg-gradient-to-t from-black/80 to-transparent',
                            selectedStyle === style.id && 'from-purple-900/80'
                          )}>
                            <span className="text-[10px] font-medium text-white">{style.name}</span>
                          </div>
                          {selectedStyle === style.id && (
                            <div className="absolute top-1 right-1 w-4 h-4 bg-purple-500 rounded-full flex items-center justify-center">
                              <svg className="w-2.5 h-2.5 text-white" fill="currentColor" viewBox="0 0 20 20">
                                <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                              </svg>
                            </div>
                          )}
                        </button>
                      ))}
                    </div>
                    <p className="text-[10px] text-white/30">可选：选择一个风格应用到生成的视频</p>
                  </div>

                  {currentModel?.features.imageToVideo && (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <label className="text-xs text-white/50 uppercase tracking-wider">参考素材</label>
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
                          className="border border-dashed border-white/20 rounded-lg p-5 text-center cursor-pointer hover:bg-white/5 hover:border-white/30 transition-all"
                        >
                          <Upload className="w-6 h-6 mx-auto text-white/30 mb-2" />
                          <p className="text-sm text-white/50">点击上传图片</p>
                          <p className="text-xs text-white/30 mt-0.5">支持 JPG, PNG</p>
                        </div>
                      ) : (
                        <div className="grid grid-cols-4 gap-2">
                          {files.map((f: { data: string; mimeType: string; preview: string }, i) => (
                            <div key={i} className="aspect-square rounded-lg overflow-hidden border border-white/10">
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
                      <label className="text-xs text-white/50 uppercase tracking-wider">创作描述</label>
                      {characterCards.length > 0 && (
                        <button
                          type="button"
                          onClick={() => {
                            setShowCharacterLibrary(!showCharacterLibrary);
                            setLibrarySearchQuery('');
                            setDisplayLimit(20); // 重置显示数量
                          }}
                          className="flex items-center gap-1.5 px-2.5 py-1 bg-gradient-to-r from-pink-500/10 to-purple-500/10 border border-pink-500/20 rounded-md hover:from-pink-500/20 hover:to-purple-500/20 transition-all"
                        >
                          <User className="w-3 h-3 text-pink-400" />
                          <span className="text-[11px] text-pink-400">角色卡库</span>
                        </button>
                      )}
                    </div>
                    <textarea
                      ref={promptTextareaRef}
                      value={prompt}
                      onChange={(e) => handlePromptChange(e, setPrompt)}
                      placeholder="描述你想要生成的内容，越详细效果越好..."
                      className="w-full h-20 px-3 py-2.5 bg-white/5 border border-white/10 text-white rounded-lg resize-none focus:outline-none focus:border-white/30 placeholder:text-white/30 text-sm"
                    />
                  </div>
                </>
              )}

              {creationMode === 'remix' && (
                <>
                  <div className="space-y-2">
                    <label className="text-xs text-white/50 uppercase tracking-wider flex items-center gap-2">
                      <LinkIcon className="w-3 h-3" />
                      视频分享链接
                    </label>
                    <input
                      type="text"
                      value={remixUrl}
                      onChange={(e) => setRemixUrl(e.target.value)}
                      placeholder="https://sora.chatgpt.com/p/s_xxx 或 s_xxx"
                      className="w-full px-3 py-2.5 bg-white/5 border border-white/10 text-white rounded-lg focus:outline-none focus:border-white/30 placeholder:text-white/30 text-sm"
                    />
                    <p className="text-xs text-white/40">
                      输入 Sora 视频分享链接或ID，基于该视频继续创作
                    </p>
                  </div>
                  <div className="space-y-2 relative">
                    <label className="text-xs text-white/50 uppercase tracking-wider flex items-center gap-2">
                      修改描述
                    </label>
                    <textarea
                      ref={remixPromptRef}
                      value={prompt}
                      onChange={(e) => handlePromptChange(e, setPrompt)}
                      placeholder="描述你想要的修改，如：改成水墨画风格"
                      className="w-full h-20 px-3 py-2.5 bg-white/5 border border-white/10 text-white rounded-lg resize-none focus:outline-none focus:border-white/30 placeholder:text-white/30 text-sm"
                    />
                  </div>
                </>
              )}

              {creationMode === 'storyboard' && (
                <div className="space-y-2">
                  <label className="text-xs text-white/50 uppercase tracking-wider flex items-center gap-2">
                    <Film className="w-3 h-3" />
                    分镜脚本
                  </label>
                  <textarea
                    value={storyboardPrompt}
                    onChange={(e) => setStoryboardPrompt(e.target.value)}
                    placeholder={`[5.0s]猫猫从飞机上跳伞\n[5.0s]猫猫降落\n[10.0s]猫猫在田野奔跑`}
                    className="w-full h-28 px-3 py-2.5 bg-white/5 border border-white/10 text-white rounded-lg resize-none focus:outline-none focus:border-white/30 placeholder:text-white/30 text-sm font-mono"
                  />
                  <p className="text-xs text-white/40">
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
                  className="w-4 h-4 rounded border-white/20 bg-white/5 text-white accent-purple-500 cursor-pointer"
                />
                <span className="text-sm text-white/50">保留提示词</span>
              </label>

              {/* Error */}
              {error && (
                <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                  <p className="text-sm text-red-400">{error}</p>
                </div>
              )}

              {/* Generate Buttons */}
              <div className="flex gap-2">
                <button
                  onClick={handleGenerate}
                  disabled={submitting}
                  className={cn(
                    'flex-1 flex items-center justify-center gap-2 px-5 py-3 rounded-lg font-medium transition-all',
                    submitting
                      ? 'bg-white/10 text-white/50 cursor-not-allowed'
                      : 'bg-gradient-to-r from-purple-500 to-blue-500 text-white hover:opacity-90'
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
                      'h-[46px] w-[46px] flex items-center justify-center rounded-lg font-medium transition-all',
                      submitting
                        ? 'bg-white/10 text-white/50 cursor-not-allowed'
                        : 'bg-gradient-to-r from-amber-500 to-orange-500 text-white hover:opacity-90'
                    )}
                    title="抽卡模式"
                  >
                    <Dices className="w-4 h-4" />
                  </button>
                  <div className="absolute bottom-full right-0 mb-2 hidden group-hover:block z-20">
                    <div className="bg-zinc-800 border border-white/10 rounded-lg px-3 py-2 text-xs text-white/80 whitespace-nowrap shadow-lg">
                      <div className="flex items-center gap-1.5 mb-1">
                        <Info className="w-3 h-3 text-amber-400" />
                        <span className="font-medium text-white">抽卡模式</span>
                      </div>
                      <p>一次性提交 3 个相同参数的任务</p>
                      <p>提高出好图的概率</p>
                      <div className="absolute bottom-0 right-4 translate-y-full">
                        <div className="border-8 border-transparent border-t-zinc-800"></div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="lg:col-span-2">
          <ResultGallery
            generations={generations}
            tasks={tasks}
            onRemoveTask={handleRemoveTask}
          />
        </div>
      </div>

      {/* 角色卡库弹窗 Modal */}
      {showCharacterLibrary && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-md bg-zinc-900 border border-white/10 rounded-2xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            {/* Header */}
            <div className="px-4 sm:px-6 py-4 border-b border-white/10 bg-gradient-to-r from-pink-500/10 to-purple-500/10">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-pink-500/20 to-purple-500/20 flex items-center justify-center">
                    <User className="w-4 h-4 text-pink-400" />
                  </div>
                  <h3 className="text-base sm:text-lg font-semibold text-white">角色卡库</h3>
                </div>
                <button
                  onClick={() => setShowCharacterLibrary(false)}
                  className="w-8 h-8 rounded-lg flex items-center justify-center text-white/40 hover:text-white hover:bg-white/10 transition-all"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Search */}
            {characterCards.length > 0 && (
              <div className="px-3 sm:px-4 py-3 border-b border-white/10 space-y-2">
                <input
                  type="text"
                  value={librarySearchQuery}
                  onChange={(e) => setLibrarySearchQuery(e.target.value)}
                  placeholder="搜索角色名..."
                  className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-pink-500/30 transition-colors"
                />
                <p className="text-xs text-white/40 text-center">
                  共 {characterCards.length} 个角色卡
                </p>
              </div>
            )}

            {/* Content */}
            <div className="max-h-[60vh] sm:max-h-96 overflow-y-auto p-3 sm:p-4">
              {characterCards.length > 0 ? (
                (() => {
                  const filtered = characterCards.filter((card) => 
                    card.characterName.toLowerCase().includes(librarySearchQuery.toLowerCase())
                  );
                  const displayed = filtered.slice(0, displayLimit);
                  const hasMore = filtered.length > displayLimit;
                  
                  return filtered.length > 0 ? (
                    <>
                      <div className="grid grid-cols-1 gap-2.5">
                        {displayed.map((card) => (
                    <button
                      key={card.id}
                      type="button"
                      onClick={() => {
                        const mention = `@${card.characterName}`;
                        setPrompt(prev => prev ? `${prev} ${mention}` : mention);
                        setShowCharacterLibrary(false);
                      }}
                      className="w-full flex items-center gap-3 sm:gap-4 px-3 sm:px-4 py-3 sm:py-3.5 bg-white/5 hover:bg-white/10 rounded-xl transition-all text-left border border-white/10 hover:border-pink-500/30 active:scale-[0.98]"
                    >
                      <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-xl overflow-hidden bg-gradient-to-br from-pink-500/20 to-purple-500/20 shrink-0">
                        {card.avatarUrl ? (
                          <img src={card.avatarUrl} alt="" className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center">
                            <User className="w-7 h-7 sm:w-8 sm:h-8 text-pink-400/50" />
                          </div>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm sm:text-base font-medium text-white truncate">
                          @{card.characterName}
                        </p>
                        <p className="text-xs sm:text-sm text-white/40 mt-0.5">点击添加到描述</p>
                      </div>
                    </button>
                        ))}
                      </div>
                      
                      {/* 加载更多按钮 */}
                      {hasMore && (
                        <div className="mt-3 text-center">
                          <button
                            type="button"
                            onClick={() => setDisplayLimit(prev => prev + 20)}
                            className="px-4 py-2 bg-white/5 hover:bg-white/10 border border-white/10 hover:border-pink-500/30 rounded-lg text-sm text-white/70 hover:text-white transition-all"
                          >
                            加载更多 ({filtered.length - displayLimit} 个)
                          </button>
                        </div>
                      )}
                    </>
                  ) : (
                    <div className="px-4 py-12 text-center">
                      <User className="w-12 h-12 mx-auto text-white/20 mb-3" />
                      <p className="text-white/40 text-sm">未找到匹配的角色卡</p>
                      <p className="text-white/30 text-xs mt-1">尝试其他关键词</p>
                    </div>
                  );
                })()
              ) : (
                <div className="px-4 py-12 text-center">
                  <User className="w-12 h-12 mx-auto text-white/20 mb-3" />
                  <p className="text-white/40 text-sm">暂无角色卡</p>
                  <p className="text-white/30 text-xs mt-1">前往角色卡生成页面创建</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
