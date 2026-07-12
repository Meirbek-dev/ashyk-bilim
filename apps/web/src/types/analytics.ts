import type { operations } from '@/lib/api/generated'
import type * as schemas from '@/lib/api/generated/api.schemas'

type AnalyticsQueryParameters = NonNullable<
  operations['teacher_overview_platform_api_v1_analytics_teacher_overview_get']['parameters']['query']
>

export type WindowPreset = NonNullable<AnalyticsQueryParameters['window']>
export type ComparePreset = NonNullable<AnalyticsQueryParameters['compare']>
export type Bucket = NonNullable<AnalyticsQueryParameters['bucket']>
export type SortOrder = NonNullable<AnalyticsQueryParameters['sort_order']>
export type AssessmentType = schemas.AssessmentOutlierRow['assessment_type']
export type AnalyticsQuery = AnalyticsQueryParameters

export type AnalyticsFilterOption = schemas.AnalyticsFilterOption
export type MetricCard = schemas.MetricCard
export type TimeSeriesPoint = schemas.TimeSeriesPoint
export type RiskDistributionCounts = schemas.RiskDistributionCounts
export type AlertItem = schemas.AlertItem
export type AdminAnalyticsResponse = schemas.AdminAnalyticsResponse
export type AnalyticsDataQuality = schemas.AnalyticsDataQuality
export type AnomalyItem = schemas.AnomalyItem
export type ContentBottleneckRow = schemas.ContentBottleneckRow
export type DrillThroughResponse = schemas.DrillThroughResponse
export type GradingBacklogItem = schemas.GradingBacklogItem
export type ForecastItem = schemas.ForecastItem
export type InsightFeedItem = schemas.InsightFeedItem
export type AtRiskLearnerRow = schemas.AtRiskLearnerRow
export type SavedAnalyticsViewCreate = schemas.SavedAnalyticsViewCreate
export type SavedAnalyticsViewListResponse = schemas.SavedAnalyticsViewListResponse
export type SavedAnalyticsViewRow = schemas.SavedAnalyticsViewRow
export type TeacherWorkloadSummary = schemas.TeacherWorkloadSummary
export type TeacherOverviewResponse = schemas.TeacherOverviewResponse
export type TeacherCourseRow = schemas.TeacherCourseRow
export type TeacherCourseListResponse = schemas.TeacherCourseListResponse
export type FunnelStep = schemas.FunnelStep
export type ActivityDropoffRow = schemas.ActivityDropoffRow
export type ContentHealthRow = schemas.ContentHealthRow
export type AssessmentOutlierRow = schemas.AssessmentOutlierRow
export type TeacherCourseDetailResponse = schemas.TeacherCourseDetailResponse
export type TeacherAssessmentListResponse = schemas.TeacherAssessmentListResponse
export type HistogramBucket = schemas.HistogramBucket
export type QuestionDifficultyRow = schemas.QuestionDifficultyRow
export type CommonFailureRow = schemas.CommonFailureRow
export type AssessmentLearnerRow = schemas.AssessmentLearnerRow
export type AssessmentDiagnosticsSnapshot = schemas.AssessmentDiagnosticsSnapshot
export type AssessmentAuditEventRow = schemas.AssessmentAuditEventRow
export type AssessmentSloSnapshot = schemas.AssessmentSloSnapshot
export type AssessmentMigrationStatus = schemas.AssessmentMigrationStatus
export type AssessmentSupportAlertRow = schemas.AssessmentSupportAlertRow
export type AssessmentSupportDiagnostics = schemas.AssessmentSupportDiagnostics
export type AssessmentItemAnalyticsRow = schemas.AssessmentItemAnalyticsRow
export type AssessmentCohortRow = schemas.AssessmentCohortRow
export type TeacherAssessmentDetailResponse = schemas.TeacherAssessmentDetailResponse
export type AtRiskLearnersResponse = schemas.AtRiskLearnersResponse
