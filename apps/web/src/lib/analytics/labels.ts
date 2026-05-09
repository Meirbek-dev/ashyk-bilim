import type { AssessmentType, Bucket, ComparePreset } from '@/types/analytics';

type Translator = (key: string, values?: Record<string, string | number>) => string;

const assessmentTypeKeys: Record<AssessmentType, string> = {
  assignment: 'labels.assessmentType.assignment',
  quiz: 'labels.assessmentType.quiz',
  exam: 'labels.assessmentType.exam',
  code_challenge: 'labels.assessmentType.codeChallenge',
};

const bucketKeys: Record<Bucket, string> = {
  day: 'labels.bucket.day',
  week: 'labels.bucket.week',
};

const compareKeys: Record<ComparePreset, string> = {
  previous_period: 'labels.compare.previousPeriod',
  none: 'labels.compare.none',
};

const severityKeys: Record<string, string> = {
  info: 'labels.severity.info',
  warning: 'labels.severity.warning',
  critical: 'labels.severity.critical',
};

const alertTypeKeys: Record<string, string> = {
  risk_spike: 'labels.alertType.riskSpike',
  engagement_drop: 'labels.alertType.engagementDrop',
  grading_backlog: 'labels.alertType.gradingBacklog',
  grading_slo: 'labels.alertType.gradingSlo',
  assessment_outlier: 'labels.alertType.assessmentOutlier',
  content_stale: 'labels.alertType.contentStale',
};

const riskLevelKeys: Record<string, string> = {
  low: 'labels.riskLevel.low',
  medium: 'labels.riskLevel.medium',
  high: 'labels.riskLevel.high',
};

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
};

const signalKeys: Record<string, string> = {
  content_freshness: 'labels.signal.contentFreshness',
  average_progress: 'labels.signal.averageProgress',
  grading_backlog: 'labels.signal.gradingBacklog',
};

const statusKeys: Record<string, string> = {
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
};

function resolveLabel(t: Translator, keyMap: Record<string, string>, value: string, fallback: string): string {
  const key = keyMap[value];
  return key ? t(key) : fallback;
}

export function getAnalyticsAssessmentTypeLabel(t: Translator, assessmentType: AssessmentType): string {
  return t(assessmentTypeKeys[assessmentType]);
}

export function getAnalyticsBucketLabel(t: Translator, bucket: Bucket): string {
  return t(bucketKeys[bucket]);
}

export function getAnalyticsCompareLabel(t: Translator, compare: ComparePreset): string {
  return t(compareKeys[compare]);
}

export function getAnalyticsSeverityLabel(t: Translator, severity: string): string {
  return resolveLabel(t, severityKeys, severity, severity);
}

export function getAnalyticsAlertTypeLabel(t: Translator, alertType: string): string {
  return resolveLabel(t, alertTypeKeys, alertType, alertType.replaceAll('_', ' '));
}

export function getAnalyticsRiskLevelLabel(t: Translator, riskLevel: string): string {
  return resolveLabel(t, riskLevelKeys, riskLevel, riskLevel);
}

export function getAnalyticsReasonCodeLabel(t: Translator, reasonCode: string): string {
  return resolveLabel(t, reasonCodeKeys, reasonCode, reasonCode);
}

export function getAnalyticsSignalLabel(t: Translator, signal: string): string {
  return resolveLabel(t, signalKeys, signal, signal.replaceAll('_', ' '));
}

export function getAnalyticsStatusLabel(t: Translator, status: string | null | undefined): string {
  if (!status) {
    return t('atRisk.na');
  }
  return resolveLabel(t, statusKeys, status, status.replaceAll('_', ' '));
}
