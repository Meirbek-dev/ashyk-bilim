import 'server-only';
import { cache } from 'react';
import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { getServerAPIUrl } from '@services/config/config';
import { ACCESS_TOKEN_COOKIE_NAME } from './types';
import type { Session, UserSessionResponse } from './types';

// ── Public API ─────────────────────────────────────────────────────────────────

/**
 * Get the session by calling the backend /auth/me endpoint with the access token cookie.
 *
 * The result is deduplicated within a single RSC render tree via React.cache().
 * A new verification is performed for every incoming request.
 */
export const getSession = cache(async (): Promise<Session | null> => {
  const cookieStore = await cookies();
  const token = cookieStore.get(ACCESS_TOKEN_COOKIE_NAME)?.value;
  if (!token) return null;

  try {
    const res = await fetch(new URL('auth/me', getServerAPIUrl()), {
      headers: {
        Cookie: `${ACCESS_TOKEN_COOKIE_NAME}=${token}`,
      },
      // Ensure we don't aggressively cache the auth state
      cache: 'no-store', 
    });

    if (!res.ok) {
      return null;
    }

    const sessionData = (await res.json()) as UserSessionResponse;
    
    // Map backend response to frontend Session shape
    return {
      ...sessionData,
      expiresAt: sessionData.expires_at ? sessionData.expires_at : 0,
      sessionVersion: sessionData.session_version ?? null,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn('[getSession] Failed to fetch session from backend:', message);
    return null;
  }
});

/**
 * Require an authenticated session or redirect to /login.
 *
 * The returnTo path comes from the x-pathname header injected by proxy.ts,
 * so the user lands back at their intended destination after signing in.
 */
export async function requireSession(): Promise<Session> {
  const session = await getSession();
  if (!session) {
    const headersList = await headers();
    const returnTo = headersList.get('x-pathname') ?? '/';
    redirect(`/login?returnTo=${encodeURIComponent(returnTo)}`);
  }
  return session;
}
