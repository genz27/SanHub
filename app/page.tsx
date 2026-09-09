import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { AnimatedBackground } from '@/components/ui/animated-background';
import { getPublicSiteConfig } from '@/lib/site-config';

const CAPABILITIES = [
  { label: '图像生成', hint: 'Image' },
  { label: '视频生成', hint: 'Video' },
  { label: '工作流', hint: 'Workspace' },
] as const;

export default async function LandingPage() {
  const siteConfig = await getPublicSiteConfig();

  return (
    <div className="relative flex min-h-screen flex-col overflow-hidden bg-background text-foreground">
      <AnimatedBackground variant="home" />

      <header className="relative z-10 h-14 border-b border-white/[0.06] bg-background/40 px-6 backdrop-blur-xl">
        <div className="mx-auto flex h-full max-w-6xl items-center justify-between">
          <Link href="/" className="text-sm font-medium tracking-tight">
            {siteConfig.siteName}
          </Link>
          <div className="flex items-center gap-3">
            <Link href="/login" className="text-sm text-muted-foreground hover:text-foreground">
              登录
            </Link>
            <Link
              href="/register"
              className="inline-flex h-8 items-center rounded-md bg-foreground px-3 text-sm font-medium text-background hover:opacity-90"
            >
              开始
            </Link>
          </div>
        </div>
      </header>

      <main className="relative z-10 flex flex-1 flex-col items-center justify-center px-6 py-16 text-center">
        <div
          aria-hidden
          className="pointer-events-none absolute left-1/2 top-[42%] h-[26rem] w-[46rem] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[radial-gradient(ellipse_at_center,rgba(255,255,255,0.14),transparent_68%)] blur-3xl"
        />
        <p className="relative mb-6 inline-flex items-center gap-2 text-xs uppercase tracking-[0.22em] text-muted-foreground">
          <span className="relative flex h-1.5 w-1.5">
            <span className="absolute inset-0 rounded-full bg-foreground/70 motion-safe:animate-ping" />
            <span className="relative h-1.5 w-1.5 rounded-full bg-foreground" />
          </span>
          AI Creation Platform
        </p>
        <h1 className="relative max-w-5xl text-5xl font-semibold leading-[1.05] tracking-tighter text-foreground sm:text-6xl md:text-7xl">
          {siteConfig.siteTagline}
        </h1>
        <p className="mt-6 max-w-xl text-sm leading-relaxed text-muted-foreground sm:text-base">
          {siteConfig.siteSubDescription}
        </p>
        <div className="mt-10 flex flex-wrap items-center justify-center gap-3">
          <Link
            href="/register"
            className="inline-flex h-10 items-center gap-1.5 rounded-md bg-foreground px-5 text-sm font-medium text-background shadow-[0_0_0_1px_rgba(255,255,255,0.08),0_12px_40px_rgba(255,255,255,0.08)] hover:opacity-90"
          >
            开始创作
            <ArrowRight className="h-4 w-4" />
          </Link>
          <Link
            href="/login"
            className="inline-flex h-10 items-center rounded-md border border-white/10 bg-white/[0.03] px-5 text-sm text-foreground backdrop-blur-sm hover:bg-white/[0.06]"
          >
            登录
          </Link>
        </div>
        <ul className="mt-14 flex flex-wrap items-center justify-center gap-2">
          {CAPABILITIES.map((item) => (
            <li
              key={item.hint}
              className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-3 py-1.5 text-xs text-muted-foreground backdrop-blur-sm"
            >
              <span className="font-medium text-foreground/85">{item.label}</span>
              <span className="font-mono text-[10px] uppercase tracking-wider text-foreground/30">
                {item.hint}
              </span>
            </li>
          ))}
        </ul>
      </main>

      <footer className="relative z-10 border-t border-white/[0.06] bg-background/30 px-6 py-5 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 text-xs text-muted-foreground sm:flex-row">
          <p>
            {siteConfig.copyright} · {siteConfig.poweredBy}
          </p>
          <div className="flex items-center gap-3">
            <a
              href="https://github.com/genz27/sanhub"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-foreground"
            >
              GitHub
            </a>
            <span>{siteConfig.contactEmail}</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
