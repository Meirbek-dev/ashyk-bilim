import { useSuspenseQuery } from '@tanstack/react-query'

import { m } from '#/paraglide/messages'
import type { ItemAnalytics, Stats } from '#/shared/api/gen/types.gen'
import { Bars } from '#/shared/components/charts/bars'
import { KpiTile } from '#/shared/components/charts/kpi-tile'
import type { DataColumn } from '#/shared/components/data-columns'
import { DataTable } from '#/shared/components/data-table'
import { formatNumber } from '#/shared/i18n/format'

import { assessmentOptions, itemStatsOptions, statsOptionsOf } from '../queries'
import { kindLabels, scoreText } from './labels'

const counts: readonly {
  key: keyof Stats & ('total' | 'needs_grading' | 'graded' | 'published' | 'returned' | 'late')
  label: () => string
}[] = [
  { key: 'total', label: m.grading_kpi_total },
  { key: 'needs_grading', label: m.grading_kpi_needs_grading },
  { key: 'graded', label: m.grading_kpi_graded },
  { key: 'published', label: m.grading_kpi_published },
  { key: 'returned', label: m.grading_kpi_returned },
  { key: 'late', label: m.grading_kpi_late },
]

const share = (value: number | null) => (value === null ? m.grading_no_score() : scoreText(value))

const itemColumns: DataColumn<ItemAnalytics>[] = [
  {
    id: 'title',
    header: m.grading_col_item(),
    priority: 1,
    cell: row => <span className="wrap-anywhere">{row.title}</span>,
  },
  { id: 'kind', header: m.grading_col_kind(), priority: 2, cell: row => kindLabels[row.kind]() },
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
  {
    id: 'discrimination',
    header: m.grading_col_discrimination(),
    priority: 3,
    cell: row => (
      <span className="tabular-nums">
        {row.discrimination_index === null ? m.grading_no_score() : formatNumber(row.discrimination_index)}
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
      <section aria-label={m.platform_tab_results()} className="grid grid-cols-2 gap-4 @3xl:grid-cols-4">
        {counts.map(({ key, label }) => (
          <KpiTile key={key} label={label()} value={formatNumber(stats[key])} />
        ))}
        <KpiTile label={m.grading_kpi_average()} value={share(stats.avg_score)} />
        <KpiTile label={m.grading_kpi_pass_rate()} value={share(stats.pass_rate)} />
      </section>
      <Bars
        title={m.grading_distribution()}
        data={stats.distribution.map(bucket => ({ label: bucket.range, value: bucket.count }))}
        formatValue={value => formatNumber(value)}
      />
      <section aria-labelledby="grading-items-stats" className="flex flex-col gap-4">
        <h2 id="grading-items-stats" className="text-xl font-semibold">
          {m.grading_items_stats()}
        </h2>
        {items.length === 0 ? (
          <p className="text-muted-foreground">{m.grading_items_stats_empty()}</p>
        ) : (
          <DataTable label={m.grading_items_stats()} rows={items} columns={itemColumns} getKey={row => row.item_id} />
        )}
      </section>
    </div>
  )
}
