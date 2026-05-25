import Link from 'next/link';
import { ArrowRight, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { AnimatedBackground } from '@/components/ui/animated-background';
import { getPublicSiteConfig } from '@/lib/site-config';

export default async function LandingPage() {
  const siteConfig = await getPublicSiteConfig();

  return (
    <div className="min-h-screen text-foreground relative flex flex-col overflow-hidden">
      {/* Animated background */}
      <AnimatedBackground variant="home" />
      
      {/* Main Content - Split viewport layout */}
      <main className="flex-1 flex items-center px-6 sm:px-12 md:px-20 lg:px-32 relative z-10 py-12 md:py-20">
        <div className="w-full max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-8 items-center">
          
          {/* Left Column: Copy & Actions */}
          <div className="lg:col-span-7 space-y-8 animate-rise text-left max-w-2xl">
            {/* Pill Badge */}
            <div className="inline-flex items-center gap-2 px-3 py-1 bg-sky-500/10 border border-sky-500/20 rounded-full animate-float">
              <Sparkles className="w-3.5 h-3.5 text-sky-400" />
              <span className="text-xs text-sky-300 font-medium tracking-wide">AI 创作平台</span>
            </div>

            {/* Hero Title */}
            <h1 className="text-4xl sm:text-5xl md:text-6xl font-light tracking-tight leading-[1.1] text-foreground">
              Let Imagination
              <br />
              <span className="bg-gradient-to-r from-sky-400 to-emerald-400 bg-clip-text text-transparent font-medium">
                Come Alive
              </span>
            </h1>

            {/* Product description */}
            <div className="space-y-4 max-w-xl">
              <h2 className="text-lg md:text-xl font-normal text-foreground/95 leading-relaxed">
                [{siteConfig.siteName || 'LMM LLM'}] 是专为 AI 创作打造的一站式平台
              </h2>
              <p className="text-sm md:text-base text-foreground/50 font-light leading-relaxed">
                我们融合了 GPT 图像、Gemini 图像创作。在这里，技术壁垒已然消融，你唯一的使命就是释放纯粹的想象。
              </p>
            </div>

            {/* CTA Buttons */}
            <div className="flex flex-row items-center gap-4 pt-2">
              <Button 
                size="lg" 
                className="bg-gradient-to-r from-sky-500 to-emerald-500 hover:opacity-95 text-white px-8 h-11 text-sm font-medium rounded-lg transition-all hover:scale-[1.02] shadow-[0_4px_20px_rgba(14,165,233,0.3)]" 
                asChild
              >
                <Link href="/register">
                  开始创作 <ArrowRight className="w-4 h-4 ml-1.5" />
                </Link>
              </Button>
              <Button 
                size="lg" 
                variant="outline" 
                className="bg-card/30 text-foreground/80 hover:text-foreground hover:bg-card/50 px-8 h-11 text-sm rounded-lg border border-border/60 backdrop-blur-sm transition-all" 
                asChild
              >
                <Link href="/login">探索应用</Link>
              </Button>
            </div>
          </div>

          {/* Right Column: High-End Celestial Saturn Planet Illustration */}
          <div className="hidden lg:flex lg:col-span-5 items-center justify-center relative select-none">
            <div className="relative w-[400px] h-[400px] flex items-center justify-center">
              {/* Ambient planetary glow */}
              <div className="absolute w-72 h-72 rounded-full bg-sky-500/10 blur-[100px] -z-10 animate-pulse" />

              {/* Saturn ring back (Behind the sphere) */}
              <div className="absolute w-[380px] h-[90px] rounded-full border-[1.5px] border-sky-400/20 rotate-[-15deg] transform scale-y-[0.25] -z-10 blur-[0.5px]" />

              {/* Sphere body */}
              <div className="relative w-60 h-60 rounded-full bg-gradient-to-br from-indigo-950 via-sky-950 to-background shadow-[inset_-10px_-10px_40px_rgba(0,0,0,0.95),inset_15px_15px_40px_rgba(255,255,255,0.06),0_0_80px_rgba(14,165,233,0.3)] overflow-hidden flex items-center justify-center">
                {/* Atmosphere outer highlight */}
                <div className="absolute inset-0 rounded-full border border-sky-400/30 opacity-60" />

                {/* Atmosphere inner glow edge (Left-top crescent) */}
                <div className="absolute inset-0 rounded-full bg-[radial-gradient(circle_at_30%_30%,rgba(14,165,233,0.25),transparent_60%)]" />

                {/* Star shape vector inside the planet */}
                <div className="relative z-10 filter drop-shadow-[0_0_15px_rgba(14,165,233,0.75)] animate-pulse">
                  <svg viewBox="0 0 24 24" className="w-16 h-16 fill-sky-400/90 text-sky-400/90" xmlns="http://www.w3.org/2000/svg">
                    <path d="M12,2 L14.5,9.5 L22,12 L14.5,14.5 L12,22 L9.5,14.5 L2,12 L9.5,9.5 Z" />
                  </svg>
                  <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-3.5 h-3.5 rounded-full bg-white blur-[1.5px]" />
                </div>

                {/* Pulsing highlights inside planet */}
                <div className="absolute top-1/4 right-1/4 w-2 h-2 rounded-full bg-sky-300 blur-[0.5px] opacity-50 animate-ping" />
                <div className="absolute bottom-1/4 left-1/3 w-1.5 h-1.5 rounded-full bg-sky-300 blur-[0.5px] opacity-30 animate-pulse" />
              </div>

              {/* Saturn ring front (Overlay clipping to place in front of the sphere) */}
              <div 
                className="absolute w-[380px] h-[90px] rounded-full border-[1.5px] border-sky-400/40 rotate-[-15deg] transform scale-y-[0.25] pointer-events-none" 
                style={{ clipPath: 'polygon(0% 50%, 100% 50%, 100% 100%, 0% 100%)' }} 
              />

              {/* Glowing Stars floating around the planet */}
              <div className="absolute top-12 left-10 animate-float" style={{ animationDelay: '0.8s' }}>
                <svg viewBox="0 0 24 24" className="w-4 h-4 fill-indigo-400/40 text-indigo-400/40 drop-shadow-[0_0_4px_rgba(129,140,248,0.4)]" xmlns="http://www.w3.org/2000/svg">
                  <path d="M12,2 L14.5,9.5 L22,12 L14.5,14.5 L12,22 L9.5,14.5 L2,12 L9.5,9.5 Z" />
                </svg>
              </div>
              <div className="absolute bottom-16 right-6 animate-float" style={{ animationDelay: '2.2s' }}>
                <svg viewBox="0 0 24 24" className="w-5 h-5 fill-sky-400/30 text-sky-400/30 drop-shadow-[0_0_4px_rgba(56,189,248,0.4)]" xmlns="http://www.w3.org/2000/svg">
                  <path d="M12,2 L14.5,9.5 L22,12 L14.5,14.5 L12,22 L9.5,14.5 L2,12 L9.5,9.5 Z" />
                </svg>
              </div>
            </div>
          </div>

        </div>
      </main>

      {/* Cyber Wave Vector Lines overlaying bottom */}
      <div className="absolute bottom-0 left-0 right-0 h-44 overflow-hidden pointer-events-none select-none z-0 opacity-30">
        <svg className="w-full h-full" viewBox="0 0 1440 200" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <linearGradient id="wave-sky" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="rgba(99, 102, 241, 0)" />
              <stop offset="50%" stopColor="rgba(56, 189, 248, 0.25)" />
              <stop offset="100%" stopColor="rgba(16, 185, 129, 0)" />
            </linearGradient>
            <linearGradient id="wave-indigo" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="rgba(14, 165, 233, 0)" />
              <stop offset="30%" stopColor="rgba(99, 102, 241, 0.2)" />
              <stop offset="70%" stopColor="rgba(16, 185, 129, 0.15)" />
              <stop offset="100%" stopColor="rgba(14, 165, 233, 0)" />
            </linearGradient>
          </defs>
          <path 
            d="M0,110 C360,60 720,160 1080,110 C1260,85 1380,135 1440,120 L1440,200 L0,200 Z" 
            fill="url(#wave-sky)" 
            className="animate-pulse"
            style={{ animationDuration: '7s' }}
          />
          <path 
            d="M0,130 C240,160 480,90 720,130 C960,170 1200,100 1440,140 L1440,200 L0,200 Z" 
            fill="url(#wave-indigo)" 
            className="animate-pulse"
            style={{ animationDuration: '9s', animationDelay: '1.5s' }}
          />
        </svg>
      </div>

      {/* Footer */}
      <footer className="relative z-10 py-6 px-6 shrink-0 mt-auto">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-foreground/40 font-light">
          <p className="text-xs text-foreground/30">
            {siteConfig.copyright} · {siteConfig.poweredBy}
          </p>
          <div className="flex items-center gap-4 text-xs">
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
        </div>
      </footer>
    </div>
  );
}
