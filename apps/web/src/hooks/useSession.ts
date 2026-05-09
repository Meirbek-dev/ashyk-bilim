'use client';

import { useSessionContext } from '@/components/providers/session-provider';
import type { SessionContextValue, SessionStatus } from '@/components/providers/session-provider';

/**
 * Access the current session, user, permissions, and auth utilities.
 *
 * Must be used inside a component tree wrapped by `<SessionProvider>`.
 *
 * @example
 * ```tsx
 * const { status, isAuthenticated, user, can, refresh } = useSession();
 *
 * if (can('course', 'create', 'platform')) {
 *   // render create button
 * }
 * ```
 */
export function useSession(): SessionContextValue {
  return useSessionContext();
}

export type { SessionContextValue, SessionStatus };
