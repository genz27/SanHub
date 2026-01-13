'use client';
import Link from 'next/link';
import { ArrowRight, Video, Image as ImageIcon, Sparkles, Zap } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { AnimatedBackground } from '@/components/ui/animated-background';
import { useSiteConfig } from '@/components/providers/site-config-provider';

export default function LandingPage() {
  const siteConfig = useSiteConfig();

  // Parse tagline into two lines
  const taglineParts = siteConfig.siteTagline.split(' ');
  const taglineLine1 = taglineParts.slice(0, 2).join(' ');
  const taglineLine2 = taglineParts.slice(2).join(' ');

  return (
    <div className="min-h-screen text-foreground relative flex flex-col overflow-hidden">
      {/* 动态背景 */}
      <AnimatedBackground variant="home" />
      
      {/* Main Content - Full viewport centered */}
      <main className="flex-1 flex flex-col items-center justify-center px-6 relative z-10">
        <div className="max-w-5xl mx-auto text-center space-y-12 animate-rise">
          {/* Logo Badge */}
          <div className="chip backdrop-blur-sm animate-float">
            <Sparkles className="w-4 h-4 text-sky-300" />
            <span className="text-sm text-foreground/70">AI 创作平台</span>
          </div>

          {/* English Tagline */}
          <h1 className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-light tracking-tight leading-[1.05]">
            <span className="bg-gradient-to-r from-foreground via-foreground/80 to-foreground/60 bg-clip-text text-transparent animate-shimmer">
              {taglineLine1}
            </span>
            <br />
            <span className="bg-gradient-to-r from-sky-200 via-foreground/70 to-emerald-200 bg-clip-text text-transparent animate-shimmer" style={{ animationDelay: '0.5s' }}>
              {taglineLine2}
            </span>
          </h1>

          {/* Chinese Description */}
          <div className="space-y-4 max-w-2xl mx-auto">
            <h2 className="text-xl md:text-2xl font-light text-foreground/80">
              {siteConfig.siteDescription}
            </h2>
            <p className="text-base md:text-lg text-foreground/50 font-light leading-relaxed">
              {siteConfig.siteSubDescription}
            </p>
          </div>

          {/* Features */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 max-w-3xl mx-auto">
            <div className="surface group flex items-center gap-3 px-5 py-4 backdrop-blur-sm transition-all hover:-translate-y-0.5">
              <div className="w-10 h-10 bg-card/70 border border-border/70 rounded-xl flex items-center justify-center group-hover:scale-110 transition-transform">
                <Video className="w-5 h-5 text-sky-300" />
              </div>
              <div className="text-left">
                <p className="text-sm font-medium text-foreground">Sora 视频</p>
                <p className="text-xs text-foreground/40">AI 视频生成</p>
              </div>
            </div>
            <div className="surface group flex items-center gap-3 px-5 py-4 backdrop-blur-sm transition-all hover:-translate-y-0.5">
              <div className="w-10 h-10 bg-card/70 border border-border/70 rounded-xl flex items-center justify-center group-hover:scale-110 transition-transform">
                <ImageIcon className="w-5 h-5 text-emerald-300" />
              </div>
              <div className="text-left">
                <p className="text-sm font-medium text-foreground">Gemini 图像</p>
                <p className="text-xs text-foreground/40">AI 图像创作</p>
              </div>
            </div>
            <div className="surface group flex items-center gap-3 px-5 py-4 backdrop-blur-sm transition-all hover:-translate-y-0.5">
              <div className="w-10 h-10 bg-card/70 border border-border/70 rounded-xl flex items-center justify-center group-hover:scale-110 transition-transform">
                <Zap className="w-5 h-5 text-amber-300" />
              </div>
              <div className="text-left">
                <p className="text-sm font-medium text-foreground">角色卡</p>
                <p className="text-xs text-foreground/40">视频角色提取</p>
              </div>
            </div>
          </div>

          {/* CTA Buttons */}
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-4">
            <Button 
              size="lg" 
              className="bg-foreground text-background px-10 h-12 text-base font-medium rounded-full transition-all hover:scale-[1.02] shadow-[0_12px_40px_rgba(0,0,0,0.35)]" 
              asChild
            >
              <Link href="/register">
                开始创作 <ArrowRight className="w-4 h-4 ml-2" />
              </Link>
            </Button>
            <Button 
              size="lg" 
              variant="ghost" 
              className="text-foreground/70 hover:text-foreground hover:bg-card/70 px-8 h-12 text-base rounded-full border border-border/70" 
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
          <div className="flex items-center gap-6 text-sm text-foreground/40">
            <a 
              href="https://github.com/genz27/sanhub" 
              target="_blank" 
              rel="noopener noreferrer"
              className="hover:text-foreground transition-colors"
            >
              GitHub
            </a>
            <span>·</span>
            <span>{siteConfig.contactEmail}</span>
          </div>
          <p className="text-xs text-foreground/30">
            {siteConfig.copyright} · {siteConfig.poweredBy}
          </p>
        </div>
      </footer>
    </div>
  );
}
