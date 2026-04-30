import { NextRequest } from 'next/server';
import { getVideoStatus } from '@/lib/sora-api';
import { buildErrorResponse, extractBearerToken, isAuthorized } from '@/lib/v1';
import { saveMediaAsync } from '@/lib/media-storage';

export const dynamic = 'force-dynamic';

function statusFromError(message: string): number {
  const lower = message.toLowerCase();
  if (lower.includes('not found') || lower.includes('404')) return 404;
  if (lower.includes('unauthorized') || lower.includes('401')) return 401;
  return 500;
}

export async function GET(request: NextRequest, context: { params: { video_id: string } }) {
  const token = extractBearerToken(request);
  if (!isAuthorized(token)) {
    return buildErrorResponse('Unauthorized', 401, 'authentication_error');
  }

  const videoId = context.params.video_id;
  if (!videoId) {
    return buildErrorResponse('Video ID is required', 400);
  }

  try {
    const status = await getVideoStatus(videoId);
    const origin = new URL(request.url).origin;
    const rawUrl = status.url || status.output?.url;
    if ((status.status === 'completed' || status.status === 'succeeded') && rawUrl) {
      const cachedUrl = await saveMediaAsync(`v1-video-${videoId}`, rawUrl, { publicBaseUrl: origin });
      status.url = cachedUrl;
      if (status.output) status.output.url = cachedUrl;
    }
    return Response.json(status);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to get video status';
    const statusCode = statusFromError(message);
    return buildErrorResponse(message, statusCode, statusCode === 500 ? 'server_error' : 'invalid_request_error');
  }
}
