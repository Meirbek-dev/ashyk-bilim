import { m } from '#/paraglide/messages'

import type { GradebookColumn, GradebookRow } from '../model/gradebook'
import { GradebookCell } from './gradebook-cell'
import { ACTIVITY, learnerName, LEARNER, ROW_CELL, TOTAL } from './gradebook-layout'
import { ScoreFigure } from './score-figure'

type GradebookLineProps = {
  courseId: string
  row: GradebookRow
  activities: readonly GradebookColumn[]
  /** Decimal slot of the total column and of each activity column, so the figures line up. */
  totalSlot: boolean
  slots: ReadonlyMap<string, boolean>
}

/** One learner's row of the gradebook: the name, the course total, then a cell per activity. */
export function GradebookLine({ courseId, row, activities, totalSlot, slots }: GradebookLineProps) {
  return (
    <tr className="group/row">
      {/* The @username under the name: real rosters hold namesakes (two «Аида Солтангазинова» in one course). */}
      <th scope="row" className={`${LEARNER} ${ROW_CELL} z-10 font-normal`}>
        <span className="block font-medium wrap-anywhere">{learnerName(row)}</span>
        <span className="block text-xs wrap-anywhere text-muted-foreground">@{row.user.username}</span>
      </th>
      <td className={`${TOTAL} ${ROW_CELL} @3xl:z-10`}>
        <span className="font-heading text-base">
          <ScoreFigure score={row.total?.score ?? null} slot={totalSlot} />
        </span>
        {row.total && row.total.missing > 0 ? (
          <span className="block text-xs text-muted-foreground">
            {m.grading_total_missing({ count: row.total.missing })}
          </span>
        ) : null}
      </td>
      {activities.map(column => (
        <td key={column.activityId} className={`${ACTIVITY} ${ROW_CELL}`}>
          <GradebookCell
            courseId={courseId}
            cell={row.cells.get(column.activityId)}
            learner={learnerName(row)}
            activity={column.title}
            slot={slots.get(column.activityId) ?? false}
          />
        </td>
      ))}
    </tr>
  )
}
