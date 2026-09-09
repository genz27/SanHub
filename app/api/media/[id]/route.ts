/* eslint-disable no-console */
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getGenerationMedia } from '@/lib/db/generation-lookup-reads';

const MEDIA_CACHE_CONTROL = 'private, max-age=31536000, immutable';
const MEDIA_REDIRECT_CACHE_CONTROL = 'private, max-age=3600';
const UNCACHED_RESPONSE_HEADERS = { 'Cache-Control': 'no-store' };

function uncachedResponse(body: string, status: number): NextResponse {
  return new NextResponse(body, {
    status,
    headers: UNCACHED_RESPONSE_HEADERS,
  });
}

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
    const sessionPromise = getServerSession(authOptions);
    const { id } = await params;
    const [session, generation] = await Promise.all([
      sessionPromise,
      getGenerationMedia(id),
    ]);
    if (!session?.user) {
      return uncachedResponse('Unauthorized', 401);
    }

    if (!generation) {
      return uncachedResponse('Not Found', 404);
    }

    const isOwner = generation.userId === session.user.id;
    const isAdmin = session.user.role === 'admin' || session.user.role === 'moderator';
    if (!isOwner && !isAdmin) {
      return uncachedResponse('Forbidden', 403);
    }
    
    let resultUrl = generation.resultUrl;
    const videoId = generation.videoId;
    const videoChannelId = generation.videoChannelId;
    
    if (!resultUrl) {
      return uncachedResponse('No Content', 204);
    }

    const needsSoraContent =
      Boolean(videoId) || (resultUrl.includes('/v1/videos/') && resultUrl.includes('/content'));
    const soraApiPromise = needsSoraContent ? import('@/lib/sora-content') : null;
    const videoProxyPromise = generation.type.includes('video')
      ? import('@/lib/video-proxy')
      : null;

    if (videoId) {
      try {
        const { getVideoContentUrl } = await soraApiPromise!;
        const actualUrl = await getVideoContentUrl(videoId, videoChannelId);
        console.log('[Media API] Sora content URL resolved by videoId:', actualUrl?.substring(0, 80));
        resultUrl = actualUrl;
      } catch (error) {
        console.error('[Media API] Failed to resolve videoId content URL:', error);
      }
    }
    
    // 检查是否是 Sora /content 端点 URL（需要 API Key 认证）
    if (resultUrl.includes('/v1/videos/') && resultUrl.includes('/content')) {
      // 从 URL 中提取 video ID
      const match = resultUrl.match(/\/v1\/videos\/([^/]+)\/content/);
      if (match) {
        const resolvedVideoId = match[1];
        try {
          const { getVideoContentUrl } = await (soraApiPromise ?? import('@/lib/sora-content'));
          const actualUrl = await getVideoContentUrl(resolvedVideoId, videoChannelId);
          console.log('[Media API] Sora content URL resolved:', actualUrl?.substring(0, 80));
          resultUrl = actualUrl;
        } catch (error) {
          console.error('[Media API] Failed to get Sora content URL:', error);
          return uncachedResponse('Failed to get video URL', 502);
        }
      }
    }
    
    // 1. 本地文件存储 (file:xxx.png)
    if (resultUrl.startsWith('file:')) {
      const { readMediaFile } = await import('@/lib/media-read');
      const file = await readMediaFile(resultUrl);
      if (!file) {
        return uncachedResponse('File not found', 404);
      }
      return createMediaResponse(request, file.buffer, file.mimeType, id);
    }
    
    // 2. 外部 URL，代理请求或重定向
    if (resultUrl.startsWith('http://') || resultUrl.startsWith('https://')) {
      const origin = new URL(request.url).origin;
      let safeUrl: URL;
      try {
        const { resolveAndValidateUrl } = await import('@/lib/safe-fetch');
        safeUrl = await resolveAndValidateUrl(resultUrl, { origin });
      } catch (error) {
        console.error('[Media API] Blocked external URL:', error);
        return uncachedResponse('Invalid media URL', 400);
      }
      // 对于视频，优先应用视频加速域名，再重定向（避免代理大文件）
      if (videoProxyPromise) {
        try {
          const { applyVideoProxy } = await videoProxyPromise;
          const proxied = await applyVideoProxy(safeUrl.toString());
          return createRedirectResponse(proxied);
        } catch {
          return createRedirectResponse(safeUrl.toString());
        }
      }
      return createRedirectResponse(safeUrl.toString());
    }
    
    // 3. Base64 data URL
    const match = resultUrl.match(/^data:([^;]+);base64,(.+)$/);
    
    if (!match) {
      return uncachedResponse('Invalid media format', 400);
    }
    
    const mimeType = match[1];
    const base64Data = match[2];
    const buffer = Buffer.from(base64Data, 'base64');
    
    return createMediaResponse(request, buffer, mimeType, id);
  } catch (error) {
    console.error('[Media API] Error:', error);
    return uncachedResponse('Internal Server Error', 500);
  }
}

function createRedirectResponse(url: string): NextResponse {
  const response = NextResponse.redirect(url, 302);
  response.headers.set('Cache-Control', MEDIA_REDIRECT_CACHE_CONTROL);
  response.headers.set('Vary', 'Cookie');
  return response;
}

function buildMediaETag(cacheKey: string, contentLength: number, contentType: string): string {
  return `"${encodeURIComponent(cacheKey)}-${contentLength}-${encodeURIComponent(contentType)}"`;
}

function requestMatchesETag(request: NextRequest, etag: string): boolean {
  const value = request.headers.get('if-none-match');
  if (!value) return false;

  return value
    .split(',')
    .some((candidate) => candidate.trim() === etag || candidate.trim() === '*');
}

// 创建媒体响应
function createMediaResponse(
  request: NextRequest,
  buffer: Buffer,
  contentType: string,
  cacheKey: string
): NextResponse {
  const etag = buildMediaETag(cacheKey, buffer.length, contentType);

  const headers: HeadersInit = {
    'Content-Type': contentType,
    'Cache-Control': MEDIA_CACHE_CONTROL,
    ETag: etag,
    'X-Content-Type-Options': 'nosniff',
    'Vary': 'Cookie',
  };

  if (requestMatchesETag(request, etag)) {
    return new NextResponse(null, {
      status: 304,
      headers,
    });
  }
  
  // 转换为 Uint8Array 以兼容 NextResponse
  return new NextResponse(new Uint8Array(buffer), {
    status: 200,
    headers: {
      ...headers,
      'Content-Length': buffer.length.toString(),
    },
  });
}
