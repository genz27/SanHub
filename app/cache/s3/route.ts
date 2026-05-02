import { NextRequest, NextResponse } from 'next/server';
import { getS3CachedObject } from '@/lib/picui';

export const dynamic = 'force-dynamic';

const CACHE_CONTROL = 'public, max-age=31536000, immutable';

function statusFromS3Error(error: unknown): number {
  const err = error as { name?: string; $metadata?: { httpStatusCode?: number }; message?: string };
  if (err.$metadata?.httpStatusCode) return err.$metadata.httpStatusCode;
  const text = `${err.name || ''} ${err.message || ''}`.toLowerCase();
  if (text.includes('notfound') || text.includes('nosuchkey') || text.includes('not found')) return 404;
  if (text.includes('outside') || text.includes('forbidden')) return 403;
  if (text.includes('not configured') || text.includes('required')) return 400;
  return 502;
}

function buildHeaders(object: Awaited<ReturnType<typeof getS3CachedObject>>): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': object.contentType,
    'Content-Length': String(object.contentLength),
    'Cache-Control': CACHE_CONTROL,
    'X-Content-Type-Options': 'nosniff',
  };
  if (object.etag) headers.ETag = object.etag;
  if (object.lastModified) headers['Last-Modified'] = object.lastModified.toUTCString();
  return headers;
}

export async function GET(request: NextRequest) {
  const key = request.nextUrl.searchParams.get('key') || '';
  const bucketId = request.nextUrl.searchParams.get('bucket') || undefined;

  try {
    const object = await getS3CachedObject(key, bucketId);
    return new NextResponse(new Uint8Array(object.buffer), {
      status: 200,
      headers: buildHeaders(object),
    });
  } catch (error) {
    const status = statusFromS3Error(error);
    return NextResponse.json(
      { detail: error instanceof Error ? error.message : 'S3 cache fetch failed' },
      { status }
    );
  }
}

export async function HEAD(request: NextRequest) {
  const key = request.nextUrl.searchParams.get('key') || '';
  const bucketId = request.nextUrl.searchParams.get('bucket') || undefined;

  try {
    const object = await getS3CachedObject(key, bucketId);
    return new NextResponse(null, {
      status: 200,
      headers: buildHeaders(object),
    });
  } catch (error) {
    const status = statusFromS3Error(error);
    return new NextResponse(null, { status });
  }
}
