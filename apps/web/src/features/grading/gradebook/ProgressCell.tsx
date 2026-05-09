'use client';

import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import SubmissionStatusBadge from '@/features/assessments/shared/components/SubmissionStatusBadge';
import { ACTIVITY_PROGRESS_STATE_CLASSES, formatGradebookStateKey } from '@/features/grading/domain';
import type { ActivityProgressCell, SubmissionStatus } from '@/features/grading/domain';
import { cn } from '@/lib/utils';

interface ProgressCellProps {
  cell: ActivityProgressCell;
  selected: boolean;
  actionRequiredLabel: string;
  attemptsLabel: string;
  lateLabel: string;
  selectLabel: string;
  stateLabel: string;
  onSelect: (checked: boolean) => void;
  onOpen: () => void;
}

const SUBMISSION_STATUSES = new Set(['DRAFT', 'PENDING', 'GRADED', 'PUBLISHED', 'RETURNED']);

export default function ProgressCell({
  cell,
  selected,
  actionRequiredLabel,
  attemptsLabel,
  lateLabel,
  selectLabel,
  stateLabel,
  onSelect,
  onOpen,
}: ProgressCellProps) {
  const canOpen = Boolean(cell.latest_submission_uuid);
  const submissionStatus = isSubmissionStatus(cell.latest_submission_status) ? cell.latest_submission_status : null;

  return (
    <div
      role={canOpen ? 'button' : undefined}
      tabIndex={canOpen ? 0 : undefined}
      aria-disabled={!canOpen}
      aria-label={`${stateLabel}. ${attemptsLabel}`}
      onClick={onOpen}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') onOpen();
      }}
      className={cn(
        'h-full w-full rounded-md border p-2 text-left transition-colors',
        canOpen ? 'cursor-pointer hover:bg-muted/60' : 'cursor-default',
        ACTIVITY_PROGRESS_STATE_CLASSES[cell.state],
        selected && 'ring-ring ring-2',
      )}
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <Checkbox
          checked={selected}
          onCheckedChange={(checked) => onSelect(checked)}
          onClick={(event) => event.stopPropagation()}
          aria-label={selectLabel}
        />
        {cell.teacher_action_required ? <Badge variant="warning">{actionRequiredLabel}</Badge> : null}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {submissionStatus ? <SubmissionStatusBadge status={submissionStatus} /> : null}
        <span className="truncate text-xs font-semibold">{stateLabel}</span>
      </div>
      <div className="mt-1 flex items-center gap-2 text-xs">
        <span>{cell.score === null || cell.score === undefined ? '--' : `${Math.round(cell.score)}%`}</span>
        {cell.is_late ? <span className="font-medium text-rose-700">{lateLabel}</span> : null}
      </div>
      <div className="mt-1 text-[11px] opacity-80">{attemptsLabel}</div>
    </div>
  );
}

export function progressStateLabelKey(state: ActivityProgressCell['state']) {
  return `states.${formatGradebookStateKey(state)}`;
}

function isSubmissionStatus(value: string | null | undefined): value is SubmissionStatus {
  return Boolean(value && SUBMISSION_STATUSES.has(value));
}
