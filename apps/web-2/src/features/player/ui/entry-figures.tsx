import { m } from '#/paraglide/messages'
import type { ActivityState, WorkState } from '#/shared/api/gen/types.gen'
import { formatDateTime, formatPercent } from '#/shared/i18n/format'

import { valueLine } from '../model/value-line'

type Tone = keyof typeof inks

// The state is quiet text in its status ink: a word on the page, not a pill.
const inks = {
  neutral: 'text-muted-foreground',
  success: 'text-success',
  warning: 'text-warning',
  info: 'text-info',
  destructive: 'text-destructive',
}

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

type EntryFiguresProps = {
  entry: ActivityState
  /** Handed in late, or still to do past the due date. */
  late: boolean
  /** Hours left when the work is due within 48 h, else null. */
  soon: number | null
  /** Open work with a grade is a retake: the grade shown is the last one. */
  retake: boolean
}

/** The state word with its warnings, the released grade large, and the deadline: the facts of an entry card. */
export function EntryFigures({ entry, late, soon, retake }: EntryFiguresProps) {
  const status = workStates[entry.state]
  const score =
    typeof entry.score === 'number'
      ? valueLine(
          // Open work with a grade is a retake: the grade is the last one.
          retake
            ? m.player_score_last({ score: formatPercent(entry.score) })
            : m.player_score({ score: formatPercent(entry.score) }),
          formatPercent(entry.score),
        )
      : null
  const due = entry.due_at_unix
    ? valueLine(m.player_due({ date: formatDateTime(entry.due_at_unix) }), formatDateTime(entry.due_at_unix))
    : null
  return (
    <>
      {/* Handed in late, or still to do past the learner's due date: the contents and the course page say so too. */}
      <p className="flex flex-wrap items-baseline gap-x-2 text-sm font-medium">
        <span className={inks[status.tone]}>{status.label()}</span>
        {late ? <span className="text-warning">{m.player_late()}</span> : null}
        {soon === null ? null : <span className="text-warning">{m.player_hours_left({ hours: soon })}</span>}
      </p>
      {score ? (
        <p className="flex flex-row-reverse flex-wrap items-baseline justify-end gap-x-3 tabular-nums">
          <span className="text-sm text-muted-foreground">{score.label}</span>
          {score.value ? <span className="font-heading text-display font-semibold">{score.value}</span> : null}
        </p>
      ) : null}
      {due ? (
        <p className="flex w-full items-baseline justify-between gap-4 border-y py-3 text-sm">
          <span className="text-muted-foreground">{due.label}</span>
          {due.value ? <span className="tabular-nums">{due.value}</span> : null}
        </p>
      ) : null}
    </>
  )
}
