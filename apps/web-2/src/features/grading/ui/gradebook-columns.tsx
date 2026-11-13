import { m } from '#/paraglide/messages'
import type { GradebookSummary } from '#/shared/api/gen/types.gen'

import type { GradebookColumn, GradebookRow } from '../model/gradebook'
import { GradebookLine } from './gradebook-line'
import { ACTIVITY, LEARNER, REST, TOTAL } from './gradebook-layout'
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
 * the top while the box scrolls under them, a phone included; hairlines between rows, as every table of the app. The
 * columns keep their own width and what is left of the page stays empty at the right. The box is a named, focusable
 * region, so it scrolls by keyboard.
 */
export function GradebookTable({ courseId, label, rows, activities, summary }: GradebookTableProps) {
  // A column lines up on the decimal point only when its learners' grades have fractions: an average alone («53,75 %»
  // under a column of whole numbers) ends flush with them instead of pushing every figure off the column's edge.
  const totalSlot = hasFraction(rows.map(row => row.total?.score))
  const averageOf = (activityId: string) => summary?.columns.find(c => c.activity_id === activityId)?.average ?? null
  const slots = new Map(
    activities.map(({ activityId }) => [
      activityId,
      hasFraction(rows.map(row => row.cells.get(activityId)?.final_score)),
    ]),
  )
  return (
    <section
      // oxlint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- a scrollable region must be reachable by keyboard (axe scrollable-region-focusable)
      tabIndex={0}
      aria-label={label}
      className="relative max-h-[calc(100dvh-6rem)] overflow-auto"
    >
      {/* oxlint-disable-next-line react/forbid-elements -- frozen head, learner and total columns need sticky cells of a native table, which DataTable does not offer. */}
      <table
        // No activity yet: the total ends the figures, so the frozen pane's edge has nothing to part.
        className={`w-max min-w-full border-separate border-spacing-0 text-sm ${activities.length === 0 ? '@3xl:[&_:is(td,th)]:border-r-0' : ''}`}
      >
        <caption className="sr-only">{label}</caption>
        <thead>
          <tr className="[&>*]:sticky [&>*]:top-0 [&>*]:border-b [&>*]:bg-background [&>th]:pt-2.5 [&>th]:pb-2 [&>th]:align-bottom [&>th]:text-xs [&>th]:font-medium [&>th]:text-muted-foreground">
            <th scope="col" className={`${LEARNER} z-30`}>
              {m.grading_col_learner()}
            </th>
            <th scope="col" className={`${TOTAL} z-20 @3xl:z-30`}>
              {m.grading_col_total()}
            </th>
            {activities.map(column => (
              <th key={column.activityId} scope="col" className={`${ACTIVITY} z-20`}>
                {/* A long activity name keeps the head at three lines; the whole of it is the tooltip. */}
                <span className="line-clamp-3 wrap-anywhere" title={column.title}>
                  {column.title}
                </span>
              </th>
            ))}
            <td aria-hidden className={`${REST} z-20`} />
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
            <tr className="[&>*]:sticky [&>*]:bottom-0 [&>*]:border-t [&>*]:bg-background [&>*]:py-2.5 [&>*]:align-baseline">
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
              <td aria-hidden className={REST} />
            </tr>
          </tfoot>
        ) : null}
      </table>
    </section>
  )
}
