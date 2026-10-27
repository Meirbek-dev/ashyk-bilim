import { useSuspenseQuery } from '@tanstack/react-query'

import { m } from '#/paraglide/messages'
import type { FileReviewStats } from '#/shared/api/gen/types.gen'
import { Bars } from '#/shared/components/charts/bars'
import { KpiStrip } from '#/shared/components/charts/kpi-strip'
import { KpiTile } from '#/shared/components/charts/kpi-tile'
import { formatNumber, formatPercent } from '#/shared/i18n/format'

import { fileStatsOptions, taskOptions } from '../queries'
import { type CountFilter, CountTile } from './count-tile'

const counts: readonly {
  key: keyof FileReviewStats & ('total' | 'submitted' | 'graded' | 'published' | 'returned' | 'late')
  label: () => string
  filter: CountFilter
}[] = [
  { key: 'total', label: m.grading_kpi_total, filter: {} },
  { key: 'submitted', label: m.grading_kpi_needs_grading, filter: { status: 'needs_grading' } },
  { key: 'graded', label: m.grading_kpi_graded, filter: { status: 'graded' } },
  { key: 'published', label: m.grading_kpi_published, filter: { status: 'published' } },
  { key: 'returned', label: m.grading_kpi_returned, filter: { status: 'returned' } },
  { key: 'late', label: m.grading_kpi_late, filter: { late: true } },
]

/**
 * A file submission's `results` (B-GRD-18): the counts of its hand-ins by state, the average and the score
 * distribution of graded ones from `fileSubmissionReviewStats`. A file task has no passing score, so no pass rate.
 */
export function FileResults({ activityId }: { activityId: string }) {
  const { data: task } = useSuspenseQuery(taskOptions(activityId))
  const { data: stats } = useSuspenseQuery(fileStatsOptions(task.id, undefined))
  return (
    <div className="flex flex-col gap-8">
      <KpiStrip label={m.platform_tab_results()} columns={4}>
        {counts.map(({ key, label, filter }) => (
          <CountTile key={key} label={label()} value={stats[key]} filter={filter} />
        ))}
        <KpiTile
          label={m.grading_kpi_average()}
          value={stats.avg_score === null ? m.grading_no_score() : formatPercent(stats.avg_score)}
        />
      </KpiStrip>
      <Bars
        title={m.grading_distribution()}
        data={stats.distribution.map(bucket => ({ label: bucket.range, value: bucket.count }))}
        formatValue={value => formatNumber(value)}
        empty={m.grading_distribution_empty()}
      />
    </div>
  )
}
