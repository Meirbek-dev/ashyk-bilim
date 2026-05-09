import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { updateUserTheme } from '@/lib/users/server';
import { getSession } from '@/lib/auth/session';

export async function POST(request: NextRequest) {
  const session = await getSession();
  const userId = session?.user?.id;

  if (!session?.user || typeof userId !== 'number') {
    return NextResponse.json({ detail: 'Authentication required' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const theme = typeof body?.theme === 'string' ? body.theme.trim() : '';

    if (!theme) {
      return NextResponse.json({ detail: 'Theme is required' }, { status: 400 });
    }

    await updateUserTheme(userId, theme);

    return NextResponse.json({ updated: true }, { status: 200 });
  } catch (error) {
    const status =
      typeof (error as { status?: unknown }).status === 'number' ? (error as { status: number }).status : 500;

    return NextResponse.json(
      {
        detail: error instanceof Error ? error.message : 'Failed to update theme',
      },
      { status: status >= 400 && status < 600 ? status : 500 },
    );
  }
}
