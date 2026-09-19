'use client'

import { TableCell } from '@/components/ui/table'
import ProgressCell, { progressStateLabelKey } from './ProgressCell'
import type { ActivityProgressCell } from '@/features/grading/domain'

export default function GradebookActivityCell({
  cell,
  labels,
  onOpen,
}: {
  cell: ActivityProgressCell
  labels: {
    actionRequired: string
    attempts: string
    late: string
    state: string
    pendingAttempt?: string | null
  }
  onOpen: () => void
}) {
  return (
    <TableCell className="h-24 align-top">
      <ProgressCell
        cell={cell}
        actionRequiredLabel={labels.actionRequired}
        attemptsLabel={labels.attempts}
        lateLabel={labels.late}
        stateLabel={labels.state}
        pendingAttemptLabel={labels.pendingAttempt}
        onOpen={onOpen}
      />
    </TableCell>
  )
}

export { progressStateLabelKey }
