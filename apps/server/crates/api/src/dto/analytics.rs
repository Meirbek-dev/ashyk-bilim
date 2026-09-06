//! Analytics DTOs (legacy `services/analytics/schemas.py`).
//!
//! The dashboard read models are computed values owned by
//! `ab_domain::analytics::types` (they already carry `Serialize` +
//! `ToSchema`) and are re-exported here as the wire shapes. This module adds
//! the query-string and request-body types.

use ab_core::assessments::AssessmentKind;
use ab_core::id::{AssessmentId, CourseId, UserId};
use ab_domain::analytics::RawFilters;
use serde::Deserialize;
use utoipa::{IntoParams, ToSchema};

pub use ab_domain::analytics::filters::{Bucket, Compare, SortOrder, Window};
pub use ab_domain::analytics::types::{
    AdminAnalyticsResponse, AssessmentOutlierRow, AtRiskLearnerRow, AtRiskLearnersResponse,
    DrillMetric, DrillThroughResponse, Intervention, InterventionList, SavedView, SavedViewList,
    TeacherAssessmentDetailResponse, TeacherAssessmentListResponse, TeacherCourseDetailResponse,
    TeacherCourseListResponse, TeacherCourseRow, TeacherOverviewResponse,
};

/// Dashboard filters shared by every analytics read.
///
/// Legacy `get_analytics_filters`. Values are validated in the domain so
/// every malformed one is a 422 field error; unknown keys are ignored (the
/// client forwards its whole filter state).
#[derive(Debug, Default, Deserialize, IntoParams)]
#[into_params(parameter_in = Query)]
pub struct AnalyticsQuery {
    /// `7d`, `28d` (default) or `90d`.
    pub window: Option<String>,
    /// `previous_period` (default) or `none`.
    pub compare: Option<String>,
    /// `day` (default) or `week`.
    pub bucket: Option<String>,
    /// Narrow to one bucket: RFC 3339 timestamp or epoch seconds.
    pub bucket_start: Option<String>,
    /// Comma-separated course ids (must be inside the caller's scope).
    pub course_ids: Option<String>,
    /// Comma-separated usergroup ids.
    pub cohort_ids: Option<String>,
    /// Inspect another teacher (platform scope only).
    pub teacher_user_id: Option<String>,
    /// IANA zone for calendar bucketing (default UTC).
    pub timezone: Option<String>,
    /// 1-based (default 1).
    pub page: Option<i64>,
    /// 1..=200 (default 25).
    pub page_size: Option<i64>,
    pub sort_by: Option<String>,
    /// `asc` or `desc` (default).
    pub sort_order: Option<String>,
}

impl From<AnalyticsQuery> for RawFilters {
    fn from(q: AnalyticsQuery) -> Self {
        Self {
            window: q.window,
            compare: q.compare,
            bucket: q.bucket,
            bucket_start: q.bucket_start,
            course_ids: q.course_ids,
            cohort_ids: q.cohort_ids,
            teacher_user_id: q.teacher_user_id,
            timezone: q.timezone,
            page: q.page,
            page_size: q.page_size,
            sort_by: q.sort_by,
            sort_order: q.sort_order,
        }
    }
}

/// Extra narrowing for the intervention list (on top of [`AnalyticsQuery`]).
#[derive(Debug, Default, Deserialize, IntoParams)]
#[into_params(parameter_in = Query)]
pub struct InterventionListQuery {
    pub user_id: Option<UserId>,
    pub course_id: Option<CourseId>,
}

/// Drill-through target (on top of [`AnalyticsQuery`]). `pass_rate` needs
/// both `assessment_type` and `assessment_id`.
#[derive(Debug, Default, Deserialize, IntoParams)]
#[into_params(parameter_in = Query)]
pub struct DrillThroughQuery {
    pub course_id: Option<CourseId>,
    pub assessment_type: Option<AssessmentKind>,
    pub assessment_id: Option<AssessmentId>,
}

fn default_status() -> String {
    "completed".to_owned()
}

fn empty_object() -> serde_json::Value {
    serde_json::Value::Object(serde_json::Map::new())
}

/// Log a teacher action for an at-risk learner. `status` defaults to
/// `completed` (legacy).
#[derive(Debug, Deserialize, garde::Validate, ToSchema)]
#[serde(deny_unknown_fields)]
pub struct CreateInterventionRequest {
    #[garde(skip)]
    pub user_id: UserId,
    #[garde(skip)]
    pub course_id: CourseId,
    /// `message_sent`, `submission_graded`, `extension_granted`,
    /// `meeting_scheduled` or `learner_recovered`.
    #[garde(length(min = 1, max = 50))]
    pub intervention_type: String,
    /// `planned`, `completed` or `resolved`.
    #[serde(default = "default_status")]
    #[garde(length(min = 1, max = 20))]
    pub status: String,
    #[garde(length(max = 2_000))]
    pub outcome: Option<String>,
    #[garde(length(max = 4_000))]
    pub notes: Option<String>,
    /// Free-form details (an object).
    #[serde(default = "empty_object")]
    #[garde(skip)]
    #[schema(value_type = Object)]
    pub payload: serde_json::Value,
}

fn default_view_type() -> String {
    "overview".to_owned()
}

/// Save (or overwrite by name + type) a dashboard view.
#[derive(Debug, Deserialize, garde::Validate, ToSchema)]
#[serde(deny_unknown_fields)]
pub struct SaveViewRequest {
    #[garde(length(min = 1, max = 200))]
    pub name: String,
    /// Defaults to `overview`.
    #[serde(default = "default_view_type")]
    #[garde(length(min = 1, max = 50))]
    pub view_type: String,
    /// The saved filter state (an object).
    #[serde(default = "empty_object")]
    #[garde(skip)]
    #[schema(value_type = Object)]
    pub query: serde_json::Value,
}
