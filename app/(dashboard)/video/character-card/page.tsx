'use client';
/* eslint-disable @next/next/no-img-element */

import { useState, useRef, useEffect, useCallback } from 'react';
import { useSession } from 'next-auth/react';
import {
  User,
  Upload,
  Trash2,
  Sparkles,
  Loader2,
  AlertCircle,
  X,
  Image as ImageIcon,
  Video,
} from 'lucide-react';
import { cn, fileToBase64 } from '@/lib/utils';
import { toast } from '@/components/ui/toaster';
import type { CharacterCard, DailyLimitConfig } from '@/types';
import { formatDate } from '@/lib/utils';

// 进行中的任务（存储在内存中，刷新后消失）
interface PendingTask {
  id: string;
  avatarUrl: string;
  status: 'pending' | 'processing' | 'failed';
  errorMessage?: string;
  createdAt: number;
}

// 每日使用量类型
interface DailyUsage {
  imageCount: number;
  videoCount: number;
  characterCardCount: number;
}

// 创建模式类型
type CreateMode = 'video' | 'image';

export default function CharacterCardPage() {
  const { data: session } = useSession();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);

  // 状态
  const [createMode, setCreateMode] = useState<CreateMode>('video'); // 创建模式：视频 or 图片
  const [videoFile, setVideoFile] = useState<{ data: string; preview: string; firstFrame: string } | null>(null);
  const [imageFile, setImageFile] = useState<{ data: string; preview: string } | null>(null); // 图生角色卡的图片
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [progressMessages, setProgressMessages] = useState<string[]>([]);
  const [characterCards, setCharacterCards] = useState<CharacterCard[]>([]);
  const [loadingCards, setLoadingCards] = useState(true);
  // 进行中的任务（在内存中，刷新后消失）
  const [pendingTasks, setPendingTasks] = useState<PendingTask[]>([]);

  // 每日限制
  const [dailyUsage, setDailyUsage] = useState<DailyUsage>({ imageCount: 0, videoCount: 0, characterCardCount: 0 });
  const [dailyLimits, setDailyLimits] = useState<DailyLimitConfig>({ imageLimit: 0, videoLimit: 0, characterCardLimit: 0 });
  
  // 角色卡参数
  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [instructionSet, setInstructionSet] = useState('');
  const [safetyInstructionSet, setSafetyInstructionSet] = useState('');
  
  // 图生角色卡参数
  const [prompt, setPrompt] = useState('');
  const [styleId, setStyleId] = useState('');
  
  // 时间戳滑块 (最多5秒范围)
  const [timestampStart, setTimestampStart] = useState(0);
  const [timestampEnd, setTimestampEnd] = useState(3);
  const [videoDuration, setVideoDuration] = useState(16); // 视频时长，最大16秒

  // 加载角色卡列表（包括已完成和进行中的）
  const loadCharacterCards = useCallback(async () => {
    try {
      const res = await fetch('/api/user/character-cards');
      if (res.ok) {
        const data = await res.json();
        setCharacterCards(data.data || []);
      }
    } catch (err) {
      console.error('Failed to load character cards:', err);
    } finally {
      setLoadingCards(false);
    }
  }, []);

  useEffect(() => {
    if (session?.user) {
      loadCharacterCards();
    }
  }, [session?.user, loadCharacterCards]);

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

  // 轮询检查处理中的角色卡状态（包括 pendingTasks）
  useEffect(() => {
    const hasProcessingInCards = characterCards.some(card => card.status === 'processing');
    const hasProcessingInTasks = pendingTasks.some(task => task.status === 'processing');
    
    if (!hasProcessingInCards && !hasProcessingInTasks) return;

    const interval = setInterval(() => {
      loadCharacterCards();
      // 清理已完成或失败的 pendingTasks（已在 characterCards 中的）
      setPendingTasks(prev => prev.filter(task => 
        !characterCards.some(card => card.id === task.id)
      ));
    }, 3000);

    return () => clearInterval(interval);
  }, [characterCards, pendingTasks, loadCharacterCards]);

  // 提取视频第一帧
  const extractFirstFrame = (videoUrl: string): Promise<string> => {
    return new Promise((resolve, reject) => {
      const video = document.createElement('video');
      video.crossOrigin = 'anonymous';
      video.src = videoUrl;
      video.muted = true;
      
      video.onloadeddata = () => {
        video.currentTime = 0;
      };
      
      video.onseeked = () => {
        try {
          const canvas = document.createElement('canvas');
          canvas.width = video.videoWidth;
          canvas.height = video.videoHeight;
          const ctx = canvas.getContext('2d');
          if (!ctx) {
            reject(new Error('无法创建 canvas context'));
            return;
          }
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          const dataUrl = canvas.toDataURL('image/jpeg', 0.8);
          resolve(dataUrl);
        } catch (err) {
          reject(err);
        }
      };
      
      video.onerror = () => {
        reject(new Error('视频加载失败'));
      };
      
      video.load();
    });
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // 仅支持 MP4 格式
    if (file.type !== 'video/mp4') {
      setError('仅支持 MP4 格式的视频');
      return;
    }

    // 限制文件大小 (15MB)
    if (file.size > 15 * 1024 * 1024) {
      setError('视频文件不能超过 15MB');
      return;
    }

    try {
      const data = await fileToBase64(file);
      // 移除 data:video/mp4;base64, 前缀
      const base64Data = data.split(',')[1] || data;
      const previewUrl = URL.createObjectURL(file);
      
      // 获取视频时长
      const duration = await new Promise<number>((resolve, reject) => {
        const video = document.createElement('video');
        video.src = previewUrl;
        video.onloadedmetadata = () => {
          resolve(video.duration);
        };
        video.onerror = () => reject(new Error('无法读取视频时长'));
      });

      // 限制视频时长最大16秒
      if (duration > 16) {
        URL.revokeObjectURL(previewUrl);
        setError('视频时长不能超过 16 秒');
        return;
      }
      
      // 提取第一帧
      const firstFrame = await extractFirstFrame(previewUrl);
      
      // 设置视频时长和重置滑块
      const actualDuration = Math.min(duration, 16);
      setVideoDuration(actualDuration);
      setTimestampStart(0);
      // 根据视频时长智能设置结束时间（推荐3秒范围）
      const defaultEnd = Math.min(3, actualDuration);
      setTimestampEnd(defaultEnd);
      
      setVideoFile({
        data: base64Data,
        preview: previewUrl,
        firstFrame,
      });
      setError('');
    } catch (err) {
      setError('视频处理失败，请重试');
    }
    e.target.value = '';
  };

  const clearVideo = () => {
    if (videoFile) {
      URL.revokeObjectURL(videoFile.preview);
    }
    setVideoFile(null);
  };

  // 图片上传处理
  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // 支持 JPEG 和 PNG
    if (!['image/jpeg', 'image/png', 'image/jpg'].includes(file.type)) {
      setError('仅支持 JPEG/PNG 格式的图片');
      return;
    }

    // 限制文件大小 (10MB)
    if (file.size > 10 * 1024 * 1024) {
      setError('图片文件不能超过 10MB');
      return;
    }

    try {
      const data = await fileToBase64(file);
      // 移除 data:image/xxx;base64, 前缀
      const base64Data = data.split(',')[1] || data;
      const previewUrl = URL.createObjectURL(file);
      
      setImageFile({
        data: base64Data,
        preview: previewUrl,
      });
      setError('');
    } catch {
      setError('图片处理失败，请重试');
    }
    e.target.value = '';
  };

  const clearImage = () => {
    if (imageFile) {
      URL.revokeObjectURL(imageFile.preview);
    }
    setImageFile(null);
  };

  // 检查是否达到每日限制
  const isCharacterCardLimitReached = dailyLimits.characterCardLimit > 0 && dailyUsage.characterCardCount >= dailyLimits.characterCardLimit;

  const handleGenerate = async () => {
    // 根据模式检查文件
    if (createMode === 'video' && !videoFile) {
      setError('请上传视频文件');
      return;
    }
    if (createMode === 'image' && !imageFile) {
      setError('请上传参考图片');
      return;
    }

    // 检查每日限制
    if (isCharacterCardLimitReached) {
      setError(`今日角色卡生成次数已达上限 (${dailyLimits.characterCardLimit} 次)`);
      return;
    }

    setError('');
    setSubmitting(true);
    setProgressMessages(['正在提交任务...']);

    try {
      // 构建请求体
      const requestBody = createMode === 'video' 
        ? {
            // 视频模式
            videoBase64: videoFile!.data,
            firstFrameBase64: videoFile!.firstFrame,
            timestamps: `${timestampStart},${timestampEnd}`,
            username: username.trim() || undefined,
            displayName: displayName.trim() || undefined,
            instructionSet: instructionSet.trim() || undefined,
            safetyInstructionSet: safetyInstructionSet.trim() || undefined,
          }
        : {
            // 图生角色卡模式
            inputImage: imageFile!.data,
            prompt: prompt.trim() || undefined,
            styleId: styleId.trim() || undefined,
            timestamps: `${timestampStart},${timestampEnd}`,
            username: username.trim() || undefined,
            displayName: displayName.trim() || undefined,
            instructionSet: instructionSet.trim() || undefined,
            safetyInstructionSet: safetyInstructionSet.trim() || undefined,
          };

      const response = await fetch('/api/generate/character-card', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || '生成失败');
      }

      // 添加到进行中任务列表
      // 视频模式使用 firstFrame (data URL)，图片模式使用 base64 data URL
      const avatarPreview = createMode === 'video' 
        ? videoFile?.firstFrame 
        : (imageFile?.data ? `data:image/jpeg;base64,${imageFile.data}` : '');
      const newTask: PendingTask = {
        id: data.data.id,
        avatarUrl: avatarPreview || '',
        status: 'processing',
        createdAt: Date.now(),
      };
      setPendingTasks(prev => [newTask, ...prev]);

      toast({
        title: '任务已提交',
        description: createMode === 'image' 
          ? '图生角色卡正在后台生成，请稍候刷新页面查看结果' 
          : '角色卡正在后台生成，请稍候刷新页面查看结果',
      });

      // 更新今日使用量
      setDailyUsage(prev => ({ ...prev, characterCardCount: prev.characterCardCount + 1 }));

      // 清空文件
      if (createMode === 'video') {
        clearVideo();
      } else {
        clearImage();
      }

      // 5秒后自动刷新列表
      setTimeout(() => {
        loadCharacterCards();
      }, 5000);

    } catch (err) {
      setError(err instanceof Error ? err.message : '生成失败');
      toast({
        title: '生成失败',
        description: err instanceof Error ? err.message : '生成失败',
        variant: 'destructive',
      });
    } finally {
      setSubmitting(false);
    }
  };

  // 删除角色卡
  const handleDeleteCard = async (cardId: string) => {
    try {
      const res = await fetch('/api/user/character-cards', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cardId }),
      });

      if (res.ok) {
        // 从列表中移除
        setCharacterCards(prev => prev.filter(c => c.id !== cardId));
        toast({
          title: '已删除',
          description: '角色卡已删除',
        });
      } else {
        const data = await res.json();
        throw new Error(data.error || '删除失败');
      }
    } catch (err) {
      toast({
        title: '删除失败',
        description: err instanceof Error ? err.message : '删除失败',
        variant: 'destructive',
      });
    }
  };

  return (
    <div className="flex flex-col h-[calc(100vh-100px)] max-w-7xl mx-auto">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between mb-4 shrink-0">
        <div>
          <h1 className="text-3xl font-extralight text-foreground">角色卡生成</h1>
          <p className="text-foreground/50 mt-1 font-light">
            上传视频或图片生成专属角色卡，角色卡将绑定到您的账户
          </p>
        </div>
        {dailyLimits.characterCardLimit > 0 && (
          <div className={cn(
            "px-4 py-2 rounded-xl border text-sm",
            isCharacterCardLimitReached
              ? "bg-red-500/10 border-red-500/30 text-red-400"
              : "bg-card/60 border-border/70 text-foreground/60"
          )}>
            今日: {dailyUsage.characterCardCount} / {dailyLimits.characterCardLimit}
          </div>
        )}
      </div>

      {isCharacterCardLimitReached && (
        <div className="p-4 bg-red-500/10 border border-red-500/30 rounded-xl flex items-center gap-3 mb-4 shrink-0">
          <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0" />
          <p className="text-sm text-red-300">今日角色卡生成次数已达上限，请明天再试</p>
        </div>
      )}

      <div className="flex-1 overflow-auto min-h-0 mb-4">
        <div className="surface overflow-hidden">
          <div className="p-4 sm:p-6 border-b border-border/70">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-card/60 border border-border/70 rounded-xl flex items-center justify-center">
                <User className="w-5 h-5 text-foreground" />
              </div>
              <div>
                <h2 className="text-lg font-medium text-foreground">我的角色卡</h2>
                <p className="text-sm text-foreground/40">
                  {characterCards.filter((c) => !pendingTasks.some((t) => t.id === c.id)).length + pendingTasks.length} 个角色卡
                </p>
              </div>
            </div>
          </div>

          <div className="p-4 sm:p-6">
            {loadingCards ? (
              <div className="flex items-center justify-center h-48">
                <Loader2 className="w-6 h-6 animate-spin text-foreground/30" />
              </div>
            ) : characterCards.length === 0 && pendingTasks.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-48 border border-dashed border-border/70 rounded-xl bg-gradient-to-br from-emerald-500/5 to-sky-500/5">
                <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-emerald-500/10 to-sky-500/10 flex items-center justify-center mb-3">
                  <User className="w-7 h-7 text-emerald-400/40" />
                </div>
                <p className="text-foreground/50 text-sm">暂无角色卡</p>
                <p className="text-foreground/30 text-xs mt-1">上传视频或图片开始创建你的第一个角色卡</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
                {pendingTasks.map((task) => {
                  return <PendingTaskItem key={task.id} task={task} />;
                })}
                {characterCards
                  .filter((card) => {
                    const isDuplicate = pendingTasks.some((t) => t.id === card.id);
                    return !isDuplicate;
                  })
                  .map((card) => {
                    return <CharacterCardItem key={card.id} card={card} onDelete={handleDeleteCard} />;
                  })}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className={cn(
        "surface shrink-0 overflow-visible",
        isCharacterCardLimitReached && "opacity-50 pointer-events-none"
      )}>
        <div className="p-4">
          {/* 模式切换 */}
          <div className="flex items-center gap-2 mb-3">
            <button
              onClick={() => setCreateMode('video')}
              className={cn(
                'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs transition-all',
                createMode === 'video'
                  ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                  : 'bg-card/60 text-foreground/50 border border-border/70 hover:border-emerald-500/20'
              )}
            >
              <Video className="w-3.5 h-3.5" />
              <span>视频生成</span>
            </button>
            <button
              onClick={() => setCreateMode('image')}
              className={cn(
                'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs transition-all',
                createMode === 'image'
                  ? 'bg-sky-500/20 text-sky-400 border border-sky-500/30'
                  : 'bg-card/60 text-foreground/50 border border-border/70 hover:border-sky-500/20'
              )}
            >
              <ImageIcon className="w-3.5 h-3.5" />
              <span>图生角色卡</span>
            </button>
            <span className="text-[10px] text-foreground/30 ml-2">
              图生角色卡会先生成短视频，再创建角色卡
            </span>
          </div>

          <div className="flex gap-4">
            {/* 左侧：文件上传区 */}
            {createMode === 'video' ? (
              /* 视频上传 */
              <div
                onClick={() => !videoFile && fileInputRef.current?.click()}
                className={cn(
                  'w-24 h-20 shrink-0 border-2 border-dashed rounded-lg flex flex-col items-center justify-center transition-all',
                  videoFile ? 'border-border/70 bg-card/60' : 'border-border/70 hover:border-emerald-500/30 hover:bg-card/60 cursor-pointer'
                )}
              >
                <input
                  type="file"
                  ref={fileInputRef}
                  className="hidden"
                  accept="video/mp4"
                  onChange={handleFileUpload}
                />
                {videoFile ? (
                  <div className="relative w-full h-full">
                    <img src={videoFile.firstFrame} alt="" className="w-full h-full object-cover rounded-md" />
                    <button
                      onClick={(e) => { e.stopPropagation(); clearVideo(); }}
                      className="absolute -top-2 -right-2 w-5 h-5 bg-red-500 rounded-full flex items-center justify-center hover:bg-red-600"
                    >
                      <X className="w-3 h-3 text-white" />
                    </button>
                  </div>
                ) : (
                  <>
                    <Video className="w-5 h-5 text-foreground/40 mb-1" />
                    <span className="text-[10px] text-foreground/40">点击上传视频</span>
                  </>
                )}
              </div>
            ) : (
              /* 图片上传 */
              <div
                onClick={() => !imageFile && imageInputRef.current?.click()}
                className={cn(
                  'w-24 h-20 shrink-0 border-2 border-dashed rounded-lg flex flex-col items-center justify-center transition-all',
                  imageFile ? 'border-border/70 bg-card/60' : 'border-border/70 hover:border-sky-500/30 hover:bg-card/60 cursor-pointer'
                )}
              >
                <input
                  type="file"
                  ref={imageInputRef}
                  className="hidden"
                  accept="image/jpeg,image/png,image/jpg"
                  onChange={handleImageUpload}
                />
                {imageFile ? (
                  <div className="relative w-full h-full">
                    <img src={imageFile.preview} alt="" className="w-full h-full object-cover rounded-md" />
                    <button
                      onClick={(e) => { e.stopPropagation(); clearImage(); }}
                      className="absolute -top-2 -right-2 w-5 h-5 bg-red-500 rounded-full flex items-center justify-center hover:bg-red-600"
                    >
                      <X className="w-3 h-3 text-white" />
                    </button>
                  </div>
                ) : (
                  <>
                    <ImageIcon className="w-5 h-5 text-foreground/40 mb-1" />
                    <span className="text-[10px] text-foreground/40">点击上传图片</span>
                  </>
                )}
              </div>
            )}

            {/* 右侧：角色信息输入 */}
            <div className="flex-1 space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-xs text-foreground/50">角色信息（可选）</label>
                {createMode === 'video' && videoFile && (
                  <span className="text-[10px] text-foreground/40 font-mono">
                    区间: {timestampStart.toFixed(1)}s - {timestampEnd.toFixed(1)}s
                  </span>
                )}
              </div>
              <div className="grid grid-cols-2 gap-2">
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value.replace(/[^a-zA-Z0-9_]/g, ''))}
                  placeholder="my_character"
                  className="w-full px-3 py-1.5 bg-card/60 border border-border/70 text-foreground rounded-lg focus:outline-none focus:border-emerald-500/30 placeholder:text-foreground/30 text-sm"
                  maxLength={32}
                />
                <input
                  type="text"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="My Character"
                  className="w-full px-3 py-1.5 bg-card/60 border border-border/70 text-foreground rounded-lg focus:outline-none focus:border-emerald-500/30 placeholder:text-foreground/30 text-sm"
                  maxLength={64}
                />
              </div>
              {createMode === 'image' ? (
                /* 图生角色卡特有参数 */
                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="text"
                    value={prompt}
                    onChange={(e) => setPrompt(e.target.value)}
                    placeholder="提示词（可选）"
                    className="w-full px-3 py-1.5 bg-card/60 border border-border/70 text-foreground rounded-lg focus:outline-none focus:border-sky-500/30 placeholder:text-foreground/30 text-sm"
                  />
                  <input
                    type="text"
                    value={styleId}
                    onChange={(e) => setStyleId(e.target.value)}
                    placeholder="风格 ID（可选）"
                    className="w-full px-3 py-1.5 bg-card/60 border border-border/70 text-foreground rounded-lg focus:outline-none focus:border-sky-500/30 placeholder:text-foreground/30 text-sm"
                  />
                </div>
              ) : (
                /* 视频模式的角色指令 */
                <textarea
                  value={instructionSet}
                  onChange={(e) => setInstructionSet(e.target.value)}
                  placeholder="描述角色的性格、特点等..."
                  className="w-full h-12 px-3 py-1.5 bg-card/60 border border-border/70 text-foreground rounded-lg resize-none focus:outline-none focus:border-emerald-500/30 placeholder:text-foreground/30 text-sm"
                />
              )}
            </div>
          </div>

          {/* 底部控制栏 */}
          <div className="flex flex-wrap items-center gap-2 mt-3">
            {/* 视频模式显示时间戳控制 */}
            {createMode === 'video' && videoFile && (
              <>
                <div className="flex items-center gap-2 px-2 py-1 bg-card/60 rounded-lg">
                  <span className="text-[10px] text-foreground/40">起始</span>
                  <input
                    type="range"
                    min={0}
                    max={Math.min(timestampEnd - 0.5, videoDuration - 0.5)}
                    step={0.5}
                    value={timestampStart}
                    onChange={(e) => {
                      const val = parseFloat(e.target.value);
                      setTimestampStart(val);
                      if (timestampEnd - val > 5) setTimestampEnd(val + 5);
                    }}
                    className="w-16 h-1 accent-emerald-500 cursor-pointer"
                  />
                  <span className="text-[10px] text-emerald-400 font-mono w-8">{timestampStart.toFixed(1)}s</span>
                </div>
                <div className="flex items-center gap-2 px-2 py-1 bg-card/60 rounded-lg">
                  <span className="text-[10px] text-foreground/40">结束</span>
                  <input
                    type="range"
                    min={Math.max(timestampStart + 0.5, 0.5)}
                    max={videoDuration}
                    step={0.5}
                    value={timestampEnd}
                    onChange={(e) => {
                      const val = parseFloat(e.target.value);
                      setTimestampEnd(val);
                      if (val - timestampStart > 5) setTimestampStart(val - 5);
                    }}
                    className="w-16 h-1 accent-sky-500 cursor-pointer"
                  />
                  <span className="text-[10px] text-sky-400 font-mono w-8">{timestampEnd.toFixed(1)}s</span>
                </div>
              </>
            )}

            {error && (
              <div className="flex items-center gap-1.5 text-xs text-red-400">
                <AlertCircle className="w-3 h-3" />
                <span>{error}</span>
              </div>
            )}

            <div className="flex-1" />

            <button
              onClick={handleGenerate}
              disabled={submitting || (createMode === 'video' ? !videoFile : !imageFile)}
              className={cn(
                'flex items-center gap-2 px-5 py-2 rounded-lg font-medium text-sm transition-all',
                submitting || (createMode === 'video' ? !videoFile : !imageFile)
                  ? 'bg-card/60 text-foreground/40 cursor-not-allowed'
                  : createMode === 'video'
                    ? 'bg-gradient-to-r from-emerald-500 to-sky-500 text-foreground hover:opacity-90'
                    : 'bg-gradient-to-r from-sky-500 to-purple-500 text-foreground hover:opacity-90'
              )}
            >
              {submitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>生成中...</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4" />
                  <span>{createMode === 'video' ? '生成角色卡' : '图生角色卡'}</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// 进行中任务卡片组件（内存中的任务，刷新后消失）
function PendingTaskItem({ task }: { task: PendingTask }) {
  const statusConfig = {
    pending: { bg: 'bg-amber-500/20', text: 'text-amber-400', label: '排队中' },
    processing: { bg: 'bg-blue-500/20', text: 'text-blue-400', label: '生成中' },
    failed: { bg: 'bg-red-500/20', text: 'text-red-400', label: '失败' },
  };
  const status = statusConfig[task.status];

  return (
    <div className="bg-card/60 border border-border/70 rounded-xl overflow-hidden hover:border-border/70 transition-all">
      <div className="aspect-square bg-gradient-to-br from-emerald-500/10 to-sky-500/10 flex items-center justify-center relative">
        {task.avatarUrl ? (
          <img src={task.avatarUrl} alt="" className="w-full h-full object-cover opacity-60" />
        ) : (
          <User className="w-12 h-12 text-foreground/30" />
        )}
        <div className="absolute inset-0 bg-background/70 flex flex-col items-center justify-center gap-2">
          {task.status === 'processing' ? (
            <Loader2 className="w-8 h-8 text-foreground animate-spin" />
          ) : task.status === 'pending' ? (
            <div className="w-8 h-8 rounded-full border-2 border-amber-400/50 border-t-amber-400 animate-spin" />
          ) : null}
          <span className={cn('px-2.5 py-1 text-xs rounded-full font-medium', status.bg, status.text)}>
            {status.label}
          </span>
        </div>
      </div>
      <div className="p-3">
        <p className="text-sm text-foreground/60 truncate">正在生成...</p>
        <p className="text-[10px] text-foreground/30 mt-1">{formatDate(task.createdAt)}</p>
        {task.errorMessage && (
          <p className="text-[10px] text-red-400 mt-1 truncate">{task.errorMessage}</p>
        )}
      </div>
    </div>
  );
}

// 角色卡卡片组件
function CharacterCardItem({ card, onDelete }: { card: CharacterCard; onDelete?: (id: string) => void }) {
  const statusConfig = {
    pending: { bg: 'bg-amber-500/20', text: 'text-amber-400', label: '排队中' },
    processing: { bg: 'bg-blue-500/20', text: 'text-blue-400', label: '生成中' },
    completed: { bg: 'bg-emerald-500/20', text: 'text-emerald-400', label: '完成' },
    failed: { bg: 'bg-red-500/20', text: 'text-red-400', label: '失败' },
  };
  const status = statusConfig[card.status];
  const isProcessing = card.status === 'processing' || card.status === 'pending';

  return (
    <div className="bg-card/60 border border-border/70 rounded-xl overflow-hidden hover:border-emerald-500/30 transition-all group">
      <div className={cn(
        "aspect-square flex items-center justify-center relative",
        card.status === 'failed' ? "bg-gradient-to-br from-red-500/10 to-red-900/10" : "bg-gradient-to-br from-emerald-500/10 to-sky-500/10"
      )}>
        {card.avatarUrl ? (
          <img
            src={card.avatarUrl}
            alt={card.characterName}
            className={cn("w-full h-full object-cover", (card.status === 'failed' || isProcessing) && "opacity-60")}
          />
        ) : isProcessing ? (
          <Loader2 className="w-10 h-10 text-foreground/30 animate-spin" />
        ) : card.status === 'failed' ? (
          <X className="w-10 h-10 text-red-400/50" />
        ) : (
          <User className="w-12 h-12 text-foreground/30" />
        )}
        
        {/* 状态遮罩 */}
        {(isProcessing || card.status === 'failed') && (
          <div className="absolute inset-0 bg-background/70 flex flex-col items-center justify-center gap-2">
            {isProcessing && <Loader2 className="w-8 h-8 text-foreground animate-spin" />}
            {card.status === 'failed' && <X className="w-8 h-8 text-red-400" />}
          </div>
        )}
        
        {/* 删除按钮 */}
        {onDelete && (
          <button
            onClick={() => onDelete(card.id)}
            className="absolute top-2 right-2 p-1.5 bg-background/70 hover:bg-red-500 rounded-lg opacity-0 group-hover:opacity-100 transition-all"
            title="删除"
          >
            <Trash2 className="w-3.5 h-3.5 text-foreground" />
          </button>
        )}
        
        {/* 状态标签 */}
        <div className="absolute bottom-2 left-2">
          <span className={cn('px-2 py-0.5 text-[10px] rounded-full font-medium backdrop-blur-sm', status.bg, status.text)}>
            {status.label}
          </span>
        </div>
      </div>

      <div className="p-3">
        <h3 className="text-sm font-medium text-foreground truncate">
          {card.characterName || (card.status === 'failed' ? '生成失败' : '生成中...')}
        </h3>
        <p className="text-[10px] text-foreground/30 mt-1">{formatDate(card.createdAt)}</p>
        {card.errorMessage && (
          <p className="text-[10px] text-red-400 mt-1 line-clamp-1" title={card.errorMessage}>
            {card.errorMessage}
          </p>
        )}
      </div>
    </div>
  );
}
