import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getSystemConfig, updateSystemConfig } from '@/lib/db';

// 登录 SORA 后台获取 admin token
async function loginSoraBackend(baseUrl: string, username: string, password: string): Promise<string> {
  const res = await fetch(`${baseUrl}/api/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });

  const data = await res.json();
  if (!data.success) {
    throw new Error(data.message || '登录 SORA 后台失败');
  }

  return data.token;
}

// 获取 tokens 列表
async function getTokensList(baseUrl: string, adminToken: string): Promise<any[]> {
  const res = await fetch(`${baseUrl}/api/tokens`, {
    headers: {
      'Authorization': `Bearer ${adminToken}`,
    },
  });

  if (!res.ok) {
    throw new Error(`HTTP ${res.status}: ${await res.text()}`);
  }

  return await res.json();
}

// 确保有有效的 admin token
async function ensureAdminToken(config: {
  soraBackendUrl: string;
  soraBackendUsername: string;
  soraBackendPassword: string;
  soraBackendToken: string;
}): Promise<{ token: string | null; loginAttempted: boolean; loginError?: string }> {
  // 如果没有配置后台 URL，返回 null
  if (!config.soraBackendUrl) {
    return { token: null, loginAttempted: false };
  }

  // 尝试使用现有 token
  if (config.soraBackendToken) {
    try {
      // 测试 token 是否有效
      await getTokensList(config.soraBackendUrl, config.soraBackendToken);
      return { token: config.soraBackendToken, loginAttempted: false };
    } catch {
      // token 无效，尝试重新登录
    }
  }

  // 如果没有配置用户名密码，无法登录
  if (!config.soraBackendUsername || !config.soraBackendPassword) {
    return { token: null, loginAttempted: false };
  }

  // 重新登录获取新 token
  try {
    const newToken = await loginSoraBackend(
      config.soraBackendUrl,
      config.soraBackendUsername,
      config.soraBackendPassword
    );

    // 保存新 token
    await updateSystemConfig({ soraBackendToken: newToken });

    return { token: newToken, loginAttempted: true };
  } catch (e) {
    return { token: null, loginAttempted: true, loginError: e instanceof Error ? e.message : String(e) };
  }
}

export async function GET() {
  try {
    const debugEnabled = process.env.NODE_ENV !== 'production' || process.env.DEBUG_ENDPOINTS_ENABLED === 'true';
    if (!debugEnabled) {
      return NextResponse.json({ error: 'Not Found' }, { status: 404 });
    }

    const session = await getServerSession(authOptions);
    if (!session?.user || session.user.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const config = await getSystemConfig();

    // 测试获取 tokens
    let tokensResult = null;
    let tokensError = null;
    let loginInfo = null;

    if (config.soraBackendUrl) {
      const { token, loginAttempted, loginError } = await ensureAdminToken(config);
      
      loginInfo = {
        loginAttempted,
        loginError: loginError || null,
        tokenObtained: !!token,
      };

      if (token) {
        try {
          const tokens = await getTokensList(config.soraBackendUrl, token);
          let totalRemaining = 0;
          let activeCount = 0;
          if (Array.isArray(tokens)) {
            for (const t of tokens) {
              if (t.is_active && typeof t.sora2_remaining_count === 'number') {
                totalRemaining += t.sora2_remaining_count;
                activeCount++;
              }
            }
          }
          tokensResult = {
            totalTokens: Array.isArray(tokens) ? tokens.length : 0,
            activeCount,
            totalRemaining,
            video10sCount: totalRemaining,
            video15sCount: Math.floor(totalRemaining / 2),
          };
        } catch (e) {
          tokensError = e instanceof Error ? e.message : String(e);
        }
      }
    }

    return NextResponse.json({
      success: true,
      config: {
        backendUrl: config.soraBackendUrl || '(empty)',
        backendToken: config.soraBackendToken ? `${config.soraBackendToken.substring(0, 20)}...` : '(empty)',
        hasUsername: !!config.soraBackendUsername,
        hasPassword: !!config.soraBackendPassword,
      },
      loginInfo,
      announcement: config.announcement,
      tokensResult,
      tokensError,
    });
  } catch (error) {
    return NextResponse.json({
      error: error instanceof Error ? error.message : '查询失败',
    });
  }
}
