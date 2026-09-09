import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { getPublicSiteConfig } from '@/lib/site-config';

export default async function LandingPage() {
  const siteConfig = await getPublicSiteConfig();

  return (
    <div className="min-h-screen flex flex-col bg-background text-foreground">
      <header className="h-14 border-b border-border px-6 flex items-center justify-between">
        <Link href="/" className="text-sm font-medium tracking-tight">
          {siteConfig.siteName}
        </Link>
        <div className="flex items-center gap-3">
          <Link href="/login" className="text-sm text-muted-foreground hover:text-foreground">
            登录
          </Link>
          <Link
            href="/register"
            className="h-8 inline-flex items-center px-3 rounded-md bg-foreground text-background text-sm font-medium hover:opacity-90"
          >
            开始
          </Link>
        </div>
      </header>

      <main className="flex-1 flex flex-col items-center justify-center px-6 text-center">
        <p className="text-xs uppercase tracking-[0.22em] text-muted-foreground mb-6">
          AI Creation Platform
        </p>
        <h1 className="text-5xl sm:text-6xl md:text-7xl font-semibold tracking-tighter leading-[1.05]">
          {siteConfig.siteTagline}
        </h1>
        <p className="mt-6 max-w-xl text-sm sm:text-base text-muted-foreground leading-relaxed">
          {siteConfig.siteSubDescription}
        </p>
        <div className="mt-10 flex flex-wrap items-center justify-center gap-3">
          <Link
            href="/register"
            className="h-10 inline-flex items-center gap-1.5 px-5 rounded-md bg-foreground text-background text-sm font-medium hover:opacity-90"
          >
            开始创作
            <ArrowRight className="w-4 h-4" />
          </Link>
          <Link
            href="/login"
            className="h-10 inline-flex items-center px-5 rounded-md border border-border text-sm text-foreground hover:bg-accent"
          >
            登录
          </Link>
        </div>
      </main>

      <footer className="border-t border-border px-6 py-5">
        <div className="max-w-5xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-muted-foreground">
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
