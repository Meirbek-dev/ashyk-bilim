import { m } from '#/paraglide/messages'
import type { GradingBacklogItem, TeacherWorkloadSummary } from '#/shared/api/gen/types.gen'
import { Bars } from '#/shared/components/charts/bars'
import type { DataColumn } from '#/shared/components/data-columns'
import { DataTable } from '#/shared/components/data-table'
import { ListState } from '#/shared/components/list-state'
import { formatNumber } from '#/shared/i18n/format'

import { hours } from './kpi'

const columns = (): DataColumn<GradingBacklogItem>[] => [
  {
    id: 'assessment',
    header: m.analytics_col_assessment(),
    priority: 1,
    cell: row => <span className="wrap-anywhere">{row.title}</span>,
  },
  {
    id: 'course',
    header: m.analytics_col_course(),
    priority: 2,
    cell: row => <span className="wrap-anywhere">{row.course_name}</span>,
  },
  {
    id: 'awaiting',
    header: m.analytics_col_awaiting(),
    priority: 2,
    cell: row => <span className="tabular-nums">{formatNumber(row.awaiting_review)}</span>,
  },
  {
    id: 'breaches',
    header: m.analytics_col_breaches(),
    priority: 2,
    cell: row => <span className="tabular-nums">{formatNumber(row.sla_breaches)}</span>,
  },
  { id: 'age', header: m.analytics_col_age(), priority: 3, cell: row => hours(row.age_hours) },
]

/** The queue's age as bars and where it sits, as a table: only when something waits. */
export function QueueDetail({ workload, onRetry }: { workload: TeacherWorkloadSummary; onRetry: () => void }) {
  const aging = workload.aging_buckets
  return (
    <>
      <Bars
        title={m.analytics_aging_title()}
        data={[
          { label: m.analytics_age_day(), value: aging.h0_24 },
          { label: m.analytics_age_3d(), value: aging.d1_3 },
          { label: m.analytics_age_7d(), value: aging.d3_7 },
          { label: m.analytics_age_older(), value: aging.d7_plus },
        ]}
        formatValue={value => formatNumber(value)}
      />
      <section className="flex flex-col gap-4">
        <h2 className="text-xl font-semibold">{m.analytics_backlog_table()}</h2>
        <ListState
          pending={false}
          error={null}
          count={workload.backlog_by_assessment.length}
          filtered={false}
          emptyText={m.analytics_backlog_empty()}
          onRetry={onRetry}
        >
          <DataTable
            label={m.analytics_backlog_table()}
            rows={workload.backlog_by_assessment}
            columns={columns()}
            getKey={row => row.assessment_id}
          />
        </ListState>
      </section>
    </>
  )
}
