import { useSuspenseQuery } from '@tanstack/react-query'
import { useSearch } from '@tanstack/react-router'

import { m } from '#/paraglide/messages'
import type { AdminCohortRow, AdminCourseRow, AdminProgramRow, AdminTeacherRow } from '#/shared/api/gen/types.gen'
import { ScoreBar } from '#/shared/components/charts/score-bar'
import type { DataColumn } from '#/shared/components/data-columns'
import { Link } from '#/shared/components/link'
import { ListPage } from '#/shared/components/templates/list-page'
import { formatNumber, formatPercent } from '#/shared/i18n/format'

import { programAuthor } from '../model/analytics'
import { adminAnalyticsOptions } from '../queries'
import { AdminTable } from './admin-table'
import { AdminFilters } from './admin-filters'
import { AsOf } from './as-of'
import { hours, percent, score } from './kpi'

const name = (text: string) => <span className="font-medium wrap-anywhere">{text}</span>
/** A 0..100 value as a bar plus its number; a dash when the server has no sample. */
const bar = (value: number | null | undefined, text: string) =>
  value === null || value === undefined ? text : <ScoreBar value={value} text={text} />
const count = (value: number) => <span className="tabular-nums">{formatNumber(value)}</span>

const courseColumn = (): DataColumn<AdminCourseRow> => ({
  id: 'course',
  header: m.analytics_col_course(),
  priority: 1,
  // A ranking row leads to the course's drill-down: why it scores low is the next question (B-ANL-41).
  cell: row => (
    <Link variant="title" to="/teach/analytics/performance" search={{ courseId: row.course_id }}>
      {name(row.course_name)}
    </Link>
  ),
})
const healthColumn = (): DataColumn<AdminCourseRow> => ({
  id: 'health',
  header: m.analytics_col_health(),
  priority: 2,
  cell: row => bar(row.health_score, score(row.health_score)),
})
const completionColumn = (): DataColumn<AdminCourseRow> => ({
  id: 'completion',
  header: m.analytics_col_completion(),
  priority: 2,
  cell: row => bar(row.completion_rate, formatPercent(row.completion_rate)),
})

// The two course rankings share their rows but not their question: health ranks by health with the learner counts
// beside it; content return leads with its own number and the two it is made of (it used to repeat the health table).
const healthColumns = (): DataColumn<AdminCourseRow>[] => [
  courseColumn(),
  healthColumn(),
  completionColumn(),
  { id: 'active', header: m.analytics_col_active(), priority: 3, cell: row => count(row.active_learners_7d) },
  { id: 'risk', header: m.analytics_kpi_at_risk_learners(), priority: 3, cell: row => count(row.at_risk_learners) },
]

const roiColumns = (): DataColumn<AdminCourseRow>[] => [
  courseColumn(),
  { id: 'roi', header: m.analytics_col_roi(), priority: 2, cell: row => score(row.content_roi_score) },
  completionColumn(),
  healthColumn(),
]

const teacherColumns = (): DataColumn<AdminTeacherRow>[] => [
  {
    id: 'teacher',
    header: m.analytics_col_teacher(),
    priority: 1,
    // The @username under the name: the prod copy has two teachers named «Садуакас Дулатович Байжуманов».
    cell: row => (
      <span className="flex flex-col">
        <Link variant="title" to="/admin/users" search={{ user: row.teacher_user_id }}>
          {name(row.teacher_display_name)}
        </Link>
        <span className="text-xs wrap-anywhere text-muted-foreground">@{row.teacher_username}</span>
      </span>
    ),
  },
  { id: 'courses', header: m.analytics_col_courses(), priority: 2, cell: row => count(row.managed_course_count) },
  { id: 'backlog', header: m.analytics_col_backlog(), priority: 2, cell: row => count(row.workload_backlog) },
  { id: 'breaches', header: m.analytics_sla_breaches(), priority: 2, cell: row => count(row.sla_breaches) },
  {
    id: 'latency',
    header: m.analytics_median_latency(),
    priority: 3,
    cell: row => hours(row.median_feedback_latency_hours),
  },
  { id: 'risk', header: m.analytics_kpi_at_risk_learners(), priority: 3, cell: row => count(row.at_risk_learners) },
]

const cohortColumns = (): DataColumn<AdminCohortRow>[] => [
  { id: 'cohort', header: m.analytics_filter_cohort(), priority: 1, cell: row => name(row.cohort_name) },
  { id: 'learners', header: m.analytics_col_learners(), priority: 2, cell: row => count(row.learners) },
  {
    id: 'retention',
    header: m.analytics_col_retention(),
    priority: 2,
    cell: row => bar(row.retention_rate, percent(row.retention_rate)),
  },
  {
    id: 'progress',
    header: m.analytics_avg_progress(),
    priority: 3,
    cell: row => bar(row.avg_progress_pct, percent(row.avg_progress_pct)),
  },
]

const programColumns = (): DataColumn<AdminProgramRow>[] => [
  {
    id: 'program',
    header: m.analytics_col_program(),
    priority: 1,
    // The author opens in the user sheet with the @username under the name, like a teacher row: two authors may share
    // a display name.
    cell: row =>
      row.program_id ? (
        <span className="flex flex-col">
          <Link variant="title" to="/admin/users" search={{ user: row.program_id }}>
            {name(programAuthor(row.program_name) ?? m.analytics_program_unassigned())}
          </Link>
          {row.author_username ? (
            <span className="text-xs wrap-anywhere text-muted-foreground">@{row.author_username}</span>
          ) : null}
        </span>
      ) : (
        name(programAuthor(row.program_name) ?? m.analytics_program_unassigned())
      ),
  },
  { id: 'courses', header: m.analytics_col_courses(), priority: 2, cell: row => count(row.course_count) },
  { id: 'learners', header: m.analytics_col_learners(), priority: 2, cell: row => count(row.learner_count) },
  {
    id: 'completion',
    header: m.analytics_col_completion(),
    priority: 3,
    cell: row => bar(row.completion_rate, percent(row.completion_rate)),
  },
  {
    id: 'health',
    header: m.analytics_col_health(),
    priority: 3,
    cell: row => bar(row.health_score, score(row.health_score)),
  },
]

/** /admin/analytics: the platform at a glance over a period, top 25 of each ranking (the server cuts them). */
export function AdminAnalyticsPage() {
  const search = useSearch({ from: '/_authed/admin/analytics' })
  const { data } = useSuspenseQuery(adminAnalyticsOptions(search.window, search))
  return (
    <ListPage
      title={m.analytics_admin_title()}
      filters={<AdminFilters search={search} />}
      activeFilters={(search.course ? 1 : 0) + (search.cohort ? 1 : 0)}
    >
      <div className="flex flex-col gap-12">
        <AsOf at={data.generated_at_unix} />
        <AdminTable
          title={m.analytics_admin_courses()}
          description={m.analytics_admin_courses_hint()}
          rows={data.course_health_ranking}
          columns={healthColumns()}
          getKey={row => row.course_id}
        />
        <AdminTable
          title={m.analytics_admin_roi()}
          description={m.analytics_admin_roi_hint()}
          rows={data.content_roi}
          columns={roiColumns()}
          getKey={row => row.course_id}
        />
        <AdminTable
          title={m.analytics_admin_teachers()}
          rows={data.teacher_workload_comparison}
          columns={teacherColumns()}
          getKey={row => row.teacher_user_id}
        />
        <AdminTable
          title={m.analytics_admin_cohorts()}
          rows={data.cohort_retention}
          columns={cohortColumns()}
          getKey={row => row.cohort_id}
        />
        <AdminTable
          title={m.analytics_admin_programs()}
          rows={data.department_program_performance}
          columns={programColumns()}
          getKey={row => row.program_id ?? row.program_name}
        />
      </div>
    </ListPage>
  )
}
