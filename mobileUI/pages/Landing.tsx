import React from 'react';
import { useNavigate } from 'react-router-dom';

export const Landing: React.FC = () => {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6 relative z-10">
      <div className="max-w-5xl mx-auto text-center space-y-12 animate-rise">
        
        {/* Badge */}
        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-white/10 bg-white/5 backdrop-blur-md">
          <svg className="w-4 h-4 text-sky-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z"/>
          </svg>
          <span className="text-xs font-medium text-white/70">AI 创作平台 v2.0</span>
        </div>

        {/* Title */}
        <h1 className="text-5xl md:text-7xl font-light tracking-tight leading-tight">
          <span className="bg-gradient-to-r from-white via-white/80 to-white/60 bg-clip-text text-transparent animate-shimmer bg-[length:200%_auto]">
            Create Without
          </span>
          <br />
          <span className="bg-gradient-to-r from-sky-200 via-white/70 to-emerald-200 bg-clip-text text-transparent animate-shimmer bg-[length:200%_auto]">
            Limits
          </span>
        </h1>

        {/* Description */}
        <div className="space-y-4 max-w-2xl mx-auto">
          <h2 className="text-xl md:text-2xl font-light text-white/80">
            AI 驱动的视频与图像创作平台
          </h2>
          <p className="text-base md:text-lg text-white/50 font-light leading-relaxed">
            基于 Sora、Gemini 等前沿 AI 模型，为创作者提供专业级内容生成服务。
            无需昂贵显卡，随时随地释放创意。
          </p>
        </div>

        {/* Features */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 max-w-3xl mx-auto">
          {[
            { title: '视频生成', desc: 'AI 视频生成', iconColor: 'text-sky-300', icon: (
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"/>
            )},
            { title: 'Gemini 图像', desc: 'AI 图像创作', iconColor: 'text-emerald-300', icon: (
               <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"/>
            )},
            { title: '工作流', desc: '节点式创作编排', iconColor: 'text-amber-300', icon: (
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z"/>
            )}
          ].map((item, idx) => (
             <div key={idx} className="bg-white/5 border border-white/10 rounded-2xl flex items-center gap-3 px-5 py-4 backdrop-blur-sm transition-all hover:-translate-y-0.5 hover:bg-white/10">
              <div className="w-10 h-10 bg-white/5 border border-white/10 rounded-xl flex items-center justify-center">
                <svg className={`w-5 h-5 ${item.iconColor}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  {item.icon}
                </svg>
              </div>
              <div className="text-left">
                <p className="text-sm font-medium text-white">{item.title}</p>
                <p className="text-xs text-white/40">{item.desc}</p>
              </div>
            </div>
          ))}
        </div>

        {/* CTA */}
        <div className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-4">
          <button 
            onClick={() => navigate('/square')}
            className="bg-white text-black hover:bg-gray-100 px-8 py-3 rounded-full font-medium transition-all shadow-[0_0_20px_rgba(255,255,255,0.2)] flex items-center gap-2 hover:scale-105 active:scale-95"
          >
            开始创作
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M14 5l7 7m0 0l-7 7m7-7H3"/>
            </svg>
          </button>
          <button 
            onClick={() => navigate('/login')}
            className="text-white/70 hover:text-white px-8 py-3 rounded-full font-medium border border-white/10 hover:bg-white/5 transition-all"
          >
            管理员登录 (Demo)
          </button>
        </div>

      </div>
    </div>
  );
};
