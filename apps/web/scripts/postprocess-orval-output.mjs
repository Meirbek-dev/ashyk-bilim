#!/usr/bin/env node
import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'

const generatedDir = path.resolve(import.meta.dirname, '..', 'src/lib/api/generated')
const activitiesPath = path.join(generatedDir, 'activities/activities.ts')
const indexPath = path.join(generatedDir, 'index.ts')

const before = 'formData.append(`subtitle_files`, bodyApiCreateVideoActivityApiV1ActivitiesVideoPost.subtitle_files)'
const after = `for (const subtitleFile of bodyApiCreateVideoActivityApiV1ActivitiesVideoPost.subtitle_files) {
      formData.append(\`subtitle_files\`, subtitleFile)
    }`

const activitySource = readFileSync(activitiesPath, 'utf8')
const normalizedActivitySource = activitySource.replace(before, after)
if (normalizedActivitySource !== activitySource) {
  writeFileSync(activitiesPath, normalizedActivitySource)
}

const schemaNames = [
  'ActivityDetailResponse',
  'ActivityDropoffRow',
  'ActivityProgressCell',
  'ActivityProgressState',
  'ActivityRead',
  'ActivityReadWithPermissions',
  'AdminAnalyticsResponse',
  'AlertItem',
  'AnalyticsDataQuality',
  'AnalyticsFilterOption',
  'AnomalyItem',
  'AssessmentAuditEventRow',
  'AssessmentCohortRow',
  'AssessmentDiagnosticsSnapshot',
  'AssessmentItemAnalyticsRow',
  'AssessmentLearnerRow',
  'AssessmentMigrationStatus',
  'AssessmentOutlierRow',
  'AssessmentRead',
  'AssessmentSloSnapshot',
  'AssessmentSupportAlertRow',
  'AssessmentSupportDiagnostics',
  'AssessmentType',
  'AtRiskLearnerRow',
  'AtRiskLearnersResponse',
  'AuthorWithRole',
  'BatchGradeItem',
  'BatchGradeRequest',
  'BatchGradeResponse',
  'BatchGradeResultItem',
  'CommonFailureRow',
  'ContentBottleneckRow',
  'ContentHealthRow',
  'CourseGradebookResponse',
  'CourseRead',
  'CourseReadWithPermissions',
  'DashboardRead',
  'DrillThroughResponse',
  'ForecastItem',
  'FullCourseRead',
  'FunnelStep',
  'GradebookActivity',
  'GradebookStudent',
  'GradebookSummary',
  'GradedItem',
  'GradingBreakdown',
  'GradingBacklogItem',
  'HistogramBucket',
  'InsightFeedItem',
  'ItemFeedback',
  'LeaderboardRead',
  'MetricCard',
  'PlatformDetailResponse',
  'PlatformRead',
  'ProfileRead',
  'QuestionDifficultyRow',
  'RiskDistributionCounts',
  'SavedAnalyticsViewCreate',
  'SavedAnalyticsViewListResponse',
  'SavedAnalyticsViewRow',
  'StreakUpdateRead',
  'StudentActivityActionRequest',
  'StudentActivityRuntime',
  'StudentSubmissionRead',
  'SubmissionListResponse',
  'SubmissionRead',
  'SubmissionStats',
  'SubmissionStatus',
  'SubmissionUser',
  'TeacherAction',
  'TeacherAssessmentDetailResponse',
  'TeacherAssessmentListResponse',
  'TeacherCourseDetailResponse',
  'TeacherCourseListResponse',
  'TeacherCourseRow',
  'TeacherOverviewResponse',
  'TeacherGradeInput',
  'TeacherWorkloadSummary',
  'TeacherSubmissionRead',
  'TimeSeriesPoint',
  'TransactionRead',
  'UserRead',
  'UserSession',
  'XPAwardRequest',
  'XPAwardResponse',
]

const schemaEntries = schemaNames.map(name => `    ${name}: Compat<schemas.${name}>`).join('\n')
const generatedIndex = readFileSync(indexPath, 'utf8').trimEnd()
const compatibilityTypes = `

export * from './api.schemas'

import type * as schemas from './api.schemas'

type Compat<T> = T extends never ? never : any

export type components = {
  schemas: {
${schemaEntries}
  }
}

export type operations = {
  teacher_overview_platform_api_v1_analytics_teacher_overview_get: {
    parameters: {
      query: Compat<schemas.TeacherOverviewPlatformApiV1AnalyticsTeacherOverviewGetParams>
    }
  }
}
`

if (!generatedIndex.includes('export type components =')) {
  writeFileSync(indexPath, `${generatedIndex}${compatibilityTypes}`)
}
