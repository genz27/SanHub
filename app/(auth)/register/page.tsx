'use client';

import { useState, useCallback, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Loader2, ArrowRight, Gift, Sparkles } from 'lucide-react';
import { Captcha } from '@/components/ui/captcha';
import { AnimatedBackground } from '@/components/ui/animated-background';
import { useSiteConfig } from '@/components/providers/site-config-provider';

export default function RegisterPage() {
  const router = useRouter();
  const { data: session, status } = useSession();
  const siteConfig = useSiteConfig();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [captchaId, setCaptchaId] = useState('');
  const [captchaCode, setCaptchaCode] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // defaultBalance now comes from siteConfig
  const defaultBalance = siteConfig.defaultBalance;

  // 已登录用户自动跳转
  useEffect(() => {
    if (status === 'authenticated' && session) {
      router.replace('/image');
    }
  }, [status, session, router]);

  const handleCaptchaChange = useCallback((id: string, code: string) => {
    setCaptchaId(id);
    setCaptchaCode(code);
  }, []);

  // 如果正在检查登录状态，显示加载中
  if (status === 'loading') {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="text-white/50">加载中...</div>
      </div>
    );
  }

  // 已登录则不渲染注册表单（等待跳转）
  if (status === 'authenticated') {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="text-white/50">正在跳转...</div>
      </div>
    );
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (password !== confirmPassword) {
      setError('两次密码输入不一致');
      return;
    }

    if (password.length < 6) {
      setError('密码至少需要 6 个字符');
      return;
    }

    // 验证码检查
    if (!captchaCode || captchaCode.length !== 4) {
      setError('请输入4位验证码');
      return;
    }

    setLoading(true);

    try {
      // 先验证验证码
      const captchaRes = await fetch('/api/captcha/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: captchaId, code: captchaCode }),
      });
      
      const captchaData = await captchaRes.json();
      if (!captchaData.success) {
        setError('验证码错误');
        handleCaptchaChange('', '');
        return;
      }

      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, password }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || '注册失败');
      }

      router.push('/login?registered=true');
    } catch (err) {
      setError(err instanceof Error ? err.message : '注册失败，请重试');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-black flex flex-col relative overflow-hidden">
      {/* 动态背景 */}
      <AnimatedBackground variant="auth" />
      
      {/* Main Content */}
      <main className="flex-1 flex flex-col items-center justify-center px-6 py-12 relative z-10">
        <div className="w-full max-w-sm space-y-6">
          {/* Logo */}
          <div className="text-center space-y-4">
            <Link href="/" className="inline-block group">
              <div className="flex items-center justify-center gap-2 mb-2">
                <div className="w-10 h-10 bg-gradient-to-br from-purple-500/30 to-blue-500/30 rounded-xl flex items-center justify-center group-hover:scale-110 transition-transform">
                  <Sparkles className="w-5 h-5 text-purple-400" />
                </div>
              </div>
              <h1 className="text-3xl font-extralight tracking-wider text-white">{siteConfig.siteName}</h1>
            </Link>
            <p className="text-white/40 text-sm">创建账号，开启创作之旅</p>
          </div>

          {/* Bonus hint */}
          <div className="flex items-center justify-center gap-2 py-2.5 px-5 bg-gradient-to-r from-purple-500/10 to-blue-500/10 border border-purple-500/20 rounded-full mx-auto w-fit backdrop-blur-sm">
            <Gift className="w-4 h-4 text-purple-400" />
            <span className="text-sm text-white/70">新用户赠送 <span className="text-purple-400 font-medium">{defaultBalance}</span> 积分</span>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-xs text-white/40 uppercase tracking-wider">昵称</label>
              <input
                type="text"
                placeholder="您的昵称"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-lg text-white placeholder:text-white/20 focus:outline-none focus:border-white/30 transition-colors text-sm"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs text-white/40 uppercase tracking-wider">邮箱</label>
              <input
                type="email"
                placeholder="your@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-lg text-white placeholder:text-white/20 focus:outline-none focus:border-white/30 transition-colors text-sm"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs text-white/40 uppercase tracking-wider">密码</label>
              <input
                type="password"
                placeholder="至少 6 个字符"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-lg text-white placeholder:text-white/20 focus:outline-none focus:border-white/30 transition-colors text-sm"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs text-white/40 uppercase tracking-wider">确认密码</label>
              <input
                type="password"
                placeholder="再次输入密码"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-lg text-white placeholder:text-white/20 focus:outline-none focus:border-white/30 transition-colors text-sm"
              />
            </div>

            <Captcha onCaptchaChange={handleCaptchaChange} />

            {error && (
              <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg">
                <p className="text-sm text-red-400">{error}</p>
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full flex items-center justify-center gap-2 px-6 py-3.5 bg-white text-black rounded-full font-medium hover:bg-white/90 transition-all hover:scale-[1.02] disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  注册中...
                </>
              ) : (
                <>
                  创建账号
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>

          <div className="text-center text-sm">
            <span className="text-white/30">已有账号？</span>{' '}
            <Link href="/login" className="text-white/70 hover:text-white transition-colors">
              立即登录
            </Link>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="relative z-10 py-6 text-center">
        <p className="text-xs text-white/20">{siteConfig.copyright}</p>
      </footer>
    </div>
  );
}
