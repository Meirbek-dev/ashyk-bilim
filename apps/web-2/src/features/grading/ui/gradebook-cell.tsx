import { Link as RouterLink } from '@tanstack/react-router'

import { m } from '#/paraglide/messages'
import type { GradebookCell as Cell } from '#/shared/api/gen/types.gen'
import { StatusBadge } from '#/shared/components/status-badge'
import { linkVariants } from '#/shared/components/link-variants'
import { formatNumber } from '#/shared/i18n/format'
import { cn } from '#/shared/lib/utils'

import { reviewTarget, waitingNote } from '../model/gradebook'
import { scoreText, statusMeta } from './labels'

type GradebookCellProps = { courseId: string; cell: Cell | undefined; learner: string; activity: string }

/**
 * One learner x activity: grade and status, late and the number of attempts (B-GRD-33), a link into the review of the
 * work waiting first (B-GRD-19). A published grade is the usual state: the grade alone, a badge only for the rest.
 */
export function GradebookCell({ courseId, cell, learner, activity }: GradebookCellProps) {
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
  const content = (link: boolean) => (
    // The score on its own line, the badges under it: wrapped inline they sat beside the score in one row and under
    // it in the next, depending on the column's width.
    <span className="flex flex-col items-start gap-1">
      <span className={cn('tabular-nums', link && linkVariants.text)}>{scoreText(cell.final_score)}</span>
      <span className="flex flex-wrap items-center gap-1 empty:hidden">
        {cell.status === 'published' ? (
          <span className="sr-only">{status.label()}</span>
        ) : (
          <StatusBadge tone={status.tone}>{status.label()}</StatusBadge>
        )}
        {cell.is_late ? <StatusBadge tone="warning">{m.grading_late()}</StatusBadge> : null}
        {cell.attempts > 1 ? (
          <span className="text-xs text-muted-foreground tabular-nums">
            {m.grading_cell_attempts({ count: formatNumber(cell.attempts) })}
          </span>
        ) : null}
        {note ? (
          <span className="text-xs text-muted-foreground">
            {note === 'release' ? m.grading_cell_waiting_release() : m.grading_cell_waiting()}
          </span>
        ) : null}
      </span>
    </span>
  )
  if (!target) return content(false)
  return (
    <RouterLink
      to="/teach/courses/$courseId/activities/$activityId/submissions/$submissionId"
      params={{ courseId, activityId: cell.activity_id, submissionId: target }}
      search={{ from: 'gradebook' }}
      className="rounded-sm"
    >
      <span className="sr-only">{m.grading_cell_link({ learner, activity })} </span>
      {content(true)}
    </RouterLink>
  )
}
