import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

const MAX_BODY_BYTES = 8192; // 8 KB cap to prevent log-spam / memory exhaustion

export async function POST(request: NextRequest) {
  try {
    const contentLength = Number(request.headers.get('content-length') ?? '0');
    if (contentLength > MAX_BODY_BYTES) {
      return NextResponse.json({ error: 'Payload too large' }, { status: 413 });
    }

    const rawText = await request.text();
    if (rawText.length > MAX_BODY_BYTES) {
      return NextResponse.json({ error: 'Payload too large' }, { status: 413 });
    }

    let body: Record<string, unknown>;
    try {
      body = JSON.parse(rawText);
    } catch {
      return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
    }

    const isProd = process.env.NODE_ENV === 'production';

    console.error('[CLIENT ERROR LOG]', {
      timestamp: new Date().toISOString(),
      url: typeof body.url === 'string' ? body.url : request.url,
      // Do not log full user-agent in production to avoid PII leakage in logs.
      userAgent: isProd ? undefined : request.headers.get('user-agent'),
      error: typeof body.error === 'string' ? body.error.slice(0, 1000) : undefined,
      digest: typeof body.digest === 'string' ? body.digest : undefined,
      // Component stacks can contain source paths and PII — strip in production.
      componentStack: isProd ? undefined : body.componentStack,
      page: typeof body.page === 'string' ? body.page : undefined,
    });

    return NextResponse.json({ logged: true }, { status: 200 });
  } catch (error) {
    console.error('Failed to log error:', error);
    return NextResponse.json({ error: 'Logging failed' }, { status: 500 });
  }
}
