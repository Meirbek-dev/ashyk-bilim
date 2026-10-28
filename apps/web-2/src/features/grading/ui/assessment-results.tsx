import { useSuspenseQuery } from '@tanstack/react-query'

import { m } from '#/paraglide/messages'
import type { ItemAnalytics, ItemBody, Stats } from '#/shared/api/gen/types.gen'
import { Bars } from '#/shared/components/charts/bars'
import { KpiStrip } from '#/shared/components/charts/kpi-strip'
import { KpiTile } from '#/shared/components/charts/kpi-tile'
import type { DataColumn } from '#/shared/components/data-columns'
import { DataTable } from '#/shared/components/data-table'
import { formatNumber, formatPercent } from '#/shared/i18n/format'

import { assessmentOptions, itemStatsOptions, statsOptionsOf } from '../queries'
import { type CountFilter, CountTile } from './count-tile'
import { itemKindText } from './labels'

const counts: readonly {
  key: keyof Stats & ('total' | 'needs_grading' | 'graded' | 'published' | 'returned' | 'late')
  label: () => string
  filter: CountFilter
}[] = [
  { key: 'total', label: m.grading_kpi_total, filter: {} },
  { key: 'needs_grading', label: m.grading_kpi_needs_grading, filter: { status: 'needs_grading' } },
  { key: 'graded', label: m.grading_kpi_graded, filter: { status: 'graded' } },
  { key: 'published', label: m.grading_kpi_published, filter: { status: 'published' } },
  { key: 'returned', label: m.grading_kpi_returned, filter: { status: 'returned' } },
  { key: 'late', label: m.grading_kpi_late, filter: { late: true } },
]

// Shares and averages at one decimal (formatPercent), as the per-question columns: «28,57 %» beside «28,6 %» read as two numbers.
// No answer yet: a quiet dash read as «Нет оценки», as in the gradebook.
const share = (value: number | null) =>
  value === null ? (
    <span className="text-muted-foreground">
      <span aria-hidden>—</span>
      <span className="sr-only">{m.grading_no_score()}</span>
    </span>
  ) : (
    formatPercent(value)
  )

/** The per-question table; a question's kind reads as the builder named it, from the assessment's own item body. */
const itemColumns = (bodies: ReadonlyMap<string, ItemBody>): DataColumn<ItemAnalytics>[] => [
  {
    id: 'title',
    header: m.grading_col_item(),
    priority: 1,
    cell: row => <span className="wrap-anywhere">{row.title}</span>,
  },
  {
    id: 'kind',
    header: m.grading_col_kind(),
    priority: 2,
    cell: row => itemKindText(row.kind, bodies.get(row.item_id)),
  },
  {
    id: 'responses',
    header: m.grading_col_responses(),
    priority: 2,
    cell: row => <span className="tabular-nums">{formatNumber(row.response_count)}</span>,
  },
  {
    id: 'average',
    header: m.grading_col_average(),
    priority: 2,
    cell: row => <span className="tabular-nums">{share(row.avg_score_pct)}</span>,
  },
  {
    id: 'correct',
    header: m.grading_col_correct(),
    priority: 2,
    cell: row => <span className="tabular-nums">{share(row.correct_pct)}</span>,
  },
  // Null below six graded works or for an item without a right answer: too little to tell, not a missing grade.
  {
    id: 'discrimination',
    header: m.grading_col_discrimination(),
    priority: 3,
    cell: row => (
      <span className="tabular-nums">
        {row.discrimination_index === null ? m.grading_discrimination_few() : formatNumber(row.discrimination_index)}
      </span>
    ),
  },
]

/** Counts, average, pass rate and the score distribution from `stats`; per-question numbers (B-GRD-18). */
export function AssessmentResults({ activityId }: { activityId: string }) {
  const { data: assessment } = useSuspenseQuery(assessmentOptions(activityId))
  const { data: stats } = useSuspenseQuery(statsOptionsOf(assessment.id))
  const { data: items } = useSuspenseQuery(itemStatsOptions(assessment.id))
  return (
    <div className="flex flex-col gap-8">
      <KpiStrip label={m.platform_tab_results()} columns={4}>
        {counts.map(({ key, label, filter }) => (
          <CountTile key={key} label={label()} value={stats[key]} filter={filter} />
        ))}
        {/* Before the first graded work: a quiet dash, as the gradebook, not a headline «Нет оценки». */}
        <KpiTile
          label={m.grading_kpi_average()}
          value={stats.avg_score === null ? null : formatPercent(stats.avg_score)}
          missing={m.grading_no_score()}
        />
        <KpiTile
          label={m.grading_kpi_pass_rate()}
          value={stats.pass_rate === null ? null : formatPercent(stats.pass_rate)}
          missing={m.grading_no_score()}
        />
      </KpiStrip>
      <Bars
        title={m.grading_distribution()}
        data={stats.distribution.map(bucket => ({ label: bucket.range, value: bucket.count }))}
        formatValue={value => formatNumber(value)}
        empty={m.grading_distribution_empty()}
      />
      <section aria-labelledby="grading-items-stats" className="flex flex-col gap-4">
        <h2 id="grading-items-stats" className="text-xl font-semibold">
          {m.grading_items_stats()}
        </h2>
        {items.length === 0 ? (
          <p className="text-muted-foreground">{m.grading_items_stats_empty()}</p>
        ) : (
          <DataTable
            label={m.grading_items_stats()}
            rows={items}
            columns={itemColumns(new Map(assessment.items.map(item => [item.id, item.body])))}
            getKey={row => row.item_id}
          />
        )}
      </section>
    </div>
  )
}
