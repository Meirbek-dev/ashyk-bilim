export * from './activities/activities'
export * from './ai/ai'
export * from './analytics/analytics'
export * from './assessments/assessments'
export * from './auth/auth'
export * from './blocks/blocks'
export * from './certifications/certifications'
export * from './chapters/chapters'
export * from './code-execution/code-execution'
export * from './collections/collections'
export * from './courses/courses'
export * from './default/default'
export * from './dev/dev'
export * from './discussions/discussions'
export * from './file-submissions/file-submissions'
export * from './gamification/gamification'
export * from './grading/grading'
export * from './health/health'
export * from './platform/platform'
export * from './rbac/rbac'
export * from './roles/roles'
export * from './search/search'
export * from './trail/trail'
export * from './uploads/uploads'
export * from './usergroups/usergroups'
export * from './users/users'
export * from './utils/utils'
export * from './work/work'

export * from './api.schemas'

import type * as schemas from './api.schemas'

type Compat<T> = T extends never ? never : any

export type components = {
  schemas: {
    ActivityDetailResponse: Compat<schemas.ActivityDetailResponse>
    ActivityDropoffRow: Compat<schemas.ActivityDropoffRow>
    ActivityProgressCell: Compat<schemas.ActivityProgressCell>
    ActivityProgressState: Compat<schemas.ActivityProgressState>
    ActivityRead: Compat<schemas.ActivityRead>
    ActivityReadWithPermissions: Compat<schemas.ActivityReadWithPermissions>
    AdminAnalyticsResponse: Compat<schemas.AdminAnalyticsResponse>
    AlertItem: Compat<schemas.AlertItem>
    AnalyticsDataQuality: Compat<schemas.AnalyticsDataQuality>
    AnalyticsFilterOption: Compat<schemas.AnalyticsFilterOption>
    AnomalyItem: Compat<schemas.AnomalyItem>
    AssessmentAuditEventRow: Compat<schemas.AssessmentAuditEventRow>
    AssessmentCohortRow: Compat<schemas.AssessmentCohortRow>
    AssessmentDiagnosticsSnapshot: Compat<schemas.AssessmentDiagnosticsSnapshot>
    AssessmentItemAnalyticsRow: Compat<schemas.AssessmentItemAnalyticsRow>
    AssessmentLearnerRow: Compat<schemas.AssessmentLearnerRow>
    AssessmentMigrationStatus: Compat<schemas.AssessmentMigrationStatus>
    AssessmentOutlierRow: Compat<schemas.AssessmentOutlierRow>
    AssessmentRead: Compat<schemas.AssessmentRead>
    AssessmentSloSnapshot: Compat<schemas.AssessmentSloSnapshot>
    AssessmentSupportAlertRow: Compat<schemas.AssessmentSupportAlertRow>
    AssessmentSupportDiagnostics: Compat<schemas.AssessmentSupportDiagnostics>
    AssessmentType: Compat<schemas.AssessmentType>
    AtRiskLearnerRow: Compat<schemas.AtRiskLearnerRow>
    AtRiskLearnersResponse: Compat<schemas.AtRiskLearnersResponse>
    AuthorWithRole: Compat<schemas.AuthorWithRole>
    BatchGradeItem: Compat<schemas.BatchGradeItem>
    BatchGradeRequest: Compat<schemas.BatchGradeRequest>
    BatchGradeResponse: Compat<schemas.BatchGradeResponse>
    BatchGradeResultItem: Compat<schemas.BatchGradeResultItem>
    CommonFailureRow: Compat<schemas.CommonFailureRow>
    ContentBottleneckRow: Compat<schemas.ContentBottleneckRow>
    ContentHealthRow: Compat<schemas.ContentHealthRow>
    CourseGradebookResponse: Compat<schemas.CourseGradebookResponse>
    CourseRead: Compat<schemas.CourseRead>
    CourseReadWithPermissions: Compat<schemas.CourseReadWithPermissions>
    DashboardRead: Compat<schemas.DashboardRead>
    DrillThroughResponse: Compat<schemas.DrillThroughResponse>
    ForecastItem: Compat<schemas.ForecastItem>
    FullCourseRead: Compat<schemas.FullCourseRead>
    FunnelStep: Compat<schemas.FunnelStep>
    GradebookActivity: Compat<schemas.GradebookActivity>
    GradebookStudent: Compat<schemas.GradebookStudent>
    GradebookSummary: Compat<schemas.GradebookSummary>
    GradedItem: Compat<schemas.GradedItem>
    GradingBreakdown: Compat<schemas.GradingBreakdown>
    GradingBacklogItem: Compat<schemas.GradingBacklogItem>
    HistogramBucket: Compat<schemas.HistogramBucket>
    InsightFeedItem: Compat<schemas.InsightFeedItem>
    ItemFeedback: Compat<schemas.ItemFeedback>
    LeaderboardRead: Compat<schemas.LeaderboardRead>
    MetricCard: Compat<schemas.MetricCard>
    PlatformDetailResponse: Compat<schemas.PlatformDetailResponse>
    PlatformRead: Compat<schemas.PlatformRead>
    ProfileRead: Compat<schemas.ProfileRead>
    QuestionDifficultyRow: Compat<schemas.QuestionDifficultyRow>
    RiskDistributionCounts: Compat<schemas.RiskDistributionCounts>
    SavedAnalyticsViewCreate: Compat<schemas.SavedAnalyticsViewCreate>
    SavedAnalyticsViewListResponse: Compat<schemas.SavedAnalyticsViewListResponse>
    SavedAnalyticsViewRow: Compat<schemas.SavedAnalyticsViewRow>
    StreakUpdateRead: Compat<schemas.StreakUpdateRead>
    StudentActivityActionRequest: Compat<schemas.StudentActivityActionRequest>
    StudentActivityRuntime: Compat<schemas.StudentActivityRuntime>
    StudentSubmissionRead: Compat<schemas.StudentSubmissionRead>
    SubmissionListResponse: Compat<schemas.SubmissionListResponse>
    SubmissionRead: Compat<schemas.SubmissionRead>
    SubmissionStats: Compat<schemas.SubmissionStats>
    SubmissionStatus: Compat<schemas.SubmissionStatus>
    SubmissionUser: Compat<schemas.SubmissionUser>
    TeacherAction: Compat<schemas.TeacherAction>
    TeacherAssessmentDetailResponse: Compat<schemas.TeacherAssessmentDetailResponse>
    TeacherAssessmentListResponse: Compat<schemas.TeacherAssessmentListResponse>
    TeacherCourseDetailResponse: Compat<schemas.TeacherCourseDetailResponse>
    TeacherCourseListResponse: Compat<schemas.TeacherCourseListResponse>
    TeacherCourseRow: Compat<schemas.TeacherCourseRow>
    TeacherOverviewResponse: Compat<schemas.TeacherOverviewResponse>
    TeacherGradeInput: Compat<schemas.TeacherGradeInput>
    TeacherWorkloadSummary: Compat<schemas.TeacherWorkloadSummary>
    TeacherSubmissionRead: Compat<schemas.TeacherSubmissionRead>
    TimeSeriesPoint: Compat<schemas.TimeSeriesPoint>
    TransactionRead: Compat<schemas.TransactionRead>
    UserRead: Compat<schemas.UserRead>
    UserSession: Compat<schemas.UserSession>
    XPAwardRequest: Compat<schemas.XPAwardRequest>
    XPAwardResponse: Compat<schemas.XPAwardResponse>
  }
}

export type operations = {
  teacher_overview_platform_api_v1_analytics_teacher_overview_get: {
    parameters: {
      query: Compat<schemas.TeacherOverviewPlatformApiV1AnalyticsTeacherOverviewGetParams>
    }
  }
}
