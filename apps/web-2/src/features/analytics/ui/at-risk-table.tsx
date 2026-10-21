import { useSuspenseQuery } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'

import { m } from '#/paraglide/messages'
import type { AtRiskLearnerRow } from '#/shared/api/gen/types.gen'
import type { DataColumn } from '#/shared/components/data-columns'
import { DataTable } from '#/shared/components/data-table'
import { Link } from '#/shared/components/link'
import { ListState } from '#/shared/components/list-state'
import { ScoreBar } from '#/shared/components/charts/score-bar'
import { formatNumber, formatPercent } from '#/shared/i18n/format'

import { activeFilters, type Filters, learnerSort, type LearnerSort } from '../model/filters'
import { whyNowText } from '../model/signals'
import { atRiskOptions } from '../queries'
import { riskLevelBadges, riskTrendLabels } from './labels'
import { Pager } from './pager'

const riskInk = { destructive: 'text-destructive', warning: 'text-warning', neutral: 'text-muted-foreground' }

/** The learner (@username under the name: namesakes, B-ANL-42) and the course the risk is in. */
const learnerCell = (row: AtRiskLearnerRow) => (
  <span className="flex flex-col">
    <Link variant="title" to="." search={prev => ({ ...prev, learnerId: row.user_id, courseId: row.course_id })}>
      <span className="font-medium wrap-anywhere">{row.user_display_name}</span>
    </Link>
    {row.user_username ? (
      <span className="text-xs wrap-anywhere text-muted-foreground">@{row.user_username}</span>
    ) : null}
    <span className="wrap-anywhere text-muted-foreground">{row.course_name}</span>
  </span>
)

const columns = (): DataColumn<AtRiskLearnerRow>[] => [
  {
    id: 'name',
    header: m.analytics_col_learner(),
    priority: 1,
    sortable: true,
    // The panel opens from the URL: this link is the shareable address of the learner in this course.
    // The learner and, under the name, the course the risk is in: one cell, so long course names do not crowd the row.
    cell: row => learnerCell(row),
  },
  {
    id: 'risk',
    header: m.analytics_col_risk(),
    priority: 2,
    sortable: true,
    cell: row => {
      // The level in its color and words; the score beside it, quiet: a column of red pills read as one alarm.
      const level = riskLevelBadges[row.risk_level]
      return (
        <span className="flex flex-wrap items-baseline gap-x-2 whitespace-nowrap">
          <span className={`font-medium ${riskInk[level.tone]}`}>{level.label()}</span>
          <span className="text-muted-foreground tabular-nums">
            {formatNumber(row.risk_score)}
            {row.risk_score_delta ? ` (${formatNumber(row.risk_score_delta, { signed: true })})` : null}
          </span>
        </span>
      )
    },
  },
  {
    id: 'progress',
    header: m.analytics_col_progress(),
    priority: 2,
    sortable: true,
    cell: row => <ScoreBar value={row.progress_pct} text={formatPercent(row.progress_pct)} />,
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
  {
    id: 'trend',
    header: m.analytics_col_trend(),
    priority: 3,
    // A row's usual state is quiet text (DESIGN 9): only a change stands out.
    cell: row => (
      <span className={row.risk_trend === 'stable' ? 'text-muted-foreground' : undefined}>
        {riskTrendLabels[row.risk_trend]()}
      </span>
    ),
  },
  { id: 'why', header: m.analytics_col_why_now(), priority: 3, wrap: true, cell: row => whyNowText(row) },
  {
    id: 'interventions',
    header: m.analytics_col_interventions(),
    priority: 2,
    cell: row => (
      <span className={row.intervention_count === 0 ? 'text-muted-foreground tabular-nums' : 'tabular-nums'}>
        {formatNumber(row.intervention_count)}
      </span>
    ),
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
