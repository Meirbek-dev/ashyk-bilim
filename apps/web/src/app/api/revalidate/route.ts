import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { revalidateTag } from 'next/cache';
import { getSession } from '@/lib/auth/session';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
} as const;

async function requireAuthenticatedSession() {
  const session = await getSession();
  if (!session?.user) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401, headers: corsHeaders });
  }

  return null;
}

export async function GET(request: NextRequest) {
  const unauthorized = await requireAuthenticatedSession();
  if (unauthorized) {
    return unauthorized;
  }

  const tag = request.nextUrl.searchParams.get('tag');

  if (!tag) {
    return NextResponse.json({ error: 'Tag parameter is required' }, { status: 400, headers: corsHeaders });
  }

  revalidateTag(tag, 'max');

  return NextResponse.json({ revalidated: true, now: Date.now(), tag }, { status: 200, headers: corsHeaders });
}

export async function POST(request: NextRequest) {
  const unauthorized = await requireAuthenticatedSession();
  if (unauthorized) {
    return unauthorized;
  }

  try {
    const { tags } = await request.json();

    if (!Array.isArray(tags) || tags.length === 0) {
      return NextResponse.json({ error: 'Tags array is required' }, { status: 400, headers: corsHeaders });
    }

    const uniqueTags = [...new Set(tags)]
      .filter((tag) => typeof tag === 'string' && tag.trim().length > 0)
      .map((tag) => tag.trim());

    if (uniqueTags.length === 0) {
      return NextResponse.json({ error: 'No valid tags provided' }, { status: 400, headers: corsHeaders });
    }

    for (const tag of uniqueTags) {
      revalidateTag(tag, 'max');
    }

    return NextResponse.json(
      {
        revalidated: true,
        now: Date.now(),
        tags: uniqueTags,
      },
      { status: 200, headers: corsHeaders },
    );
  } catch (error) {
    return NextResponse.json(
      {
        error: 'Invalid request payload',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 400, headers: corsHeaders },
    );
  }
}
