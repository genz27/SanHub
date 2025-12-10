'use client';

import { useEffect, useRef, useState } from 'react';

export function DashboardBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);

  // 检测用户是否偏好减少动画
  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    setPrefersReducedMotion(mediaQuery.matches);
    
    const handler = (e: MediaQueryListEvent) => setPrefersReducedMotion(e.matches);
    mediaQuery.addEventListener('change', handler);
    return () => mediaQuery.removeEventListener('change', handler);
  }, []);

  // 粒子动画 - 性能优化版
  useEffect(() => {
    // 如果用户偏好减少动画，跳过粒子效果
    if (prefersReducedMotion) return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d', { alpha: true });
    if (!ctx) return;

    let animationId: number;
    let isVisible = true;
    let particles: Array<{
      x: number;
      y: number;
      size: number;
      speedX: number;
      speedY: number;
      opacity: number;
    }> = [];

    // 监听页面可见性，不可见时暂停动画
    const handleVisibilityChange = () => {
      isVisible = !document.hidden;
      if (isVisible) {
        lastTime = performance.now();
        animationId = requestAnimationFrame(animate);
      }
    };

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = window.innerWidth * dpr;
      canvas.height = window.innerHeight * dpr;
      canvas.style.width = `${window.innerWidth}px`;
      canvas.style.height = `${window.innerHeight}px`;
      ctx.scale(dpr, dpr);
      initParticles();
    };

    const initParticles = () => {
      particles = [];
      // 减少粒子数量，提升性能
      const particleCount = Math.min(Math.floor((window.innerWidth * window.innerHeight) / 40000), 35);
      for (let i = 0; i < particleCount; i++) {
        particles.push({
          x: Math.random() * window.innerWidth,
          y: Math.random() * window.innerHeight,
          size: Math.random() * 1.2 + 0.5,
          speedX: (Math.random() - 0.5) * 0.15,
          speedY: (Math.random() - 0.5) * 0.15,
          opacity: Math.random() * 0.3 + 0.1,
        });
      }
    };

    let lastTime = 0;
    const targetFPS = 20; // 降低到 20fps，肉眼几乎无差别
    const frameInterval = 1000 / targetFPS;

    const animate = (currentTime: number) => {
      if (!isVisible) return;
      
      animationId = requestAnimationFrame(animate);

      const deltaTime = currentTime - lastTime;
      if (deltaTime < frameInterval) return;
      lastTime = currentTime - (deltaTime % frameInterval);

      ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);

      // 批量绘制粒子
      ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
      particles.forEach((particle) => {
        particle.x += particle.speedX;
        particle.y += particle.speedY;

        if (particle.x < 0) particle.x = window.innerWidth;
        if (particle.x > window.innerWidth) particle.x = 0;
        if (particle.y < 0) particle.y = window.innerHeight;
        if (particle.y > window.innerHeight) particle.y = 0;

        ctx.globalAlpha = particle.opacity;
        ctx.beginPath();
        ctx.arc(particle.x, particle.y, particle.size, 0, Math.PI * 2);
        ctx.fill();
      });
      ctx.globalAlpha = 1;
    };

    resize();
    requestAnimationFrame(animate);

    // 使用防抖处理 resize
    let resizeTimeout: NodeJS.Timeout;
    const debouncedResize = () => {
      clearTimeout(resizeTimeout);
      resizeTimeout = setTimeout(resize, 200);
    };

    window.addEventListener('resize', debouncedResize);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      window.removeEventListener('resize', debouncedResize);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      cancelAnimationFrame(animationId);
      clearTimeout(resizeTimeout);
    };
  }, [prefersReducedMotion]);

  // 渐变球样式 - 使用 will-change 优化 GPU 渲染
  const blobStyle = {
    willChange: 'transform',
    backfaceVisibility: 'hidden' as const,
    perspective: 1000,
  };

  return (
    <div className="fixed inset-0 overflow-hidden pointer-events-none z-0">
      {/* 基础渐变 */}
      <div className="absolute inset-0 bg-gradient-to-br from-black via-zinc-950 to-black" />

      {/* 网格图案 - 静态，无性能影响 */}
      <div 
        className="absolute inset-0 opacity-[0.015]"
        style={{
          backgroundImage: `
            linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px),
            linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)
          `,
          backgroundSize: '80px 80px',
        }}
      />

      {/* 渐变球 - 使用 CSS 动画（GPU 加速），减少动画时暂停 */}
      {!prefersReducedMotion && (
        <>
          {/* 动态渐变球 1 - 紫色 - 左上 */}
          <div 
            className="absolute w-[400px] h-[400px] rounded-full opacity-15 blur-[80px] animate-blob"
            style={{
              ...blobStyle,
              background: 'radial-gradient(circle, rgba(147, 51, 234, 0.5) 0%, transparent 70%)',
              top: '-10%',
              left: '-5%',
              animationDelay: '0s',
            }}
          />

          {/* 动态渐变球 2 - 蓝色 - 右侧 */}
          <div 
            className="absolute w-[350px] h-[350px] rounded-full opacity-12 blur-[70px] animate-blob"
            style={{
              ...blobStyle,
              background: 'radial-gradient(circle, rgba(59, 130, 246, 0.5) 0%, transparent 70%)',
              top: '30%',
              right: '-5%',
              animationDelay: '2s',
            }}
          />

          {/* 动态渐变球 3 - 粉色 - 底部 */}
          <div 
            className="absolute w-[300px] h-[300px] rounded-full opacity-10 blur-[60px] animate-blob"
            style={{
              ...blobStyle,
              background: 'radial-gradient(circle, rgba(236, 72, 153, 0.4) 0%, transparent 70%)',
              bottom: '5%',
              left: '30%',
              animationDelay: '4s',
            }}
          />
        </>
      )}

      {/* 静态渐变球 - 当用户偏好减少动画时显示 */}
      {prefersReducedMotion && (
        <>
          <div 
            className="absolute w-[400px] h-[400px] rounded-full opacity-15 blur-[80px]"
            style={{
              background: 'radial-gradient(circle, rgba(147, 51, 234, 0.5) 0%, transparent 70%)',
              top: '-10%',
              left: '-5%',
            }}
          />
          <div 
            className="absolute w-[350px] h-[350px] rounded-full opacity-12 blur-[70px]"
            style={{
              background: 'radial-gradient(circle, rgba(59, 130, 246, 0.5) 0%, transparent 70%)',
              top: '30%',
              right: '-5%',
            }}
          />
        </>
      )}

      {/* 粒子画布 - 仅在非减少动画模式下显示 */}
      <canvas
        ref={canvasRef}
        className="absolute inset-0 opacity-50"
      />

      {/* 噪点纹理 */}
      <div 
        className="absolute inset-0 opacity-[0.01]"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)'/%3E%3C/svg%3E")`,
        }}
      />
    </div>
  );
}
