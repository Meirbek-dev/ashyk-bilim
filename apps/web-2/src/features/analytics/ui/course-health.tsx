import { m } from '#/paraglide/messages'
import type { CourseId, TeacherCourseDetailResponse } from '#/shared/api/gen/types.gen'
import { Link } from '#/shared/components/link'
import { formatNumber } from '#/shared/i18n/format'

import { funnelLabel, healthValue } from '../model/course-health'
import type { Filters } from '../model/filters'
import { severityBadges } from '../model/signals'
import { BottlenecksTable } from './bottlenecks-table'
import { CountBars } from './count-bars'
import { ToneText } from './tone-text'

type CourseHealthProps = { filters: Filters; courseId: CourseId; data: TeacherCourseDetailResponse }

/**
 * The course drill's "where learners stall" (B-ANL-27): the completion funnel, learners per chapter, content health,
 * the bottleneck activities, and the course's at-risk learners and assessments one click away (their own tabs).
 */
export function CourseHealth({ filters, courseId, data }: CourseHealthProps) {
  const scoped = { ...filters, course: courseId }
  return (
    <>
      <CountBars
        title={m.analytics_funnel_title()}
        data={data.funnels.course_completion.map(step => ({ label: funnelLabel(step.label), value: step.count }))}
        formatValue={value => formatNumber(value)}
      />
      {data.funnels.chapter_dropoff.length > 0 ? (
        <CountBars
          title={m.analytics_chapters_title()}
          data={data.funnels.chapter_dropoff.map(step => ({ label: step.label, value: step.count }))}
          formatValue={value => formatNumber(value)}
        />
      ) : null}
      <section className="flex flex-col gap-2">
        <h3 className="text-lg font-semibold">{m.analytics_health_title()}</h3>
        <ul className="flex flex-col divide-y border-y text-sm">
          {data.content_health.map(row => (
            <li key={row.signal} className="flex flex-wrap items-baseline gap-x-4 py-2">
              <span className="w-24 shrink-0">
                <ToneText tone={severityBadges[row.severity].tone}>{severityBadges[row.severity].label()}</ToneText>
              </span>
              <span>{healthValue(row)}</span>
            </li>
          ))}
        </ul>
      </section>
      <BottlenecksTable rows={data.content_bottlenecks} withCourse={false} />
      <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
        <Link to="/teach/analytics/learners" search={scoped}>
          {m.analytics_course_at_risk({ count: formatNumber(data.at_risk_learners.length) })}
        </Link>
        <Link to="/teach/analytics/performance" search={scoped}>
          {m.analytics_course_assessments()}
        </Link>
      </div>
    </>
  )
}
