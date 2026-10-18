import { m } from '#/paraglide/messages'
import type {
  AssessmentCohortRow,
  QuestionDifficultyRow,
  TeacherAssessmentDetailResponse,
} from '#/shared/api/gen/types.gen'
import { Bars } from '#/shared/components/charts/bars'
import { KpiStrip } from '#/shared/components/charts/kpi-strip'
import { KpiTile } from '#/shared/components/charts/kpi-tile'
import type { DataColumn } from '#/shared/components/data-columns'
import { DataTable } from '#/shared/components/data-table'
import { formatNumber, formatPercent } from '#/shared/i18n/format'

import { hours, percent, score } from './kpi'

const questionColumns = (): DataColumn<QuestionDifficultyRow>[] => [
  { id: 'question', header: m.analytics_col_question(), priority: 1, cell: row => row.question_label },
  { id: 'accuracy', header: m.analytics_col_accuracy(), priority: 2, cell: row => percent(row.accuracy_pct) },
  {
    id: 'discrimination',
    header: m.analytics_col_discrimination(),
    priority: 2,
    cell: row => score(row.discrimination_index),
  },
  { id: 'strong', header: m.analytics_col_strong_miss(), priority: 3, cell: row => percent(row.strong_miss_pct) },
  { id: 'weak', header: m.analytics_col_weak_correct(), priority: 3, cell: row => percent(row.weak_correct_pct) },
  {
    id: 'distractors',
    header: m.analytics_col_distractors(),
    priority: 3,
    cell: row => formatNumber(row.distractor_issue_count),
  },
]

const groupColumns = (): DataColumn<AssessmentCohortRow>[] => [
  { id: 'group', header: m.analytics_col_group(), priority: 1, cell: row => row.cohort_name },
  { id: 'eligible', header: m.analytics_col_eligible(), priority: 3, cell: row => formatNumber(row.eligible_learners) },
  { id: 'submission', header: m.analytics_col_submission(), priority: 2, cell: row => percent(row.submission_rate) },
  { id: 'pass', header: m.analytics_col_pass(), priority: 2, cell: row => percent(row.pass_rate) },
  { id: 'awaiting', header: m.analytics_col_awaiting(), priority: 3, cell: row => formatNumber(row.awaiting_grading) },
  {
    id: 'returned',
    header: m.analytics_col_returned(),
    priority: 3,
    cell: row => formatNumber(row.returned_for_resubmission),
  },
  { id: 'released', header: m.analytics_col_released(), priority: 3, cell: row => formatNumber(row.released_learners) },
]

/**
 * The assessment drill's "what went wrong" (B-ANL-28): attempts per learner, the most missed questions, each
 * question's quality, the groups side by side and the review deadline. Empty parts are not shown.
 */
export function AssessmentInsights({ data }: { data: TeacherAssessmentDetailResponse }) {
  const { slo } = data
  return (
    <>
      {data.attempt_distribution.length > 0 ? (
        <Bars
          title={m.analytics_attempts_distribution()}
          data={data.attempt_distribution.map(bucket => ({ label: bucket.label, value: bucket.count }))}
          formatValue={value => formatNumber(value)}
        />
      ) : null}
      {data.common_failures.length > 0 ? (
        <section className="flex flex-col gap-2">
          <h3 className="text-lg font-semibold">{m.analytics_common_failures()}</h3>
          <ul className="flex flex-col gap-1">
            {data.common_failures.map(failure => (
              <li key={failure.key} className="flex justify-between gap-4">
                <span className="wrap-anywhere">{failure.label}</span>
                {/* The share of learners who missed the question (a code challenge has none). */}
                <span className="text-muted-foreground tabular-nums">{formatPercent(failure.count)}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      {data.question_breakdown.length > 0 ? (
        <section className="flex flex-col gap-4">
          <h3 className="text-lg font-semibold">{m.analytics_questions_title()}</h3>
          <DataTable
            label={m.analytics_questions_title()}
            rows={data.question_breakdown}
            columns={questionColumns()}
            getKey={row => row.question_id}
          />
        </section>
      ) : null}
      {data.cohort_analytics.length > 0 ? (
        <section className="flex flex-col gap-4">
          <h3 className="text-lg font-semibold">{m.analytics_groups_title()}</h3>
          <DataTable
            label={m.analytics_groups_title()}
            rows={data.cohort_analytics}
            columns={groupColumns()}
            getKey={row => row.cohort_id}
          />
        </section>
      ) : null}
      {data.diagnostics.manual_grading_required ? (
        <section aria-label={m.analytics_slo_title()} className="flex flex-col gap-4">
          <h3 className="text-lg font-semibold">{m.analytics_slo_title()}</h3>
          <KpiStrip columns={4}>
            <KpiTile label={m.analytics_slo_target()} value={hours(slo.target_hours)} />
            <KpiTile label={m.analytics_slo_p90()} value={hours(slo.observed_p90_hours)} />
            <KpiTile label={m.analytics_col_backlog()} value={formatNumber(slo.backlog_count)} />
            <KpiTile label={m.analytics_slo_overdue()} value={formatNumber(slo.overdue_backlog_count)} />
          </KpiStrip>
        </section>
      ) : null}
    </>
  )
}
