import { useSuspenseQuery } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'

import { m } from '#/paraglide/messages'
import type { AtRiskLearnerRow } from '#/shared/api/gen/types.gen'
import { formatNumber, formatPercent } from '#/shared/i18n/format'
import { Badge } from '#/shared/ui/badge'
import type { DataColumn } from '#/shared/ui/data-columns'
import { DataTable } from '#/shared/ui/data-table'
import { Link } from '#/shared/ui/link'
import { ListState } from '#/shared/ui/list-state'

import { activeFilters, type Filters, learnerSort, type LearnerSort } from '../model/filters'
import { atRiskOptions } from '../queries'
import { riskLevelBadges, riskTrendLabels } from './labels'
import { Pager } from './pager'

const columns = (): DataColumn<AtRiskLearnerRow>[] => [
  {
    id: 'name',
    header: m.analytics_col_learner(),
    priority: 1,
    sortable: true,
    // The panel opens from the URL: this link is the shareable address of the learner in this course.
    cell: row => (
      <Link to="." search={prev => ({ ...prev, learnerId: row.user_id, courseId: row.course_id })}>
        <span className="wrap-anywhere">{row.user_display_name}</span>
      </Link>
    ),
  },
  {
    id: 'course',
    header: m.analytics_col_course(),
    priority: 2,
    cell: row => <span className="wrap-anywhere">{row.course_name}</span>,
  },
  {
    id: 'risk',
    header: m.analytics_col_risk(),
    priority: 2,
    sortable: true,
    cell: row => {
      const badge = riskLevelBadges[row.risk_level]
      return (
        <Badge tone={badge.tone}>
          {badge.label()} · {formatNumber(row.risk_score)}
        </Badge>
      )
    },
  },
  {
    id: 'progress',
    header: m.analytics_col_progress(),
    priority: 2,
    sortable: true,
    cell: row => <span className="tabular-nums">{formatPercent(row.progress_pct)}</span>,
  },
  {
    id: 'activity',
    header: m.analytics_col_inactive(),
    priority: 3,
    sortable: true,
    cell: row => (
      <span className="tabular-nums">
        {row.days_since_last_activity === null || row.days_since_last_activity === undefined
          ? '—'
          : formatNumber(row.days_since_last_activity)}
      </span>
    ),
  },
  { id: 'trend', header: m.analytics_col_trend(), priority: 3, cell: row => riskTrendLabels[row.risk_trend]() },
  {
    id: 'interventions',
    header: m.analytics_col_interventions(),
    priority: 2,
    cell: row => <span className="tabular-nums">{formatNumber(row.intervention_count)}</span>,
  },
]

type AtRiskTableProps = {
  search: { page: number; sort?: LearnerSort | undefined; desc?: boolean | undefined }
  filters: Filters
}

/** The learners at risk, worst first by default; the order and the page live in the URL. */
export function AtRiskTable({ search, filters }: AtRiskTableProps) {
  const query = useSuspenseQuery(atRiskOptions(filters, search))
  const navigate = useNavigate()
  const sort = search.sort ? { id: search.sort, desc: search.desc ?? false } : undefined
  return (
    <section className="flex flex-col gap-4">
      <h2 className="text-xl font-semibold">{m.analytics_at_risk_table()}</h2>
      <ListState
        pending={false}
        error={query.error}
        count={query.data.items.length}
        filtered={activeFilters(filters) > 0}
        emptyText={m.analytics_at_risk_empty()}
        onResetFilters={() => void navigate({ to: '.', search: {} })}
        onRetry={() => void query.refetch()}
      >
        <DataTable
          label={m.analytics_at_risk_table()}
          rows={query.data.items}
          columns={columns()}
          getKey={row => `${row.user_id}:${row.course_id}`}
          sort={sort}
          onSortChange={next =>
            void navigate({ to: '.', search: prev => ({ ...prev, ...learnerSort(next), page: 1 }) })
          }
        />
        <Pager page={search.page} total={query.data.total} />
      </ListState>
    </section>
  )
}
