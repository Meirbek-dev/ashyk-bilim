import { m } from '#/paraglide/messages'
import type {
  DrillMetric,
  InterventionOutcome,
  InterventionStatus,
  InterventionType,
  RiskLevel,
  RiskTrend,
  TeacherOverviewSummary,
} from '#/shared/api/gen/types.gen'

import type { Trend } from '../model/analytics'
import type { BUCKETS, COMPARES, Tab, WINDOWS } from '../model/filters'

// Exhaustive maps (spec 7.9, DESIGN 8): a new value without a text is a type error here.

export const tabLabels = {
  overview: m.platform_tab_overview,
  learners: m.platform_tab_learners,
  performance: m.platform_tab_performance,
  operations: m.platform_tab_operations,
} satisfies Record<Tab, () => string>

export const windowLabels = {
  '7d': m.analytics_window_7d,
  '28d': m.analytics_window_28d,
  '90d': m.analytics_window_90d,
} satisfies Record<(typeof WINDOWS)[number], () => string>

export const compareLabels = {
  previous_period: m.analytics_compare_previous,
  none: m.analytics_compare_none,
} satisfies Record<(typeof COMPARES)[number], () => string>

export const bucketLabels = {
  day: m.analytics_bucket_day,
  week: m.analytics_bucket_week,
} satisfies Record<(typeof BUCKETS)[number], () => string>

export const kpiLabels = {
  active_learners: m.analytics_kpi_active_learners,
  returning_learners: m.analytics_kpi_returning_learners,
  completion_rate: m.analytics_kpi_completion_rate,
  at_risk_learners: m.analytics_kpi_at_risk_learners,
  ungraded_submissions: m.analytics_kpi_ungraded_submissions,
  negative_engagement_courses: m.analytics_kpi_negative_engagement,
} satisfies Record<keyof TeacherOverviewSummary, () => string>

/** The heading of a drill-through: the number it explains. */
export const drillTitles = {
  active_learners: m.analytics_kpi_active_learners,
  completion_rate: m.analytics_kpi_completion_rate,
  backlog: m.analytics_kpi_ungraded_submissions,
  pass_rate: m.analytics_pass_rows,
} satisfies Record<DrillMetric, () => string>

export const trendLabels = {
  better: { label: m.analytics_trend_better, tone: 'success' },
  worse: { label: m.analytics_trend_worse, tone: 'destructive' },
  same: { label: m.analytics_trend_same, tone: 'neutral' },
} as const satisfies Record<Trend, { label: () => string; tone: 'success' | 'destructive' | 'neutral' }>

export const riskLevelBadges = {
  high: { label: m.analytics_risk_high, tone: 'destructive' },
  medium: { label: m.analytics_risk_medium, tone: 'warning' },
  low: { label: m.analytics_risk_low, tone: 'neutral' },
} as const satisfies Record<RiskLevel, { label: () => string; tone: 'destructive' | 'warning' | 'neutral' }>

export const riskTrendLabels = {
  newly_at_risk: m.analytics_risk_trend_new,
  worsening: m.analytics_risk_trend_worsening,
  improving: m.analytics_risk_trend_improving,
  recovered: m.analytics_risk_trend_recovered,
  stable: m.analytics_risk_trend_stable,
} satisfies Record<RiskTrend, () => string>

export const interventionTypeLabels = {
  message_sent: m.analytics_intervention_message_sent,
  submission_graded: m.analytics_intervention_submission_graded,
  extension_granted: m.analytics_intervention_extension_granted,
  meeting_scheduled: m.analytics_intervention_meeting_scheduled,
  learner_recovered: m.analytics_intervention_learner_recovered,
} satisfies Record<InterventionType, () => string>

export const interventionOutcomeLabels = {
  improved: m.analytics_outcome_improved,
  no_change: m.analytics_outcome_no_change,
  worsened: m.analytics_outcome_worsened,
  no_response: m.analytics_outcome_no_response,
} satisfies Record<InterventionOutcome, () => string>

export const interventionStatusLabels = {
  planned: m.analytics_intervention_status_planned,
  completed: m.analytics_intervention_status_completed,
  resolved: m.analytics_intervention_status_resolved,
} satisfies Record<InterventionStatus, () => string>
