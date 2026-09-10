'use client'

import { useCallback, useTransition } from 'react'
import { unstable_rethrow } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'
import { logout } from '@services/auth/auth'

/**
 * Runs `logout()` and reports a genuine failure — never swallows one.
 *
 * `logout()` ends in a Server Action `redirect()`, which works by throwing a
 * special Next.js control-flow error (digest `NEXT_REDIRECT`) that must
 * reach the framework unhandled to actually navigate the browser. A bare
 * `catch { console.error(...) }` around the call absorbs that signal along
 * with real errors, so the redirect (and therefore the whole logout) becomes
 * a silent no-op. `unstable_rethrow` — the same guard already used in
 * `lib/auth/session.ts` — lets the redirect (or `notFound`) propagate, and
 * only a genuine failure (e.g. the request never reached the server) falls
 * through to `onFailure`.
 *
 * Exported standalone (not just via `useLogout`) so it can be unit-tested
 * without rendering a component or wiring up a transition.
 */
export async function performLogout(onFailure: () => void): Promise<void> {
  try {
    await logout()
  } catch (error) {
    unstable_rethrow(error)
    console.error('Logout failed:', error)
    onFailure()
  }
}

/**
 * Shared client-side logout trigger for every sign-out control in the app
 * (sidebar footer, header profile menu, ...) — one implementation so a fix
 * here fixes all of them.
 */
export function useLogout() {
  const [isLoggingOut, startTransition] = useTransition()
  const t = useTranslations('Errors')

  const runLogout = useCallback(() => {
    startTransition(async () => {
      await performLogout(() => toast.error(t('somethingWentWrong')))
    })
  }, [t])

  return { logout: runLogout, isLoggingOut }
}
