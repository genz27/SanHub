'use client';

import { useState, useRef } from 'react';
import { 
  Video, 
  Upload, 
  Trash2, 
  Sparkles, 
  Loader2,
  AlertCircle
} from 'lucide-react';
import { cn, fileToBase64 } from '@/lib/utils';
import { toast } from '@/components/ui/toaster';
import type { Task } from './result-gallery';

interface SoraPanelProps {
  onTaskAdded: (task: Task) => void;
}

type Ratio = 'landscape' | 'portrait' | 'square';
type Duration = '10s' | '15s';

export function SoraPanel({ onTaskAdded }: SoraPanelProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [ratio, setRatio] = useState<Ratio>('landscape');
  const [duration, setDuration] = useState<Duration>('10s');
  const [prompt, setPrompt] = useState('');
  const [files, setFiles] = useState<{ data: string; mimeType: string; preview: string }[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [keepPrompt, setKeepPrompt] = useState(false);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = Array.from(e.target.files || []);
    for (const file of selectedFiles) {
      if (!file.type.startsWith('image/') && !file.type.startsWith('video/')) continue;
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

  const buildModelId = (): string => {
    let base = 'sora-video';
    if (ratio !== 'square') base += `-${ratio}`;
    base += `-${duration}`;
    return base;
  };

  const handleGenerate = async () => {
    if (!prompt.trim() && files.length === 0) {
      setError('请输入提示词或上传参考文件');
      return;
    }

    setError('');
    setSubmitting(true);

    const taskPrompt = prompt.trim();
    const taskModel = buildModelId();

    try {
      // 提交任务
      const res = await fetch('/api/generate/sora', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: taskModel,
          prompt: taskPrompt,
          files: files.map((f) => ({ mimeType: f.mimeType, data: f.data })),
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || '生成失败');
      }

      // 通知父组件添加任务
      const newTask: Task = {
        id: data.data.id,
        prompt: taskPrompt,
        model: taskModel,
        type: 'sora-video',
        status: 'pending',
        createdAt: Date.now(),
      };
      onTaskAdded(newTask);

      toast({
        title: '任务已提交',
        description: '任务已加入队列，可继续提交新任务',
      });

      // 清空输入（如果勾选了保留提示词则不清空提示词和文件）
      if (!keepPrompt) {
        setPrompt('');
        clearFiles();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '生成失败');
    } finally {
      setSubmitting(false);
    }
  };

  const ratioOptions = [
    { value: 'landscape', label: '16:9', icon: '▬' },
    { value: 'portrait', label: '9:16', icon: '▮' },
    { value: 'square', label: '1:1', icon: '■' },
  ];

  return (
    <div className="bg-white/5 border border-white/10 rounded-2xl overflow-hidden">
      {/* Header */}
      <div className="p-6 border-b border-white/10">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-white/10 rounded-xl flex items-center justify-center">
            <Video className="w-5 h-5 text-white" />
          </div>
          <div>
            <h2 className="text-lg font-medium text-white">Sora 视频生成</h2>
            <p className="text-sm text-white/40">AI 视频创作</p>
          </div>
        </div>
      </div>

      <div className="p-6 space-y-6">
        {/* Aspect Ratio */}
        <div className="space-y-3">
          <label className="text-sm text-white/50 uppercase tracking-wider">画面比例</label>
          <div className="grid grid-cols-3 gap-3">
            {ratioOptions.map((r) => (
              <button
                key={r.value}
                onClick={() => setRatio(r.value as Ratio)}
                className={cn(
                  'flex flex-col items-center gap-2 px-4 py-4 rounded-xl border transition-all',
                  ratio === r.value
                    ? 'bg-white text-black border-white'
                    : 'bg-white/5 text-white/70 border-white/10 hover:bg-white/10 hover:text-white'
                )}
              >
                <span className="text-lg">{r.icon}</span>
                <span className="text-xs font-medium">{r.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Duration */}
        <div className="space-y-3">
            <label className="text-sm text-white/50 uppercase tracking-wider">视频时长</label>
            <div className="grid grid-cols-2 gap-3">
              {(['10s', '15s'] as Duration[]).map((d) => (
                <button
                  key={d}
                  onClick={() => setDuration(d)}
                  className={cn(
                    'px-4 py-3 rounded-xl border transition-all text-sm font-medium',
                    duration === d
                      ? 'bg-white text-black border-white'
                      : 'bg-white/5 text-white/70 border-white/10 hover:bg-white/10 hover:text-white'
                  )}
                >
                  {d === '10s' ? '10 秒' : '15 秒'}
                </button>
              ))}
            </div>
          </div>

        {/* File Upload */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <label className="text-sm text-white/50 uppercase tracking-wider">参考素材</label>
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
            accept="image/*,video/*"
            onChange={handleFileUpload}
          />
          {files.length === 0 ? (
            <div
              onClick={() => fileInputRef.current?.click()}
              className="border border-dashed border-white/20 rounded-xl p-8 text-center cursor-pointer hover:bg-white/5 hover:border-white/30 transition-all"
            >
              <Upload className="w-8 h-8 mx-auto text-white/30 mb-3" />
              <p className="text-sm text-white/50">点击上传图片或视频</p>
              <p className="text-xs text-white/30 mt-1">支持 JPG, PNG, MP4</p>
            </div>
          ) : (
            <div className="grid grid-cols-4 gap-2">
              {files.map((f, i) => (
                <div key={i} className="aspect-square rounded-xl overflow-hidden border border-white/10">
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

        {/* Prompt */}
        <div className="space-y-3">
          <label className="text-sm text-white/50 uppercase tracking-wider">创作描述</label>
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="描述你想要生成的内容，越详细效果越好..."
            className="w-full h-28 px-4 py-3 bg-white/5 border border-white/10 text-white rounded-xl resize-none focus:outline-none focus:border-white/30 placeholder:text-white/30 text-sm"
          />
          <label className="flex items-center gap-2 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={keepPrompt}
              onChange={(e) => setKeepPrompt(e.target.checked)}
              className="w-4 h-4 rounded border-white/20 bg-white/5 text-white accent-white cursor-pointer"
            />
            <span className="text-sm text-white/50">保留提示词</span>
          </label>
        </div>

        {/* Error */}
        {error && (
          <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-xl flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
            <p className="text-sm text-red-400">{error}</p>
          </div>
        )}

        {/* Generate Button */}
        <button
          onClick={handleGenerate}
          disabled={submitting}
          className={cn(
            'w-full flex items-center justify-center gap-2 px-6 py-4 rounded-xl font-medium transition-all',
            submitting
              ? 'bg-white/10 text-white/50 cursor-not-allowed'
              : 'bg-white text-black hover:bg-white/90'
          )}
        >
          {submitting ? (
            <>
              <Loader2 className="w-5 h-5 animate-spin" />
              <span>提交中...</span>
            </>
          ) : (
            <>
              <Sparkles className="w-5 h-5" />
              <span>开始生成</span>
            </>
          )}
        </button>

      </div>
    </div>
  );
}
