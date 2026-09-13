'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

/**
 * UX-068: the dashboard work queue is server-rendered; a hand-in made while
 * the tab is open re-renders it on window focus and every 30 s while visible
 * (the same cadence a react-query `refetchOnWindowFocus` + `refetchInterval`
 * would give a client query).
 */
export function WorkQueueAutoRefresh({ intervalMs = 30_000 }: { intervalMs?: number }) {
  const router = useRouter()
  useEffect(() => {
    const refresh = () => {
      if (document.visibilityState === 'visible') router.refresh()
    }
    const timer = globalThis.setInterval(refresh, intervalMs)
    globalThis.addEventListener('focus', refresh)
    return () => {
      globalThis.clearInterval(timer)
      globalThis.removeEventListener('focus', refresh)
    }
  }, [router, intervalMs])
  return null
}
