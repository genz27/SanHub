'use client';
import Link from 'next/link';
import { ArrowRight, Video, Image, Sparkles, Zap, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { AnimatedBackground } from '@/components/ui/animated-background';
import { useState, useEffect } from 'react';
import type { SiteConfig } from '@/types';

export default function LandingPage() {
  const [siteConfig, setSiteConfig] = useState<SiteConfig | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/site-config')
      .then(res => res.json())
      .then(data => {
        if (data.success) {
          setSiteConfig(data.data);
        }
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  // Default values while loading
  const siteName = siteConfig?.siteName || 'SANHUB';
  const taglineParts = (siteConfig?.siteTagline || 'Let Imagination Come Alive').split(' ');
  const taglineLine1 = taglineParts.slice(0, 2).join(' ');
  const taglineLine2 = taglineParts.slice(2).join(' ');
  const description = siteConfig?.siteDescription || '「SANHUB」是专为 AI 创作打造的一站式平台';
  const subDescription = siteConfig?.siteSubDescription || '我们融合了 Sora 视频生成、Gemini 图像创作与多模型 AI 对话。在这里，技术壁垒已然消融，你唯一的使命就是释放纯粹的想象。';
  const contactEmail = siteConfig?.contactEmail || 'support@sanhub.com';
  const copyright = siteConfig?.copyright || 'Copyright © 2025 SANHUB';
  const poweredBy = siteConfig?.poweredBy || 'Powered by OpenAI Sora & Google Gemini';

  return (
    <div className="min-h-screen bg-black text-white relative flex flex-col overflow-hidden">
      {/* 动态背景 */}
      <AnimatedBackground variant="home" />
      
      {/* Main Content - Full viewport centered */}
      <main className="flex-1 flex flex-col items-center justify-center px-6 relative z-10">
        <div className="max-w-5xl mx-auto text-center space-y-12">
          {/* Logo Badge */}
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-white/5 border border-white/10 rounded-full backdrop-blur-sm animate-float">
            <Sparkles className="w-4 h-4 text-purple-400" />
            <span className="text-sm text-white/70">AI 创作平台</span>
          </div>

          {/* English Tagline */}
          <h1 className="text-5xl sm:text-6xl md:text-7xl lg:text-8xl font-extralight tracking-tight leading-[1.1]">
            <span className="bg-gradient-to-r from-purple-400 via-white to-blue-400 bg-clip-text text-transparent animate-gradient-x">
              {taglineLine1}
            </span>
            <br />
            <span className="bg-gradient-to-r from-blue-400 via-white to-pink-400 bg-clip-text text-transparent animate-gradient-x" style={{ animationDelay: '0.5s' }}>
              {taglineLine2}
            </span>
          </h1>

          {/* Chinese Description */}
          <div className="space-y-4 max-w-2xl mx-auto">
            <h2 className="text-xl md:text-2xl font-light text-white/80">
              {description}
            </h2>
            <p className="text-base md:text-lg text-white/50 font-light leading-relaxed">
              {subDescription}
            </p>
          </div>

          {/* Features */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 max-w-3xl mx-auto">
            <div className="group flex items-center gap-3 px-5 py-4 bg-white/5 border border-white/10 rounded-2xl backdrop-blur-sm hover:bg-white/10 hover:border-white/20 transition-all">
              <div className="w-10 h-10 bg-gradient-to-br from-purple-500/30 to-purple-600/30 rounded-xl flex items-center justify-center group-hover:scale-110 transition-transform">
                <Video className="w-5 h-5 text-purple-400" />
              </div>
              <div className="text-left">
                <p className="text-sm font-medium text-white">Sora 视频</p>
                <p className="text-xs text-white/40">AI 视频生成</p>
              </div>
            </div>
            <div className="group flex items-center gap-3 px-5 py-4 bg-white/5 border border-white/10 rounded-2xl backdrop-blur-sm hover:bg-white/10 hover:border-white/20 transition-all">
              <div className="w-10 h-10 bg-gradient-to-br from-blue-500/30 to-blue-600/30 rounded-xl flex items-center justify-center group-hover:scale-110 transition-transform">
                <Image className="w-5 h-5 text-blue-400" />
              </div>
              <div className="text-left">
                <p className="text-sm font-medium text-white">Gemini 图像</p>
                <p className="text-xs text-white/40">AI 图像创作</p>
              </div>
            </div>
            <div className="group flex items-center gap-3 px-5 py-4 bg-white/5 border border-white/10 rounded-2xl backdrop-blur-sm hover:bg-white/10 hover:border-white/20 transition-all">
              <div className="w-10 h-10 bg-gradient-to-br from-pink-500/30 to-pink-600/30 rounded-xl flex items-center justify-center group-hover:scale-110 transition-transform">
                <Zap className="w-5 h-5 text-pink-400" />
              </div>
              <div className="text-left">
                <p className="text-sm font-medium text-white">角色卡</p>
                <p className="text-xs text-white/40">视频角色提取</p>
              </div>
            </div>
          </div>

          {/* CTA Buttons */}
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-4">
            <Button 
              size="lg" 
              className="bg-gradient-to-r from-purple-500 to-blue-500 hover:from-purple-600 hover:to-blue-600 text-white px-10 h-14 text-base font-medium rounded-full transition-all hover:scale-105 shadow-lg shadow-purple-500/20" 
              asChild
            >
              <Link href="/register">
                开始创作 <ArrowRight className="w-4 h-4 ml-2" />
              </Link>
            </Button>
            <Button 
              size="lg" 
              variant="ghost" 
              className="text-white/60 hover:text-white hover:bg-white/5 px-8 h-14 text-base rounded-full border border-white/10" 
              asChild
            >
              <Link href="/login">已有账号？登录</Link>
            </Button>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="relative z-10 py-8 px-6">
        <div className="max-w-4xl mx-auto flex flex-col items-center gap-4 text-center">
          <div className="flex items-center gap-6 text-sm text-white/30">
            <a 
              href="https://github.com/genz27/sanhub" 
              target="_blank" 
              rel="noopener noreferrer"
              className="hover:text-white/60 transition-colors"
            >
              GitHub
            </a>
            <span>·</span>
            <span>{contactEmail}</span>
          </div>
          <p className="text-xs text-white/20">
            {copyright} · {poweredBy}
          </p>
        </div>
      </footer>
    </div>
  );
}
