'use client';
/* eslint-disable @next/next/no-img-element */

import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import dynamic from 'next/dynamic';
import { useSession } from 'next-auth/react';
import {
  Upload,
  Loader2,
  AlertCircle,
  Sparkles,
  ChevronDown,
  Dices,
  Info,
  X,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { compressImageToWebP, fileToBase64 } from '@/lib/image-compression';
import type { Generation, SafeImageModel, DailyLimitConfig } from '@/types';
import { toast } from '@/components/ui/toaster';
import type { Task } from '@/components/generator/result-gallery';
import { getPollingInterval, shouldContinuePolling, isTransientError, getFriendlyErrorMessage } from '@/lib/polling-utils';
import { CustomSelect } from '@/components/ui/select-custom';

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

// 获取图像分辨率
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

export default function ImageGenerationPage() {
  const { update } = useSession();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const abortControllersRef = useRef<Map<string, AbortController>>(new Map());

  // 模型列表（从 API 获取）
  const [availableModels, setAvailableModels] = useState<SafeImageModel[]>([]);
  const [modelsLoaded, setModelsLoaded] = useState(false);

  // 每日限制
  const [dailyUsage, setDailyUsage] = useState<DailyUsage>({ imageCount: 0, videoCount: 0, characterCardCount: 0 });
  const [dailyLimits, setDailyLimits] = useState<DailyLimitConfig>({ imageLimit: 0, videoLimit: 0, characterCardLimit: 0 });

  // 模型选择
  const [selectedModelId, setSelectedModelId] = useState<string>('');

  // 参数状态
  const [aspectRatio, setAspectRatio] = useState<string>('1:1');
  const [imageSize, setImageSize] = useState<string>('1K');
  const [prompt, setPrompt] = useState('');
  const [images, setImages] = useState<{ file: File; preview: string }[]>([]);

  // 任务状态
  const [generations, setGenerations] = useState<Generation[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [compressing, setCompressing] = useState(false);
  const [compressedCache, setCompressedCache] = useState<Map<File, string>>(new Map());
  const [error, setError] = useState('');
  const [keepPrompt, setKeepPrompt] = useState(false);

  // 获取当前选中的模型配置
  const currentModel = useMemo(() => {
    return availableModels.find(m => m.id === selectedModelId) || availableModels[0];
  }, [availableModels, selectedModelId]);

  // 加载模型列表
  useEffect(() => {
    const loadModels = async () => {
      try {
        const res = await fetch('/api/image-models');
        if (res.ok) {
          const data = await res.json();
          const models = data.data?.models || [];
          setAvailableModels(models);
          // 设置默认选中第一个模型
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
      if (model.defaultImageSize) {
        setImageSize(model.defaultImageSize);
      }
      // 如果新模型不支持参考图，清除已上传的图片
      if (!model.features.imageToImage) {
        setImages((prev) => {
          prev.forEach((img) => URL.revokeObjectURL(img.preview));
          return [];
        });
      }
    }
  }, [selectedModelId, availableModels]);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = Array.from(e.target.files || []);

    for (const file of selectedFiles) {
      if (!file.type.startsWith('image/')) continue;

      // 立即校验文件大小
      if (file.size > 15 * 1024 * 1024) {
        setError('图片大小不能超过 15MB');
        continue;
      }

      // 只存储 File 对象和预览
      setImages((prev) => [
        ...prev,
        {
          file,
          preview: URL.createObjectURL(file)
        },
      ]);
    }

    e.target.value = '';
  };

  const clearImages = () => {
    images.forEach((img) => URL.revokeObjectURL(img.preview));
    setImages([]);
    setCompressedCache(new Map()); // 清理压缩缓存
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
        if (!shouldContinuePolling(elapsed, 'image')) {
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

          // Reset error count on success
          consecutiveErrors = 0;
          const status = data.data.status;
          const rawUrl = typeof data.data.url === 'string' ? data.data.url : '';
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
          } else if (isCompletedStatus || rawUrl) {
            await update();

            const generation: Generation = {
              id: data.data.id,
              userId: '',
              type: data.data.type,
              prompt: taskPrompt,
              params: {},
              resultUrl: rawUrl || `/api/media/${data.data.id || taskId}`,
              cost: data.data.cost,
              status: 'completed',
              createdAt: data.data.createdAt,
              updatedAt: data.data.updatedAt,
            };

            setTasks((prev) => prev.filter((t) => t.id !== taskId));
            // 避免重复添加（如果已经存在于历史记录中）
            setGenerations((prev) => {
              if (prev.some(g => g.id === generation.id)) {
                return prev;
              }
              return [generation, ...prev];
            });

            toast({
              title: '生成成功',
              description: `消耗 ${data.data.cost} 积分`,
            });

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
            const interval = getPollingInterval(elapsed, 'image');
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
    [update]
  );

  // Load pending tasks
  useEffect(() => {
    const abortControllers = abortControllersRef.current;
    const loadPendingTasks = async () => {
      try {
        const res = await fetch('/api/user/tasks');
        if (res.ok) {
          const data = await res.json();
          // Filter pending image tasks (sora, gemini, zimage)
          const imageTasks: Task[] = (data.data || [])
            .filter((t: any) =>
              t.type?.includes('sora-image') ||
              t.type?.includes('gemini') ||
              t.type?.includes('zimage') ||
              t.type?.includes('gitee')
            )
            .map((t: any) => ({
              id: t.id,
              prompt: t.prompt,
              type: t.type,
              status: t.status as 'pending' | 'processing',
              createdAt: t.createdAt,
            }));

          if (imageTasks.length > 0) {
            setTasks(imageTasks);
            imageTasks.forEach((task) => {
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

  // 检查是否达到每日限制
  const isImageLimitReached = dailyLimits.imageLimit > 0 && dailyUsage.imageCount >= dailyLimits.imageLimit;

  // 验证输入
  const validateInput = (): string | null => {
    if (!currentModel) return '请选择模型';
  // 检查每日限制
    if (isImageLimitReached) {
      return `今日图像生成次数已达上限 (${dailyLimits.imageLimit} 次)`;
    }
    if (currentModel.requiresReferenceImage && images.length === 0) {
      return '请上传参考图';
    }
  // Gemini 类型允许图片或提示词
    if (currentModel.channelType === 'gemini') {
      if (!prompt.trim() && images.length === 0) {
        return '请输入提示词或上传参考图片';
      }
    } else if (!currentModel.allowEmptyPrompt) {
      if (!prompt.trim()) {
        return '请输入提示词';
      }
    }
    return null;
  };

  // 压缩图片（如果需要）
  const compressImagesIfNeeded = async (): Promise<Array<{ mimeType: string; data: string }>> => {
    if (images.length === 0) return [];

    setCompressing(true);
    setError('');

    try {
      const compressedImages = [];

      for (const img of images) {
        // 检查缓存
        let base64 = compressedCache.get(img.file);

        if (!base64) {
          // 压缩图片（Web Worker 自动处理）
          const compressedFile = await compressImageToWebP(img.file);

          // 转换为 base64
          base64 = await fileToBase64(compressedFile);

          // 缓存结果
          setCompressedCache(prev => new Map(prev).set(img.file, base64!));
        }

        compressedImages.push({
          mimeType: 'image/jpeg',
          data: `data:image/jpeg;base64,${base64}`
        });
      }

      return compressedImages;
    } finally {
      setCompressing(false);
    }
  };

  // 单次提交任务的核心函数
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

    const taskPrompt = prompt.trim();

    try {
      // 先压缩图片
      const compressedImages = await compressImagesIfNeeded();

      // 提交任务
      await submitSingleTask(taskPrompt, compressedImages);

      toast({
        title: '任务已提交',
        description: '任务已加入队列，可继续提交新任务',
      });

      // 更新今日使用量
      setDailyUsage(prev => ({ ...prev, imageCount: prev.imageCount + 1 }));

      if (!keepPrompt) {
        setPrompt('');
        clearImages();
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

    const taskPrompt = prompt.trim();

    try {
      // 压缩一次，复用 3 次
      const compressedImages = await compressImagesIfNeeded();

      // 提交 3 次任务
      for (let i = 0; i < 3; i++) {
        await submitSingleTask(taskPrompt, compressedImages);
      }

      toast({
        title: '已提交 3 个任务',
        description: '抽卡模式启动，等待结果中...',
      });

      // 更新今日使用量
      setDailyUsage(prev => ({ ...prev, imageCount: prev.imageCount + 3 }));

      if (!keepPrompt) {
        setPrompt('');
        clearImages();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '生成失败');
    } finally {
      setSubmitting(false);
    }
  };

  // 获取当前分辨率显示
  const getCurrentResolutionDisplay = () => {
    if (!currentModel) return '';
    return getImageResolution(currentModel, aspectRatio, imageSize);
  };

  return (
    <div className="flex flex-col lg:h-[calc(100vh-100px)] max-w-7xl mx-auto">
      {/* 页面标题 */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between mb-4 shrink-0">
        <div>
          <h1 className="text-2xl lg:text-3xl font-light text-foreground">图像生成</h1>
          <p className="text-foreground/50 text-sm lg:text-base mt-0.5 font-light">
            选择模型，生成高质量图像
          </p>
        </div>
        {dailyLimits.imageLimit > 0 && (
          <div className={cn(
            "px-3 py-1.5 rounded-lg border text-xs lg:text-sm",
            isImageLimitReached
              ? "bg-red-500/10 border-red-500/30 text-red-400"
              : "bg-card/60 border-border/70 text-foreground/60"
          )}>
            今日: {dailyUsage.imageCount} / {dailyLimits.imageLimit}
          </div>
        )}
      </div>

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

      {/* 移动端：输入在上，结果在下 */}
      {/* 桌面端：结果在上，输入在下 */}
      <div className={cn(
        "surface shrink-0 overflow-visible mb-4 lg:mb-0 lg:order-2",
        (availableModels.length === 0 || isImageLimitReached) && "opacity-50 pointer-events-none"
      )}>
        <div className="p-4">
          <div className="flex gap-4 mb-4">
            {currentModel?.features.imageToImage && (
              <div
                onClick={() => fileInputRef.current?.click()}
                className={cn(
                  'w-24 h-20 shrink-0 border-2 border-dashed rounded-lg flex flex-col items-center justify-center cursor-pointer transition-all',
                  images.length > 0 ? 'border-border/70 bg-card/60' : 'border-border/70 hover:border-border hover:bg-card/60'
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
                {images.length > 0 ? (
                  <div className="relative w-full h-full">
                    <img src={images[0].preview} alt="" className="w-full h-full object-cover rounded-md" />
                    {images.length > 1 && (
                      <div className="absolute bottom-1 right-1 px-1.5 py-0.5 bg-black/70 rounded text-[10px] text-white">
                        +{images.length - 1}
                      </div>
                    )}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        clearImages();
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
                  options={currentModel.aspectRatios.map((r) => ({
                    value: r,
                    label: r,
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

      {/* 结果展示区 - 移动端在下面，桌面端在上面 */}
      <div className="flex-1 overflow-auto min-h-0 lg:order-1 pb-20 lg:pb-4">
        <ResultGallery
          generations={generations}
          tasks={tasks}
          onRemoveTask={handleRemoveTask}
        />
      </div>
    </div>
  );
}
