//! Analytics read models (legacy `services/analytics/schemas.py`).
//!
//! These are computed values, never database rows, so they carry `Serialize`
//! + `ToSchema` here and are re-exported by `ab_api::dto::analytics` as the
//! wire shapes. Ids are the v2 typed uuids; timestamps are `*_unix` epoch
//! seconds; label-like fields are stable snake_case codes the client
//! translates (the legacy returned Russian prose).

use std::collections::BTreeMap;

use ab_core::assessments::AssessmentKind;
use ab_core::id::{
    ActivityId, AssessmentId, BulkActionId, ChapterId, CourseId, GradingEntryId, InterventionId,
    SavedViewId, SubmissionId, UserId, UsergroupId,
};
use serde::Serialize;
use utoipa::ToSchema;

use super::filters::{Compare, Window};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, ToSchema)]
#[serde(rename_all = "snake_case")]
pub enum Direction {
    Up,
    Down,
    Flat,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Serialize, ToSchema)]
#[serde(rename_all = "snake_case")]
pub enum Severity {
    Info,
    Warning,
    Critical,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Serialize, ToSchema)]
#[serde(rename_all = "snake_case")]
pub enum RiskLevel {
    Low,
    Medium,
    High,
}

impl RiskLevel {
    #[must_use]
    pub const fn as_str(self) -> &'static str {
        match self {
            Self::Low => "low",
            Self::Medium => "medium",
            Self::High => "high",
        }
    }

    #[must_use]
    pub fn parse(s: &str) -> Option<Self> {
        match s {
            "low" => Some(Self::Low),
            "medium" => Some(Self::Medium),
            "high" => Some(Self::High),
            _ => None,
        }
    }

    #[must_use]
    pub const fn is_at_risk(self) -> bool {
        matches!(self, Self::Medium | Self::High)
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, ToSchema)]
#[serde(rename_all = "snake_case")]
pub enum Confidence {
    Low,
    Medium,
    High,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, ToSchema)]
#[serde(rename_all = "snake_case")]
pub enum RiskTrend {
    NewlyAtRisk,
    Worsening,
    Improving,
    Recovered,
    Stable,
}

#[derive(Debug, Clone, Serialize, ToSchema)]
pub struct MetricCard {
    pub value: f64,
    pub delta_value: Option<f64>,
    pub delta_pct: Option<f64>,
    pub direction: Direction,
    /// Stable code (`active_learners`, `completion_rate`, …).
    pub label: &'static str,
    pub unit: Option<&'static str>,
    pub is_higher_better: bool,
    pub benchmark: Option<f64>,
    pub benchmark_label: Option<&'static str>,
}

#[derive(Debug, Clone, Serialize, ToSchema)]
pub struct TimeSeriesPoint {
    pub bucket_start_unix: i64,
    pub value: f64,
}

#[derive(Debug, Clone, Serialize, ToSchema)]
pub struct AlertItem {
    pub id: String,
    /// `risk_spike` | `engagement_drop` | `grading_backlog` | `grading_slo` |
    /// `assessment_outlier` | `content_stale`.
    pub kind: &'static str,
    pub severity: Severity,
    pub title: String,
    pub body: String,
    pub href: Option<String>,
    pub course_id: Option<CourseId>,
    pub activity_id: Option<ActivityId>,
    pub assessment_id: Option<AssessmentId>,
    pub learner_count: Option<i64>,
}

#[derive(Debug, Clone, Serialize, ToSchema)]
pub struct FilterOption {
    pub label: String,
    pub value: String,
}

#[derive(Debug, Clone, Default, Serialize, ToSchema)]
pub struct RiskDistributionCounts {
    pub high: i64,
    pub medium: i64,
    pub low: i64,
}

#[derive(Debug, Clone, Default, Serialize, ToSchema)]
pub struct InterventionSummary {
    pub total: i64,
    pub open: i64,
    pub resolved: i64,
    pub recovered_learners: i64,
    pub avg_risk_delta_after_intervention: Option<f64>,
}

#[derive(Debug, Clone, Serialize, ToSchema)]
pub struct ContentBottleneckRow {
    pub course_id: CourseId,
    pub course_name: String,
    pub activity_id: ActivityId,
    pub activity_name: String,
    pub activity_type: String,
    /// `high_time_low_completion` | `exit_after_open` |
    /// `repeated_assessment_failures` | `stale_low_performance`.
    pub signal: &'static str,
    pub severity: Severity,
    pub completion_rate: Option<f64>,
    pub started_learners: i64,
    pub completed_learners: i64,
    pub avg_time_seconds: Option<f64>,
    pub exit_count: i64,
    pub failed_assessments: i64,
    pub stale_days: Option<i64>,
    pub note: &'static str,
}

#[derive(Debug, Clone, Default, Serialize, ToSchema)]
pub struct WorkloadAgingBuckets {
    pub h0_24: i64,
    pub d1_3: i64,
    pub d3_7: i64,
    pub d7_plus: i64,
}

#[derive(Debug, Clone, Serialize, ToSchema)]
pub struct GradingBacklogItem {
    pub course_id: CourseId,
    pub course_name: String,
    pub assessment_id: AssessmentId,
    pub assessment_type: AssessmentKind,
    pub title: String,
    pub awaiting_review: i64,
    pub oldest_submitted_at_unix: Option<i64>,
    pub age_hours: Option<f64>,
    pub sla_breaches: i64,
}

#[derive(Debug, Clone, Default, Serialize, ToSchema)]
pub struct TeacherWorkloadSummary {
    pub backlog_total: i64,
    pub sla_breaches: i64,
    pub median_feedback_latency_hours: Option<f64>,
    pub aging_buckets: WorkloadAgingBuckets,
    pub forecast_backlog_7d: i64,
    pub backlog_by_assessment: Vec<GradingBacklogItem>,
}

#[derive(Debug, Clone, Serialize, ToSchema)]
pub struct InsightFeedItem {
    pub id: String,
    /// `risk` | `assessment` | `content` | `workload` | `completion` | `intervention`.
    pub category: &'static str,
    pub severity: Severity,
    pub priority: i64,
    pub title: String,
    pub body: String,
    pub course_id: Option<CourseId>,
    pub activity_id: Option<ActivityId>,
    pub assessment_type: Option<AssessmentKind>,
    pub assessment_id: Option<AssessmentId>,
    pub learner_count: Option<i64>,
    pub href: Option<String>,
}

#[derive(Debug, Clone, Serialize, ToSchema)]
pub struct SavedView {
    pub id: SavedViewId,
    pub teacher_user_id: UserId,
    pub name: String,
    pub view_type: String,
    #[schema(value_type = Object)]
    pub query: serde_json::Value,
    pub created_at_unix: i64,
    pub updated_at_unix: i64,
}

#[derive(Debug, Clone, Serialize, ToSchema)]
pub struct SavedViewList {
    pub generated_at_unix: i64,
    pub total: i64,
    pub items: Vec<SavedView>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, serde::Deserialize, ToSchema)]
#[serde(rename_all = "snake_case")]
pub enum DrillMetric {
    ActiveLearners,
    CompletionRate,
    PassRate,
    Backlog,
}

#[derive(Debug, Clone, Serialize, ToSchema)]
pub struct DrillThroughResponse {
    pub generated_at_unix: i64,
    pub metric: DrillMetric,
    pub total: i64,
    #[schema(value_type = Vec<Object>)]
    pub items: Vec<serde_json::Value>,
}

#[derive(Debug, Clone, Serialize, ToSchema)]
pub struct DataQualityIssue {
    pub id: &'static str,
    pub severity: Severity,
    pub title: &'static str,
    pub detail: String,
    pub course_id: Option<CourseId>,
    pub source: Option<&'static str>,
}

#[derive(Debug, Clone, Serialize, ToSchema)]
pub struct CourseDataGap {
    pub course_id: CourseId,
    pub course_name: String,
    pub learner_count: i64,
    pub reason: &'static str,
}

#[derive(Debug, Clone, Serialize, ToSchema)]
pub struct AnalyticsDataQuality {
    /// `live` | `rollup`.
    pub mode: &'static str,
    pub last_rollup_time_unix: Option<i64>,
    pub freshness_seconds: i64,
    pub confidence_level: Confidence,
    pub missing_event_sources: Vec<&'static str>,
    pub courses_without_enough_data: Vec<CourseDataGap>,
    pub excluded_preview_attempts: i64,
    pub excluded_teacher_attempts: i64,
    pub issues: Vec<DataQualityIssue>,
}

#[derive(Debug, Clone, Serialize, ToSchema)]
pub struct ForecastItem {
    pub id: String,
    /// `completion_target_miss` | `grading_backlog_7d` |
    /// `course_completion_deadline` | `assessment_failure_risk`.
    pub kind: &'static str,
    pub severity: Severity,
    pub title: String,
    pub prediction: String,
    pub confidence_level: Confidence,
    pub course_id: Option<CourseId>,
    pub course_name: Option<String>,
    pub assessment_type: Option<AssessmentKind>,
    pub assessment_id: Option<AssessmentId>,
    pub learner_count: Option<i64>,
    pub expected_value: Option<f64>,
    pub target_value: Option<f64>,
    pub deadline_at_unix: Option<i64>,
}

#[derive(Debug, Clone, Serialize, ToSchema)]
pub struct AnomalyItem {
    pub id: String,
    /// `engagement_drop` | `submission_spike` | `fast_quiz_completion` |
    /// `score_distribution_shift`.
    pub kind: &'static str,
    pub severity: Severity,
    pub title: String,
    pub detail: &'static str,
    pub observed_value: Option<f64>,
    pub baseline_value: Option<f64>,
    pub course_id: Option<CourseId>,
    pub course_name: Option<String>,
    pub assessment_type: Option<AssessmentKind>,
    pub assessment_id: Option<AssessmentId>,
    pub activity_id: Option<ActivityId>,
}

#[derive(Debug, Clone, Serialize, ToSchema)]
pub struct AdminTeacherRow {
    pub teacher_user_id: UserId,
    pub teacher_display_name: String,
    pub managed_course_count: i64,
    pub workload_backlog: i64,
    pub sla_breaches: i64,
    pub median_feedback_latency_hours: Option<f64>,
    pub at_risk_learners: i64,
}

#[derive(Debug, Clone, Serialize, ToSchema)]
pub struct AdminCourseRow {
    pub course_id: CourseId,
    pub course_name: String,
    pub health_score: f64,
    pub completion_rate: f64,
    pub active_learners_7d: i64,
    pub at_risk_learners: i64,
    pub content_roi_score: Option<f64>,
}

#[derive(Debug, Clone, Serialize, ToSchema)]
pub struct AdminCohortRow {
    pub cohort_id: UsergroupId,
    pub cohort_name: String,
    pub learners: i64,
    pub retained_learners: i64,
    pub retention_rate: Option<f64>,
    pub avg_progress_pct: Option<f64>,
}

#[derive(Debug, Clone, Serialize, ToSchema)]
pub struct AdminProgramRow {
    /// The creating teacher; `None` groups courses without a creator.
    pub program_id: Option<UserId>,
    pub program_name: String,
    pub course_count: i64,
    pub learner_count: i64,
    pub completion_rate: Option<f64>,
    pub health_score: Option<f64>,
}

#[derive(Debug, Clone, Serialize, ToSchema)]
pub struct AdminAnalyticsResponse {
    pub generated_at_unix: i64,
    pub teacher_workload_comparison: Vec<AdminTeacherRow>,
    pub course_health_ranking: Vec<AdminCourseRow>,
    pub cohort_retention: Vec<AdminCohortRow>,
    pub department_program_performance: Vec<AdminProgramRow>,
    pub content_roi: Vec<AdminCourseRow>,
}

#[derive(Debug, Clone, Serialize, ToSchema)]
pub struct Intervention {
    pub id: InterventionId,
    pub teacher_user_id: UserId,
    pub user_id: UserId,
    pub course_id: CourseId,
    pub intervention_type: String,
    pub status: String,
    pub outcome: Option<String>,
    pub notes: Option<String>,
    pub risk_score_before: Option<f64>,
    pub risk_score_after: Option<f64>,
    #[schema(value_type = Object)]
    pub payload: serde_json::Value,
    pub created_at_unix: i64,
    pub updated_at_unix: i64,
    pub resolved_at_unix: Option<i64>,
}

impl From<ab_db::analytics::InterventionRow> for Intervention {
    fn from(r: ab_db::analytics::InterventionRow) -> Self {
        Self {
            id: r.id,
            teacher_user_id: r.teacher_user_id,
            user_id: r.user_id,
            course_id: r.course_id,
            intervention_type: r.intervention_type,
            status: r.status,
            outcome: r.outcome,
            notes: r.notes,
            risk_score_before: r.risk_score_before,
            risk_score_after: r.risk_score_after,
            payload: r.payload,
            created_at_unix: r.created_at,
            updated_at_unix: r.updated_at,
            resolved_at_unix: r.resolved_at,
        }
    }
}

impl From<ab_db::analytics::SavedViewRow> for SavedView {
    fn from(r: ab_db::analytics::SavedViewRow) -> Self {
        Self {
            id: r.id,
            teacher_user_id: r.teacher_user_id,
            name: r.name,
            view_type: r.view_type,
            query: r.query,
            created_at_unix: r.created_at,
            updated_at_unix: r.updated_at,
        }
    }
}

#[derive(Debug, Clone, Serialize, ToSchema)]
pub struct InterventionList {
    pub generated_at_unix: i64,
    pub total: i64,
    pub items: Vec<Intervention>,
}

#[derive(Debug, Clone, Serialize, ToSchema)]
pub struct AtRiskLearnerRow {
    pub user_id: UserId,
    pub course_id: CourseId,
    pub course_name: String,
    pub user_display_name: String,
    pub cohort_name: Option<String>,
    pub progress_pct: f64,
    pub days_since_last_activity: Option<i64>,
    pub open_grading_blocks: i64,
    pub failed_assessments: i64,
    pub missing_required_assessments: i64,
    pub risk_score: f64,
    pub risk_level: RiskLevel,
    pub risk_components: BTreeMap<&'static str, f64>,
    pub reason_codes: Vec<&'static str>,
    pub risk_trend: RiskTrend,
    pub previous_risk_score: Option<f64>,
    pub risk_score_delta: Option<f64>,
    pub top_contributing_factor: Option<&'static str>,
    pub confidence_level: Confidence,
    /// Stable code explaining the strongest signal.
    pub why_now: &'static str,
    pub intervention_count: i64,
    pub last_intervention_type: Option<String>,
    pub last_intervention_at_unix: Option<i64>,
    pub last_intervention_outcome: Option<String>,
    /// Stable code (`review_submissions_first`, …).
    pub recommended_action: &'static str,
}

#[derive(Debug, Clone, Serialize, ToSchema)]
pub struct TeacherOverviewScope {
    pub teacher_user_id: UserId,
    pub course_ids: Vec<CourseId>,
    pub cohort_ids: Vec<UsergroupId>,
}

#[derive(Debug, Clone, Serialize, ToSchema)]
pub struct TeacherOverviewSummary {
    pub active_learners: MetricCard,
    pub returning_learners: MetricCard,
    pub completion_rate: MetricCard,
    pub at_risk_learners: MetricCard,
    pub ungraded_submissions: MetricCard,
    pub negative_engagement_courses: MetricCard,
}

#[derive(Debug, Clone, Serialize, ToSchema)]
pub struct TeacherOverviewTrends {
    pub active_learners: Vec<TimeSeriesPoint>,
    pub completions: Vec<TimeSeriesPoint>,
    pub submissions: Vec<TimeSeriesPoint>,
    pub grading_completed: Vec<TimeSeriesPoint>,
}

#[derive(Debug, Clone, Serialize, ToSchema)]
pub struct TeacherOverviewResponse {
    pub generated_at_unix: i64,
    pub freshness_seconds: i64,
    pub window: Window,
    pub compare: Compare,
    pub scope: TeacherOverviewScope,
    pub summary: TeacherOverviewSummary,
    pub trends: TeacherOverviewTrends,
    pub alerts: Vec<AlertItem>,
    pub insights: Vec<InsightFeedItem>,
    pub data_quality: AnalyticsDataQuality,
    pub forecasts: Vec<ForecastItem>,
    pub anomalies: Vec<AnomalyItem>,
    pub risk_distribution: RiskDistributionCounts,
    pub intervention_summary: InterventionSummary,
    pub workload: TeacherWorkloadSummary,
    pub content_bottlenecks: Vec<ContentBottleneckRow>,
    pub at_risk_preview: Vec<AtRiskLearnerRow>,
    pub course_preview: Vec<TeacherCourseRow>,
    pub assessment_preview: Vec<AssessmentOutlierRow>,
    pub course_total: i64,
    pub assessment_total: i64,
    pub at_risk_total: i64,
    pub course_options: Vec<FilterOption>,
    pub cohort_options: Vec<FilterOption>,
}

#[derive(Debug, Clone, Serialize, ToSchema)]
pub struct TeacherCourseRow {
    pub course_id: CourseId,
    pub course_name: String,
    pub active_learners_7d: i64,
    pub completion_rate: f64,
    pub engagement_delta_pct: Option<f64>,
    pub at_risk_learners: i64,
    pub ungraded_submissions: i64,
    pub content_health_score: f64,
    pub assessment_difficulty_score: Option<f64>,
    pub teacher_completion_delta_pct: Option<f64>,
    pub platform_completion_delta_pct: Option<f64>,
    pub historical_completion_delta_pct: Option<f64>,
    pub cohort_completion_delta_pct: Option<f64>,
    pub last_content_update_at_unix: Option<i64>,
    pub top_alert: Option<AlertItem>,
}

#[derive(Debug, Clone, Serialize, ToSchema)]
pub struct TeacherCourseListResponse {
    pub generated_at_unix: i64,
    pub total: i64,
    pub page: i64,
    pub page_size: i64,
    pub items: Vec<TeacherCourseRow>,
    pub course_options: Vec<FilterOption>,
    pub cohort_options: Vec<FilterOption>,
}

#[derive(Debug, Clone, Serialize, ToSchema)]
pub struct FunnelStep {
    /// Stable code (`enrolled`, `active_7d`, `completed`) or a chapter name.
    pub label: String,
    pub count: i64,
    pub pct_of_previous: Option<f64>,
}

#[derive(Debug, Clone, Serialize, ToSchema)]
pub struct Funnels {
    pub course_completion: Vec<FunnelStep>,
    pub chapter_dropoff: Vec<FunnelStep>,
}

#[derive(Debug, Clone, Serialize, ToSchema)]
pub struct ActivityDropoffRow {
    pub chapter_id: ChapterId,
    pub activity_id: ActivityId,
    pub activity_name: String,
    pub activity_type: String,
    pub previous_step_completions: i64,
    pub current_step_completions: i64,
    pub dropoff_pct: f64,
}

#[derive(Debug, Clone, Serialize, ToSchema)]
pub struct ContentHealthRow {
    pub course_id: CourseId,
    /// `content_freshness` | `average_progress` | `grading_backlog`.
    pub signal: &'static str,
    pub severity: Severity,
    pub value: Option<f64>,
    pub note: &'static str,
}

#[derive(Debug, Clone, Serialize, ToSchema)]
pub struct AssessmentOutlierRow {
    pub assessment_type: AssessmentKind,
    pub assessment_id: AssessmentId,
    pub activity_id: Option<ActivityId>,
    pub course_id: CourseId,
    pub course_name: String,
    pub title: String,
    pub submission_rate: Option<f64>,
    pub completion_rate: Option<f64>,
    pub pass_rate: Option<f64>,
    pub median_score: Option<f64>,
    pub avg_attempts: Option<f64>,
    pub grading_latency_hours_p50: Option<f64>,
    pub grading_latency_hours_p90: Option<f64>,
    pub difficulty_score: Option<f64>,
    pub score_variance: Option<f64>,
    pub reliability_score: Option<f64>,
    pub discrimination_index: Option<f64>,
    /// `too_easy` | `too_hard` | `low_discrimination` | `low_variance`.
    pub suspicious_flag: Option<&'static str>,
    pub outlier_reason_codes: Vec<&'static str>,
}

#[derive(Debug, Clone, Serialize, ToSchema)]
pub struct TeacherCourseDetailSummary {
    pub enrolled_learners: i64,
    pub active_learners_7d: i64,
    pub completion_rate: f64,
    pub avg_progress_pct: f64,
    pub at_risk_learners: i64,
    pub ungraded_submissions: i64,
    pub certificates_issued: i64,
}

#[derive(Debug, Clone, Serialize, ToSchema)]
pub struct CourseRef {
    pub id: CourseId,
    pub name: String,
}

#[derive(Debug, Clone, Serialize, ToSchema)]
pub struct TeacherCourseDetailResponse {
    pub generated_at_unix: i64,
    pub course: CourseRef,
    pub summary: TeacherCourseDetailSummary,
    pub funnels: Funnels,
    pub engagement_trend: Vec<TimeSeriesPoint>,
    pub activity_dropoff: Vec<ActivityDropoffRow>,
    pub at_risk_learners: Vec<AtRiskLearnerRow>,
    pub assessment_outliers: Vec<AssessmentOutlierRow>,
    pub content_health: Vec<ContentHealthRow>,
    pub content_bottlenecks: Vec<ContentBottleneckRow>,
}

#[derive(Debug, Clone, Serialize, ToSchema)]
pub struct TeacherAssessmentListResponse {
    pub generated_at_unix: i64,
    pub total: i64,
    pub page: i64,
    pub page_size: i64,
    pub items: Vec<AssessmentOutlierRow>,
    pub course_options: Vec<FilterOption>,
    pub cohort_options: Vec<FilterOption>,
}

#[derive(Debug, Clone, Serialize, ToSchema)]
pub struct HistogramBucket {
    pub label: &'static str,
    pub count: i64,
}

#[derive(Debug, Clone, Serialize, ToSchema)]
pub struct QuestionDifficultyRow {
    pub question_id: String,
    pub question_label: String,
    pub accuracy_pct: Option<f64>,
    pub avg_time_seconds: Option<f64>,
    pub discrimination_index: Option<f64>,
    pub strong_miss_pct: Option<f64>,
    pub weak_correct_pct: Option<f64>,
    pub distractor_issue_count: i64,
}

#[derive(Debug, Clone, Serialize, ToSchema)]
pub struct CommonFailureRow {
    pub key: String,
    pub label: String,
    pub count: i64,
}

#[derive(Debug, Clone, Serialize, ToSchema)]
pub struct AssessmentLearnerRow {
    pub user_id: UserId,
    pub user_display_name: String,
    pub attempts: i64,
    pub best_score: Option<f64>,
    pub last_score: Option<f64>,
    pub submitted_at_unix: Option<i64>,
    pub graded_at_unix: Option<i64>,
    /// Submission status of the latest attempt (`pending`, `graded`, …).
    pub status: Option<String>,
}

#[derive(Debug, Clone, Default, Serialize, ToSchema)]
pub struct AssessmentDiagnosticsSnapshot {
    pub manual_grading_required: bool,
    pub total_attempt_records: i64,
    pub draft_attempts: i64,
    pub awaiting_grading: i64,
    pub graded_not_released: i64,
    pub returned_for_resubmission: i64,
    pub released: i64,
    pub late_submissions: i64,
    pub stale_backlog: i64,
    pub suspicious_attempts: i64,
    pub missing_scores: i64,
    pub note: Option<&'static str>,
}

#[derive(Debug, Clone, Serialize, ToSchema)]
pub struct AssessmentAuditEventRow {
    pub id: String,
    /// `grading_entry` | `bulk_action`.
    pub source: &'static str,
    pub action: String,
    pub actor_user_id: Option<UserId>,
    pub actor_display_name: Option<String>,
    pub occurred_at_unix: i64,
    pub status: Option<String>,
    pub summary: String,
    pub affected_count: Option<i64>,
    pub submission_id: Option<SubmissionId>,
    pub grading_entry_id: Option<GradingEntryId>,
    pub bulk_action_id: Option<BulkActionId>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, ToSchema)]
#[serde(rename_all = "snake_case")]
pub enum SloStatus {
    Healthy,
    Warning,
    Breached,
    NotApplicable,
}

#[derive(Debug, Clone, Serialize, ToSchema)]
pub struct AssessmentSloSnapshot {
    pub status: SloStatus,
    pub target_hours: Option<f64>,
    pub observed_p50_hours: Option<f64>,
    pub observed_p90_hours: Option<f64>,
    pub backlog_count: i64,
    pub overdue_backlog_count: i64,
    pub note: &'static str,
}

#[derive(Debug, Clone, Serialize, ToSchema)]
pub struct AssessmentSupportAlertRow {
    /// `grading_slo_breached` | `grading_slo_warning` | `suspicious_attempts` | `missing_scores`.
    pub code: &'static str,
    pub severity: Severity,
    pub summary: &'static str,
}

#[derive(Debug, Clone, Serialize, ToSchema)]
pub struct AssessmentSupportDiagnostics {
    pub scoped_eligible_learners: i64,
    pub scoped_visible_learners: i64,
    pub scoped_cohort_count: i64,
    pub cohort_filter_applied: bool,
    pub audit_event_count: i64,
    pub alerts: Vec<AssessmentSupportAlertRow>,
    pub note: &'static str,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, ToSchema)]
#[serde(rename_all = "snake_case")]
pub enum ItemSignal {
    Healthy,
    Watch,
    Critical,
}

#[derive(Debug, Clone, Serialize, ToSchema)]
pub struct AssessmentItemAnalyticsRow {
    pub item_key: String,
    pub item_label: String,
    /// `workflow` | `question` | `test`.
    pub item_type: &'static str,
    pub population_count: i64,
    pub impacted_count: i64,
    pub impact_rate: Option<f64>,
    pub signal: ItemSignal,
    pub note: String,
}

#[derive(Debug, Clone, Serialize, ToSchema)]
pub struct AssessmentCohortRow {
    pub cohort_id: UsergroupId,
    pub cohort_name: String,
    pub eligible_learners: i64,
    pub submitted_learners: i64,
    pub submission_rate: Option<f64>,
    pub pass_rate: Option<f64>,
    pub awaiting_grading: i64,
    pub returned_for_resubmission: i64,
    pub released_learners: i64,
    pub avg_attempts: Option<f64>,
    pub median_score: Option<f64>,
}

#[derive(Debug, Clone, Default, Serialize, ToSchema)]
pub struct TeacherAssessmentDetailSummary {
    pub eligible_learners: i64,
    pub submitted_learners: i64,
    pub submission_rate: Option<f64>,
    pub pass_rate: Option<f64>,
    pub median_score: Option<f64>,
    pub avg_attempts: Option<f64>,
    pub grading_latency_hours_p50: Option<f64>,
    pub grading_latency_hours_p90: Option<f64>,
}

#[derive(Debug, Clone, Serialize, ToSchema)]
pub struct TeacherAssessmentDetailResponse {
    pub generated_at_unix: i64,
    pub assessment_type: AssessmentKind,
    pub assessment_id: AssessmentId,
    pub activity_id: ActivityId,
    pub course_id: CourseId,
    pub title: String,
    pub pass_threshold: f64,
    pub pass_threshold_bucket_label: &'static str,
    pub summary: TeacherAssessmentDetailSummary,
    pub score_distribution: Vec<HistogramBucket>,
    pub attempt_distribution: Vec<HistogramBucket>,
    pub question_breakdown: Vec<QuestionDifficultyRow>,
    pub common_failures: Vec<CommonFailureRow>,
    pub learner_rows: Vec<AssessmentLearnerRow>,
    pub diagnostics: AssessmentDiagnosticsSnapshot,
    pub audit_history: Vec<AssessmentAuditEventRow>,
    pub slo: AssessmentSloSnapshot,
    pub support: AssessmentSupportDiagnostics,
    pub cohort_analytics: Vec<AssessmentCohortRow>,
    pub item_analytics: Vec<AssessmentItemAnalyticsRow>,
}

#[derive(Debug, Clone, Serialize, ToSchema)]
pub struct AtRiskLearnersResponse {
    pub generated_at_unix: i64,
    pub total: i64,
    pub page: i64,
    pub page_size: i64,
    pub items: Vec<AtRiskLearnerRow>,
    pub course_options: Vec<FilterOption>,
    pub cohort_options: Vec<FilterOption>,
}
