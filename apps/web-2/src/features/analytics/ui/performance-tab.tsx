import { useSearch } from '@tanstack/react-router'

import { m } from '#/paraglide/messages'

import { exportHrefs } from '../model/analytics'
import { pickFilters } from '../model/filters'
import { AssessmentDrill } from './assessment-drill'
import { AssessmentsTable } from './assessments-table'
import { CourseDrill } from './course-drill'
import { CoursesTable } from './courses-table'
import { ExportLinks } from './export-links'

/** The performance tab: courses and assessments, or a drill-down into one of them (search params, spec 5.3). */
export function PerformanceTab() {
  const search = useSearch({ from: '/_authed/teach/analytics/performance' })
  const filters = pickFilters(search)
  if (search.assessmentType && search.assessmentId)
    return (
      <AssessmentDrill filters={filters} type={search.assessmentType} id={search.assessmentId} page={search.page} />
    )
  if (search.courseId) return <CourseDrill filters={filters} courseId={search.courseId} />
  const hrefs = exportHrefs(filters)
  return (
    <div className="flex flex-col gap-8">
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
