import { useSuspenseQuery } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'

import { m } from '#/paraglide/messages'
import type { TeacherCourseRow } from '#/shared/api/gen/types.gen'
import type { DataColumn } from '#/shared/components/data-columns'
import { DataTable } from '#/shared/components/data-table'
import { ScoreBar } from '#/shared/components/charts/score-bar'
import { Link } from '#/shared/components/link'
import { ListState } from '#/shared/components/list-state'
import { formatNumber, formatPercent } from '#/shared/i18n/format'

import { activeFilters, COURSE_SORTS, type CourseSort, type Filters, tableSort } from '../model/filters'
import { coursesOptions } from '../queries'
import { Pager } from './pager'

const count = (value: number) => <span className="tabular-nums">{formatNumber(value)}</span>

const columns = (): DataColumn<TeacherCourseRow>[] => [
  {
    id: 'name',
    sortable: true,
    header: m.analytics_col_course(),
    priority: 1,
    cell: row => (
      <Link variant="title" to="." search={prev => ({ ...prev, courseId: row.course_id })}>
        <span className="font-medium wrap-anywhere">{row.course_name}</span>
      </Link>
    ),
  },
  {
    id: 'completion',
    sortable: true,
    header: m.analytics_col_completion(),
    priority: 2,
    cell: row => <ScoreBar value={row.completion_rate} text={formatPercent(row.completion_rate)} />,
  },
  {
    id: 'active',
    sortable: true,
    header: m.analytics_col_active(),
    priority: 2,
    cell: row => count(row.active_learners_7d),
  },
  {
    id: 'risk',
    sortable: true,
    header: m.analytics_kpi_at_risk_learners(),
    priority: 2,
    cell: row => count(row.at_risk_learners),
  },
  {
    id: 'health',
    sortable: true,
    header: m.analytics_col_health(),
    priority: 3,
    cell: row => count(row.content_health_score),
  },
  { id: 'ungraded', header: m.analytics_col_ungraded(), priority: 3, cell: row => count(row.ungraded_submissions) },
]

/** The caller's courses with their completion and health; a course opens its drill-down. */
type CoursesTableProps = { filters: Filters; page: number; order: { sort?: CourseSort; desc?: boolean } }

export function CoursesTable({ filters, page, order }: CoursesTableProps) {
  const query = useSuspenseQuery(coursesOptions(filters, page, order))
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
          sort={order.sort ? { id: order.sort, desc: order.desc ?? false } : undefined}
          onSortChange={next => {
            const { sort, desc } = tableSort(COURSE_SORTS, next)
            void navigate({ to: '.', search: prev => ({ ...prev, courseSort: sort, courseDesc: desc, coursePage: 1 }) })
          }}
        />
        <Pager page={page} total={query.data.total} param="coursePage" />
      </ListState>
    </section>
  )
}
