import { useSuspenseQuery } from '@tanstack/react-query'

import { m } from '#/paraglide/messages'
import type { FileReviewStats } from '#/shared/api/gen/types.gen'
import { KpiStrip } from '#/shared/components/charts/kpi-strip'

import { fileStatsOptions, taskOptions } from '../queries'
import { type CountFilter, CountTile } from './count-tile'

const counts: readonly { key: keyof FileReviewStats; label: () => string; filter: CountFilter }[] = [
  { key: 'total', label: m.grading_kpi_total, filter: {} },
  { key: 'submitted', label: m.grading_kpi_needs_grading, filter: { status: 'needs_grading' } },
  { key: 'graded', label: m.grading_kpi_graded, filter: { status: 'graded' } },
  { key: 'published', label: m.grading_kpi_published, filter: { status: 'published' } },
  { key: 'returned', label: m.grading_kpi_returned, filter: { status: 'returned' } },
  { key: 'late', label: m.grading_kpi_late, filter: { late: true } },
]

/**
 * A file submission's `results` (B-GRD-18): the counts of its hand-ins by state from `fileSubmissionReviewStats`; the
 * server keeps no score distribution for files.
 */
export function FileResults({ activityId }: { activityId: string }) {
  const { data: task } = useSuspenseQuery(taskOptions(activityId))
  const { data: stats } = useSuspenseQuery(fileStatsOptions(task.id, undefined))
  return (
    <KpiStrip label={m.platform_tab_results()} columns={3}>
      {counts.map(({ key, label, filter }) => (
        <CountTile key={key} label={label()} value={stats[key]} filter={filter} />
      ))}
    </KpiStrip>
  )
}
