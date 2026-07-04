'use client'

import { useMemo } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'

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
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const open = searchParams.get('ai') === 'open'
  const mode = (searchParams.get('aiMode') as ActivityAIMode | null) ?? defaultMode
  const thread = searchParams.get('aiThread') ?? searchParams.get('thread')

  const params = useMemo(() => new URLSearchParams(searchParams.toString()), [searchParams])

  function replace(nextParams: URLSearchParams) {
    const query = nextParams.toString()
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false })
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
