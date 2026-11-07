import { m } from '#/paraglide/messages'
import type { GradebookSummary } from '#/shared/api/gen/types.gen'

import type { GradebookColumn, GradebookRow } from '../model/gradebook'
import { GradebookLine } from './gradebook-line'
import { ACTIVITY, LEARNER, TOTAL } from './gradebook-layout'
import { hasFraction, ScoreFigure } from './score-figure'

type GradebookTableProps = {
  courseId: string
  label: string
  rows: readonly GradebookRow[]
  activities: readonly GradebookColumn[]
  summary: GradebookSummary | null | undefined
}

/**
 * The gradebook as a table set for reading (B-GRD-19..21, B-GRD-37): the learner stays at the left edge and the heads at
 * the top while the box scrolls under them, a phone included; figures on the decimal point, hairlines between rows, a
 * rule under the head and over the averages. The box is a named, focusable region, so it scrolls by keyboard.
 */
export function GradebookTable({ courseId, label, rows, activities, summary }: GradebookTableProps) {
  const totalSlot = hasFraction([...rows.map(row => row.total?.score), summary?.course_average])
  const averageOf = (activityId: string) => summary?.columns.find(c => c.activity_id === activityId)?.average ?? null
  const slots = new Map(
    activities.map(({ activityId }) => [
      activityId,
      hasFraction([...rows.map(row => row.cells.get(activityId)?.final_score), averageOf(activityId)]),
    ]),
  )
  return (
    <section
      // oxlint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- a scrollable region must be reachable by keyboard (axe scrollable-region-focusable)
      tabIndex={0}
      aria-label={label}
      className="relative max-h-[calc(100dvh-6rem)] overflow-auto border-t border-foreground/50"
    >
      {/* oxlint-disable-next-line react/forbid-elements -- frozen head, learner and total columns need sticky cells of a native table, which DataTable does not offer. */}
      <table className="w-max min-w-full border-separate border-spacing-0 text-sm">
        <caption className="sr-only">{label}</caption>
        <thead>
          <tr className="[&>th]:sticky [&>th]:top-0 [&>th]:border-b [&>th]:border-b-foreground/50 [&>th]:bg-background [&>th]:pt-2.5 [&>th]:pb-2 [&>th]:align-bottom [&>th]:text-xs [&>th]:font-medium [&>th]:text-muted-foreground">
            <th scope="col" className={`${LEARNER} z-30`}>
              {m.grading_col_learner()}
            </th>
            <th scope="col" className={`${TOTAL} z-20 @3xl:z-30`}>
              {m.grading_col_total()}
            </th>
            {activities.map(column => (
              <th key={column.activityId} scope="col" className={`${ACTIVITY} z-20`}>
                {column.title}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map(row => (
            <GradebookLine
              key={row.user.id}
              courseId={courseId}
              row={row}
              activities={activities}
              totalSlot={totalSlot}
              slots={slots}
            />
          ))}
        </tbody>
        {summary ? (
          // The average row (B-GRD-37): «Среднее», the mean course total, each column's mean grade. It stays in sight.
          <tfoot>
            <tr className="[&>*]:sticky [&>*]:bottom-0 [&>*]:border-t [&>*]:border-t-foreground/50 [&>*]:bg-background [&>*]:py-2.5 [&>*]:align-baseline">
              <th scope="row" className={`${LEARNER} z-30 font-medium`}>
                {m.grading_average()}
              </th>
              <td className={`${TOTAL} z-20 @3xl:z-30`}>
                <span className="font-heading text-base">
                  <ScoreFigure score={summary.course_average} slot={totalSlot} />
                </span>
              </td>
              {activities.map(column => (
                <td key={column.activityId} className={`${ACTIVITY} z-20`}>
                  <ScoreFigure score={averageOf(column.activityId)} slot={slots.get(column.activityId) ?? false} />
                </td>
              ))}
            </tr>
          </tfoot>
        ) : null}
      </table>
    </section>
  )
}
