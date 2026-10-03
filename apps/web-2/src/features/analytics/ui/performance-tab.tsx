import { useSuspenseQuery } from '@tanstack/react-query'
import { useSearch } from '@tanstack/react-router'

import { m } from '#/paraglide/messages'

import { exportHrefs } from '../model/analytics'
import { pickFilters } from '../model/filters'
import { overviewOptions } from '../queries'
import { AssessmentDrill } from './assessment-drill'
import { AssessmentsTable } from './assessments-table'
import { CourseDrill } from './course-drill'
import { CoursesTable } from './courses-table'
import { ExportLinks } from './export-links'
import { SignalList } from './signal-list'

/**
 * The performance tab: forecasts and anomalies (from the overview answer the layout already loads), courses and
 * assessments, or a drill-down into one of them (search params, spec 5.3).
 */
export function PerformanceTab() {
  const search = useSearch({ from: '/_authed/teach/analytics/performance' })
  const filters = pickFilters(search)
  const { data } = useSuspenseQuery(overviewOptions(filters))
  if (search.assessmentType && search.assessmentId)
    return (
      <AssessmentDrill filters={filters} type={search.assessmentType} id={search.assessmentId} page={search.page} />
    )
  if (search.courseId) return <CourseDrill filters={filters} courseId={search.courseId} />
  const hrefs = exportHrefs(filters)
  return (
    <div className="flex flex-col gap-8">
      <div className="grid gap-gutter @3xl:grid-cols-2">
        <SignalList title={m.analytics_forecasts_title()} items={data.forecasts} />
        <SignalList title={m.analytics_anomalies_title()} items={data.anomalies} />
      </div>
      <CoursesTable filters={filters} page={search.coursePage} />
      <AssessmentsTable filters={filters} page={search.page} />
      <ExportLinks
        links={[
          { href: hrefs.courseProgress, label: m.analytics_export_course_progress() },
          { href: hrefs.assessmentOutcomes, label: m.analytics_export_assessment_outcomes() },
        ]}
      />
    </div>
  )
}
