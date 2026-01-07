// ========================================
// 请求限流（基于内存的滑动窗口）
// ========================================

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

class RateLimiter {
  private limits = new Map<string, RateLimitEntry>();
  private cleanupInterval: NodeJS.Timeout | null = null;

  constructor() {
    // 每分钟清理过期记录
    this.cleanupInterval = setInterval(() => this.cleanup(), 60000);
  }

  /**
   * 检查是否超过限制
   * @param key 限流键（如 IP 或用户 ID）
   * @param maxRequests 时间窗口内最大请求数
   * @param windowSeconds 时间窗口（秒）
   * @returns { allowed: boolean, remaining: number, resetAt: number }
   */
  check(
    key: string,
    maxRequests: number,
    windowSeconds: number
  ): { allowed: boolean; remaining: number; resetAt: number } {
    const now = Date.now();
    const entry = this.limits.get(key);

    // 如果没有记录或已过期，创建新记录
    if (!entry || now > entry.resetAt) {
      const resetAt = now + windowSeconds * 1000;
      this.limits.set(key, { count: 1, resetAt });
      return { allowed: true, remaining: maxRequests - 1, resetAt };
    }

    // 检查是否超过限制
    if (entry.count >= maxRequests) {
      return { allowed: false, remaining: 0, resetAt: entry.resetAt };
    }

    // 增加计数
    entry.count++;
    return { allowed: true, remaining: maxRequests - entry.count, resetAt: entry.resetAt };
  }

  private cleanup(): void {
    const now = Date.now();
    const entries = Array.from(this.limits.entries());
    entries.forEach(([key, entry]) => {
      if (now > entry.resetAt) {
        this.limits.delete(key);
      }
    });
  }
}

// 全局限流器实例
export const rateLimiter = new RateLimiter();

// 预定义的限流配置
export const RateLimitConfig = {
  // API 通用限流：每分钟 60 次
  API: { maxRequests: 60, windowSeconds: 60 },
  // 生成 API：每分钟 10 次
  GENERATE: { maxRequests: 10, windowSeconds: 60 },
  // 聊天 API：每分钟 30 次
  CHAT: { maxRequests: 30, windowSeconds: 60 },
  // 登录 API：每分钟 5 次
  AUTH: { maxRequests: 5, windowSeconds: 60 },
} as const;

// 获取客户端 IP
export function getClientIP(request: Request): string {
  const trustProxy = process.env.TRUST_PROXY === 'true';
  const forwarded = request.headers.get('x-forwarded-for');
  if (trustProxy && forwarded) {
    return forwarded.split(',')[0].trim();
  }
  const realIP = request.headers.get('x-real-ip');
  if (realIP) {
    return realIP;
  }
  return 'unknown';
}

// 限流检查辅助函数
export function checkRateLimit(
  request: Request,
  config: { maxRequests: number; windowSeconds: number },
  keyPrefix = 'api'
): { allowed: boolean; remaining: number; resetAt: number; headers: Record<string, string> } {
  const ip = getClientIP(request);
  const key = `${keyPrefix}:${ip}`;
  const result = rateLimiter.check(key, config.maxRequests, config.windowSeconds);

  const headers: Record<string, string> = {
    'X-RateLimit-Limit': String(config.maxRequests),
    'X-RateLimit-Remaining': String(result.remaining),
    'X-RateLimit-Reset': String(Math.ceil(result.resetAt / 1000)),
  };

  if (!result.allowed) {
    headers['Retry-After'] = String(Math.ceil((result.resetAt - Date.now()) / 1000));
  }

  return { ...result, headers };
}
