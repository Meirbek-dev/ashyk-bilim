import type { ReactNode } from 'react'

import type { StatusTone } from '#/shared/components/status-badge'

const inks = {
  neutral: 'text-muted-foreground',
  success: 'text-success',
  warning: 'text-warning',
  info: 'text-info',
  destructive: 'text-destructive',
} satisfies Record<StatusTone, string>

/** A status in a typeset row: the word in its tone (DESIGN 9: a list's usual state is quiet text, not a column of pills). */
export function StatusText({ tone, children }: { tone: StatusTone; children: ReactNode }) {
  return <span className={inks[tone]}>{children}</span>
}
