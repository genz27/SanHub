'use client';

import { useEffect, useState } from 'react';

interface AnimatedBackgroundProps {
  variant?: 'home' | 'auth';
}

export function AnimatedBackground({ variant = 'home' }: AnimatedBackgroundProps) {
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);

  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    setPrefersReducedMotion(mediaQuery.matches);

    const handler = (e: MediaQueryListEvent) => setPrefersReducedMotion(e.matches);
    mediaQuery.addEventListener('change', handler);
    return () => mediaQuery.removeEventListener('change', handler);
  }, []);

  return (
    <div className="fixed inset-0 overflow-hidden pointer-events-none">
      <div className="absolute inset-0 bg-gradient-to-b from-background/95 via-background/70 to-background/95" />

      {!prefersReducedMotion ? (
        <>
          <div
            className="absolute w-[500px] h-[500px] rounded-full opacity-25 blur-[100px] animate-blob"
            style={{
              background: 'radial-gradient(circle, hsl(var(--glow-a) / 0.35) 0%, transparent 70%)',
              top: variant === 'home' ? '10%' : '20%',
              left: variant === 'home' ? '10%' : '-10%',
              animationDelay: '0s',
            }}
          />
          <div
            className="absolute w-[400px] h-[400px] rounded-full opacity-20 blur-[80px] animate-blob"
            style={{
              background: 'radial-gradient(circle, hsl(var(--glow-b) / 0.35) 0%, transparent 70%)',
              top: variant === 'home' ? '50%' : '60%',
              right: variant === 'home' ? '5%' : '-5%',
              animationDelay: '2s',
            }}
          />
          <div
            className="absolute w-[350px] h-[350px] rounded-full opacity-15 blur-[70px] animate-blob"
            style={{
              background: 'radial-gradient(circle, rgba(255, 255, 255, 0.16) 0%, transparent 70%)',
              bottom: variant === 'home' ? '10%' : '5%',
              left: variant === 'home' ? '30%' : '60%',
              animationDelay: '4s',
            }}
          />
        </>
      ) : (
        <>
          <div
            className="absolute w-[500px] h-[500px] rounded-full opacity-20 blur-[100px]"
            style={{
              background: 'radial-gradient(circle, hsl(var(--glow-a) / 0.35) 0%, transparent 70%)',
              top: variant === 'home' ? '10%' : '20%',
              left: variant === 'home' ? '10%' : '-10%',
            }}
          />
          <div
            className="absolute w-[400px] h-[400px] rounded-full opacity-15 blur-[80px]"
            style={{
              background: 'radial-gradient(circle, hsl(var(--glow-b) / 0.35) 0%, transparent 70%)',
              top: variant === 'home' ? '50%' : '60%',
              right: variant === 'home' ? '5%' : '-5%',
            }}
          />
        </>
      )}

      <div
        className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[400px] opacity-20"
        style={{
          background: 'radial-gradient(ellipse at center top, rgba(255,255,255,0.18) 0%, transparent 60%)',
        }}
      />
      <div className="absolute bottom-0 left-0 right-0 h-32 bg-gradient-to-t from-background to-transparent" />
    </div>
  );
}
