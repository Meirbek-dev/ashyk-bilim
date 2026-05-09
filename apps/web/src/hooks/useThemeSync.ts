'use client';

import { useEffect, useRef } from 'react';
import { useSyncUserTheme } from '@/features/users/hooks/useUserPreferences';
import { useSession } from '@/hooks/useSession';

/**
 * Syncs the active theme name to the server with 1-second debounce.
 * Uses sendBeacon on page unload to flush any pending sync.
 *
 * Must be called inside a component that has access to the shared session/query providers
 * (for useSession) and the current theme name as a parameter.
 */
export function useThemeSync(themeName: string): void {
  const { user, isAuthenticated } = useSession();
  const userId = user?.id;
  const { mutateAsync: syncTheme } = useSyncUserTheme(userId);

  const pendingThemeRef = useRef<string | null>(null);
  const syncedThemeRef = useRef(user?.theme ?? null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Reset sync state when the user changes (login/logout/switch).
  useEffect(() => {
    syncedThemeRef.current = user?.theme ?? null;
    pendingThemeRef.current = null;
  }, [user?.id, user?.theme]);

  // Debounced sync: send theme to server 1 second after the last change.
  useEffect(() => {
    if (!userId || !isAuthenticated) {
      pendingThemeRef.current = null;
      return;
    }

    if (themeName === syncedThemeRef.current) {
      pendingThemeRef.current = null;
      return;
    }

    pendingThemeRef.current = themeName;

    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }

    timeoutRef.current = globalThis.setTimeout(() => {
      const nextTheme = pendingThemeRef.current;
      if (!nextTheme) return;

      void syncTheme(nextTheme)
        .then(() => {
          syncedThemeRef.current = nextTheme;
          pendingThemeRef.current = null;
        })
        .catch((error: unknown) => {
          const status = typeof error === 'object' && error && 'status' in error ? Number(error.status) : undefined;

          if (status === 401 || status === 403) {
            pendingThemeRef.current = null;
            return;
          }

          console.error('Failed to sync theme to server:', error);
        });
    }, 1000);

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
    };
  }, [isAuthenticated, syncTheme, themeName, userId]);

  // Flush pending theme via sendBeacon on page unload.
  useEffect(() => {
    if (!userId || !isAuthenticated) return;

    const handleBeforeUnload = () => {
      if (!pendingThemeRef.current) return;
      const payload = JSON.stringify({ theme: pendingThemeRef.current });
      const body = new Blob([payload], { type: 'application/json' });
      navigator.sendBeacon('/api/user/theme', body);
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [isAuthenticated, userId]);
}
