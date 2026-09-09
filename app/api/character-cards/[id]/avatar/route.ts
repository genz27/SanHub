/* eslint-disable no-console */
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getCharacterCardAvatar } from '@/lib/db/character-card-reads';

const MEDIA_CACHE_CONTROL = 'private, max-age=31536000, immutable';
const MEDIA_REDIRECT_CACHE_CONTROL = 'private, max-age=3600';
const UNCACHED_RESPONSE_HEADERS = { 'Cache-Control': 'no-store' };

function uncachedResponse(body: string, status: number): NextResponse {
  return new NextResponse(body, {
    status,
    headers: UNCACHED_RESPONSE_HEADERS,
  });
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const sessionPromise = getServerSession(authOptions);
    const { id } = await params;
    const [session, card] = await Promise.all([
      sessionPromise,
      getCharacterCardAvatar(id),
    ]);
    if (!session?.user) {
      return uncachedResponse('Unauthorized', 401);
    }

    if (!card) {
      return uncachedResponse('Not Found', 404);
    }

    const isOwner = card.userId === session.user.id;
    const isAdmin = session.user.role === 'admin' || session.user.role === 'moderator';
    if (!isOwner && !isAdmin) {
      return uncachedResponse('Forbidden', 403);
    }

    const avatarUrl = card.avatarUrl;
    if (!avatarUrl) {
      return uncachedResponse('No Content', 204);
    }

    if (avatarUrl.startsWith('file:')) {
      const { readMediaFile } = await import('@/lib/media-read');
      const file = await readMediaFile(avatarUrl);
      if (!file) {
        return uncachedResponse('File not found', 404);
      }
      return createMediaResponse(request, file.buffer, file.mimeType, id);
    }

    if (avatarUrl.startsWith('http://') || avatarUrl.startsWith('https://')) {
      const origin = new URL(request.url).origin;
      try {
        const { resolveAndValidateUrl } = await import('@/lib/safe-fetch');
        const safeUrl = await resolveAndValidateUrl(avatarUrl, { origin });
        return createRedirectResponse(safeUrl.toString());
      } catch (error) {
        console.error('[Character Avatar] Blocked external URL:', error);
        return uncachedResponse('Invalid media URL', 400);
      }
    }

    const match = avatarUrl.match(/^data:([^;]+);base64,(.+)$/);
    if (!match) {
      return uncachedResponse('Invalid media format', 400);
    }

    const mimeType = match[1];
    const buffer = Buffer.from(match[2], 'base64');
    return createMediaResponse(request, buffer, mimeType, id);
  } catch (error) {
    console.error('[Character Avatar] Error:', error);
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
    Vary: 'Cookie',
  };

  if (requestMatchesETag(request, etag)) {
    return new NextResponse(null, {
      status: 304,
      headers,
    });
  }

  return new NextResponse(new Uint8Array(buffer), {
    status: 200,
    headers: {
      ...headers,
      'Content-Length': buffer.length.toString(),
    },
  });
}
