import { m } from '#/paraglide/messages'
import type { GradebookSummary } from '#/shared/api/gen/types.gen'
import type { DataColumn } from '#/shared/components/data-columns'

import type { GradebookColumn, GradebookRow } from '../model/gradebook'
import { GradebookCell } from './gradebook-cell'
import { scoreText } from './labels'

const learnerName = (row: GradebookRow) => row.user.display_name || row.user.username

/**
 * The learner, their course total (B-GRD-37), then one column per graded activity. At narrow width each learner is a
 * card with a line per activity (priority 2), the phone fallback of B-GRD-21.
 */
export const gradebookTableColumns = (courseId: string, activities: readonly GradebookColumn[]) => [
  {
    id: 'learner',
    header: m.grading_col_learner(),
    priority: 1,
    // The @username under the name: real rosters hold namesakes (two «Аида Солтангазинова» in one course).
    cell: (row: GradebookRow) => (
      <span className="flex flex-col">
        <span className="wrap-anywhere">{learnerName(row)}</span>
        <span className="text-xs font-normal wrap-anywhere text-muted-foreground">@{row.user.username}</span>
      </span>
    ),
  } satisfies DataColumn<GradebookRow>,
  {
    id: 'total',
    header: m.grading_col_total(),
    priority: 2,
    cell: (row: GradebookRow) => (
      <span className="flex flex-col">
        <Score value={row.total?.score ?? null} />
        {row.total && row.total.missing > 0 ? (
          <span className="text-xs text-muted-foreground">{m.grading_total_missing({ count: row.total.missing })}</span>
        ) : null}
      </span>
    ),
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

/** The average row under the table (B-GRD-37): «Среднее», the mean course total, each column's mean grade. */
export const gradebookFooter = (summary: GradebookSummary) => (column: DataColumn<GradebookRow>) => {
  if (column.id === 'learner') return m.grading_average()
  const average =
    column.id === 'total'
      ? summary.course_average
      : (summary.columns.find(c => c.activity_id === column.id)?.average ?? null)
  return <Score value={average} />
}

/** A percent, or a quiet dash read as «Нет оценки» (most rows of a real course have nothing graded yet). */
function Score({ value }: { value: number | null }) {
  return value === null ? (
    <span className="text-muted-foreground">
      <span aria-hidden>—</span>
      <span className="sr-only">{m.grading_no_score()}</span>
    </span>
  ) : (
    <span className="font-medium tabular-nums">{scoreText(value)}</span>
  )
}
