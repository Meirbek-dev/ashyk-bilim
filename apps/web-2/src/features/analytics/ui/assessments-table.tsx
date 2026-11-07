import { useSuspenseQuery } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'

import { m } from '#/paraglide/messages'
import type { AssessmentOutlierRow } from '#/shared/api/gen/types.gen'
import type { DataColumn } from '#/shared/components/data-columns'
import { DataTable } from '#/shared/components/data-table'
import { Link } from '#/shared/components/link'
import { ListState } from '#/shared/components/list-state'
import { activityTypeMeta } from '#/shared/i18n/labels'

import { activeFilters, ASSESSMENT_SORTS, type AssessmentSort, type Filters, tableSort } from '../model/filters'
import { outlierLabels } from '../model/signals'
import { assessmentsOptions } from '../queries'
import { hours, percent } from './kpi'
import { Pager } from './pager'
import { TABLE_LOOK } from './table-look'

const columns = (): DataColumn<AssessmentOutlierRow>[] => [
  {
    id: 'title',
    sortable: true,
    header: m.analytics_col_assessment(),
    priority: 1,
    // The kind and the course under the name: two more columns squeezed the figures off the right edge.
    cell: row => (
      <span className="flex flex-col">
        <Link
          variant="title"
          to="."
          search={prev => ({ ...prev, assessmentType: row.assessment_type, assessmentId: row.assessment_id, page: 1 })}
        >
          <span className="font-medium wrap-anywhere">{row.title}</span>
        </Link>
        <span className="font-sans text-xs font-normal wrap-anywhere text-muted-foreground">
          {activityTypeMeta[row.assessment_type].label()} · {row.course_name}
        </span>
      </span>
    ),
  },
  {
    id: 'submission',
    sortable: true,
    header: m.analytics_col_submission(),
    priority: 2,
    cell: row => percent(row.submission_rate),
  },
  { id: 'pass', sortable: true, header: m.analytics_col_pass(), priority: 2, cell: row => percent(row.pass_rate) },
  { id: 'median', header: m.analytics_col_median(), priority: 3, cell: row => percent(row.median_score) },
  {
    id: 'latency',
    sortable: true,
    header: m.analytics_col_latency(),
    priority: 3,
    cell: row => hours(row.grading_latency_hours_p50),
  },
  {
    id: 'outliers',
    header: m.analytics_col_outliers(),
    priority: 3,
    wrap: true,
    cell: row => row.outlier_reason_codes.map(code => outlierLabels[code]()).join(', ') || '—',
  },
]

/** Assessment outcomes across the caller's courses; an assessment opens its drill-down with the learners. */
type AssessmentsTableProps = { filters: Filters; page: number; order: { sort?: AssessmentSort; desc?: boolean } }

export function AssessmentsTable({ filters, page, order }: AssessmentsTableProps) {
  const query = useSuspenseQuery(assessmentsOptions(filters, page, order))
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
        <div
          className={`${TABLE_LOOK} [&_td:nth-child(n+2):nth-child(-n+5)]:text-right [&_th:nth-child(n+2):nth-child(-n+5)]:text-right [&_th:nth-child(n+2):nth-child(-n+5)_button]:-mr-3`}
        >
          <DataTable
            label={m.analytics_assessments_table()}
            rows={query.data.items}
            columns={columns()}
            getKey={row => row.assessment_id}
            sort={order.sort ? { id: order.sort, desc: order.desc ?? false } : undefined}
            onSortChange={next =>
              void navigate({ to: '.', search: prev => ({ ...prev, ...tableSort(ASSESSMENT_SORTS, next), page: 1 }) })
            }
          />
        </div>
        <Pager page={page} total={query.data.total} />
      </ListState>
    </section>
  )
}
