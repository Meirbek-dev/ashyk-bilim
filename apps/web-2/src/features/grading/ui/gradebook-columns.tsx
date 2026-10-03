import { m } from '#/paraglide/messages'
import type { DataColumn } from '#/shared/components/data-columns'

import type { GradebookColumn, GradebookRow } from '../model/gradebook'
import { GradebookCell } from './gradebook-cell'

const learnerName = (row: GradebookRow) => row.user.display_name || row.user.username

/**
 * The learner, then one column per graded activity. At narrow width each learner is a card with a line per activity
 * (priority 2), the phone fallback of B-GRD-21.
 */
export const gradebookTableColumns = (courseId: string, activities: readonly GradebookColumn[]) => [
  {
    id: 'learner',
    header: m.grading_col_learner(),
    priority: 1,
    cell: (row: GradebookRow) => <span className="wrap-anywhere">{learnerName(row)}</span>,
  } satisfies DataColumn<GradebookRow>,
  ...activities.map((column): DataColumn<GradebookRow> => ({
    id: column.activityId,
    header: column.title,
    priority: 2,
    cell: row => (
      <GradebookCell
        courseId={courseId}
        cell={row.cells.get(column.activityId)}
        learner={learnerName(row)}
        activity={column.title}
      />
    ),
  })),
]
