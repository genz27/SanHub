'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { useSession } from 'next-auth/react';
import {
  User,
  Upload,
  Trash2,
  Sparkles,
  Loader2,
  AlertCircle,
  CheckCircle,
  Video,
} from 'lucide-react';
import { cn, fileToBase64 } from '@/lib/utils';
import { toast } from '@/components/ui/toaster';
import type { CharacterCard } from '@/types';
import { formatDate } from '@/lib/utils';

interface StreamProgress {
  message: string;
}

// 进行中的任务（存储在内存中，刷新后消失）
interface PendingTask {
  id: string;
  avatarUrl: string;
  status: 'pending' | 'processing' | 'failed';
  errorMessage?: string;
  createdAt: number;
}

export default function CharacterCardPage() {
  const { data: session } = useSession();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 状态
  const [videoFile, setVideoFile] = useState<{ data: string; preview: string; firstFrame: string } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [progressMessages, setProgressMessages] = useState<string[]>([]);
  const [characterCards, setCharacterCards] = useState<CharacterCard[]>([]);
  const [loadingCards, setLoadingCards] = useState(true);
  // 进行中的任务（在内存中，刷新后消失）
  const [pendingTasks, setPendingTasks] = useState<PendingTask[]>([]);

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

    // 限制文件大小 (20MB)
    if (file.size > 20 * 1024 * 1024) {
      setError('视频文件不能超过 20MB');
      return;
    }

    try {
      const data = await fileToBase64(file);
      // 移除 data:video/mp4;base64, 前缀
      const base64Data = data.split(',')[1] || data;
      const previewUrl = URL.createObjectURL(file);
      
      // 提取第一帧
      const firstFrame = await extractFirstFrame(previewUrl);
      
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

  const handleGenerate = async () => {
    if (!videoFile) {
      setError('请上传视频文件');
      return;
    }

    setError('');
    setSubmitting(true);
    setProgressMessages([]);

    try {
      const response = await fetch('/api/generate/character-card', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          videoBase64: videoFile.data,
          firstFrameBase64: videoFile.firstFrame,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || '生成失败');
      }

      if (!response.body) {
        throw new Error('响应没有 body');
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6).trim();
            if (data === '[DONE]') {
              continue;
            }

            try {
              const parsed = JSON.parse(data);
              
              if (parsed.event === 'progress') {
                setProgressMessages(prev => [...prev, parsed.data.message]);
              } else if (parsed.event === 'started') {
                // 添加到进行中任务列表
                const newTask: PendingTask = {
                  id: parsed.data.id,
                  avatarUrl: videoFile?.firstFrame || '',
                  status: 'processing',
                  createdAt: Date.now(),
                };
                setPendingTasks(prev => [newTask, ...prev]);
              } else if (parsed.event === 'completed') {
                // 从进行中任务列表移除
                setPendingTasks(prev => prev.filter(t => t.id !== parsed.data.id));
                toast({
                  title: '角色卡生成成功',
                  description: `角色: ${parsed.data.characterName}`,
                });
                // 刷新列表
                loadCharacterCards();
                // 清空视频
                clearVideo();
              } else if (parsed.event === 'error') {
                // 从进行中任务列表移除（失败的任务已从数据库删除，刷新后消失）
                setPendingTasks(prev => prev.map(t => 
                  t.status === 'processing'
                    ? { ...t, status: 'failed' as const, errorMessage: parsed.data.message }
                    : t
                ));
                throw new Error(parsed.data.message);
              }
            } catch (parseError) {
              if (parseError instanceof SyntaxError) {
                // 忽略 JSON 解析错误
              } else {
                throw parseError;
              }
            }
          }
        }
      }
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

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <div>
        <h1 className="text-3xl font-extralight text-white">角色卡生成</h1>
        <p className="text-white/50 mt-1 font-light">
          上传视频生成专属角色卡，角色卡将绑定到您的账户
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* 左侧 - 生成面板 */}
        <div className="lg:col-span-1">
          <div className="bg-white/5 border border-white/10 rounded-2xl overflow-hidden backdrop-blur-sm">
            {/* Header */}
            <div className="px-5 py-4 border-b border-white/10 bg-gradient-to-r from-pink-500/5 to-purple-500/5">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 bg-gradient-to-br from-pink-500/30 to-purple-500/30 rounded-lg flex items-center justify-center">
                  <User className="w-4 h-4 text-pink-400" />
                </div>
                <div>
                  <h2 className="text-base font-medium text-white">角色卡创建</h2>
                  <p className="text-xs text-white/40">从视频提取角色</p>
                </div>
              </div>
            </div>

            <div className="px-5 py-4 space-y-4">
              {/* 视频上传 */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs text-white/50 uppercase tracking-wider">上传视频</label>
                  {videoFile && (
                    <button
                      onClick={clearVideo}
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
                  accept="video/mp4"
                  onChange={handleFileUpload}
                />
                {!videoFile ? (
                  <div
                    onClick={() => fileInputRef.current?.click()}
                    className="border border-dashed border-white/20 rounded-lg p-8 text-center cursor-pointer hover:bg-white/5 hover:border-white/30 transition-all"
                  >
                    <Upload className="w-8 h-8 mx-auto text-white/30 mb-3" />
                    <p className="text-sm text-white/50">点击上传视频</p>
                    <p className="text-xs text-white/30 mt-1">仅支持 MP4 格式，最大 20MB</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {/* 视频预览 */}
                    <div className="relative aspect-video rounded-lg overflow-hidden border border-white/10">
                      <video
                        src={videoFile.preview}
                        className="w-full h-full object-cover"
                        controls
                      />
                    </div>
                    {/* 第一帧预览 */}
                    <div className="flex items-center gap-3 p-3 bg-gradient-to-r from-pink-500/10 to-purple-500/10 rounded-lg border border-pink-500/20">
                      <div className="w-12 h-12 rounded-lg overflow-hidden border border-white/20 shrink-0">
                        <img
                          src={videoFile.firstFrame}
                          alt="视频第一帧"
                          className="w-full h-full object-cover"
                        />
                      </div>
                      <div>
                        <p className="text-xs text-white/80">角色卡封面</p>
                        <p className="text-[10px] text-white/40">将使用视频第一帧作为角色卡图案</p>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* 进度消息 */}
              {progressMessages.length > 0 && (
                <div className="space-y-1 p-3 bg-white/5 rounded-lg max-h-40 overflow-y-auto">
                  {progressMessages.map((msg, i) => (
                    <p key={i} className="text-xs text-white/60 font-mono">{msg}</p>
                  ))}
                </div>
              )}

              {/* Error */}
              {error && (
                <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                  <p className="text-sm text-red-400">{error}</p>
                </div>
              )}

              {/* Generate Button */}
              <button
                onClick={handleGenerate}
                disabled={submitting || !videoFile}
                className={cn(
                  'w-full flex items-center justify-center gap-2 px-5 py-3 rounded-lg font-medium transition-all',
                  submitting || !videoFile
                    ? 'bg-white/10 text-white/50 cursor-not-allowed'
                    : 'bg-gradient-to-r from-pink-500 to-purple-500 text-white hover:opacity-90'
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
                    <span>生成角色卡</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>

        {/* 右侧 - 角色卡列表 */}
        <div className="lg:col-span-2">
          <div className="bg-white/5 border border-white/10 rounded-2xl overflow-hidden backdrop-blur-sm">
            <div className="px-5 py-4 border-b border-white/10 bg-gradient-to-r from-purple-500/5 to-pink-500/5">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 bg-gradient-to-br from-purple-500/30 to-pink-500/30 rounded-lg flex items-center justify-center">
                  <User className="w-4 h-4 text-purple-400" />
                </div>
                <div>
                  <h2 className="text-base font-medium text-white">我的角色卡</h2>
                  <p className="text-xs text-white/40">{characterCards.filter((c) => !pendingTasks.some((t) => t.id === c.id)).length + pendingTasks.length} 个角色卡</p>
                </div>
              </div>
            </div>

            <div className="p-5">
              {loadingCards ? (
                <div className="flex items-center justify-center h-48">
                  <Loader2 className="w-6 h-6 animate-spin text-white/30" />
                </div>
              ) : characterCards.length === 0 && pendingTasks.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-48 border border-dashed border-white/20 rounded-xl">
                  <User className="w-12 h-12 text-white/20 mb-3" />
                  <p className="text-white/40">暂无执行中的任务</p>
                  <p className="text-white/20 text-sm mt-1">上传视频生成角色卡，完成后可在历史记录中查看</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {/* 内存中的任务（优先显示，有实时状态） */}
                  {pendingTasks.map((task) => (
                    <PendingTaskItem key={task.id} task={task} />
                  ))}
                  {/* 数据库中的角色卡（去重：排除已在 pendingTasks 中的） */}
                  {characterCards
                    .filter((card) => !pendingTasks.some((t) => t.id === card.id))
                    .map((card) => (
                      <CharacterCardItem key={card.id} card={card} />
                    ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// 进行中任务卡片组件（内存中的任务，刷新后消失）
function PendingTaskItem({ task }: { task: PendingTask }) {
  const statusColors = {
    pending: 'bg-yellow-500/20 text-yellow-400',
    processing: 'bg-blue-500/20 text-blue-400',
    failed: 'bg-red-500/20 text-red-400',
  };

  const statusLabels = {
    pending: '等待中',
    processing: '生成中',
    failed: '失败',
  };

  return (
    <div className="bg-white/5 border border-white/10 rounded-xl overflow-hidden hover:border-white/20 transition-all">
      {/* 头像区域 */}
      <div className="aspect-square bg-gradient-to-br from-pink-500/10 to-purple-500/10 flex items-center justify-center relative">
        {task.avatarUrl ? (
          <img
            src={task.avatarUrl}
            alt="生成中..."
            className="w-full h-full object-cover"
          />
        ) : (
          <User className="w-16 h-16 text-white/20" />
        )}
        {task.status === 'processing' && (
          <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
            <Loader2 className="w-8 h-8 text-white animate-spin" />
          </div>
        )}
      </div>

      {/* 信息区域 */}
      <div className="p-3 space-y-2">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-medium text-white truncate">
            生成中...
          </h3>
          <span className={cn('px-2 py-0.5 text-[10px] rounded-md', statusColors[task.status])}>
            {statusLabels[task.status]}
          </span>
        </div>
        <p className="text-[10px] text-white/40">{formatDate(task.createdAt)}</p>
        {task.errorMessage && (
          <p className="text-[10px] text-red-400 truncate">{task.errorMessage}</p>
        )}
      </div>
    </div>
  );
}

// 角色卡卡片组件
function CharacterCardItem({ card }: { card: CharacterCard }) {
  const statusColors = {
    pending: 'bg-yellow-500/20 text-yellow-400',
    processing: 'bg-blue-500/20 text-blue-400',
    completed: 'bg-green-500/20 text-green-400',
    failed: 'bg-red-500/20 text-red-400',
  };

  const statusLabels = {
    pending: '等待中',
    processing: '生成中',
    completed: '已完成',
    failed: '失败',
  };

  return (
    <div className="bg-white/5 border border-white/10 rounded-xl overflow-hidden hover:border-white/20 transition-all">
      {/* 头像区域 */}
      <div className="aspect-square bg-gradient-to-br from-pink-500/10 to-purple-500/10 flex items-center justify-center">
        {card.avatarUrl ? (
          <img
            src={card.avatarUrl}
            alt={card.characterName}
            className="w-full h-full object-cover"
          />
        ) : card.status === 'processing' || card.status === 'pending' ? (
          <Loader2 className="w-12 h-12 text-white/30 animate-spin" />
        ) : (
          <User className="w-16 h-16 text-white/20" />
        )}
      </div>

      {/* 信息区域 */}
      <div className="p-3 space-y-2">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-medium text-white truncate">
            {card.characterName || '生成中...'}
          </h3>
          <span className={cn('px-2 py-0.5 text-[10px] rounded-md', statusColors[card.status])}>
            {statusLabels[card.status]}
          </span>
        </div>
        <p className="text-[10px] text-white/40">{formatDate(card.createdAt)}</p>
        {card.errorMessage && (
          <p className="text-[10px] text-red-400 truncate">{card.errorMessage}</p>
        )}
      </div>
    </div>
  );
}
