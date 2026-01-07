/* eslint-disable no-console */
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getGeneration } from '@/lib/db';
import { readMediaFile, isLocalFile } from '@/lib/media-storage';
import { getVideoContentUrl } from '@/lib/sora-api';
import { fetchExternalBuffer, resolveAndValidateUrl } from '@/lib/safe-fetch';

// 媒体文件服务端点
// 支持多种存储方式：
// 1. 本地文件 (file:xxx.png)
// 2. 外部 URL (http/https)
// 3. Base64 data URL (data:image/png;base64,xxx)
// 4. Sora /content 端点 (需要 API Key 认证)

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return new NextResponse('Unauthorized', { status: 401 });
    }

    const { id } = await params;
    
    const generation = await getGeneration(id);
    
    if (!generation) {
      return new NextResponse('Not Found', { status: 404 });
    }

    const isOwner = generation.userId === session.user.id;
    const isAdmin = session.user.role === 'admin' || session.user.role === 'moderator';
    if (!isOwner && !isAdmin) {
      return new NextResponse('Forbidden', { status: 403 });
    }
    
    let resultUrl = generation.resultUrl;
    
    if (!resultUrl) {
      return new NextResponse('No Content', { status: 204 });
    }
    
    // 检查是否是 Sora /content 端点 URL（需要 API Key 认证）
    if (resultUrl.includes('/v1/videos/') && resultUrl.includes('/content')) {
      // 从 URL 中提取 video ID
      const match = resultUrl.match(/\/v1\/videos\/([^/]+)\/content/);
      if (match) {
        const videoId = match[1];
        try {
          // 通过 API Key 获取实际的视频 URL
          const actualUrl = await getVideoContentUrl(videoId);
          console.log('[Media API] Sora content URL resolved:', actualUrl?.substring(0, 80));
          resultUrl = actualUrl;
        } catch (error) {
          console.error('[Media API] Failed to get Sora content URL:', error);
          return new NextResponse('Failed to get video URL', { status: 502 });
        }
      }
    }
    
    // 1. 本地文件存储 (file:xxx.png)
    if (isLocalFile(resultUrl)) {
      const file = await readMediaFile(resultUrl);
      if (!file) {
        return new NextResponse('File not found', { status: 404 });
      }
      return createMediaResponse(file.buffer, file.mimeType);
    }
    
    // 2. 外部 URL，代理请求或重定向
    if (resultUrl.startsWith('http://') || resultUrl.startsWith('https://')) {
      const origin = new URL(request.url).origin;
      let safeUrl: URL;
      try {
        safeUrl = await resolveAndValidateUrl(resultUrl, { origin });
      } catch (error) {
        console.error('[Media API] Blocked external URL:', error);
        return new NextResponse('Invalid media URL', { status: 400 });
      }
      // 对于视频，直接重定向到外部 URL（避免代理大文件）
      if (generation.type.includes('video')) {
        return NextResponse.redirect(safeUrl.toString(), 302);
      }
      // 对于图片，代理请求
      return await proxyExternalUrl(safeUrl.toString(), generation.type, origin);
    }
    
    // 3. Base64 data URL
    const match = resultUrl.match(/^data:([^;]+);base64,(.+)$/);
    
    if (!match) {
      return new NextResponse('Invalid media format', { status: 400 });
    }
    
    const mimeType = match[1];
    const base64Data = match[2];
    const buffer = Buffer.from(base64Data, 'base64');
    
    return createMediaResponse(buffer, mimeType);
  } catch (error) {
    console.error('[Media API] Error:', error);
    return new NextResponse('Internal Server Error', { status: 500 });
  }
}

// 代理外部URL
async function proxyExternalUrl(url: string, type: string, origin: string): Promise<NextResponse> {
  try {
    const { buffer, contentType } = await fetchExternalBuffer(url, {
      origin,
      allowRelative: false,
      maxBytes: 20 * 1024 * 1024,
      timeoutMs: 15000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
    });

    if (!contentType.startsWith('image/')) {
      return new NextResponse('Unsupported media type', { status: 415 });
    }

    const finalType = contentType || (type.includes('video') ? 'video/mp4' : 'image/png');
    return createMediaResponse(buffer, finalType);
  } catch (error) {
    console.error('[Media API] Proxy error:', error);
    return new NextResponse('Proxy error', { status: 502 });
  }
}

// 创建媒体响应
function createMediaResponse(buffer: Buffer, contentType: string): NextResponse {
  const cacheControl = 'private, max-age=0, no-store';
  
  const headers: HeadersInit = {
    'Content-Type': contentType,
    'Content-Length': buffer.length.toString(),
    'Cache-Control': cacheControl,
    'X-Content-Type-Options': 'nosniff',
    'Vary': 'Cookie',
  };
  
  // 转换为 Uint8Array 以兼容 NextResponse
  return new NextResponse(new Uint8Array(buffer), {
    status: 200,
    headers,
  });
}
