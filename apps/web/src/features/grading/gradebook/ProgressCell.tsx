'use client'

import { Badge } from '@/components/ui/badge'
import { LmsStatusBadge, LmsStatuses } from '@/features/lms-status'
import SubmissionStatusBadge from '@/features/assessments/shared/components/SubmissionStatusBadge'
import { formatGradebookStateKey } from '@/features/grading/domain'
import { usePercentFormat } from '@/features/assessments/shared/usePercentFormat'
import type { ActivityProgressCell, SubmissionStatus } from '@/features/grading/domain'
import { cn } from '@/lib/utils'

interface ProgressCellProps {
  cell: ActivityProgressCell
  actionRequiredLabel: string
  attemptsLabel: string
  lateLabel: string
  stateLabel: string
  onOpen: () => void
}

const SUBMISSION_STATUSES = new Set(['DRAFT', 'PENDING', 'GRADED', 'PUBLISHED', 'RETURNED'])

export default function ProgressCell({
  cell,
  actionRequiredLabel,
  attemptsLabel,
  lateLabel,
  stateLabel,
  onOpen,
}: ProgressCellProps) {
  // UX-105: one score, one rendering — the shared percent format («90,25%»)
  // the review list and the CSV agree on, not a rounded «90%».
  const percent = usePercentFormat()
  const canOpen = Boolean(cell.latest_submission_uuid)
  // The submission badge adds nothing when it names the same state as the
  // progress badge («Оценено Оценено» on a graded exam).
  const submissionStatus =
    isSubmissionStatus(cell.latest_submission_status) && cell.latest_submission_status !== cell.state
      ? cell.latest_submission_status
      : null

  return (
    <div
      role={canOpen ? 'button' : undefined}
      tabIndex={canOpen ? 0 : undefined}
      aria-disabled={!canOpen}
      aria-label={`${stateLabel}. ${attemptsLabel}`}
      onClick={onOpen}
      onKeyDown={event => {
        if (event.key === 'Enter' || event.key === ' ') onOpen()
      }}
      className={cn(
        'h-full w-full rounded-md border p-2 text-left transition-colors',
        canOpen ? 'cursor-pointer hover:bg-muted/60' : 'cursor-default',
        'bg-card text-card-foreground',
      )}
    >
      {cell.teacher_action_required ? (
        <div className="mb-2 flex items-center justify-end">
          <Badge variant="warning">{actionRequiredLabel}</Badge>
        </div>
      ) : null}
      <div className="flex flex-wrap items-center gap-2">
        {submissionStatus ? <SubmissionStatusBadge status={submissionStatus} /> : null}
        <LmsStatusBadge status={mapProgressStateToLmsStatus(cell.state)} label={stateLabel} />
      </div>
      <div className="mt-1 flex items-center gap-2 text-xs">
        <span>{cell.score === null || cell.score === undefined ? '--' : percent(cell.score)}</span>
        {cell.is_late ? <Badge variant="destructive">{lateLabel}</Badge> : null}
      </div>
      <div className="mt-1 text-[11px] opacity-80">{attemptsLabel}</div>
    </div>
  )
}

export function progressStateLabelKey(state: ActivityProgressCell['state']) {
  return `states.${formatGradebookStateKey(state)}`
}

function isSubmissionStatus(value: string | null | undefined): value is SubmissionStatus {
  return Boolean(value && SUBMISSION_STATUSES.has(value))
}

function mapProgressStateToLmsStatus(state: ActivityProgressCell['state']) {
  switch (state) {
    case 'PASSED':
    case 'COMPLETED':
    case 'GRADED': {
      return LmsStatuses.READY
    }
    case 'SUBMITTED':
    case 'NEEDS_GRADING': {
      return LmsStatuses.NEEDS_ATTENTION
    }
    case 'RETURNED':
    case 'FAILED': {
      return LmsStatuses.BLOCKED
    }
    case 'IN_PROGRESS': {
      return LmsStatuses.IN_PROGRESS
    }
    case 'NOT_STARTED': {
      return LmsStatuses.DRAFT
    }
    default: {
      return LmsStatuses.DRAFT
    }
  }
}
