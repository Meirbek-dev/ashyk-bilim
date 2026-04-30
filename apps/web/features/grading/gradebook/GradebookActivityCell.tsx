'use client';

import { TableCell } from '@/components/ui/table';
import ProgressCell, { progressStateLabelKey } from './ProgressCell';
import type { ActivityProgressCell } from '@/features/grading/domain';

export default function GradebookActivityCell({
  cell,
  selected,
  labels,
  onOpen,
  onSelect,
}: {
  cell: ActivityProgressCell;
  selected: boolean;
  labels: {
    actionRequired: string;
    attempts: string;
    late: string;
    selectCell: string;
    state: string;
  };
  onOpen: () => void;
  onSelect: (checked: boolean) => void;
}) {
  return (
    <TableCell className="h-24 align-top">
      <ProgressCell
        cell={cell}
        selected={selected}
        actionRequiredLabel={labels.actionRequired}
        attemptsLabel={labels.attempts}
        lateLabel={labels.late}
        selectLabel={labels.selectCell}
        stateLabel={labels.state}
        onOpen={onOpen}
        onSelect={onSelect}
      />
    </TableCell>
  );
}

export { progressStateLabelKey };
