import { useSuspenseQuery } from '@tanstack/react-query'
import { useSearch } from '@tanstack/react-router'

import { m } from '#/paraglide/messages'
import type { TeacherOverviewSummary, TeacherOverviewTrends } from '#/shared/api/gen/types.gen'
import { TimeSeries } from '#/shared/components/charts/time-series'
import { formatDayMonth, formatNumber } from '#/shared/i18n/format'

import { pickFilters, type TileMetric } from '../model/filters'
import { overviewOptions } from '../queries'
import { DrillSection } from './drill-section'
import { drillTitles, kpiLabels } from './labels'
import { MetricTile } from './metric-tile'
import { SignalList } from './signal-list'

/** Each KPI in reading order, with the drill-through behind it (if the server has one). */
const tiles: readonly { name: keyof TeacherOverviewSummary; drill?: TileMetric }[] = [
  { name: 'active_learners', drill: 'active_learners' },
  { name: 'returning_learners' },
  { name: 'completion_rate', drill: 'completion_rate' },
  { name: 'at_risk_learners' },
  { name: 'ungraded_submissions', drill: 'backlog' },
  { name: 'negative_engagement_courses' },
]

const series: readonly { name: keyof TeacherOverviewTrends; label: () => string }[] = [
  { name: 'active_learners', label: m.analytics_kpi_active_learners },
  { name: 'submissions', label: m.analytics_series_submissions },
  { name: 'completions', label: m.analytics_series_completions },
  { name: 'grading_completed', label: m.analytics_series_grading },
]

/** The overview tab: six KPIs against the previous period, the rows behind one of them, alerts and insights, the trends. */
export function OverviewTab() {
  const search = useSearch({ from: '/_authed/teach/analytics/overview' })
  const filters = pickFilters(search)
  const { data } = useSuspenseQuery(overviewOptions(filters))
  return (
    <div className="flex flex-col gap-8">
      <section aria-label={m.analytics_kpis()} className="grid grid-cols-1 gap-4 @md:grid-cols-2 @4xl:grid-cols-3">
        {tiles.map(({ name, drill }) => (
          <MetricTile key={name} label={kpiLabels[name]()} card={data.summary[name]} drill={drill} />
        ))}
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
      <div className="grid gap-gutter @3xl:grid-cols-2">
        <SignalList title={m.analytics_alerts_title()} items={data.alerts} />
        <SignalList title={m.analytics_insights_title()} items={data.insights} />
      </div>
      <section className="flex flex-col gap-4">
        <h2 className="text-xl font-semibold">{m.analytics_trends_title()}</h2>
        <div className="grid gap-gutter @3xl:grid-cols-2">
          {series.map(({ name, label }) => (
            <TimeSeries
              key={name}
              title={label()}
              data={data.trends[name].map(point => ({
                label: formatDayMonth(point.bucket_start_unix),
                value: point.value,
              }))}
              formatValue={value => formatNumber(value)}
            />
          ))}
        </div>
      </section>
    </div>
  )
}
