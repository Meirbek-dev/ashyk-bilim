import { m } from '#/paraglide/messages'
import type { CourseId, GradingMetrics } from '#/shared/api/gen/types.gen'
import { KpiStrip } from '#/shared/components/charts/kpi-strip'
import { KpiTile } from '#/shared/components/charts/kpi-tile'
import { Link } from '#/shared/components/link'
import { formatNumber, formatPercent } from '#/shared/i18n/format'

import { acceptance, decided, feedbackChange, oneDecimal } from '../model/metrics'
import { type AiGradingSearch, PERIODS } from '../route'

const hours = (value: number) => m.ai_grading_hours({ value: formatNumber(oneDecimal(value)) })

const trendText = { faster: m.ai_grading_faster, slower: m.ai_grading_slower, same: m.ai_grading_same }
const trendTone = { faster: 'success', slower: 'destructive', same: 'neutral' } as const

type MetricsSectionProps = { courseId: CourseId; search: AiGradingSearch; metrics: GradingMetrics }

/**
 * The period links (`?days=`, B-AIG-02) and the numbers (B-AIG-03): median time to feedback against the period before,
 * drafts applied as proposed, the mean gap between AI and teacher, hours saved, drafts written.
 */
export function MetricsSection({ courseId, search, metrics }: MetricsSectionProps) {
  const change = feedbackChange(metrics.median_feedback_hours, metrics.previous_median_feedback_hours)
  const accepted = acceptance(metrics)
  return (
    <section aria-labelledby="ai-grading-metrics" className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <h2 id="ai-grading-metrics" className="text-xl font-semibold">
          {m.ai_grading_metrics_title()}
        </h2>
        <nav aria-label={m.ai_grading_period()} className="flex flex-wrap">
          {PERIODS.map(days => (
            <Link
              key={days}
              to="/teach/courses/$courseId/ai-grading"
              params={{ courseId }}
              search={{ ...search, days: days === 30 ? undefined : days }}
              activeOptions={{ exact: true, includeSearch: true }}
              variant="tab"
            >
              {m.ai_grading_days({ count: formatNumber(days) })}
            </Link>
          ))}
        </nav>
      </div>
      <KpiStrip label={m.ai_grading_metrics_title()} columns={4}>
        <KpiTile
          label={m.ai_grading_kpi_feedback()}
          value={metrics.median_feedback_hours === null ? null : hours(metrics.median_feedback_hours)}
          missing={m.ai_grading_no_data()}
          change={
            change
              ? m.ai_grading_feedback_before({ hours: hours(change.before), trend: trendText[change.trend]() })
              : undefined
          }
          tone={change ? trendTone[change.trend] : 'neutral'}
        />
        <KpiTile
          label={m.ai_grading_kpi_accepted()}
          value={accepted === null ? null : formatPercent(accepted)}
          missing={m.ai_grading_no_data()}
          change={m.ai_grading_accepted_of({
            exact: formatNumber(metrics.applied_exact),
            adjusted: formatNumber(metrics.applied_adjusted),
            discarded: formatNumber(metrics.discarded),
            total: formatNumber(decided(metrics)),
          })}
        />
        <KpiTile
          label={m.ai_grading_kpi_delta()}
          value={
            metrics.mean_abs_delta === null
              ? null
              : m.ai_grading_points({ value: formatNumber(oneDecimal(metrics.mean_abs_delta)) })
          }
          missing={m.ai_grading_no_data()}
        />
        <KpiTile label={m.ai_grading_kpi_saved()} value={hours(metrics.saved_hours)} />
        <KpiTile
          label={m.ai_grading_kpi_drafts()}
          value={formatNumber(metrics.drafts)}
          change={m.ai_grading_drafts_state({
            ready: formatNumber(metrics.ready),
            failed: formatNumber(metrics.failed),
          })}
        />
      </KpiStrip>
    </section>
  )
}
