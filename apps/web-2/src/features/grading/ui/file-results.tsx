import { useSuspenseQuery } from '@tanstack/react-query'

import { m } from '#/paraglide/messages'
import type { FileReviewStats } from '#/shared/api/gen/types.gen'
import { KpiStrip } from '#/shared/components/charts/kpi-strip'
import { KpiTile } from '#/shared/components/charts/kpi-tile'
import { formatNumber } from '#/shared/i18n/format'

import { fileStatsOptions, taskOptions } from '../queries'

const counts: readonly { key: keyof FileReviewStats; label: () => string }[] = [
  { key: 'total', label: m.grading_kpi_total },
  { key: 'submitted', label: m.grading_kpi_needs_grading },
  { key: 'graded', label: m.grading_kpi_graded },
  { key: 'published', label: m.grading_kpi_published },
  { key: 'returned', label: m.grading_kpi_returned },
  { key: 'late', label: m.grading_kpi_late },
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
      {counts.map(({ key, label }) => (
        <KpiTile key={key} label={label()} value={formatNumber(stats[key])} />
      ))}
    </KpiStrip>
  )
}
