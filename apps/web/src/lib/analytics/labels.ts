import type { AssessmentType, Bucket, ComparePreset } from '@/types/analytics'

type Translator = ((key: string, values?: Record<string, string | number>) => string) & {
  has?: (key: string) => boolean
}

/** Outcomes the previous client stored as English prose; shown through their codes. */
const legacyOutcomeCodes: Record<string, string> = {
  'Learner contacted': 'learner_contacted',
  'Teacher check-in scheduled': 'check_in_scheduled',
  'Remediation draft prepared': 'remediation_draft_prepared',
  'Recovered from risk': 'recovered_from_risk',
  'Risk marked resolved after teacher review.': 'risk_resolved_after_review',
}

/**
 * Wire codes (`snake_case` enums, note/label codes, intervention types…)
 * rendered through `TeacherAnalytics.codes.<code>`; unknown codes fall back
 * to a humanised form instead of the raw key.
 */
export function getAnalyticsCodeLabel(t: Translator, code: string | null | undefined): string {
  if (!code) return t('atRisk.na')
  const normalized = legacyOutcomeCodes[code] ?? code
  const key = `codes.${normalized}`
  if (t.has ? t.has(key) : /^[a-z0-9_]+$/.test(normalized)) return t(key)
  return code.replaceAll('_', ' ')
}

const assessmentTypeKeys: Record<string, string> = {
  manual_assessment: 'labels.assessmentType.manualAssessment',
  quiz: 'labels.assessmentType.quiz',
  exam: 'labels.assessmentType.exam',
  code_challenge: 'labels.assessmentType.codeChallenge',
}

/**
 * `sort_by` keys each listing honours (the server 422s on any other key, and
 * the overview endpoints do not sort at all — UX-095).
 */
export const AT_RISK_SORT_KEYS = ['risk', 'progress', 'activity', 'name'] as const
export const COURSE_SORT_KEYS = [
  'name',
  'active',
  'completion',
  'risk',
  'health',
  'engagement',
  'difficulty',
  'signals',
] as const
export const ASSESSMENT_SORT_KEYS = ['title', 'submission', 'pass', 'difficulty', 'latency', 'signals'] as const

const sortKeys: Record<string, string> = {
  risk: 'filters.sortRisk',
  progress: 'filters.sortProgress',
  activity: 'filters.sortActivity',
  name: 'filters.sortName',
  active: 'filters.sortActiveLearners',
  completion: 'filters.sortCompletion',
  health: 'filters.sortHealth',
  engagement: 'filters.sortEngagement',
  difficulty: 'filters.sortDifficulty',
  signals: 'filters.sortSignals',
  title: 'filters.sortTitle',
  submission: 'filters.sortSubmission',
  pass: 'filters.sortPass',
  latency: 'filters.sortLatency',
}

const bucketKeys: Record<string, string> = {
  day: 'labels.bucket.day',
  week: 'labels.bucket.week',
}

const compareKeys: Record<string, string> = {
  previous_period: 'labels.compare.previousPeriod',
  none: 'labels.compare.none',
}

const severityKeys: Record<string, string> = {
  info: 'labels.severity.info',
  warning: 'labels.severity.warning',
  critical: 'labels.severity.critical',
}

const alertTypeKeys: Record<string, string> = {
  risk_spike: 'labels.alertType.riskSpike',
  engagement_drop: 'labels.alertType.engagementDrop',
  grading_backlog: 'labels.alertType.gradingBacklog',
  grading_slo: 'labels.alertType.gradingSlo',
  assessment_outlier: 'labels.alertType.assessmentOutlier',
  content_stale: 'labels.alertType.contentStale',
}

const riskLevelKeys: Record<string, string> = {
  low: 'labels.riskLevel.low',
  medium: 'labels.riskLevel.medium',
  high: 'labels.riskLevel.high',
}

const reasonCodeKeys: Record<string, string> = {
  inactive_7d: 'labels.reasonCode.inactive7d',
  low_progress: 'labels.reasonCode.lowProgress',
  repeated_failures: 'labels.reasonCode.repeatedFailures',
  missing_required_assessments: 'labels.reasonCode.missingRequiredAssessments',
  grading_block: 'labels.reasonCode.gradingBlock',
  low_submission_rate: 'labels.reasonCode.lowSubmissionRate',
  low_success_rate: 'labels.reasonCode.lowSuccessRate',
  slow_feedback: 'labels.reasonCode.slowFeedback',
  low_pass_rate: 'labels.reasonCode.lowPassRate',
  grading_latency: 'labels.reasonCode.gradingLatency',
  low_completion_rate: 'labels.reasonCode.lowCompletionRate',
  below_threshold: 'labels.reasonCode.belowThreshold',
  low_accuracy: 'labels.reasonCode.lowAccuracy',
}

const signalKeys: Record<string, string> = {
  content_freshness: 'labels.signal.contentFreshness',
  average_progress: 'labels.signal.averageProgress',
  grading_backlog: 'labels.signal.gradingBacklog',
}

const statusKeys: Record<string, string> = {
  DRAFT: 'labels.status.draft',
  PUBLISHED: 'labels.status.published',
  RETURNED: 'labels.status.returned',
  PENDING: 'labels.status.pending',
  SUBMITTED: 'labels.status.submitted',
  GRADED: 'labels.status.graded',
  LATE: 'labels.status.late',
  NOT_SUBMITTED: 'labels.status.notSubmitted',
  IN_PROGRESS: 'labels.status.inProgress',
  AUTO_SUBMITTED: 'labels.status.autoSubmitted',
  COMPLETED: 'labels.status.completed',
  FAILED: 'labels.status.failed',
  PROCESSING: 'labels.status.processing',
  PENDING_JUDGE0: 'labels.status.pendingJudge0',
}

function resolveLabel(t: Translator, keyMap: Record<string, string>, value: string, fallback: string): string {
  const key = keyMap[value]
  return key ? t(key) : fallback
}

export function getAnalyticsAssessmentTypeLabel(
  t: Translator,
  normalizedAssessmentType: AssessmentType | null | undefined,
): string {
  if (!normalizedAssessmentType) return t('atRisk.na')
  return resolveLabel(t, assessmentTypeKeys, normalizedAssessmentType, normalizedAssessmentType)
}

export function getAnalyticsBucketLabel(t: Translator, normalizedBucket: Bucket | null | undefined = 'day'): string {
  const lookup = normalizedBucket ?? 'day'
  const key = (bucketKeys[lookup] ?? bucketKeys.day)!
  return t(key)
}

export function getAnalyticsCompareLabel(
  t: Translator,
  normalizedCompare: ComparePreset | null | undefined = 'none',
): string {
  const lookup = normalizedCompare ?? 'none'
  const key = (compareKeys[lookup] ?? compareKeys.none)!
  return t(key)
}

export function getAnalyticsSortLabel(t: Translator, sortKey: string): string {
  return resolveLabel(t, sortKeys, sortKey, sortKey)
}

export function getAnalyticsSeverityLabel(t: Translator, severity: string): string {
  return resolveLabel(t, severityKeys, severity, severity)
}

export function getAnalyticsAlertTypeLabel(t: Translator, alertType: string): string {
  return resolveLabel(t, alertTypeKeys, alertType, alertType.replaceAll('_', ' '))
}

export function getAnalyticsRiskLevelLabel(t: Translator, riskLevel: string): string {
  return resolveLabel(t, riskLevelKeys, riskLevel, riskLevel)
}

export function getAnalyticsReasonCodeLabel(t: Translator, reasonCode: string): string {
  return resolveLabel(t, reasonCodeKeys, reasonCode, reasonCode)
}

export function getAnalyticsSignalLabel(t: Translator, signal: string): string {
  return resolveLabel(t, signalKeys, signal, signal.replaceAll('_', ' '))
}

export function getAnalyticsStatusLabel(t: Translator, status: string | null | undefined): string {
  if (!status) {
    return t('atRisk.na')
  }
  return resolveLabel(t, statusKeys, status.toUpperCase(), status.replaceAll('_', ' '))
}

/**
 * Server-composed analytics messages (alerts, forecasts, anomalies, insights,
 * data-quality issues) arrive as an `AnalyticsCode` plus `params`; the copy is
 * `TeacherAnalytics.messages.<code>.{title,body}`. Lists of wire codes (the
 * missing event sources) are rendered through `codes.*` before joining.
 */
export function getAnalyticsMessage(
  t: Translator,
  item: { code: string; params: Record<string, unknown> },
): { title: string; body: string } {
  const values: Record<string, string | number> = {}
  for (const [key, value] of Object.entries(item.params)) {
    if (Array.isArray(value)) values[key] = value.map(v => getAnalyticsCodeLabel(t, String(v))).join(', ')
    else if (typeof value === 'number' || typeof value === 'string') values[key] = value
  }
  return { title: t(`messages.${item.code}.title`, values), body: t(`messages.${item.code}.body`, values) }
}
