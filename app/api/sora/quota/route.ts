import { NextResponse } from 'next/server';
import { getSystemConfig, updateSystemConfig } from '@/lib/db';

// 禁用缓存
export const dynamic = 'force-dynamic';
export const revalidate = 0;

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
    throw new Error('获取 tokens 列表失败');
  }

  return await res.json();
}

// 确保有有效的 admin token
async function ensureAdminToken(config: {
  soraBackendUrl: string;
  soraBackendUsername: string;
  soraBackendPassword: string;
  soraBackendToken: string;
}): Promise<string | null> {
  // 如果没有配置后台 URL，返回 null
  if (!config.soraBackendUrl) {
    return null;
  }

  // 尝试使用现有 token
  if (config.soraBackendToken) {
    try {
      // 测试 token 是否有效
      await getTokensList(config.soraBackendUrl, config.soraBackendToken);
      return config.soraBackendToken;
    } catch {
      // token 无效，尝试重新登录
    }
  }

  // 如果没有配置用户名密码，无法登录
  if (!config.soraBackendUsername || !config.soraBackendPassword) {
    return null;
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

    return newToken;
  } catch {
    return null;
  }
}

// 获取 Sora 全站剩余配额（公开接口，无需登录）
export async function GET() {
  try {
    const config = await getSystemConfig();

    // 检查是否配置了 Sora 后台
    if (!config.soraBackendUrl) {
      return NextResponse.json({ success: true, data: null });
    }

    // 确保有有效的 admin token
    const backendToken = await ensureAdminToken(config);
    if (!backendToken) {
      return NextResponse.json({ success: true, data: null });
    }

    const tokens = await getTokensList(config.soraBackendUrl, backendToken);

    // 计算激活用户的 sora2_remaining_count 总数
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

    // 10s 视频 = totalRemaining / 1
    // 15s 视频 = totalRemaining / 2
    const video10sCount = totalRemaining;
    const video15sCount = Math.floor(totalRemaining / 2);

    return NextResponse.json({
      success: true,
      data: {
        totalRemaining,
        video10sCount,
        video15sCount,
        activeTokens: activeCount,
      },
    });
  } catch (error) {
    console.error('[Sora Quota] 错误:', error);
    return NextResponse.json({
      success: true,
      data: null,
    });
  }
}
