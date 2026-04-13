'use client';

import { createContext, use, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { queryOptions, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api-client';
import { AUTH_PERMISSION_WILDCARD } from '@/lib/auth/types';
import type { ReactNode } from 'react';
import type { Action, Resource, Scope } from '@/types/permissions';
import { perm } from '@/types/permissions';
import type { Session, UserSessionResponse } from '@/lib/auth/types';

// ── Types ─────────────────────────────────────────────────────────────────────

export type SessionStatus = 'loading' | 'authenticated' | 'unauthenticated' | 'error';

// ── Broadcast channel name for cross-tab session sync ─────────────────────────

const AUTH_BROADCAST_CHANNEL = 'auth';

type AuthBroadcastMessage = { type: 'logout' } | { type: 'session_refresh' };

// ── Context value ─────────────────────────────────────────────────────────────

export interface SessionContextValue {
  /** Discriminated session status — distinguishes loading from unauthenticated. */
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
   * (e.g. post-OAuth redirect, receiving a roles-updated WebSocket event)
   * without requiring a full page navigation.
   */
  refresh: () => void;
}

const SessionContext = createContext<SessionContextValue | undefined>(undefined);

// ── Full profile hook ─────────────────────────────────────────────────────────

function useFullProfile(userId: number | null) {
  const normalizedUserId = userId ?? 0;

  return useQuery(
    queryOptions({
      queryKey: ['auth', 'me', normalizedUserId],
      queryFn: async (): Promise<UserSessionResponse> => {
        const response = await apiFetch('auth/me');
        if (!response.ok) {
          throw new Error(`Failed to fetch profile: ${String(response.status)}`);
        }
        return response.json() as Promise<UserSessionResponse>;
      },
      enabled: userId !== null,
      staleTime: 5 * 60 * 1000,
      refetchOnWindowFocus: false,
    }),
  );
}

// ── Cross-tab broadcast listener ──────────────────────────────────────────────

function useSessionBroadcastListener(onLogout: () => void, onSessionRefresh: () => void) {
  useEffect(() => {
    if (typeof BroadcastChannel === 'undefined') return;

    const channel = new BroadcastChannel(AUTH_BROADCAST_CHANNEL);
    channel.onmessage = (event: MessageEvent<AuthBroadcastMessage>) => {
      if (event.data.type === 'logout') {
        onLogout();
      }
      if (event.data.type === 'session_refresh') {
        onSessionRefresh();
      }
    };
    return () => {
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

  // ── Full profile fetch via TanStack Query ─────────────────────────────────
  const userId = session?.user.id ?? null;
  const { data: fullProfile, isError: profileError } = useFullProfile(userId);

  // Merge full profile data into session when available
  const mergedSession = useMemo<Session | null>(() => {
    if (!session) return null;
    if (!fullProfile) return session;
    return {
      ...session,
      user: fullProfile.user,
      roles: fullProfile.roles,
      permissions: fullProfile.permissions,
      permissions_timestamp: fullProfile.permissions_timestamp ?? session.permissions_timestamp,
    };
  }, [session, fullProfile]);

  // ── Session status ────────────────────────────────────────────────────────
  const status = useMemo<SessionStatus>(() => {
    if (profileError) return 'error';
    if (mergedSession !== null) return 'authenticated';
    return 'unauthenticated';
  }, [mergedSession, profileError]);

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
  const permissionsSet = useMemo(() => new Set<string>(mergedSession?.permissions), [mergedSession?.permissions]);

  const can = useCallback(
    (resource: Resource, action: Action, scope: Scope): boolean => {
      if (!mergedSession) return false;
      return permissionsSet.has(AUTH_PERMISSION_WILDCARD) || permissionsSet.has(perm(resource, action, scope));
    },
    [mergedSession, permissionsSet],
  );

  const value = useMemo<SessionContextValue>(
    () => ({
      status,
      isAuthenticated: status === 'authenticated',
      session: mergedSession,
      user: mergedSession?.user ?? null,
      can,
      refresh,
    }),
    [status, mergedSession, can, refresh],
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
