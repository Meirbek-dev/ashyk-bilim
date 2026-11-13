import { useSuspenseQuery } from '@tanstack/react-query'
import { useSearch } from '@tanstack/react-router'
import { CircleCheck } from 'lucide-react'

import { m } from '#/paraglide/messages'
import { KpiStrip } from '#/shared/components/charts/kpi-strip'
import { KpiTile } from '#/shared/components/charts/kpi-tile'
import { Link } from '#/shared/components/link'
import { formatNumber } from '#/shared/i18n/format'

import { exportHrefs } from '../model/analytics'
import { pickFilters } from '../model/filters'
import { overviewOptions } from '../queries'
import { DataQuality } from './data-quality'
import { DrillSection } from './drill-section'
import { ExportLinks } from './export-links'
import { QueueDetail } from './queue-detail'
import { hours } from './kpi'
import { drillTitles } from './labels'

/** The operations tab: the review queue now, how old it is, where it sits, and its rows (`?metric=backlog`). */
export function OperationsTab() {
  const search = useSearch({ from: '/_authed/teach/analytics/operations' })
  const filters = pickFilters(search)
  const { data, refetch } = useSuspenseQuery(overviewOptions(filters))
  const workload = data.workload
  return (
    <div className="flex flex-col gap-10">
      <KpiStrip label={m.analytics_kpis()} columns={4}>
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
      </KpiStrip>
      {search.metric ? (
        <DrillSection
          title={drillTitles[search.metric]()}
          metric={search.metric}
          page={search.page}
          filters={filters}
          closable
        />
      ) : null}
      {/* The queue and its download are one block: alone between two sections the CSV link belonged to neither. */}
      <div className="flex flex-col gap-4">
        {/* An empty queue has no age: one line instead of an empty chart and an empty table. */}
        {workload.backlog_total === 0 ? (
          <p className="flex items-center gap-2 text-sm text-success">
            <CircleCheck aria-hidden className="size-4" />
            {m.analytics_backlog_empty()}
          </p>
        ) : (
          <div className="flex flex-col gap-10">
            <QueueDetail workload={workload} onRetry={() => void refetch()} />
          </div>
        )}
        <ExportLinks
          links={[{ href: exportHrefs(filters).gradingBacklog, label: m.analytics_export_grading_backlog() }]}
        />
      </div>
      <DataQuality quality={data.data_quality} />
    </div>
  )
}
