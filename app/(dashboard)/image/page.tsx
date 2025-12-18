'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { useSession } from 'next-auth/react';
import {
  Image,
  Upload,
  Trash2,
  Wand2,
  Loader2,
  AlertCircle,
  Sparkles,
  ChevronDown,
  Dices,
  Info,
} from 'lucide-react';
import { cn, fileToBase64 } from '@/lib/utils';
import type { Generation } from '@/types';
import { toast } from '@/components/ui/toaster';
import { ResultGallery, type Task } from '@/components/generator/result-gallery';
import {
  IMAGE_MODELS,
  getImageModelById,
  getImageResolution,
} from '@/lib/model-config';

export default function ImageGenerationPage() {
  const { update } = useSession();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const abortControllersRef = useRef<Map<string, AbortController>>(new Map());

  // 模型选择
  const [selectedModelId, setSelectedModelId] = useState<string>('gemini-nano');
  const [showModelDropdown, setShowModelDropdown] = useState(false);

  // 参数状态
  const [aspectRatio, setAspectRatio] = useState<string>('1:1');
  const [imageSize, setImageSize] = useState<string>('1K');
  const [prompt, setPrompt] = useState('');
  const [images, setImages] = useState<{ data: string; mimeType: string; preview: string }[]>([]);

  // 任务状态
  const [generations, setGenerations] = useState<Generation[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  // 获取当前选中的模型配置
  const currentModel = getImageModelById(selectedModelId) || IMAGE_MODELS[0];

  // 当模型改变时，重置参数到默认值
  useEffect(() => {
    const model = getImageModelById(selectedModelId);
    if (model) {
      setAspectRatio(model.defaultAspectRatio);
      if (model.defaultImageSize) {
        setImageSize(model.defaultImageSize);
      }
      // 如果新模型不支持参考图，清除已上传的图片
      if (!model.features.supportReferenceImage) {
        setImages((prev) => {
          prev.forEach((img) => URL.revokeObjectURL(img.preview));
          return [];
        });
      }
    }
  }, [selectedModelId]);

  // 加载 pending 任务
  useEffect(() => {
    const loadPendingTasks = async () => {
      try {
        const res = await fetch('/api/user/tasks');
        if (res.ok) {
          const data = await res.json();
          // 加载图像类型的任务 (sora, gemini, zimage)
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
      abortControllersRef.current.forEach((controller) => controller.abort());
      abortControllersRef.current.clear();
    };
  }, []);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = Array.from(e.target.files || []);
    for (const file of selectedFiles) {
      if (!file.type.startsWith('image/')) continue;
      const data = await fileToBase64(file);
      setImages((prev) => [
        ...prev,
        { data, mimeType: file.type, preview: URL.createObjectURL(file) },
      ]);
    }
    e.target.value = '';
  };

  const clearImages = () => {
    images.forEach((img) => URL.revokeObjectURL(img.preview));
    setImages([]);
  };

  // 轮询任务状态
  const pollTaskStatus = useCallback(
    async (taskId: string, taskPrompt: string): Promise<void> => {
      if (abortControllersRef.current.has(taskId)) return;

      const controller = new AbortController();
      abortControllersRef.current.set(taskId, controller);

      const maxAttempts = 240;
      let attempts = 0;

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
                  ? { ...t, status: status as 'pending' | 'processing' }
                  : t
              )
            );
            setTimeout(poll, 10000);
          }
        } catch (err) {
          if ((err as Error).name === 'AbortError') return;
          setTasks((prev) =>
            prev.map((t) =>
              t.id === taskId
                ? {
                    ...t,
                    status: 'failed' as const,
                    errorMessage: (err as Error).message,
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

  // 验证输入
  const validateInput = (): string | null => {
    if (currentModel.id === 'qwen-image-edit' && images.length === 0) {
      return '请上传参考图';
    }
    if (currentModel.provider === 'gemini') {
      if (!prompt.trim() && images.length === 0) {
        return '请输入提示词或上传参考图片';
      }
    } else {
      if (!prompt.trim()) {
        return '请输入提示词';
      }
    }
    return null;
  };

  // 单次提交任务的核心函数
  const submitSingleTask = async (taskPrompt: string) => {
    let res: Response;
    let taskType: string;

    if (currentModel.provider === 'sora') {
      const size = getImageResolution(currentModel, aspectRatio);
      res = await fetch('/api/generate/sora-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: taskPrompt,
          model: currentModel.apiModel,
          size,
          input_image: images.length > 0 ? images[0].data : undefined,
        }),
      });
      taskType = 'sora-image';
    } else if (currentModel.provider === 'gemini') {
      res = await fetch('/api/generate/gemini', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: currentModel.apiModel,
          prompt: taskPrompt,
          aspectRatio,
          imageSize: currentModel.features.supportImageSize ? imageSize : undefined,
          images: images.map((img) => ({ mimeType: img.mimeType, data: img.data })),
        }),
      });
      taskType = 'gemini-image';
    } else {
      const size = getImageResolution(currentModel, aspectRatio);
      const payload: Record<string, unknown> = {
        prompt: taskPrompt,
        model: currentModel.apiModel,
        size,
        channel: currentModel.channel,
        ...(currentModel.channel === 'gitee' && { numInferenceSteps: 9 }),
      };
      if (currentModel.features.supportReferenceImage && images.length > 0) {
        payload.images = images.map((img) => ({ mimeType: img.mimeType, data: img.data }));
      }
      res = await fetch('/api/generate/zimage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      taskType = currentModel.channel === 'gitee' ? 'gitee-image' : 'zimage-image';
    }

    const data = await res.json();

    if (!res.ok) {
      throw new Error(data.error || '生成失败');
    }

    const newTask: Task = {
      id: data.data.id,
      prompt: taskPrompt,
      type: taskType,
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
      await submitSingleTask(taskPrompt);

      toast({
        title: '任务已提交',
        description: '任务已加入队列，可继续提交新任务',
      });

      setPrompt('');
      clearImages();
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
      for (let i = 0; i < 3; i++) {
        await submitSingleTask(taskPrompt);
      }

      toast({
        title: '抽卡模式已启动',
        description: '已提交 3 个相同任务，等待结果中...',
      });

      setPrompt('');
      clearImages();
    } catch (err) {
      setError(err instanceof Error ? err.message : '生成失败');
    } finally {
      setSubmitting(false);
    }
  };

  // 获取当前分辨率显示
  const getCurrentResolutionDisplay = () => {
    return getImageResolution(currentModel, aspectRatio, imageSize);
  };

  return (
    <div className="max-w-7xl mx-auto space-y-8">
      <div>
        <h1 className="text-3xl font-extralight text-white">图像生成</h1>
        <p className="text-white/50 mt-1 font-light">
          选择模型，生成高质量图像
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-1">
          <div className="bg-white/5 border border-white/10 rounded-2xl overflow-hidden backdrop-blur-sm">
            <div className="px-5 py-4 border-b border-white/10 bg-gradient-to-r from-blue-500/5 to-purple-500/5">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 bg-gradient-to-br from-blue-500/20 to-purple-500/20 rounded-lg flex items-center justify-center">
                  <Sparkles className="w-4 h-4 text-blue-400" />
                </div>
                <div>
                  <h2 className="text-base font-medium text-white">创作面板</h2>
                  <p className="text-xs text-white/40">配置参数开始生成</p>
                </div>
              </div>
            </div>
            <div className="p-5 space-y-5">
              {/* Model Selection Dropdown */}
              <div className="space-y-2">
                <label className="text-xs text-white/50 uppercase tracking-wider">模型</label>
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setShowModelDropdown(!showModelDropdown)}
                    className="w-full flex items-center justify-between px-3 py-2.5 bg-white/5 border border-white/10 text-white rounded-lg focus:outline-none focus:border-white/30"
                  >
                    <div className="flex flex-col items-start">
                      <span className="text-sm font-medium">{currentModel.name}</span>
                      <span className="text-xs text-white/50">{currentModel.description}</span>
                    </div>
                    <ChevronDown className={`w-4 h-4 transition-transform ${showModelDropdown ? 'rotate-180' : ''}`} />
                  </button>
                  {showModelDropdown && (
                    <div className="absolute z-50 w-full mt-1 bg-zinc-900 border border-white/10 rounded-lg shadow-xl overflow-hidden">
                      {IMAGE_MODELS.map((model) => (
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
                          <span className="text-xs text-white/50">
                            {model.description}
                            {!model.features.supportReferenceImage && ' · 不支持参考图'}
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Image Size (if supported) */}
              {currentModel.features.supportImageSize && currentModel.imageSizes && (
                <div className="space-y-2">
                  <label className="text-xs text-white/50 uppercase tracking-wider">分辨率</label>
                  <div className="grid grid-cols-3 gap-2">
                    {currentModel.imageSizes.map((size) => (
                      <button
                        key={size}
                        onClick={() => setImageSize(size)}
                        className={cn(
                          'px-3 py-2 rounded-lg border text-sm font-medium transition-all',
                          imageSize === size
                            ? 'bg-white text-black border-white'
                            : 'bg-white/5 text-white/70 border-white/10 hover:bg-white/10 hover:text-white'
                        )}
                      >
                        {size}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Aspect Ratio */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs text-white/50 uppercase tracking-wider">画面比例</label>
                  <span className="text-xs text-white/40">{getCurrentResolutionDisplay()}</span>
                </div>
                <div className="grid grid-cols-5 gap-1.5">
                  {currentModel.aspectRatios.map((r) => (
                    <button
                      key={r}
                      onClick={() => setAspectRatio(r)}
                      className={cn(
                        'px-2 py-2 rounded-lg border text-xs font-medium transition-all',
                        aspectRatio === r
                          ? 'bg-white text-black border-white'
                          : 'bg-white/5 text-white/70 border-white/10 hover:bg-white/10 hover:text-white'
                      )}
                    >
                      {r}
                    </button>
                  ))}
                </div>
              </div>

              {/* Reference Images (if supported) */}
              {currentModel.features.supportReferenceImage && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-xs text-white/50 uppercase tracking-wider">参考图</label>
                    {images.length > 0 && (
                      <button
                        onClick={clearImages}
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
                  {images.length === 0 ? (
                    <div
                      onClick={() => fileInputRef.current?.click()}
                      className="border border-dashed border-white/20 rounded-lg p-5 text-center cursor-pointer hover:bg-white/5 hover:border-white/30 transition-all"
                    >
                      <Upload className="w-6 h-6 mx-auto text-white/30 mb-2" />
                      <p className="text-sm text-white/50">点击上传参考图</p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-4 gap-2">
                      {images.map((img, i) => (
                        <div
                          key={i}
                          className="aspect-square rounded-lg overflow-hidden border border-white/10"
                        >
                          <img
                            src={img.preview}
                            className="w-full h-full object-cover"
                            alt=""
                          />
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Prompt */}
              <div className="space-y-2">
                <label className="text-xs text-white/50 uppercase tracking-wider">提示词</label>
                <textarea
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  placeholder="描述你想要生成的图像..."
                  className="w-full h-20 px-3 py-2.5 bg-white/5 border border-white/10 text-white rounded-lg resize-none focus:outline-none focus:border-white/30 placeholder:text-white/30 text-sm"
                />
              </div>

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
                      : 'bg-white text-black hover:bg-white/90'
                  )}
                >
                  {submitting ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>提交中...</span>
                    </>
                  ) : (
                    <>
                      <Wand2 className="w-4 h-4" />
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
    </div>
  );
}
