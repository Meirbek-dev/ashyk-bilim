import { useSuspenseQuery } from '@tanstack/react-query'
import { useSearch } from '@tanstack/react-router'

import { m } from '#/paraglide/messages'
import type { GradingBacklogItem } from '#/shared/api/gen/types.gen'
import { Bars } from '#/shared/components/charts/bars'
import { KpiTile } from '#/shared/components/charts/kpi-tile'
import type { DataColumn } from '#/shared/components/data-columns'
import { DataTable } from '#/shared/components/data-table'
import { Link } from '#/shared/components/link'
import { ListState } from '#/shared/components/list-state'
import { formatNumber } from '#/shared/i18n/format'

import { exportHrefs } from '../model/analytics'
import { pickFilters } from '../model/filters'
import { overviewOptions } from '../queries'
import { DrillSection } from './drill-section'
import { ExportLinks } from './export-links'
import { hours } from './kpi'
import { drillTitles } from './labels'

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

/** The operations tab: the review queue now, how old it is, where it sits, and its rows (`?metric=backlog`). */
export function OperationsTab() {
  const search = useSearch({ from: '/_authed/teach/analytics/operations' })
  const filters = pickFilters(search)
  const { data, refetch } = useSuspenseQuery(overviewOptions(filters))
  const workload = data.workload
  const aging = workload.aging_buckets
  return (
    <div className="flex flex-col gap-8">
      <section aria-label={m.analytics_kpis()} className="grid grid-cols-2 gap-4 @4xl:grid-cols-4">
        <KpiTile
          label={m.analytics_kpi_ungraded_submissions()}
          value={formatNumber(workload.backlog_total)}
          action={
            <Link to="." search={prev => ({ ...prev, metric: 'backlog', page: 1 })}>
              {m.analytics_show_rows()}
            </Link>
          }
        />
        <KpiTile label={m.analytics_sla_breaches()} value={formatNumber(workload.sla_breaches)} />
        <KpiTile label={m.analytics_median_latency()} value={hours(workload.median_feedback_latency_hours)} />
        <KpiTile label={m.analytics_forecast_7d()} value={formatNumber(workload.forecast_backlog_7d)} />
      </section>
      {search.metric ? (
        <DrillSection
          title={drillTitles[search.metric]()}
          metric={search.metric}
          page={search.page}
          filters={filters}
          closable
        />
      ) : null}
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
          onRetry={() => void refetch()}
        >
          <DataTable
            label={m.analytics_backlog_table()}
            rows={workload.backlog_by_assessment}
            columns={columns()}
            getKey={row => row.assessment_id}
          />
        </ListState>
      </section>
      <ExportLinks
        links={[{ href: exportHrefs(filters).gradingBacklog, label: m.analytics_export_grading_backlog() }]}
      />
    </div>
  )
}
