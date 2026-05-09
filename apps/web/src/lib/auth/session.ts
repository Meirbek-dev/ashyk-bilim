import 'server-only';
import { cache } from 'react';
import { headers } from 'next/headers';
import { redirect, unstable_rethrow } from 'next/navigation';
import { apiFetch } from '@/lib/api-client';
import type { Session, UserSessionResponse } from './types';

// ── Public API ─────────────────────────────────────────────────────────────────

/**
 * Get the current session from the backend.
 *
 * The result is deduplicated within a single RSC render tree via React.cache().
 * A fresh auth check still happens on every incoming request.
 */
export const getSession = cache(async (): Promise<Session | null> => {
  try {
    const res = await apiFetch('auth/me');
    if (!res.ok) {
      return null;
    }

    const sessionData = (await res.json()) as UserSessionResponse;
    return {
      ...sessionData,
      expiresAt: sessionData.expires_at ?? 0,
      sessionVersion: sessionData.session_version ?? null,
    };
  } catch (error) {
    unstable_rethrow(error);

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
