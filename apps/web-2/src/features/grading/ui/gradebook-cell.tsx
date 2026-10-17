import { Link as RouterLink } from '@tanstack/react-router'

import { m } from '#/paraglide/messages'
import type { GradebookCell as Cell } from '#/shared/api/gen/types.gen'
import { StatusBadge } from '#/shared/components/status-badge'
import { linkVariants } from '#/shared/components/link-variants'
import { formatNumber } from '#/shared/i18n/format'

import { reviewTarget, waitingNote } from '../model/gradebook'
import { scoreText, statusMeta } from './labels'

type GradebookCellProps = { courseId: string; cell: Cell | undefined; learner: string; activity: string }

/**
 * One learner x activity: status and grade, late and the number of attempts (B-GRD-33), a link into the review of the
 * work waiting first (B-GRD-19).
 */
export function GradebookCell({ courseId, cell, learner, activity }: GradebookCellProps) {
  if (!cell) return <span className="text-muted-foreground">{m.grading_cell_none()}</span>
  const target = reviewTarget(cell)
  const status = statusMeta[cell.status]
  const note = waitingNote(cell)
  const content = (
    <span className="flex flex-wrap items-center gap-2">
      <span className="tabular-nums">{scoreText(cell.final_score)}</span>
      <StatusBadge tone={status.tone}>{status.label()}</StatusBadge>
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
  )
  if (!target) return content
  return (
    <RouterLink
      to="/teach/courses/$courseId/activities/$activityId/submissions/$submissionId"
      params={{ courseId, activityId: cell.activity_id, submissionId: target }}
      className={linkVariants.text}
    >
      <span className="sr-only">{m.grading_cell_link({ learner, activity })} </span>
      {content}
    </RouterLink>
  )
}
