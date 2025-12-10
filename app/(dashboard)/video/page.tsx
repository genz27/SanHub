'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
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
} from 'lucide-react';
import { cn, fileToBase64 } from '@/lib/utils';
import { toast } from '@/components/ui/toaster';
import { ResultGallery, type Task } from '@/components/generator/result-gallery';
import type { Generation, CharacterCard } from '@/types';
import {
  VIDEO_MODELS,
  getVideoModelById,
  buildSoraModelId,
} from '@/lib/model-config';

type CreationMode = 'normal' | 'remix' | 'storyboard';

const CREATION_MODES = [
  { id: 'normal', label: '普通生成', icon: Video, description: '文本/图片生成视频' },
  { id: 'remix', label: '视频Remix', icon: Wand2, description: '基于已有视频继续创作' },
  { id: 'storyboard', label: '视频分镜', icon: Film, description: '多镜头分段生成' },
] as const;

export default function VideoGenerationPage() {
  const { update } = useSession();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const abortControllersRef = useRef<Map<string, AbortController>>(new Map());

  // 创作模式
  const [creationMode, setCreationMode] = useState<CreationMode>('normal');

  // 模型选择
  const [selectedModelId, setSelectedModelId] = useState<string>('sora');
  const [showModelDropdown, setShowModelDropdown] = useState(false);

  // 参数状态
  const [aspectRatio, setAspectRatio] = useState<string>('landscape');
  const [duration, setDuration] = useState<string>('10s');
  const [prompt, setPrompt] = useState('');
  const [files, setFiles] = useState<{ data: string; mimeType: string; preview: string }[]>([]);

  // Remix 模式
  const [remixUrl, setRemixUrl] = useState('');

  // 分镜模式
  const [storyboardPrompt, setStoryboardPrompt] = useState('');

  // 任务状态
  const [generations, setGenerations] = useState<Generation[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  // 角色卡选择
  const [characterCards, setCharacterCards] = useState<CharacterCard[]>([]);
  const [showCharacterPicker, setShowCharacterPicker] = useState(false);
  const [characterPickerPosition, setCharacterPickerPosition] = useState({ top: 0, left: 0 });
  const [atSearchQuery, setAtSearchQuery] = useState('');
  const [atCursorPosition, setAtCursorPosition] = useState<number | null>(null);
  const promptTextareaRef = useRef<HTMLTextAreaElement>(null);
  const remixPromptRef = useRef<HTMLTextAreaElement>(null);

  // 获取当前选中的模型配置
  const currentModel = getVideoModelById(selectedModelId) || VIDEO_MODELS[0];


  // 当模型改变时，重置参数到默认值
  useEffect(() => {
    const model = getVideoModelById(selectedModelId);
    if (model) {
      setAspectRatio(model.defaultAspectRatio);
      setDuration(model.defaultDuration);
      if (!model.features.supportReferenceFile) {
        setFiles((prev) => {
          prev.forEach((f) => URL.revokeObjectURL(f.preview));
          return [];
        });
      }
    }
  }, [selectedModelId]);

  // 加载用户角色卡
  useEffect(() => {
    const loadCharacterCards = async () => {
      try {
        const res = await fetch('/api/user/character-cards');
        if (res.ok) {
          const data = await res.json();
          const completedCards = (data.data || []).filter(
            (c: CharacterCard) => c.status === 'completed'
          );
          setCharacterCards(completedCards);
        }
      } catch (err) {
        console.error('Failed to load character cards:', err);
      }
    };
    loadCharacterCards();
  }, []);

  // 处理 @ 输入检测
  const handlePromptChange = (
    e: React.ChangeEvent<HTMLTextAreaElement>,
    setter: (value: string) => void
  ) => {
    const value = e.target.value;
    const cursorPos = e.target.selectionStart;
    setter(value);

    // 检测是否刚输入了 @
    const textBeforeCursor = value.slice(0, cursorPos);
    const lastAtIndex = textBeforeCursor.lastIndexOf('@');
    
    if (lastAtIndex !== -1) {
      const textAfterAt = textBeforeCursor.slice(lastAtIndex + 1);
      // 检查 @ 后面是否有空格或其他特殊字符（如果有就不显示选择器）
      if (!/\s/.test(textAfterAt) && characterCards.length > 0) {
        // 获取 @ 后的搜索词
        setAtSearchQuery(textAfterAt.toLowerCase());
        setAtCursorPosition(lastAtIndex);
        setShowCharacterPicker(true);
        return;
      }
    }
    
    setShowCharacterPicker(false);
    setAtSearchQuery('');
    setAtCursorPosition(null);
  };

  // 选择角色卡
  const selectCharacterCard = (
    card: CharacterCard,
    textareaRef: React.RefObject<HTMLTextAreaElement>,
    currentValue: string,
    setter: (value: string) => void
  ) => {
    if (atCursorPosition === null) return;

    // 在 @ 位置插入「@角色名」
    const beforeAt = currentValue.slice(0, atCursorPosition);
    const afterCursor = currentValue.slice(textareaRef.current?.selectionStart || atCursorPosition);
    // 移除 @ 后已输入的搜索词
    const cleanAfter = afterCursor.replace(/^[^\s]*/, '');

    const mention = `@${card.characterName}`;
    const newValue = `${beforeAt}${mention} ${cleanAfter}`;
    setter(newValue);

    setShowCharacterPicker(false);
    setAtSearchQuery('');
    setAtCursorPosition(null);

    // 聚焦回输入框并把光标放在「@角色名 」之后
    setTimeout(() => {
      if (textareaRef.current) {
        const newCursorPos = beforeAt.length + mention.length + 1;
        textareaRef.current.focus();
        textareaRef.current.setSelectionRange(newCursorPos, newCursorPos);
      }
    }, 0);
  };

  // 过滤角色卡
  const filteredCharacterCards = characterCards.filter(
    (card) =>
      card.characterName.toLowerCase().includes(atSearchQuery) ||
      atSearchQuery === ''
  );

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

  // 加载 pending 任务
  useEffect(() => {
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
      abortControllersRef.current.forEach((controller) => controller.abort());
      abortControllersRef.current.clear();
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
        if (!remixUrl.trim()) return prompt.trim();
        return `${remixUrl.trim()} ${prompt.trim()}`.trim();
      case 'storyboard':
        return storyboardPrompt.trim();
      default:
        return prompt.trim();
    }
  };

  // 构建files数组
  const buildFiles = (): { mimeType: string; data: string }[] => {
    return files.map((f) => ({ mimeType: f.mimeType, data: f.data }));
  };

  // 验证输入
  const validateInput = (): string | null => {
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

  // 单次提交任务的核心函数
  const submitSingleTask = async (taskPrompt: string, taskModel: string, taskFiles: { mimeType: string; data: string }[]) => {
    const res = await fetch('/api/generate/sora', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: taskModel,
        prompt: taskPrompt,
        files: taskFiles,
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
    const taskModel = buildSoraModelId(aspectRatio, duration);
    const taskFiles = buildFiles();

    try {
      await submitSingleTask(taskPrompt, taskModel, taskFiles);

      toast({
        title: '任务已提交',
        description: '任务已加入队列，可继续提交新任务',
      });

      // 清空输入
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
    const taskModel = buildSoraModelId(aspectRatio, duration);
    const taskFiles = buildFiles();

    try {
      // 连续提交3个任务
      for (let i = 0; i < 3; i++) {
        await submitSingleTask(taskPrompt, taskModel, taskFiles);
      }

      toast({
        title: '抽卡模式已启动',
        description: '已提交 3 个相同任务，等待结果中...',
      });

      // 清空输入
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
    } catch (err) {
      setError(err instanceof Error ? err.message : '生成失败');
    } finally {
      setSubmitting(false);
    }
  };


  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <div>
        <h1 className="text-3xl font-extralight text-white">视频生成</h1>
        <p className="text-white/50 mt-1 font-light">
          支持普通生成、Remix、分镜等多种创作模式
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-1">
          <div className="bg-white/5 border border-white/10 rounded-2xl overflow-hidden backdrop-blur-sm">
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
                      <span className="text-sm font-medium">{currentModel.name}</span>
                      <span className="text-xs text-white/50">{currentModel.description}</span>
                    </div>
                    <ChevronDown className={`w-4 h-4 transition-transform ${showModelDropdown ? 'rotate-180' : ''}`} />
                  </button>
                  {showModelDropdown && (
                    <div className="absolute z-10 w-full mt-1 bg-zinc-900 border border-white/10 rounded-lg shadow-lg overflow-hidden">
                      {VIDEO_MODELS.map((model) => (
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
                      <span className="text-base">{r.icon}</span>
                      <span className="text-xs font-medium">{r.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Duration */}
              <div className="space-y-2">
                <label className="text-xs text-white/50 uppercase tracking-wider">视频时长</label>
                <div className="grid grid-cols-2 gap-2">
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

              {/* Mode-specific inputs */}
              {creationMode === 'normal' && (
                <>
                  {currentModel.features.supportReferenceFile && (
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
                          {files.map((f, i) => (
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
                    <label className="text-xs text-white/50 uppercase tracking-wider flex items-center gap-2">
                      创作描述
                      {characterCards.length > 0 && (
                        <span className="text-[10px] text-pink-400/60">输入 @ 选择角色卡</span>
                      )}
                    </label>
                    <textarea
                      ref={promptTextareaRef}
                      value={prompt}
                      onChange={(e) => handlePromptChange(e, setPrompt)}
                      placeholder="描述你想要生成的内容，越详细效果越好..."
                      className="w-full h-20 px-3 py-2.5 bg-white/5 border border-white/10 text-white rounded-lg resize-none focus:outline-none focus:border-white/30 placeholder:text-white/30 text-sm"
                    />
                    {/* 角色卡选择器 */}
                    {showCharacterPicker && creationMode === 'normal' && (
                      <div className="absolute z-20 left-0 right-0 top-full mt-1 bg-zinc-900 border border-white/10 rounded-lg shadow-xl max-h-60 overflow-hidden">
                        <div className="p-2 border-b border-white/10 space-y-2">
                          <p className="text-[10px] text-white/40 uppercase tracking-wider flex items-center justify-between">
                            <span>选择角色卡</span>
                            {atSearchQuery && (
                              <span className="text-[10px] text-pink-400/70">@{atSearchQuery}</span>
                            )}
                          </p>
                          <input
                            autoFocus
                            value={atSearchQuery}
                            onChange={(e) => setAtSearchQuery(e.target.value.toLowerCase())}
                            placeholder="搜索角色名..."
                            className="w-full px-2.5 py-1.5 bg-black/40 border border-white/10 rounded text-[11px] text-white placeholder:text-white/30 focus:outline-none focus:border-white/30"
                          />
                        </div>
                        <div className="max-h-40 overflow-y-auto">
                          {filteredCharacterCards.length > 0 ? (
                            filteredCharacterCards.map((card) => (
                              <button
                                key={card.id}
                                type="button"
                                onClick={() => selectCharacterCard(card, promptTextareaRef, prompt, setPrompt)}
                                className="w-full flex items-center gap-3 px-3 py-2 hover:bg-white/10 transition-colors text-left"
                              >
                                <div className="w-8 h-8 rounded-lg overflow-hidden bg-gradient-to-br from-pink-500/20 to-purple-500/20 shrink-0">
                                  {card.avatarUrl ? (
                                    <img src={card.avatarUrl} alt="" className="w-full h-full object-cover" />
                                  ) : (
                                    <div className="w-full h-full flex items-center justify-center">
                                      <User className="w-4 h-4 text-pink-400/50" />
                                    </div>
                                  )}
                                </div>
                                <div className="flex-1 min-w-0">
                                  <p className="text-sm text-white truncate">
                                    @{card.characterName}
                                  </p>
                                </div>
                              </button>
                            ))
                          ) : (
                            <div className="px-3 py-4 text-center text-white/40 text-xs">
                              没有匹配的角色卡，请输入更多字符搜索
                            </div>
                          )}
                        </div>
                      </div>
                    )}
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
                      {characterCards.length > 0 && (
                        <span className="text-[10px] text-pink-400/60">输入 @ 选择角色卡</span>
                      )}
                    </label>
                    <textarea
                      ref={remixPromptRef}
                      value={prompt}
                      onChange={(e) => handlePromptChange(e, setPrompt)}
                      placeholder="描述你想要的修改，如：改成水墨画风格"
                      className="w-full h-20 px-3 py-2.5 bg-white/5 border border-white/10 text-white rounded-lg resize-none focus:outline-none focus:border-white/30 placeholder:text-white/30 text-sm"
                    />
                    {/* 角色卡选择器 */}
                    {showCharacterPicker && creationMode === 'remix' && (
                      <div className="absolute z-20 left-0 right-0 top-full mt-1 bg-zinc-900 border border-white/10 rounded-lg shadow-xl max-h-60 overflow-hidden">
                        <div className="p-2 border-b border-white/10 space-y-2">
                          <p className="text-[10px] text-white/40 uppercase tracking-wider flex items-center justify-between">
                            <span>选择角色卡</span>
                            {atSearchQuery && (
                              <span className="text-[10px] text-pink-400/70">@{atSearchQuery}</span>
                            )}
                          </p>
                          <input
                            autoFocus
                            value={atSearchQuery}
                            onChange={(e) => setAtSearchQuery(e.target.value.toLowerCase())}
                            placeholder="搜索角色名..."
                            className="w-full px-2.5 py-1.5 bg-black/40 border border-white/10 rounded text-[11px] text-white placeholder:text-white/30 focus:outline-none focus:border-white/30"
                          />
                        </div>
                        <div className="max-h-40 overflow-y-auto">
                          {filteredCharacterCards.length > 0 ? (
                            filteredCharacterCards.map((card) => (
                              <button
                                key={card.id}
                                type="button"
                                onClick={() => selectCharacterCard(card, remixPromptRef, prompt, setPrompt)}
                                className="w-full flex items-center gap-3 px-3 py-2 hover:bg-white/10 transition-colors text-left"
                              >
                                <div className="w-8 h-8 rounded-lg overflow-hidden bg-gradient-to-br from-pink-500/20 to-purple-500/20 shrink-0">
                                  {card.avatarUrl ? (
                                    <img src={card.avatarUrl} alt="" className="w-full h-full object-cover" />
                                  ) : (
                                    <div className="w-full h-full flex items-center justify-center">
                                      <User className="w-4 h-4 text-pink-400/50" />
                                    </div>
                                  )}
                                </div>
                                <div className="flex-1 min-w-0">
                                  <p className="text-sm text-white truncate">
                                    @{card.characterName}
                                  </p>
                                </div>
                              </button>
                            ))
                          ) : (
                            <div className="px-3 py-4 text-center text-white/40 text-xs">
                              没有匹配的角色卡，请输入更多字符搜索
                            </div>
                          )}
                        </div>
                      </div>
                    )}
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
    </div>
  );
}
