import { useSuspenseQuery } from '@tanstack/react-query'

import { m } from '#/paraglide/messages'
import type { AdminCohortRow, AdminCourseRow, AdminProgramRow, AdminTeacherRow } from '#/shared/api/gen/types.gen'
import type { DataColumn } from '#/shared/components/data-columns'
import { ListPage } from '#/shared/components/templates/list-page'
import { formatNumber, formatPercent } from '#/shared/i18n/format'

import { adminAnalyticsOptions } from '../queries'
import { AdminTable } from './admin-table'
import { hours, percent, score } from './kpi'

const name = (text: string) => <span className="wrap-anywhere">{text}</span>
const count = (value: number) => <span className="tabular-nums">{formatNumber(value)}</span>

const courseColumns = (): DataColumn<AdminCourseRow>[] => [
  { id: 'course', header: m.analytics_col_course(), priority: 1, cell: row => name(row.course_name) },
  { id: 'health', header: m.analytics_col_health(), priority: 2, cell: row => count(row.health_score) },
  { id: 'roi', header: m.analytics_col_roi(), priority: 2, cell: row => score(row.content_roi_score) },
  {
    id: 'completion',
    header: m.analytics_col_completion(),
    priority: 2,
    cell: row => formatPercent(row.completion_rate),
  },
  { id: 'active', header: m.analytics_col_active(), priority: 3, cell: row => count(row.active_learners_7d) },
  { id: 'risk', header: m.analytics_kpi_at_risk_learners(), priority: 3, cell: row => count(row.at_risk_learners) },
]

const teacherColumns = (): DataColumn<AdminTeacherRow>[] => [
  { id: 'teacher', header: m.analytics_col_teacher(), priority: 1, cell: row => name(row.teacher_display_name) },
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
  { id: 'retention', header: m.analytics_col_retention(), priority: 2, cell: row => percent(row.retention_rate) },
  { id: 'progress', header: m.analytics_avg_progress(), priority: 3, cell: row => percent(row.avg_progress_pct) },
]

const programColumns = (): DataColumn<AdminProgramRow>[] => [
  { id: 'program', header: m.analytics_col_program(), priority: 1, cell: row => name(row.program_name) },
  { id: 'courses', header: m.analytics_col_courses(), priority: 2, cell: row => count(row.course_count) },
  { id: 'learners', header: m.analytics_col_learners(), priority: 2, cell: row => count(row.learner_count) },
  { id: 'completion', header: m.analytics_col_completion(), priority: 3, cell: row => percent(row.completion_rate) },
  { id: 'health', header: m.analytics_col_health(), priority: 3, cell: row => score(row.health_score) },
]

/** /admin/analytics: the platform at a glance, top 25 of each ranking (the server cuts them). */
export function AdminAnalyticsPage() {
  const { data } = useSuspenseQuery(adminAnalyticsOptions())
  return (
    <ListPage title={m.analytics_admin_title()}>
      <div className="flex flex-col gap-12">
        <AdminTable
          title={m.analytics_admin_courses()}
          rows={data.course_health_ranking}
          columns={courseColumns()}
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
