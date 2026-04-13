import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { updateUserTheme } from '@/lib/users/server';
import { getSession } from '@/lib/auth/session';

export async function POST(request: NextRequest) {
  const session = await getSession();
  const userId = session?.user?.id;

  if (!session?.user || typeof userId !== 'number') {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const theme = typeof body?.theme === 'string' ? body.theme.trim() : '';

    if (!theme) {
      return NextResponse.json({ error: 'Theme is required' }, { status: 400 });
    }

    await updateUserTheme(userId, theme);

    return NextResponse.json({ updated: true }, { status: 200 });
  } catch (error) {
    return NextResponse.json(
      {
        error: 'Failed to update theme',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 },
    );
  }
}
