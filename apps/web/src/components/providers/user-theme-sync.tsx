'use client'

import { useEffect, useEffectEvent, useRef } from 'react'
import { useSession } from '@/hooks/useSession'
import { useTheme } from '@/components/providers/theme-provider'
import { updateProfile } from '@/lib/users/client'
import { DEFAULT_THEME_NAME, getTheme } from '@/lib/themes'

export const THEME_SYNC_DELAY_MS = 1000

/**
 * BUG-362: the signed-in user's theme lives on the server (`users.theme`,
 * `GET /users/me`). Rendered under the platform `SessionProvider` - the root
 * `ThemeProvider` only ever sees the anonymous session - it adopts the server
 * choice when the user (re)appears and persists a local change through
 * `PATCH /users/me { theme }` after a short debounce (the selector's
 * prev/next/random buttons fire in bursts). Anonymous visitors keep the
 * provider's localStorage fast path. An unset server theme equals the app
 * default, so a user who never chose one is never written - and signing in
 * adopts that default too, so a theme left in this browser by a previous
 * account is never saved onto the next one (BUG-380).
 */
export function UserThemeSync() {
  const { user } = useSession()
  const { themeName, setTheme } = useTheme()
  const userId = user?.id
  // A slug outside the registry renders as the default; that fallback is the
  // synced state, never a choice to write over the stored one (BUG-365).
  const serverTheme = user?.theme ?? null
  const syncedName = serverTheme ? getTheme(serverTheme).name : DEFAULT_THEME_NAME
  const syncedRef = useRef<string | null>(syncedName)
  // `setTheme` changes identity with the light/dark mode; adopting must not re-run on a toggle.
  const adoptTheme = useEffectEvent((theme: string) => setTheme(theme))

  useEffect(() => {
    syncedRef.current = syncedName
    if (userId) adoptTheme(serverTheme ?? DEFAULT_THEME_NAME)
  }, [userId, serverTheme, syncedName])

  useEffect(() => {
    if (!userId || themeName === syncedRef.current) return
    const persist = async () => {
      try {
        await updateProfile({ theme: themeName })
        syncedRef.current = themeName
      } catch {
        // Offline or signed out: the local choice stays, the next change retries.
      }
    }
    const timer = setTimeout(() => void persist(), THEME_SYNC_DELAY_MS)
    return () => {
      clearTimeout(timer)
    }
  }, [userId, themeName])

  return null
}
