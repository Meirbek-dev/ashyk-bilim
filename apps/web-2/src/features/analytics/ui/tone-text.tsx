import type { ReactNode } from 'react'

import type { StatusTone } from '#/shared/components/status-badge'

const inks: Record<StatusTone, string> = {
  neutral: 'text-muted-foreground',
  info: 'text-info',
  warning: 'text-warning',
  success: 'text-success',
  destructive: 'text-destructive',
}

/** A state as quiet text in its ink: down a column, a pill on every row reads as one alarm. */
export function ToneText({ tone, children }: { tone: StatusTone; children: ReactNode }) {
  return <span className={inks[tone]}>{children}</span>
}
