import { NextRequest, NextResponse } from 'next/server';
import { buildErrorResponse, extractBearerToken, isAuthorized } from '@/lib/v1';

export const dynamic = 'force-dynamic';

function statusFromError(message: string): number {
  const lower = message.toLowerCase();
  if (lower.includes('not found') || lower.includes('404')) return 404;
  if (lower.includes('not completed') || lower.includes('400')) return 400;
  return 500;
}

export async function GET(request: NextRequest, context: { params: { video_id: string } }) {
  const token = extractBearerToken(request);
  if (!isAuthorized(token)) {
    return buildErrorResponse('Unauthorized', 401, 'authentication_error');
  }

  const soraApiPromise = import('@/lib/sora-content');
  const saveMediaPromise = import('@/lib/media-storage');

  const videoId = context.params.video_id;
  if (!videoId) {
    return buildErrorResponse('Video ID is required', 400);
  }

  try {
    const { getVideoContentUrl } = await soraApiPromise;
    const url = await getVideoContentUrl(videoId);
    const origin = new URL(request.url).origin;
    const { saveMediaAsync } = await saveMediaPromise;
    const cachedUrl = await saveMediaAsync(`v1-video-${videoId}`, url, { publicBaseUrl: origin });
    return NextResponse.redirect(cachedUrl, 302);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to get video content';
    const statusCode = statusFromError(message);
    return buildErrorResponse(message, statusCode, statusCode === 500 ? 'server_error' : 'invalid_request_error');
  }
}
