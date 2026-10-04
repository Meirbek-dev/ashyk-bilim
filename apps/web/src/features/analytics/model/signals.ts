import * as v from 'valibot'

import { m } from '#/paraglide/messages'
import type {
  AnalyticsCode,
  ContentBottleneckSignal,
  MessageParams,
  OutlierReasonCode,
  RecommendedAction,
  RiskReasonCode,
  Severity,
  WhyNow,
} from '#/shared/api/gen/types.gen'
import { vContentBottleneckSignal } from '#/shared/api/gen/valibot.gen'
import { formatNumber, formatPercent } from '#/shared/i18n/format'

// Exhaustive maps (spec 7.9, DESIGN 8): a value the server adds without a text here is a type error.

export const severityBadges = {
  critical: { label: m.analytics_severity_critical, tone: 'destructive' },
  warning: { label: m.analytics_severity_warning, tone: 'warning' },
  info: { label: m.analytics_severity_info, tone: 'info' },
} as const satisfies Record<Severity, { label: () => string; tone: 'destructive' | 'warning' | 'info' }>

const bottleneckLabels = {
  high_time_low_completion: m.analytics_bottleneck_high_time_low_completion,
  exit_after_open: m.analytics_bottleneck_exit_after_open,
  repeated_assessment_failures: m.analytics_bottleneck_repeated_assessment_failures,
  stale_low_performance: m.analytics_bottleneck_stale_low_performance,
} satisfies Record<ContentBottleneckSignal, () => string>

export const recommendedActionLabels = {
  review_submissions_first: m.analytics_action_review_submissions_first,
  contact_learner_this_week: m.analytics_action_contact_learner_this_week,
  offer_targeted_help: m.analytics_action_offer_targeted_help,
  remind_missing_work: m.analytics_action_remind_missing_work,
  schedule_pace_meeting: m.analytics_action_schedule_pace_meeting,
  send_personal_message: m.analytics_action_send_personal_message,
} satisfies Record<RecommendedAction, () => string>

export const whyNowLabels = {
  grading_block_blocks_progress: m.analytics_why_grading_block_blocks_progress,
  inactivity_past_7_days: m.analytics_why_inactivity_past_7_days,
  recent_assessment_failures: m.analytics_why_recent_assessment_failures,
  missing_required_work: m.analytics_why_missing_required_work,
  progress_behind_course_baseline: m.analytics_why_progress_behind_course_baseline,
  multiple_risk_signals: m.analytics_why_multiple_risk_signals,
} satisfies Record<WhyNow, () => string>

export const riskReasonLabels = {
  inactive_7d: m.analytics_reason_inactive_7d,
  low_progress: m.analytics_reason_low_progress,
  repeated_failures: m.analytics_reason_repeated_failures,
  missing_required_assessments: m.analytics_reason_missing_required_assessments,
  grading_block: m.analytics_reason_grading_block,
} satisfies Record<RiskReasonCode, () => string>

export const outlierLabels = {
  low_completion_rate: m.analytics_outlier_low_completion_rate,
  below_threshold: m.analytics_outlier_below_threshold,
  low_accuracy: m.analytics_outlier_low_accuracy,
  low_submission_rate: m.analytics_outlier_low_submission_rate,
  low_success_rate: m.analytics_outlier_low_success_rate,
  grading_latency: m.analytics_outlier_grading_latency,
} satisfies Record<OutlierReasonCode, () => string>

// `params` is `{ [name]: string | number }`; the names per code are in the contract's AnalyticsCode description.
const text = (p: MessageParams, key: string): string => String(p[key] ?? '')
const num = (p: MessageParams, key: string): string => {
  const value = p[key]
  return typeof value === 'number' ? formatNumber(value) : text(p, key)
}
const pct = (p: MessageParams, key: string): string => {
  const value = p[key]
  return typeof value === 'number' ? formatPercent(value) : text(p, key)
}
const hrs = (p: MessageParams, key: string): string => m.analytics_hours({ value: num(p, key) })
const bottleneck = (p: MessageParams): string => {
  const signal = p['signal']
  return v.is(vContentBottleneckSignal, signal) ? bottleneckLabels[signal]() : text(p, 'signal')
}
const slo = (p: MessageParams) => ({
  title: text(p, 'assessment_title'),
  course: text(p, 'course_name'),
  breaches: num(p, 'breaches'),
  awaiting: num(p, 'awaiting'),
  oldest: hrs(p, 'oldest_hours'),
  target: hrs(p, 'target_hours'),
})

/** The sentence for a server-composed analytics item: its code localised with its params, numbers formatted. */
export const signalText = {
  grading_backlog: p => m.analytics_code_grading_backlog({ count: num(p, 'count') }),
  engagement_dropped: p => m.analytics_code_engagement_dropped({ delta: pct(p, 'delta_pct') }),
  content_stale: p => m.analytics_code_content_stale({ days: num(p, 'days') }),
  risk_spike: p => m.analytics_code_risk_spike({ count: num(p, 'count') }),
  grading_slo_breached: p => m.analytics_code_grading_slo_breached(slo(p)),
  grading_slo_watch: p => m.analytics_code_grading_slo_watch(slo(p)),
  completion_target_miss: p =>
    m.analytics_code_completion_target_miss({ course: text(p, 'course_name'), count: num(p, 'count') }),
  course_completion_deadline: p =>
    m.analytics_code_course_completion_deadline({ course: text(p, 'course_name'), expected: pct(p, 'expected_pct') }),
  grading_backlog_7d: p => m.analytics_code_grading_backlog_7d({ count: num(p, 'count') }),
  assessment_failure_risk: p =>
    m.analytics_code_assessment_failure_risk({ title: text(p, 'assessment_title'), expected: pct(p, 'expected_pct') }),
  sharp_engagement_drop: p => m.analytics_code_sharp_engagement_drop({ course: text(p, 'course_name') }),
  submission_spike: p => m.analytics_code_submission_spike({ course: text(p, 'course_name') }),
  fast_quiz_completion: p => m.analytics_code_fast_quiz_completion({ title: text(p, 'assessment_title') }),
  score_distribution_shift: p => m.analytics_code_score_distribution_shift({ title: text(p, 'assessment_title') }),
  new_at_risk_learners: p =>
    m.analytics_code_new_at_risk_learners({ course: text(p, 'course_name'), count: num(p, 'count') }),
  low_pass_rate: p => m.analytics_code_low_pass_rate({ title: text(p, 'assessment_title'), rate: pct(p, 'pass_rate') }),
  low_pass_rate_with_diagnostics: p =>
    m.analytics_code_low_pass_rate_with_diagnostics({ title: text(p, 'assessment_title'), rate: pct(p, 'pass_rate') }),
  content_bottleneck: p =>
    m.analytics_code_content_bottleneck({ activity: text(p, 'activity_name'), signal: bottleneck(p) }),
  workload_backlog: p =>
    m.analytics_code_workload_backlog({
      count: num(p, 'count'),
      breaches: num(p, 'breaches'),
      forecast: num(p, 'forecast_7d'),
      target: hrs(p, 'target_hours'),
    }),
  completion_improved: p =>
    m.analytics_code_completion_improved({ course: text(p, 'course_name'), delta: num(p, 'delta_pts') }),
  missing_event_sources: () => m.analytics_code_missing_event_sources(),
  thin_course_data: p => m.analytics_code_thin_course_data({ count: num(p, 'count') }),
  stale_rollup: () => m.analytics_code_stale_rollup(),
} satisfies Record<AnalyticsCode, (params: MessageParams) => string>
