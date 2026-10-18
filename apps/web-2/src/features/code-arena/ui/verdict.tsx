import { CircleCheck, CircleDashed, CircleX, Info, TriangleAlert, type LucideIcon } from 'lucide-react'

import type { StatusTone } from '#/shared/components/status-badge'

const looks = {
  success: { icon: CircleCheck, ink: 'text-success' },
  destructive: { icon: CircleX, ink: 'text-destructive' },
  warning: { icon: TriangleAlert, ink: 'text-warning' },
  info: { icon: Info, ink: 'text-info' },
  neutral: { icon: CircleDashed, ink: 'text-muted-foreground' },
} satisfies Record<StatusTone, { icon: LucideIcon; ink: string }>

/**
 * A verdict or attempt state as an icon and its word in the status color (DESIGN 3: the word is the second channel).
 * Quieter than a badge: a run list is a column of verdicts, not a column of pills.
 */
export function Verdict({ status }: { status: { label: () => string; tone: StatusTone } }) {
  const look = looks[status.tone]
  return (
    <span className={`inline-flex items-center gap-1.5 font-medium ${look.ink}`}>
      <look.icon aria-hidden className="size-4 shrink-0" />
      {status.label()}
    </span>
  )
}
