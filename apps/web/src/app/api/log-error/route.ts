import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // Log the error with full details
    console.error('[CLIENT ERROR LOG]', {
      timestamp: new Date().toISOString(),
      url: body.url || request.url,
      userAgent: request.headers.get('user-agent'),
      error: body.error,
      digest: body.digest,
      componentStack: body.componentStack,
      page: body.page,
    });

    return NextResponse.json({ logged: true }, { status: 200 });
  } catch (error) {
    console.error('Failed to log error:', error);
    return NextResponse.json({ error: 'Logging failed' }, { status: 500 });
  }
}
