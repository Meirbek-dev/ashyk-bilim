import type { ReactNode } from 'react'

import { m } from '#/paraglide/messages'
import type { ActivityState, WorkState } from '#/shared/api/gen/types.gen'
import { formatDate, formatNumber } from '#/shared/i18n/format'
import { Badge } from '#/shared/ui/badge'

type Tone = 'neutral' | 'success' | 'warning' | 'info' | 'destructive'

const workStates = {
  not_started: { label: m.player_state_not_started, tone: 'neutral' },
  in_progress: { label: m.player_state_in_progress, tone: 'info' },
  submitted: { label: m.player_state_submitted, tone: 'info' },
  needs_grading: { label: m.player_state_needs_grading, tone: 'info' },
  graded_hidden: { label: m.player_state_graded_hidden, tone: 'info' },
  returned: { label: m.player_state_returned, tone: 'warning' },
  passed: { label: m.player_state_passed, tone: 'success' },
  failed: { label: m.player_state_failed, tone: 'destructive' },
  complete: { label: m.player_done, tone: 'success' },
  locked: { label: m.player_state_locked, tone: 'neutral' },
} satisfies Record<WorkState, { label: () => string; tone: Tone }>

/** Graded work's entry: the work state, deadline and score from the learner state; the action sits below it. */
export function EntryCard({ entry, action }: { entry: ActivityState; action: ReactNode }) {
  const status = workStates[entry.state]
  return (
    <div className="flex flex-col items-start gap-4 rounded-lg border bg-card p-gutter text-card-foreground">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <Badge tone={status.tone}>{status.label()}</Badge>
        {entry.is_late ? <Badge tone="warning">{m.player_late()}</Badge> : null}
      </div>
      {entry.due_at_unix || typeof entry.score === 'number' ? (
        <ul className="flex flex-col gap-1 text-sm text-muted-foreground">
          {entry.due_at_unix ? <li>{m.player_due({ date: formatDate(entry.due_at_unix) })}</li> : null}
          {typeof entry.score === 'number' ? (
            <li className="tabular-nums">{m.player_score({ score: formatNumber(entry.score) })}</li>
          ) : null}
        </ul>
      ) : null}
      {action}
    </div>
  )
}
