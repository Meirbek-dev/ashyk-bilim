import { useSuspenseQuery } from '@tanstack/react-query'

import { m } from '#/paraglide/messages'
import type { ActivityDropoffRow, CourseId } from '#/shared/api/gen/types.gen'
import { formatDayMonth, formatNumber, formatPercent } from '#/shared/i18n/format'
import { activityType, activityTypeMeta } from '#/shared/i18n/labels'
import { KpiTile } from '#/shared/ui/charts/kpi-tile'
import { TimeSeries } from '#/shared/ui/charts/time-series'
import type { DataColumn } from '#/shared/ui/data-columns'
import { DataTable } from '#/shared/ui/data-table'
import { ListState } from '#/shared/ui/list-state'

import type { Filters } from '../model/filters'
import { courseOptions } from '../queries'
import { BackLink } from './back-link'

const columns = (): DataColumn<ActivityDropoffRow>[] => [
  {
    id: 'activity',
    header: m.analytics_col_activity(),
    priority: 1,
    cell: row => {
      const meta = activityTypeMeta[activityType(row.activity_type)]
      return (
        <span className="inline-flex items-center gap-1 wrap-anywhere">
          <meta.icon aria-hidden className={`size-4 shrink-0 ${meta.ink}`} />
          {row.activity_name}
        </span>
      )
    },
  },
  {
    id: 'completed',
    header: m.analytics_col_completed(),
    priority: 2,
    cell: row => <span className="tabular-nums">{formatNumber(row.current_step_completions)}</span>,
  },
  {
    id: 'dropoff',
    header: m.analytics_col_dropoff(),
    priority: 2,
    cell: row => <span className="tabular-nums">{formatPercent(row.dropoff_pct)}</span>,
  },
]

/** One course (`?courseId=`): its numbers, learner activity over the period, and where learners stop. */
export function CourseDrill({ filters, courseId }: { filters: Filters; courseId: CourseId }) {
  const { data, refetch } = useSuspenseQuery(courseOptions(filters, courseId))
  const summary = data.summary
  const tiles = [
    { label: m.analytics_course_enrolled(), value: formatNumber(summary.enrolled_learners) },
    { label: m.analytics_col_active(), value: formatNumber(summary.active_learners_7d) },
    { label: m.analytics_col_completion(), value: formatPercent(summary.completion_rate) },
    { label: m.analytics_avg_progress(), value: formatPercent(summary.avg_progress_pct) },
    { label: m.analytics_kpi_at_risk_learners(), value: formatNumber(summary.at_risk_learners) },
    { label: m.analytics_col_ungraded(), value: formatNumber(summary.ungraded_submissions) },
    { label: m.analytics_certificates(), value: formatNumber(summary.certificates_issued) },
  ]
  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col items-start gap-2">
        <BackLink />
        <h2 className="text-xl font-semibold wrap-anywhere">{data.course.name}</h2>
      </div>
      <section aria-label={m.analytics_kpis()} className="grid grid-cols-2 gap-4 @3xl:grid-cols-4">
        {tiles.map(tile => (
          <KpiTile key={tile.label} label={tile.label} value={tile.value} />
        ))}
      </section>
      <TimeSeries
        title={m.analytics_engagement_trend()}
        data={data.engagement_trend.map(point => ({
          label: formatDayMonth(point.bucket_start_unix),
          value: point.value,
        }))}
        formatValue={value => formatNumber(value)}
      />
      <section className="flex flex-col gap-4">
        <h3 className="text-lg font-semibold">{m.analytics_dropoff_table()}</h3>
        <ListState
          pending={false}
          error={null}
          count={data.activity_dropoff.length}
          filtered={false}
          emptyText={m.analytics_dropoff_empty()}
          onRetry={() => void refetch()}
        >
          <DataTable
            label={m.analytics_dropoff_table()}
            rows={data.activity_dropoff}
            columns={columns()}
            getKey={row => row.activity_id}
          />
        </ListState>
      </section>
    </div>
  )
}
