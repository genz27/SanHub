'use client';

import { useEffect, useState } from 'react';

interface DashboardBackgroundProps {
  reducedEffects?: boolean;
}

export function DashboardBackground({ reducedEffects = false }: DashboardBackgroundProps) {
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);
  const shouldReduceEffects = reducedEffects || prefersReducedMotion;

  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    setPrefersReducedMotion(mediaQuery.matches);

    const handler = (e: MediaQueryListEvent) => setPrefersReducedMotion(e.matches);
    mediaQuery.addEventListener('change', handler);
    return () => mediaQuery.removeEventListener('change', handler);
  }, []);

  return (
    <div className="fixed inset-0 overflow-hidden pointer-events-none z-0">
      <div className="absolute inset-0 bg-gradient-to-br from-background via-background/80 to-background" />

      {!shouldReduceEffects && (
        <>
          <div
            className="absolute w-[400px] h-[400px] rounded-full opacity-15 blur-[80px] animate-blob"
            style={{
              background: 'radial-gradient(circle, hsl(var(--glow-a) / 0.35) 0%, transparent 70%)',
              top: '-10%',
              left: '-5%',
              animationDelay: '0s',
            }}
          />
          <div
            className="absolute w-[350px] h-[350px] rounded-full opacity-12 blur-[70px] animate-blob"
            style={{
              background: 'radial-gradient(circle, hsl(var(--glow-b) / 0.35) 0%, transparent 70%)',
              top: '30%',
              right: '-5%',
              animationDelay: '2s',
            }}
          />
          <div
            className="absolute w-[300px] h-[300px] rounded-full opacity-10 blur-[60px] animate-blob"
            style={{
              background: 'radial-gradient(circle, rgba(255, 255, 255, 0.16) 0%, transparent 70%)',
              bottom: '5%',
              left: '30%',
              animationDelay: '4s',
            }}
          />
        </>
      )}

      <div className="absolute bottom-0 left-0 right-0 h-28 bg-gradient-to-t from-background to-transparent" />
    </div>
  );
}
