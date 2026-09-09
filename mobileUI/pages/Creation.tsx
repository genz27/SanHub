import React, { useState } from 'react';
import { Surface, Button, SectionTitle } from '../components/ui/Theme';
import { Wand2, Image as ImageIcon, Video as VideoIcon, Sparkles, Settings2, Download, Users, Layers, Film, Scissors } from 'lucide-react';

// --- Image Generation Component ---

export const ImageGeneration: React.FC = () => {
  const [model, setModel] = useState('gemini');
  const [prompt, setPrompt] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedImage, setGeneratedImage] = useState<string | null>(null);

  const handleGenerate = async () => {
    if (!prompt) return;
    setIsGenerating(true);
    setTimeout(() => {
      setGeneratedImage(`https://picsum.photos/1024/1024?random=${Date.now()}`);
      setIsGenerating(false);
    }, 2000);
  };

  return (
    <div className="h-full flex flex-col max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <SectionTitle title="图像创作" subtitle="AI 驱动的无限创意工坊" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 flex-1">
        {/* Settings Panel */}
        <div className="lg:col-span-4 space-y-5">
          <Surface className="p-5 space-y-5">
            {/* Model Selector */}
            <div>
              <label className="text-xs font-medium text-white/60 mb-3 flex items-center gap-2">
                <Layers className="w-3 h-3" /> 模型引擎
              </label>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { id: 'gemini', label: 'Gemini' },
                  { id: 'z-image', label: 'Z-Image' },
                  { id: 'gitee', label: 'Gitee' }
                ].map((m) => (
                  <button
                    key={m.id}
                    onClick={() => setModel(m.id)}
                    className={`px-2 py-2.5 rounded-lg text-xs font-medium transition-all border ${
                      model === m.id
                        ? 'bg-sky-500/10 text-sky-400 border-sky-500/30'
                        : 'bg-black/20 text-white/50 border-transparent hover:bg-white/5'
                    }`}
                  >
                    {m.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Params */}
            <div className="space-y-4">
               <div>
                <label className="text-xs font-medium text-white/60 mb-2 block">画面比例</label>
                <div className="grid grid-cols-3 gap-2">
                  {['1:1', '3:4', '16:9'].map(r => (
                    <button key={r} className="px-2 py-2 text-xs border border-white/10 rounded bg-white/5 text-white/70 focus:bg-sky-500/20 focus:text-sky-400 focus:border-sky-500/30">
                      {r}
                    </button>
                  ))}
                </div>
              </div>
               <div>
                  <label className="text-xs font-medium text-white/60 mb-2 block">风格预设</label>
                  <select className="w-full bg-black/20 border border-white/10 rounded-lg px-3 py-2 text-xs text-white">
                    <option>无 (None)</option>
                    <option>二次元 (Anime)</option>
                    <option>写实摄影 (Photorealistic)</option>
                    <option>赛博朋克 (Cyberpunk)</option>
                  </select>
               </div>
            </div>
          </Surface>

          <Surface className="p-4">
             <label className="text-xs font-medium text-white/60 mb-2 block">创意提示词</label>
             <textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="在此描述你想要生成的画面..."
                className="w-full h-32 bg-black/20 border border-white/10 rounded-xl p-3 text-sm text-white resize-none focus:outline-none focus:border-sky-500/50"
              />
              <div className="mt-3 flex gap-2">
                 <button className="flex-1 py-2 rounded-lg bg-white/5 hover:bg-white/10 text-xs text-white/60 transition-colors flex items-center justify-center gap-1">
                    <Sparkles className="w-3 h-3" /> 优化
                 </button>
                 <Button onClick={handleGenerate} disabled={!prompt || isGenerating} className="flex-[2] bg-sky-500 hover:bg-sky-600 text-white border-none">
                    {isGenerating ? '生成中...' : '立即生成'}
                 </Button>
              </div>
          </Surface>
        </div>

        {/* Preview Panel */}
        <div className="lg:col-span-8 h-[50vh] lg:h-auto min-h-[400px]">
          <Surface className="h-full flex items-center justify-center relative overflow-hidden group border-dashed border-white/10 bg-black/20">
            {generatedImage ? (
              <>
                <img src={generatedImage} alt="Generated" className="w-full h-full object-contain" />
                <div className="absolute inset-x-0 bottom-0 p-6 bg-gradient-to-t from-black/90 to-transparent flex items-center justify-center gap-4 translate-y-full group-hover:translate-y-0 transition-transform">
                  <Button variant="glass" size="sm">
                     <Download className="w-4 h-4 mr-2" /> 保存
                  </Button>
                   <Button variant="primary" size="sm">
                     <ImageIcon className="w-4 h-4 mr-2" /> 变体
                  </Button>
                </div>
              </>
            ) : (
              <div className="text-center space-y-4">
                 <div className="w-20 h-20 rounded-2xl bg-white/5 flex items-center justify-center mx-auto border border-white/10 animate-pulse">
                    <ImageIcon className="w-8 h-8 text-white/20" />
                 </div>
                 <p className="text-white/30 text-sm font-light">
                    选择模型并输入提示词<br/>开始您的 AI 艺术之旅
                 </p>
              </div>
            )}
             {isGenerating && (
              <div className="absolute inset-0 bg-black/80 backdrop-blur-sm flex flex-col items-center justify-center z-10">
                <div className="w-12 h-12 border-4 border-sky-500/30 border-t-sky-500 rounded-full animate-spin mb-4" />
                <p className="text-sky-400 text-xs font-medium tracking-wider animate-pulse">RENDERING...</p>
              </div>
            )}
          </Surface>
        </div>
      </div>
    </div>
  );
};

// --- Video Generation Component ---

export const VideoGeneration: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'sora' | 'remix' | 'storyboard'>('sora');

  return (
    <div className="max-w-4xl mx-auto h-full flex flex-col">
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between mb-6 gap-4">
        <div>
          <h2 className="text-2xl font-light text-white tracking-tight">视频工坊</h2>
          <p className="text-white/40 text-sm mt-1">文生视频 / 参考图 / 分镜脚本</p>
        </div>
        
        {/* Feature Navigation */}
        <div className="flex bg-white/5 p-1 rounded-xl">
           {[
             { id: 'sora', label: 'Sora 生成', icon: Film },
             { id: 'remix', label: 'Remix', icon: Scissors },
             { id: 'storyboard', label: '分镜', icon: Layers },
           ].map(tab => (
             <button
               key={tab.id}
               onClick={() => setActiveTab(tab.id as any)}
               className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-medium transition-all ${
                 activeTab === tab.id 
                   ? 'bg-white text-black shadow-lg' 
                   : 'text-white/60 hover:text-white hover:bg-white/5'
               }`}
             >
               <tab.icon className="w-3 h-3" />
               {tab.label}
             </button>
           ))}
        </div>
        
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 flex-1">
        <div className="space-y-6">
           <Surface className="p-5 space-y-4">
               <div>
                 <div className="flex justify-between items-center mb-2">
                   <label className="text-xs font-medium text-white/60">创意描述</label>
                   <span className="text-[10px] text-sky-400 cursor-pointer">随机灵感</span>
                 </div>
                 <textarea 
                   className="w-full h-32 bg-black/20 border border-white/10 rounded-xl p-3 text-sm text-white focus:border-sky-500/50 focus:outline-none resize-none"
                   placeholder={activeTab === 'remix' ? "上传视频并描述想要修改的元素..." : "描述一段生动的视频画面..."}
                 ></textarea>
               </div>
               
               {activeTab === 'remix' && (
                  <div className="h-24 border border-dashed border-white/10 rounded-xl flex items-center justify-center bg-white/5 cursor-pointer hover:bg-white/10 transition-colors">
                     <div className="text-center">
                        <VideoIcon className="w-6 h-6 mx-auto mb-1 text-white/40" />
                        <span className="text-xs text-white/30">点击上传参考视频</span>
                     </div>
                  </div>
               )}

               <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-white/50 mb-1.5 block">时长</label>
                    <select className="w-full bg-black/20 border border-white/10 rounded-lg px-3 py-2 text-xs text-white">
                      <option>5s (50 Credits)</option>
                      <option>10s (90 Credits)</option>
                      <option>15s (140 Credits)</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-xs text-white/50 mb-1.5 block">运镜</label>
                    <select className="w-full bg-black/20 border border-white/10 rounded-lg px-3 py-2 text-xs text-white">
                      <option>Dynamic (动态)</option>
                      <option>Slow Pan (慢推)</option>
                      <option>Zoom In (拉近)</option>
                    </select>
                  </div>
               </div>
               
               <Button className="w-full bg-gradient-to-r from-violet-600 to-indigo-600 border-none shadow-lg shadow-violet-900/20">
                 生成视频
               </Button>
           </Surface>
        </div>

        <div className="flex flex-col gap-4">
           <Surface className="flex-1 flex flex-col items-center justify-center min-h-[300px] border-dashed border-white/10 bg-black/20">
              <Film className="w-12 h-12 mb-4 text-white/10" />
              <p className="text-sm text-white/30">生成结果预览</p>
           </Surface>
        </div>
      </div>
    </div>
  );
};
