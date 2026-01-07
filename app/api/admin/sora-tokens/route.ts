/* eslint-disable no-console */
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getSystemConfig, updateSystemConfig } from '@/lib/db';
import type { SoraStats } from '@/types';

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

// RT 转 AT
async function rt2at(baseUrl: string, adminToken: string, rt: string): Promise<{
  access_token: string;
  refresh_token: string;
  expires_in: number;
}> {
  const res = await fetch(`${baseUrl}/api/tokens/rt2at`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${adminToken}`,
    },
    body: JSON.stringify({ rt }),
  });

  const data = await res.json();
  if (!data.success) {
    throw new Error(data.message || 'RT 转换 AT 失败');
  }

  return {
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expires_in: data.expires_in,
  };
}

// 添加 Token 到 SORA 后台
async function addToken(baseUrl: string, adminToken: string, accessToken: string, refreshToken: string): Promise<number> {
  const res = await fetch(`${baseUrl}/api/tokens`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${adminToken}`,
    },
    body: JSON.stringify({
      token: accessToken,
      st: null,
      rt: refreshToken,
      client_id: null,
      remark: null,
      image_enabled: true,
      video_enabled: true,
      image_concurrency: -1,
      video_concurrency: -1,
    }),
  });

  const data = await res.json();
  if (!data.success) {
    throw new Error(data.message || '添加 Token 失败');
  }

  return data.token_id;
}

// 获取 SORA 统计数据
async function getSoraStats(baseUrl: string, adminToken: string): Promise<SoraStats> {
  const res = await fetch(`${baseUrl}/api/stats`, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${adminToken}`,
    },
  });

  const data = await res.json();
  
  // 检查是否返回了无效 token 的错误
  if (data?.data?.detail === 'Invalid or expired token' || 
      data?.detail === 'Invalid or expired token' ||
      !res.ok) {
    throw new Error('Invalid or expired token');
  }
  
  return data as SoraStats;
}

// 获取已保存的 admin token，如果无效则重新登录
async function ensureAdminToken(config: {
  soraBackendUrl: string;
  soraBackendUsername: string;
  soraBackendPassword: string;
  soraBackendToken: string;
}): Promise<string> {
  // 如果没有配置用户名密码，直接使用现有 token
  if (!config.soraBackendUsername || !config.soraBackendPassword) {
    if (!config.soraBackendToken) {
      throw new Error('请先在管理后台配置 SORA 后台账号和密码');
    }
    return config.soraBackendToken;
  }

  // 尝试使用现有 token
  if (config.soraBackendToken) {
    try {
      // 测试 token 是否有效
      await getSoraStats(config.soraBackendUrl, config.soraBackendToken);
      return config.soraBackendToken;
    } catch {
      // token 无效，继续尝试重新登录
      console.log('[SORA] Token 已过期，尝试重新登录...');
    }
  }

  // 重新登录获取新 token
  console.log('[SORA] 正在登录后台获取新 Token...');
  try {
    const newToken = await loginSoraBackend(
      config.soraBackendUrl,
      config.soraBackendUsername,
      config.soraBackendPassword
    );

    // 保存新 token
    await updateSystemConfig({ soraBackendToken: newToken });
    console.log('[SORA] 新 Token 获取成功并已保存');

    return newToken;
  } catch (error) {
    console.error('[SORA] 登录失败:', error);
    throw new Error(`SORA 后台登录失败: ${error instanceof Error ? error.message : '未知错误'}`);
  }
}

// GET: 获取 SORA 统计数据
export async function GET() {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user || session.user.role !== 'admin') {
      return NextResponse.json({ error: '无权限' }, { status: 403 });
    }

    const config = await getSystemConfig();

    if (!config.soraBackendUrl) {
      return NextResponse.json({ error: '请先配置 SORA 后台地址' }, { status: 400 });
    }

    const adminToken = await ensureAdminToken(config);
    const stats = await getSoraStats(config.soraBackendUrl, adminToken);

    return NextResponse.json({ success: true, data: stats });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '获取统计数据失败' },
      { status: 500 }
    );
  }
}

// POST: 批量导入 RT
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user || session.user.role !== 'admin') {
      return NextResponse.json({ error: '无权限' }, { status: 403 });
    }

    const { action, rts } = await request.json();

    if (action === 'import' && Array.isArray(rts)) {
      const config = await getSystemConfig();

      if (!config.soraBackendUrl) {
        return NextResponse.json({ error: '请先配置 SORA 后台地址' }, { status: 400 });
      }

      const adminToken = await ensureAdminToken(config);

      const results: {
        success: { rt: string; tokenId: number }[];
        failed: { rt: string; error: string }[];
      } = {
        success: [],
        failed: [],
      };

      for (const rt of rts) {
        const trimmedRt = rt.trim();
        if (!trimmedRt) continue;

        try {
          // 1. RT 转 AT
          const { access_token, refresh_token } = await rt2at(
            config.soraBackendUrl,
            adminToken,
            trimmedRt
          );

          // 2. 添加 Token
          const tokenId = await addToken(
            config.soraBackendUrl,
            adminToken,
            access_token,
            refresh_token
          );

          results.success.push({ rt: trimmedRt.substring(0, 20) + '...', tokenId });
        } catch (error) {
          results.failed.push({
            rt: trimmedRt.substring(0, 20) + '...',
            error: error instanceof Error ? error.message : '未知错误',
          });
        }
      }

      return NextResponse.json({
        success: true,
        data: results,
        message: `成功导入 ${results.success.length} 个，失败 ${results.failed.length} 个`,
      });
    }

    return NextResponse.json({ error: '无效的操作' }, { status: 400 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '导入失败' },
      { status: 500 }
    );
  }
}
