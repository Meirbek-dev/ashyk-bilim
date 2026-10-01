'use client'

import { useMemo } from 'react'
import { usePathname, useSearchParams } from 'next/navigation'

export type ActivityAIMode =
  | 'ask'
  | 'explain'
  | 'practice'
  | 'sources'
  | 'review'
  | 'analyze'
  | 'draft-feedback'
  | 'remediation'

export function useActivityAIUrlState(defaultMode: ActivityAIMode = 'ask') {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const open = searchParams.get('ai') === 'open'
  const mode = (searchParams.get('aiMode') as ActivityAIMode | null) ?? defaultMode
  const thread = searchParams.get('aiThread') ?? searchParams.get('thread')

  const params = useMemo(() => new URLSearchParams(searchParams.toString()), [searchParams])

  // UX-299: panel state lives in the URL only for sharing/reload - the native History API
  // updates `useSearchParams` at once; `router.replace` re-rendered the activity page on the
  // server first (2–10 s before the panel opened or a new Q&A thread was selected).
  function replace(nextParams: URLSearchParams) {
    const query = nextParams.toString()
    globalThis.history.replaceState(null, '', query ? `${pathname}?${query}` : pathname)
  }

  function setOpen(nextOpen: boolean) {
    const next = new URLSearchParams(params.toString())
    if (nextOpen) {
      next.set('ai', 'open')
      if (!next.get('aiMode')) next.set('aiMode', mode)
    } else {
      next.delete('ai')
    }
    replace(next)
  }

  function setMode(nextMode: ActivityAIMode) {
    const next = new URLSearchParams(params.toString())
    next.set('ai', 'open')
    next.set('aiMode', nextMode)
    replace(next)
  }

  function setThread(nextThread: string | null) {
    const next = new URLSearchParams(params.toString())
    if (nextThread) {
      next.set('aiThread', nextThread)
      next.set('thread', nextThread)
    } else {
      next.delete('aiThread')
      next.delete('thread')
    }
    replace(next)
  }

  return { open, mode, thread, setOpen, setMode, setThread }
}
