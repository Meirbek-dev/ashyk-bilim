import { useSuspenseQuery } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'

import { m } from '#/paraglide/messages'
import type { TeacherCourseRow } from '#/shared/api/gen/types.gen'
import { formatNumber, formatPercent } from '#/shared/i18n/format'
import type { DataColumn } from '#/shared/ui/data-columns'
import { DataTable } from '#/shared/ui/data-table'
import { Link } from '#/shared/ui/link'
import { ListState } from '#/shared/ui/list-state'

import { activeFilters, type Filters } from '../model/filters'
import { coursesOptions } from '../queries'
import { Pager } from './pager'

const count = (value: number) => <span className="tabular-nums">{formatNumber(value)}</span>

const columns = (): DataColumn<TeacherCourseRow>[] => [
  {
    id: 'course',
    header: m.analytics_col_course(),
    priority: 1,
    cell: row => (
      <Link to="." search={prev => ({ ...prev, courseId: row.course_id })}>
        <span className="wrap-anywhere">{row.course_name}</span>
      </Link>
    ),
  },
  {
    id: 'completion',
    header: m.analytics_col_completion(),
    priority: 2,
    cell: row => <span className="tabular-nums">{formatPercent(row.completion_rate)}</span>,
  },
  { id: 'active', header: m.analytics_col_active(), priority: 2, cell: row => count(row.active_learners_7d) },
  { id: 'risk', header: m.analytics_kpi_at_risk_learners(), priority: 2, cell: row => count(row.at_risk_learners) },
  { id: 'health', header: m.analytics_col_health(), priority: 3, cell: row => count(row.content_health_score) },
  { id: 'ungraded', header: m.analytics_col_ungraded(), priority: 3, cell: row => count(row.ungraded_submissions) },
]

/** The caller's courses with their completion and health; a course opens its drill-down. */
export function CoursesTable({ filters, page }: { filters: Filters; page: number }) {
  const query = useSuspenseQuery(coursesOptions(filters, page))
  const navigate = useNavigate()
  return (
    <section className="flex flex-col gap-4">
      <h2 className="text-xl font-semibold">{m.analytics_courses_table()}</h2>
      <ListState
        pending={false}
        error={query.error}
        count={query.data.items.length}
        filtered={activeFilters(filters) > 0}
        emptyText={m.analytics_courses_empty()}
        onResetFilters={() => void navigate({ to: '.', search: {} })}
        onRetry={() => void query.refetch()}
      >
        <DataTable
          label={m.analytics_courses_table()}
          rows={query.data.items}
          columns={columns()}
          getKey={row => row.course_id}
        />
        <Pager page={page} total={query.data.total} param="coursePage" />
      </ListState>
    </section>
  )
}
