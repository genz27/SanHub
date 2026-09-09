import { NextRequest, NextResponse } from 'next/server';
import { getPublicSystemConfig } from '@/lib/db/system-config-public';
import { createUser } from '@/lib/db/user-writes';
import { checkRateLimit, RateLimitConfig } from '@/lib/rate-limit';

export async function POST(request: NextRequest) {
  try {
    const rateLimit = checkRateLimit(request, RateLimitConfig.AUTH, 'auth-register');
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: 'Too many requests' },
        { status: 429, headers: rateLimit.headers }
      );
    }

    const [body, config] = await Promise.all([
      request.json() as Promise<{ name?: string; email?: string; password?: string }>,
      getPublicSystemConfig(),
    ]);
    const { name, email, password } = body;

    if (!name || !email || !password) {
      return NextResponse.json(
        { error: '请填写所有必填字段' },
        { status: 400 }
      );
    }

    if (password.length < 6) {
      return NextResponse.json(
        { error: '密码至少需要 6 个字符' },
        { status: 400 }
      );
    }

    if (!config.registerEnabled) {
      return NextResponse.json(
        { error: '当前不开放注册' },
        { status: 403 }
      );
    }

    const user = await createUser(email, password, name, 'user', config.defaultBalance);

    return NextResponse.json({
      success: true,
      data: {
        id: user.id,
        email: user.email,
        name: user.name,
      },
    });
  } catch (error) {
    console.error('Registration error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '注册失败' },
      { status: 500 }
    );
  }
}
