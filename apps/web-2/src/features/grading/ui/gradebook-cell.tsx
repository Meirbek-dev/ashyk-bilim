import { Link as RouterLink } from '@tanstack/react-router'

import { m } from '#/paraglide/messages'
import type { GradebookCell as Cell } from '#/shared/api/gen/types.gen'
import { linkVariants } from '#/shared/components/link-variants'
import { formatNumber } from '#/shared/i18n/format'

import { reviewTarget, waitingNote } from '../model/gradebook'
import { statusMeta } from './labels'
import { ScoreFigure } from './score-figure'
import { StatusText } from './status-text'

type GradebookCellProps = {
  courseId: string
  cell: Cell | undefined
  learner: string
  activity: string
  /** The column has fractions: the figure keeps the slot that lines them up. */
  slot?: boolean
}

/**
 * One learner x activity: grade and status, late and the number of attempts (B-GRD-33), a link into the review of the
 * work waiting first (B-GRD-19). The figure holds the column; what is unusual about it hangs under it in small type, so
 * a row keeps one baseline however much a cell has to say. A published grade is the usual state: the grade alone.
 */
export function GradebookCell({ courseId, cell, learner, activity, slot = false }: GradebookCellProps) {
  if (!cell)
    return (
      <span className="text-muted-foreground">
        <span aria-hidden>—</span>
        <span className="sr-only">{m.grading_cell_none()}</span>
      </span>
    )
  const target = reviewTarget(cell)
  const status = statusMeta[cell.status]
  const note = waitingNote(cell)
  const content = (
    <span className="flex flex-col items-end gap-0.5">
      <span className={target ? linkVariants.title : undefined}>
        <ScoreFigure score={cell.final_score} slot={slot} />
      </span>
      <span className="flex flex-col items-end text-xs empty:hidden">
        {cell.status === 'published' ? (
          <span className="sr-only">{status.label()}</span>
        ) : (
          // A grade not yet published is a state, not an alarm: only what waits for the teacher keeps its ink.
          <StatusText tone={cell.status === 'graded' ? 'neutral' : status.tone}>{status.label()}</StatusText>
        )}
        {cell.is_late ? <StatusText tone="warning">{m.grading_late()}</StatusText> : null}
        {cell.attempts > 1 ? (
          <span className="text-muted-foreground tabular-nums">
            {m.grading_cell_attempts({ count: formatNumber(cell.attempts) })}
          </span>
        ) : null}
        {note ? (
          <span className="text-muted-foreground">
            {note === 'release' ? m.grading_cell_waiting_release() : m.grading_cell_waiting()}
          </span>
        ) : null}
      </span>
    </span>
  )
  if (!target) return content
  return (
    <RouterLink
      to="/teach/courses/$courseId/activities/$activityId/submissions/$submissionId"
      params={{ courseId, activityId: cell.activity_id, submissionId: target }}
      search={{ from: 'gradebook' }}
      className="block rounded-sm"
    >
      <span className="sr-only">{m.grading_cell_link({ learner, activity })} </span>
      {content}
    </RouterLink>
  )
}
