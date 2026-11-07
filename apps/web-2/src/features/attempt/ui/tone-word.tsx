import type { ReactNode } from 'react'

import type { StatusTone } from '#/shared/components/status-badge'

const inks: Record<StatusTone, string> = {
  neutral: 'text-muted-foreground',
  success: 'text-success',
  warning: 'text-warning',
  info: 'text-info',
  destructive: 'text-destructive',
}

/** A state as a word in its status ink, on the paper: an exam paper is marked, not stickered. */
export function ToneWord({ tone, children }: { tone: StatusTone; children: ReactNode }) {
  return <span className={`font-medium ${inks[tone]}`}>{children}</span>
}
