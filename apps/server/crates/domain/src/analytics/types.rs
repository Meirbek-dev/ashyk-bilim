//! Analytics read models (legacy `services/analytics/schemas.py`).
//!
//! These are computed values, never database rows, so they carry
//! `Serialize` and `ToSchema` here and are re-exported by
//! `ab_api::dto::analytics` as the wire shapes. Ids are the v2 typed uuids;
//! timestamps are `*_unix` epoch seconds; label-like fields are stable
//! snake_case codes the client translates (the legacy returned Russian
//! prose).

use std::collections::BTreeMap;

use ab_core::assessments::AssessmentKind;
use ab_core::id::{
    ActivityId, AssessmentId, BulkActionId, ChapterId, CourseId, GradingEntryId, InterventionId,
    SavedViewId, SubmissionId, UserId, UsergroupId,
};
use serde::Serialize;
use utoipa::ToSchema;

use super::filters::{Compare, Window};

/// A closed set of stable codes: the variant's literal is both its wire
/// value and `as_str()`.
macro_rules! code_enum {
    // `$s:tt`, not `:literal`: a `literal` fragment reaches derives wrapped
    // in an invisible group, which utoipa's `serde(rename)` parser skips -
    // the schema then listed the Rust names (`RiskSpike`) while the wire
    // sent `risk_spike` (pinned by `code_enum_schemas_match_the_wire`).
    ($(#[$doc:meta])* $name:ident { $($variant:ident => $s:tt),+ $(,)? }) => {
        $(#[$doc])*
        #[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, ToSchema)]
        pub enum $name {
            $(#[serde(rename = $s)] $variant),+
        }

        impl $name {
            pub const ALL: &'static [Self] = &[$(Self::$variant),+];

            #[must_use]
            pub const fn as_str(self) -> &'static str {
                match self { $(Self::$variant => $s),+ }
            }
        }

        impl std::fmt::Display for $name {
            fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
                f.write_str(self.as_str())
            }
        }
    };
}

/// Why a learner is at risk (`risk::reason_codes`; a test pins the set).
#[derive(Debug, Clone, Copy, Serialize, ToSchema)]
#[serde(rename_all = "snake_case")]
pub enum RiskReasonCode {
    #[serde(rename = "inactive_7d")]
    Inactive7d,
    LowProgress,
    RepeatedFailures,
    MissingRequiredAssessments,
    GradingBlock,
}

/// `AtRiskLearnerRow.recommended_action` (`risk::recommended_action`; a
/// test pins the set).
#[derive(Debug, Clone, Copy, Serialize, ToSchema)]
#[serde(rename_all = "snake_case")]
pub enum RecommendedAction {
    ReviewSubmissionsFirst,
    ContactLearnerThisWeek,
    OfferTargetedHelp,
    RemindMissingWork,
    SchedulePaceMeeting,
    SendPersonalMessage,
}

/// `AtRiskLearnerRow.why_now` (`risk::why_now`; a test pins the set).
#[derive(Debug, Clone, Copy, Serialize, ToSchema)]
#[serde(rename_all = "snake_case")]
pub enum WhyNow {
    GradingBlockBlocksProgress,
    #[serde(rename = "inactivity_past_7_days")]
    InactivityPast7Days,
    RecentAssessmentFailures,
    MissingRequiredWork,
    ProgressBehindCourseBaseline,
    MultipleRiskSignals,
}

/// `AssessmentOutlierRow.outlier_reason_codes`
/// (`assessments::outlier_reason_codes`; a test pins the set).
#[derive(Debug, Clone, Copy, Serialize, ToSchema)]
#[serde(rename_all = "snake_case")]
pub enum OutlierReasonCode {
    LowCompletionRate,
    BelowThreshold,
    LowAccuracy,
    LowSubmissionRate,
    LowSuccessRate,
    GradingLatency,
}

code_enum!(AlertKind {
    RiskSpike => "risk_spike",
    EngagementDrop => "engagement_drop",
    GradingBacklog => "grading_backlog",
    GradingSlo => "grading_slo",
    AssessmentOutlier => "assessment_outlier",
    ContentStale => "content_stale",
});

code_enum!(ContentBottleneckSignal {
    HighTimeLowCompletion => "high_time_low_completion",
    ExitAfterOpen => "exit_after_open",
    RepeatedAssessmentFailures => "repeated_assessment_failures",
    StaleLowPerformance => "stale_low_performance",
});

code_enum!(InsightCategory {
    Risk => "risk",
    Assessment => "assessment",
    Content => "content",
    Workload => "workload",
    Completion => "completion",
    Intervention => "intervention",
});

code_enum!(
    /// Where the analytics read came from.
    DataMode {
        Live => "live",
        Rollup => "rollup",
    }
);

code_enum!(ForecastKind {
    CompletionTargetMiss => "completion_target_miss",
    GradingBacklog7d => "grading_backlog_7d",
    CourseCompletionDeadline => "course_completion_deadline",
    AssessmentFailureRisk => "assessment_failure_risk",
});

code_enum!(AnomalyKind {
    EngagementDrop => "engagement_drop",
    SubmissionSpike => "submission_spike",
    FastQuizCompletion => "fast_quiz_completion",
    ScoreDistributionShift => "score_distribution_shift",
});

code_enum!(ContentHealthSignal {
    ContentFreshness => "content_freshness",
    AverageProgress => "average_progress",
    GradingBacklog => "grading_backlog",
});

code_enum!(SuspiciousFlag {
    TooEasy => "too_easy",
    TooHard => "too_hard",
    LowDiscrimination => "low_discrimination",
    LowVariance => "low_variance",
});

code_enum!(AuditSource {
    GradingEntry => "grading_entry",
    BulkAction => "bulk_action",
});

code_enum!(SupportAlertCode {
    GradingSloBreached => "grading_slo_breached",
    GradingSloWarning => "grading_slo_warning",
    SuspiciousAttempts => "suspicious_attempts",
    MissingScores => "missing_scores",
});

code_enum!(ItemType {
    Workflow => "workflow",
    Question => "question",
    Test => "test",
});

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

/// Every server-composed analytics message. The client localises the code
/// with the item's `params` (DECISIONS "Pass-6 contract gaps": codes +
/// params on the wire, no prose). Param names per code:
///
/// - alerts: `grading_backlog {count}`, `engagement_dropped {delta_pct}`,
///   `content_stale {days}`, `risk_spike {count}`, `grading_slo_breached`
///   / `grading_slo_watch {assessment_title, course_name, breaches,
///   awaiting, oldest_hours?, target_hours}`;
/// - forecasts: `completion_target_miss {course_name, count}`,
///   `course_completion_deadline {course_name, expected_pct}`,
///   `grading_backlog_7d {count}`, `assessment_failure_risk
///   {assessment_title, expected_pct}`;
/// - anomalies: `sharp_engagement_drop` / `submission_spike {course_name}`,
///   `fast_quiz_completion` / `score_distribution_shift {assessment_title}`;
/// - insights: `new_at_risk_learners {course_name, count}`, `low_pass_rate`
///   / `low_pass_rate_with_diagnostics {assessment_title, pass_rate}`,
///   `content_bottleneck {activity_name, signal}`, `workload_backlog {count,
///   breaches, forecast_7d, target_hours}`, `completion_improved
///   {course_name, delta_pts}`;
/// - data quality: `missing_event_sources {sources[]}`, `thin_course_data
///   {count}`, `stale_rollup {}`.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, ToSchema)]
#[serde(rename_all = "snake_case")]
pub enum AnalyticsCode {
    GradingBacklog,
    EngagementDropped,
    ContentStale,
    RiskSpike,
    GradingSloBreached,
    GradingSloWatch,
    CompletionTargetMiss,
    CourseCompletionDeadline,
    #[serde(rename = "grading_backlog_7d")]
    GradingBacklog7d,
    AssessmentFailureRisk,
    SharpEngagementDrop,
    SubmissionSpike,
    FastQuizCompletion,
    ScoreDistributionShift,
    NewAtRiskLearners,
    LowPassRate,
    LowPassRateWithDiagnostics,
    ContentBottleneck,
    WorkloadBacklog,
    CompletionImproved,
    MissingEventSources,
    ThinCourseData,
    StaleRollup,
}

#[derive(Debug, Clone, Serialize, ToSchema)]
pub struct AlertItem {
    pub id: String,
    pub kind: AlertKind,
    pub severity: Severity,
    pub code: AnalyticsCode,
    #[schema(value_type = crate::wire::MessageParams)]
    pub params: serde_json::Value,
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

/// At-risk learners by level (medium + high, UX-240).
#[derive(Debug, Clone, Default, Serialize, ToSchema)]
pub struct RiskDistributionCounts {
    pub high: i64,
    pub medium: i64,
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
    pub signal: ContentBottleneckSignal,
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
    pub category: InsightCategory,
    pub severity: Severity,
    pub priority: i64,
    pub code: AnalyticsCode,
    #[schema(value_type = crate::wire::MessageParams)]
    pub params: serde_json::Value,
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
    #[schema(value_type = crate::wire::SavedQuery)]
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
    #[schema(value_type = Vec<crate::wire::DrillThroughRow>)]
    pub items: Vec<serde_json::Value>,
}

#[derive(Debug, Clone, Serialize, ToSchema)]
pub struct DataQualityIssue {
    pub id: &'static str,
    pub severity: Severity,
    pub code: AnalyticsCode,
    #[schema(value_type = crate::wire::MessageParams)]
    pub params: serde_json::Value,
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
    pub mode: DataMode,
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
    pub kind: ForecastKind,
    pub severity: Severity,
    pub code: AnalyticsCode,
    #[schema(value_type = crate::wire::MessageParams)]
    pub params: serde_json::Value,
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
    pub kind: AnomalyKind,
    pub severity: Severity,
    pub code: AnalyticsCode,
    #[schema(value_type = crate::wire::MessageParams)]
    pub params: serde_json::Value,
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
    #[schema(value_type = crate::analytics::InterventionType)]
    pub intervention_type: String,
    #[schema(value_type = crate::analytics::InterventionStatus)]
    pub status: String,
    pub outcome: Option<String>,
    pub notes: Option<String>,
    pub risk_score_before: Option<f64>,
    pub risk_score_after: Option<f64>,
    #[schema(value_type = crate::wire::InterventionPayload)]
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
    pub page: i64,
    pub page_size: i64,
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
    #[schema(value_type = Vec<RiskReasonCode>)]
    pub reason_codes: Vec<&'static str>,
    pub risk_trend: RiskTrend,
    pub previous_risk_score: Option<f64>,
    pub risk_score_delta: Option<f64>,
    pub top_contributing_factor: Option<&'static str>,
    pub confidence_level: Confidence,
    /// Stable code explaining the strongest signal.
    #[schema(value_type = WhyNow)]
    pub why_now: &'static str,
    pub intervention_count: i64,
    #[schema(value_type = Option<crate::analytics::InterventionType>)]
    pub last_intervention_type: Option<String>,
    pub last_intervention_at_unix: Option<i64>,
    pub last_intervention_outcome: Option<String>,
    /// Stable code (`review_submissions_first`, …).
    #[schema(value_type = RecommendedAction)]
    pub recommended_action: &'static str,
    /// What the caller may do for this learner now (the gates of
    /// `POST /analytics/teacher/interventions`).
    pub allowed_actions: Vec<AtRiskAction>,
}

/// `AtRiskLearnerRow.allowed_actions`.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, ToSchema)]
#[serde(rename_all = "snake_case")]
pub enum AtRiskAction {
    /// Record an intervention (course in the caller's scope, not archived).
    RecordIntervention,
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
    pub signal: ContentHealthSignal,
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
    pub suspicious_flag: Option<SuspiciousFlag>,
    #[schema(value_type = Vec<OutlierReasonCode>)]
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
    /// Submission status of the grade-of-record attempt (`published`,
    /// `pending`, `graded`, …) - the gradebook cell's rule.
    pub status: Option<String>,
    /// The newest attempt still awaiting the teacher (`pending` or `graded`
    /// but unreleased), if any - it may be newer than the ranked attempt.
    pub pending_attempt: Option<i32>,
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
    pub source: AuditSource,
    pub action: String,
    pub actor_user_id: Option<UserId>,
    pub actor_display_name: Option<String>,
    pub occurred_at_unix: i64,
    pub status: Option<String>,
    /// The saved/published score of a grading entry; `None` for bulk actions.
    pub final_score: Option<f64>,
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
    pub code: SupportAlertCode,
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
    pub item_type: ItemType,
    pub population_count: i64,
    pub impacted_count: i64,
    pub impact_rate: Option<f64>,
    pub signal: ItemSignal,
    /// Stable code for workflow rows (`manual_review_pending`, …); questions
    /// and tests carry `accuracy_pct` instead.
    pub note: Option<&'static str>,
    pub accuracy_pct: Option<f64>,
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

#[cfg(test)]
#[allow(clippy::unwrap_used, clippy::expect_used)]
mod code_enum_schema_tests {
    use super::*;
    use utoipa::PartialSchema;

    /// The schema's `enum` values, as JSON.
    fn schema_values<T: PartialSchema>() -> Vec<serde_json::Value> {
        let schema = serde_json::to_value(T::schema()).unwrap();
        schema["enum"].as_array().cloned().unwrap_or_default()
    }

    fn wire_values<T: Serialize>(all: &[T]) -> Vec<serde_json::Value> {
        all.iter()
            .map(|v| serde_json::to_value(v).unwrap())
            .collect()
    }

    macro_rules! pin {
        ($($t:ident),+ $(,)?) => {{
            $(
                assert_eq!(
                    schema_values::<$t>(),
                    wire_values($t::ALL),
                    concat!(stringify!($t), ": schema enum != serde output"),
                );
                for v in $t::ALL {
                    assert_eq!(serde_json::to_value(v).unwrap(), v.as_str());
                }
            )+
            [$(stringify!($t)),+].len()
        }};
    }

    #[test]
    fn code_enum_schemas_match_the_wire() {
        let pinned = pin!(
            AlertKind,
            ContentBottleneckSignal,
            InsightCategory,
            DataMode,
            ForecastKind,
            AnomalyKind,
            ContentHealthSignal,
            SuspiciousFlag,
            AuditSource,
            SupportAlertCode,
            ItemType,
        );
        // A new `code_enum!` must join the list above.
        let declared = include_str!("types.rs")
            .matches(concat!("code_enum", "!("))
            .count();
        assert_eq!(pinned, declared);
    }
}
