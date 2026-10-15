import { Link as RouterLink } from '@tanstack/react-router'

import { m } from '#/paraglide/messages'
import type { ContentBottleneckRow, CourseId, TeacherCourseDetailResponse } from '#/shared/api/gen/types.gen'
import { Bars } from '#/shared/components/charts/bars'
import type { DataColumn } from '#/shared/components/data-columns'
import { DataTable } from '#/shared/components/data-table'
import { StatusBadge } from '#/shared/components/status-badge'
import { formatNumber, formatPercent } from '#/shared/i18n/format'
import { buttonVariants } from '#/shared/ui/button'

import { funnelLabel, healthValue } from '../model/course-health'
import type { Filters } from '../model/filters'
import { bottleneckLabel, severityBadges } from '../model/signals'

const bottleneckColumns = (): DataColumn<ContentBottleneckRow>[] => [
  { id: 'activity', header: m.analytics_col_activity(), priority: 1, cell: row => row.activity_name },
  { id: 'signal', header: m.analytics_col_signal(), priority: 2, cell: row => bottleneckLabel(row.signal) },
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

type CourseHealthProps = { filters: Filters; courseId: CourseId; data: TeacherCourseDetailResponse }

/**
 * The course drill's "where learners stall" (B-ANL-27): the completion funnel, learners per chapter, content health,
 * the bottleneck activities, and the course's at-risk learners and assessments one click away (their own tabs).
 */
export function CourseHealth({ filters, courseId, data }: CourseHealthProps) {
  const scoped = { ...filters, course: courseId }
  return (
    <>
      <Bars
        title={m.analytics_funnel_title()}
        data={data.funnels.course_completion.map(step => ({ label: funnelLabel(step.label), value: step.count }))}
        formatValue={value => formatNumber(value)}
      />
      {data.funnels.chapter_dropoff.length > 0 ? (
        <Bars
          title={m.analytics_chapters_title()}
          data={data.funnels.chapter_dropoff.map(step => ({ label: step.label, value: step.count }))}
          formatValue={value => formatNumber(value)}
        />
      ) : null}
      <section className="flex flex-col gap-2">
        <h3 className="text-lg font-semibold">{m.analytics_health_title()}</h3>
        <ul className="flex flex-col gap-2">
          {data.content_health.map(row => (
            <li key={row.signal} className="flex flex-wrap items-center gap-2">
              <StatusBadge tone={severityBadges[row.severity].tone}>{severityBadges[row.severity].label()}</StatusBadge>
              <span>{healthValue(row)}</span>
            </li>
          ))}
        </ul>
      </section>
      {data.content_bottlenecks.length > 0 ? (
        <section className="flex flex-col gap-4">
          <h3 className="text-lg font-semibold">{m.analytics_bottlenecks_title()}</h3>
          <DataTable
            label={m.analytics_bottlenecks_title()}
            rows={data.content_bottlenecks}
            columns={bottleneckColumns()}
            getKey={row => `${row.activity_id}-${row.signal}`}
          />
        </section>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <RouterLink to="/teach/analytics/learners" search={scoped} className={buttonVariants({ variant: 'outline' })}>
          {m.analytics_course_at_risk({ count: formatNumber(data.at_risk_learners.length) })}
        </RouterLink>
        <RouterLink
          to="/teach/analytics/performance"
          search={scoped}
          className={buttonVariants({ variant: 'outline' })}
        >
          {m.analytics_course_assessments()}
        </RouterLink>
      </div>
    </>
  )
}
