import { useSuspenseQuery } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'

import { m } from '#/paraglide/messages'
import type { AssessmentOutlierRow } from '#/shared/api/gen/types.gen'
import type { DataColumn } from '#/shared/components/data-columns'
import { DataTable } from '#/shared/components/data-table'
import { Link } from '#/shared/components/link'
import { ListState } from '#/shared/components/list-state'
import { activityTypeMeta } from '#/shared/i18n/labels'

import { activeFilters, type Filters } from '../model/filters'
import { assessmentsOptions } from '../queries'
import { hours, percent, score } from './kpi'
import { Pager } from './pager'

const columns = (): DataColumn<AssessmentOutlierRow>[] => [
  {
    id: 'assessment',
    header: m.analytics_col_assessment(),
    priority: 1,
    cell: row => (
      <Link
        to="."
        search={prev => ({ ...prev, assessmentType: row.assessment_type, assessmentId: row.assessment_id, page: 1 })}
      >
        <span className="wrap-anywhere">{row.title}</span>
      </Link>
    ),
  },
  {
    id: 'type',
    header: m.analytics_col_type(),
    priority: 2,
    cell: row => {
      const meta = activityTypeMeta[row.assessment_type]
      return (
        <span className="inline-flex items-center gap-1">
          <meta.icon aria-hidden className={`size-4 ${meta.ink}`} />
          {meta.label()}
        </span>
      )
    },
  },
  {
    id: 'course',
    header: m.analytics_col_course(),
    priority: 2,
    cell: row => <span className="wrap-anywhere">{row.course_name}</span>,
  },
  { id: 'submission', header: m.analytics_col_submission(), priority: 2, cell: row => percent(row.submission_rate) },
  { id: 'pass', header: m.analytics_col_pass(), priority: 2, cell: row => percent(row.pass_rate) },
  { id: 'median', header: m.analytics_col_median(), priority: 3, cell: row => score(row.median_score) },
  {
    id: 'latency',
    header: m.analytics_col_latency(),
    priority: 3,
    cell: row => hours(row.grading_latency_hours_p50),
  },
]

/** Assessment outcomes across the caller's courses; an assessment opens its drill-down with the learners. */
export function AssessmentsTable({ filters, page }: { filters: Filters; page: number }) {
  const query = useSuspenseQuery(assessmentsOptions(filters, page))
  const navigate = useNavigate()
  return (
    <section className="flex flex-col gap-4">
      <h2 className="text-xl font-semibold">{m.analytics_assessments_table()}</h2>
      <ListState
        pending={false}
        error={query.error}
        count={query.data.items.length}
        filtered={activeFilters(filters) > 0}
        emptyText={m.analytics_assessments_empty()}
        onResetFilters={() => void navigate({ to: '.', search: {} })}
        onRetry={() => void query.refetch()}
      >
        <DataTable
          label={m.analytics_assessments_table()}
          rows={query.data.items}
          columns={columns()}
          getKey={row => row.assessment_id}
        />
        <Pager page={page} total={query.data.total} />
      </ListState>
    </section>
  )
}
