'use client';

import { createContext, use, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { AUTH_PERMISSION_WILDCARD } from '@/lib/auth/types';
import type { ReactNode } from 'react';
import type { Action, Resource, Scope } from '@/types/permissions';
import { perm } from '@/types/permissions';
import type { Session } from '@/lib/auth/types';

// ── Types ─────────────────────────────────────────────────────────────────────

export type SessionStatus = 'authenticated' | 'unauthenticated';

// ── Broadcast channel name for cross-tab session sync ─────────────────────────

const AUTH_BROADCAST_CHANNEL = 'auth';

type AuthBroadcastMessage = { type: 'logout' } | { type: 'session_refresh' };

// ── Context value ─────────────────────────────────────────────────────────────

export interface SessionContextValue {
  /** Current session status derived from the latest server render. */
  status: SessionStatus;
  /** Convenience boolean — equivalent to `status === 'authenticated'`. */
  isAuthenticated: boolean;
  session: Session | null;
  user: Session['user'] | null;
  /**
   * Check whether the current user holds a specific RBAC permission.
   *
   * Argument order: ``can(resource, action, scope)``.
   *
   * Delegates to the permission set embedded in the session (expanded by the
   * backend before being placed in the JWT).  Uses an exact Set.has() lookup —
   * no wildcard matching required on the frontend.
   *
   * Returns false when the user is not authenticated.
   */
  can: (resource: Resource, action: Action, scope: Scope) => boolean;
  /**
   * Re-fetch the session by triggering a full RSC refresh via router.refresh().
   *
   * Use this after operations that change authentication state on the client
   * (e.g. post-OAuth redirect)
   * without requiring a full page navigation.
   */
  refresh: () => void;
}

const SessionContext = createContext<SessionContextValue | undefined>(undefined);

// ── Cross-tab broadcast listener ──────────────────────────────────────────────

function useSessionBroadcastListener(onLogout: () => void, onSessionRefresh: () => void) {
  useEffect(() => {
    if (typeof BroadcastChannel === 'undefined') return;

    const channel = new BroadcastChannel(AUTH_BROADCAST_CHANNEL);
    const handleMessage = (event: MessageEvent<AuthBroadcastMessage>) => {
      if (event.data.type === 'logout') {
        onLogout();
      }
      if (event.data.type === 'session_refresh') {
        onSessionRefresh();
      }
    };

    channel.addEventListener('message', handleMessage);
    return () => {
      channel.removeEventListener('message', handleMessage);
      channel.close();
    };
  }, [onLogout, onSessionRefresh]);
}

// ── Provider ──────────────────────────────────────────────────────────────────

interface SessionProviderProps {
  children: ReactNode;
  initialSession?: Session | null;
}

export function SessionProvider({ children, initialSession = null }: SessionProviderProps) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [session, setSession] = useState<Session | null>(initialSession);

  // Sync session state when RSC re-renders with a new initialSession (e.g.
  // after token refresh or navigation).
  const prevInitialRef = useRef(initialSession);
  useEffect(() => {
    if (prevInitialRef.current !== initialSession) {
      prevInitialRef.current = initialSession;
      setSession(initialSession);
    }
  }, [initialSession]);

  const status: SessionStatus = session ? 'authenticated' : 'unauthenticated';

  // ── Cross-tab session sync via BroadcastChannel ───────────────────────────
  const handleBroadcastLogout = useCallback(() => {
    setSession(null);
    queryClient.clear();
    router.push('/login');
  }, [queryClient, router]);

  const handleBroadcastRefresh = useCallback(() => {
    router.refresh();
  }, [router]);

  useSessionBroadcastListener(handleBroadcastLogout, handleBroadcastRefresh);

  // Trigger a full RSC refresh; Next.js re-runs getSession() server-side and
  // streams fresh data to the client without a navigation.
  const refresh = useCallback(() => {
    router.refresh();
  }, [router]);

  // Lazily build a permission Set so lookup is O(1).  Recomputed only when
  // session.permissions reference changes.
  const permissionsSet = useMemo(() => new Set<string>(session?.permissions), [session?.permissions]);

  const can = useCallback(
    (resource: Resource, action: Action, scope: Scope): boolean => {
      if (!session) return false;
      return permissionsSet.has(AUTH_PERMISSION_WILDCARD) || permissionsSet.has(perm(resource, action, scope));
    },
    [session, permissionsSet],
  );

  const value = useMemo<SessionContextValue>(
    () => ({
      status,
      isAuthenticated: status === 'authenticated',
      session,
      user: session?.user ?? null,
      can,
      refresh,
    }),
    [status, session, can, refresh],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

// ── Broadcast helpers (used by server actions to notify other tabs) ───────────

export function broadcastLogout(): void {
  if (typeof BroadcastChannel === 'undefined') return;
  const channel = new BroadcastChannel(AUTH_BROADCAST_CHANNEL);
  channel.postMessage({ type: 'logout' } satisfies AuthBroadcastMessage);
  channel.close();
}

export function broadcastSessionRefresh(): void {
  if (typeof BroadcastChannel === 'undefined') return;
  const channel = new BroadcastChannel(AUTH_BROADCAST_CHANNEL);
  channel.postMessage({ type: 'session_refresh' } satisfies AuthBroadcastMessage);
  channel.close();
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useSessionContext(): SessionContextValue {
  const context = use(SessionContext);

  if (context === undefined) {
    throw new Error('useSessionContext must be used within a SessionProvider');
  }

  return context;
}
