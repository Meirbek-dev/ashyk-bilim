import { m } from '#/paraglide/messages'
import type { ContentBottleneckRow } from '#/shared/api/gen/types.gen'
import type { DataColumn } from '#/shared/components/data-columns'
import { DataTable } from '#/shared/components/data-table'
import { formatNumber, formatPercent } from '#/shared/i18n/format'

import { bottleneckLabel } from '../model/signals'

const course: DataColumn<ContentBottleneckRow> = {
  id: 'course',
  header: m.analytics_col_course(),
  priority: 2,
  wrap: true,
  cell: row => row.course_name,
}

const columns = (withCourse: boolean): DataColumn<ContentBottleneckRow>[] => [
  {
    id: 'activity',
    header: m.analytics_col_activity(),
    priority: 1,
    cell: row => <span className="font-medium">{row.activity_name}</span>,
  },
  ...(withCourse ? [course] : []),
  { id: 'signal', header: m.analytics_col_signal(), priority: 2, wrap: true, cell: row => bottleneckLabel(row.signal) },
  {
    id: 'completion',
    header: m.analytics_col_completion(),
    priority: 2,
    cell: row => (
      <span className="tabular-nums">{row.completion_rate === null ? '-' : formatPercent(row.completion_rate)}</span>
    ),
  },
  {
    id: 'exits',
    header: m.analytics_col_exits(),
    priority: 3,
    cell: row => <span className="tabular-nums">{formatNumber(row.exit_count)}</span>,
  },
]

/** Activities where learners stall (B-ANL-27, B-ANL-30): signal, completion, exits; nothing when there are none. */
export function BottlenecksTable({ rows, withCourse }: { rows: ContentBottleneckRow[]; withCourse: boolean }) {
  if (rows.length === 0) return null
  return (
    <section className="flex flex-col gap-4">
      <h3 className="text-lg font-semibold">{m.analytics_bottlenecks_title()}</h3>
      <DataTable
        label={m.analytics_bottlenecks_title()}
        rows={rows}
        columns={columns(withCourse)}
        getKey={row => `${row.activity_id}-${row.signal}`}
      />
    </section>
  )
}
