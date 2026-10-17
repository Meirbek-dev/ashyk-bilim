import { Link as RouterLink } from '@tanstack/react-router'

import { m } from '#/paraglide/messages'
import type { CourseId, TeacherCourseDetailResponse } from '#/shared/api/gen/types.gen'
import { Bars } from '#/shared/components/charts/bars'
import { StatusBadge } from '#/shared/components/status-badge'
import { formatNumber } from '#/shared/i18n/format'
import { buttonVariants } from '#/shared/components/button-variants'

import { funnelLabel, healthValue } from '../model/course-health'
import type { Filters } from '../model/filters'
import { severityBadges } from '../model/signals'
import { BottlenecksTable } from './bottlenecks-table'

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
      <BottlenecksTable rows={data.content_bottlenecks} withCourse={false} />
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
