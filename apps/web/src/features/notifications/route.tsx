// Route-level code (validateSearch) and the shell's hook-ups: the route tree and the shell keep it in the entry chunk,
// so this file imports nothing of the feature statically (AGENTS.md "Entry chunk").
import { useQueryClient } from '@tanstack/react-query'
import { useHydrated } from '@tanstack/react-router'
import { lazy, Suspense, useEffect } from 'react'
import * as v from 'valibot'

/** /notifications?unread=true: only the unread ones (B-NOT-03). Anything else is the whole list. */
export const notificationsSearchSchema = v.object({
  unread: v.fallback(
    v.optional(
      v.pipe(
        v.boolean(),
        v.transform(only => only || undefined),
      ),
    ),
    undefined,
  ),
})

const Bell = lazy(() => import('./ui/notification-bell').then(module => ({ default: module.NotificationBell })))

/** The shell's `notifications` slot: the bell reads its count in the browser, after hydration (no SSR request). */
export function NotificationsSlot() {
  const hydrated = useHydrated()
  if (!hydrated) return null
  return (
    <Suspense fallback={null}>
      <Bell />
    </Suspense>
  )
}

/**
 * The tab's one event stream (spec 7.7), for the signed-in `userId`: opened after hydration, its module loaded on
 * demand, closed when the user signs out or changes. Called once by the app shell.
 */
export function useLiveEvents(userId: string | undefined): void {
  const queryClient = useQueryClient()
  useEffect(() => {
    if (!userId) return undefined
    let stop: (() => void) | undefined
    let cancelled = false
    const open = async () => {
      const { startLive } = await import('./live')
      if (!cancelled) stop = startLive(queryClient)
    }
    void open()
    return () => {
      cancelled = true
      stop?.()
    }
  }, [queryClient, userId])
}
