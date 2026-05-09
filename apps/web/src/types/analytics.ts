import type { components, operations } from '@/lib/api/generated';

type AnalyticsQueryParameters = NonNullable<
  operations['teacher_overview_platform_api_v1_analytics_teacher_overview_get']['parameters']['query']
>;

export type WindowPreset = NonNullable<AnalyticsQueryParameters['window']>;
export type ComparePreset = NonNullable<AnalyticsQueryParameters['compare']>;
export type Bucket = NonNullable<AnalyticsQueryParameters['bucket']>;
export type SortOrder = NonNullable<AnalyticsQueryParameters['sort_order']>;
export type AssessmentType = components['schemas']['AssessmentOutlierRow']['assessment_type'];
export type AnalyticsQuery = AnalyticsQueryParameters;

export type AnalyticsFilterOption = components['schemas']['AnalyticsFilterOption'];
export type MetricCard = components['schemas']['MetricCard'];
export type TimeSeriesPoint = components['schemas']['TimeSeriesPoint'];
export type RiskDistributionCounts = components['schemas']['RiskDistributionCounts'];
export type AlertItem = components['schemas']['AlertItem'];
export type AdminAnalyticsResponse = components['schemas']['AdminAnalyticsResponse'];
export type AnalyticsDataQuality = components['schemas']['AnalyticsDataQuality'];
export type AnomalyItem = components['schemas']['AnomalyItem'];
export type ContentBottleneckRow = components['schemas']['ContentBottleneckRow'];
export type DrillThroughResponse = components['schemas']['DrillThroughResponse'];
export type GradingBacklogItem = components['schemas']['GradingBacklogItem'];
export type ForecastItem = components['schemas']['ForecastItem'];
export type InsightFeedItem = components['schemas']['InsightFeedItem'];
export type AtRiskLearnerRow = components['schemas']['AtRiskLearnerRow'];
export type SavedAnalyticsViewCreate = components['schemas']['SavedAnalyticsViewCreate'];
export type SavedAnalyticsViewListResponse = components['schemas']['SavedAnalyticsViewListResponse'];
export type SavedAnalyticsViewRow = components['schemas']['SavedAnalyticsViewRow'];
export type TeacherWorkloadSummary = components['schemas']['TeacherWorkloadSummary'];
export type TeacherOverviewResponse = components['schemas']['TeacherOverviewResponse'];
export type TeacherCourseRow = components['schemas']['TeacherCourseRow'];
export type TeacherCourseListResponse = components['schemas']['TeacherCourseListResponse'];
export type FunnelStep = components['schemas']['FunnelStep'];
export type ActivityDropoffRow = components['schemas']['ActivityDropoffRow'];
export type ContentHealthRow = components['schemas']['ContentHealthRow'];
export type AssessmentOutlierRow = components['schemas']['AssessmentOutlierRow'];
export type TeacherCourseDetailResponse = components['schemas']['TeacherCourseDetailResponse'];
export type TeacherAssessmentListResponse = components['schemas']['TeacherAssessmentListResponse'];
export type HistogramBucket = components['schemas']['HistogramBucket'];
export type QuestionDifficultyRow = components['schemas']['QuestionDifficultyRow'];
export type CommonFailureRow = components['schemas']['CommonFailureRow'];
export type AssessmentLearnerRow = components['schemas']['AssessmentLearnerRow'];
export type AssessmentDiagnosticsSnapshot = components['schemas']['AssessmentDiagnosticsSnapshot'];
export type AssessmentAuditEventRow = components['schemas']['AssessmentAuditEventRow'];
export type AssessmentSloSnapshot = components['schemas']['AssessmentSloSnapshot'];
export type AssessmentMigrationStatus = components['schemas']['AssessmentMigrationStatus'];
export type AssessmentSupportAlertRow = components['schemas']['AssessmentSupportAlertRow'];
export type AssessmentSupportDiagnostics = components['schemas']['AssessmentSupportDiagnostics'];
export type AssessmentItemAnalyticsRow = components['schemas']['AssessmentItemAnalyticsRow'];
export type AssessmentCohortRow = components['schemas']['AssessmentCohortRow'];
export type TeacherAssessmentDetailResponse = components['schemas']['TeacherAssessmentDetailResponse'];
export type AtRiskLearnersResponse = components['schemas']['AtRiskLearnersResponse'];
