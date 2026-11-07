import type { ReactNode } from 'react'

import { Badge } from '#/shared/ui/badge'

const tones = {
  neutral: 'border-transparent bg-secondary text-secondary-foreground',
  success: 'border-transparent bg-success/10 text-success',
  warning: 'border-transparent bg-warning/10 text-warning',
  info: 'border-transparent bg-info/10 text-info',
  // No tint: destructive is set by themes, and its /10 tint drops below 4.5:1 in some dark themes (G-15).
  destructive: 'border-destructive/30 bg-transparent text-destructive',
}

export type StatusTone = keyof typeof tones

/** A status label on the stock Badge. Features map their status enum with `Record<Status, { label, tone }>`. */
export function StatusBadge({ tone, children }: { tone: StatusTone; children: ReactNode }) {
  return (
    <Badge variant="outline" className={tones[tone]}>
      {children}
    </Badge>
  )
}
