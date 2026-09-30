'use client'

import { formatGradebookStateKey } from '@/features/grading/domain'
import { usePercentFormat } from '@/features/assessments/shared/usePercentFormat'
import type { ActivityProgressCell } from '@/features/grading/domain'
import { cn } from '@/lib/utils'

interface ProgressCellProps {
  cell: ActivityProgressCell
  actionRequiredLabel: string
  attemptsLabel: string
  lateLabel: string
  stateLabel: string
  /** BUG-175: «На проверке · попытка N» when a newer attempt waits behind the grade of record. */
  pendingAttemptLabel?: string | null | undefined
  onOpen: () => void
}

export default function ProgressCell({
  cell,
  actionRequiredLabel,
  attemptsLabel,
  lateLabel,
  stateLabel,
  pendingAttemptLabel,
  onOpen,
}: ProgressCellProps) {
  // UX-105: one score, one rendering — the shared percent format («90,25%»)
  // the review list and the CSV agree on, not a rounded «90%».
  const percent = usePercentFormat()
  const canOpen = Boolean(cell.latest_submission_uuid)
  const details = [
    stateLabel,
    attemptsLabel,
    cell.is_late ? lateLabel : null,
    cell.teacher_action_required ? (pendingAttemptLabel ?? actionRequiredLabel) : null,
  ]
    .filter(Boolean)
    .join(' · ')

  // One glanceable tile per learner × activity: score on top, state below, colour = state.
  // Everything else (attempts, submission status, pending attempt) is in the tooltip.
  return (
    <div
      role={canOpen ? 'button' : undefined}
      tabIndex={canOpen ? 0 : undefined}
      aria-disabled={!canOpen}
      aria-label={details}
      title={details}
      onClick={onOpen}
      onKeyDown={event => {
        if (event.key === 'Enter' || event.key === ' ') onOpen()
      }}
      className={cn(
        'flex min-h-10 w-full flex-col justify-center rounded-md px-2 py-1 text-left text-xs transition-colors',
        STATE_TONE[cell.state] ?? 'text-muted-foreground',
        canOpen ? 'cursor-pointer hover:brightness-95' : 'cursor-default',
      )}
    >
      <span className="flex items-center justify-between gap-1">
        <span className="font-semibold tabular-nums">
          {cell.score === null || cell.score === undefined ? '—' : percent(cell.score)}
        </span>
        <span className="flex items-center gap-1">
          {cell.is_late ? <span className="text-destructive font-bold">!</span> : null}
          {cell.teacher_action_required ? <span className="size-2 rounded-full bg-amber-500" aria-hidden /> : null}
        </span>
      </span>
      <span className="truncate text-[11px] opacity-80">{stateLabel}</span>
    </div>
  )
}

const STATE_TONE: Partial<Record<ActivityProgressCell['state'], string>> = {
  PASSED: 'bg-emerald-500/10 text-emerald-800 dark:text-emerald-300',
  COMPLETED: 'bg-emerald-500/10 text-emerald-800 dark:text-emerald-300',
  GRADED: 'bg-emerald-500/10 text-emerald-800 dark:text-emerald-300',
  SUBMITTED: 'bg-amber-500/10 text-amber-900 dark:text-amber-300',
  NEEDS_GRADING: 'bg-amber-500/10 text-amber-900 dark:text-amber-300',
  RETURNED: 'bg-red-500/10 text-red-800 dark:text-red-300',
  FAILED: 'bg-red-500/10 text-red-800 dark:text-red-300',
  IN_PROGRESS: 'bg-sky-500/10 text-sky-900 dark:text-sky-300',
}

export function progressStateLabelKey(state: ActivityProgressCell['state']) {
  return `states.${formatGradebookStateKey(state)}`
}
