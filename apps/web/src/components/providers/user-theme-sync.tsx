'use client'

import { useEffect, useRef } from 'react'
import { useSession } from '@/hooks/useSession'
import { useTheme } from '@/components/providers/theme-provider'
import { updateProfile } from '@/lib/users/client'
import { DEFAULT_THEME_NAME } from '@/lib/themes'

export const THEME_SYNC_DELAY_MS = 1000

/**
 * BUG-362: the signed-in user's theme lives on the server (`users.theme`,
 * `GET /users/me`). Rendered under the platform `SessionProvider` — the root
 * `ThemeProvider` only ever sees the anonymous session — it adopts the server
 * choice when the user (re)appears and persists a local change through
 * `PATCH /users/me { theme }` after a short debounce (the selector's
 * prev/next/random buttons fire in bursts). Anonymous visitors keep the
 * provider's localStorage fast path. An unset server theme equals the app
 * default, so a user who never chose one is never written.
 */
export function UserThemeSync() {
  const { user } = useSession()
  const { themeName, setTheme } = useTheme()
  const userId = user?.id
  const serverTheme = user?.theme ?? null
  const syncedRef = useRef<string | null>(serverTheme ?? DEFAULT_THEME_NAME)
  // `setTheme` changes identity with the light/dark mode; adopting must not re-run on a toggle.
  const setThemeRef = useRef(setTheme)
  setThemeRef.current = setTheme

  useEffect(() => {
    syncedRef.current = serverTheme ?? DEFAULT_THEME_NAME
    if (userId && serverTheme) setThemeRef.current(serverTheme)
  }, [userId, serverTheme])

  useEffect(() => {
    if (!userId || themeName === syncedRef.current) return
    const timer = setTimeout(() => {
      updateProfile({ theme: themeName })
        .then(() => {
          syncedRef.current = themeName
        })
        .catch(() => {
          // Offline or signed out: the local choice stays, the next change retries.
        })
    }, THEME_SYNC_DELAY_MS)
    return () => {
      clearTimeout(timer)
    }
  }, [userId, themeName])

  return null
}
