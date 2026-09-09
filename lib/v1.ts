import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

export { buildDataUrl, parseDataUrl, stripDataUrl } from './v1-data-url';

export type OpenAiErrorType = 'invalid_request_error' | 'server_error' | 'authentication_error';

export function extractBearerToken(request: NextRequest): string | null {
  const header = request.headers.get('authorization') || request.headers.get('Authorization');
  if (!header) return null;
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : null;
}

export function isAuthorized(token: string | null): boolean {
  if (!token) return false;
  const required = process.env.V1_API_KEY || process.env.API_KEY;
  if (!required) return true;
  return token === required;
}

export function buildErrorResponse(message: string, status: number, type: OpenAiErrorType = 'invalid_request_error') {
  return NextResponse.json(
    {
      error: {
        message,
        type,
      },
    },
    { status }
  );
}

