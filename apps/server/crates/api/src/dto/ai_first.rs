//! Request bodies of the AI-first routes (docs/AI-FIRST.md): concept graph curation, material search
//! and AI pre-grading. Responses are the domain views (`ab_domain::ai::assist`).

use ab_core::id::{ActivityId, ConceptId, ConceptTagId, GradeDraftId};
use ab_domain::ai::assist::{ApproveAction, ApproveItem};
use serde::Deserialize;
use utoipa::ToSchema;

#[allow(clippy::trivially_copy_pass_by_ref)]
fn valid_status(value: &str, _ctx: &()) -> garde::Result {
    if matches!(value, "suggested" | "approved" | "rejected") {
        Ok(())
    } else {
        Err(garde::Error::new(
            "status is suggested, approved or rejected",
        ))
    }
}

#[allow(clippy::ref_option, clippy::trivially_copy_pass_by_ref)]
fn valid_optional_status(value: &Option<String>, ctx: &()) -> garde::Result {
    value.as_deref().map_or(Ok(()), |v| valid_status(v, ctx))
}

#[allow(clippy::trivially_copy_pass_by_ref)]
fn valid_decision(value: &str, _ctx: &()) -> garde::Result {
    if matches!(value, "approved" | "rejected") {
        Ok(())
    } else {
        Err(garde::Error::new("status is approved or rejected"))
    }
}

#[allow(clippy::trivially_copy_pass_by_ref)]
fn valid_weight(value: &f32, _ctx: &()) -> garde::Result {
    if *value > 0.0 && *value <= 1.0 {
        Ok(())
    } else {
        Err(garde::Error::new("weight must be within (0, 1]"))
    }
}

#[allow(clippy::ref_option, clippy::trivially_copy_pass_by_ref)]
fn valid_optional_weight(value: &Option<f32>, ctx: &()) -> garde::Result {
    value.as_ref().map_or(Ok(()), |v| valid_weight(v, ctx))
}

#[allow(clippy::ref_option, clippy::trivially_copy_pass_by_ref)]
fn valid_optional_score(value: &Option<f64>, _ctx: &()) -> garde::Result {
    match value {
        Some(v) if !(0.0..=100.0).contains(v) => {
            Err(garde::Error::new("score must be within 0..=100"))
        }
        _ => Ok(()),
    }
}

const fn default_weight() -> f32 {
    1.0
}

#[derive(Debug, Deserialize, garde::Validate, ToSchema)]
#[serde(deny_unknown_fields)]
pub struct CreateConceptRequest {
    #[garde(length(min = 1, max = 200))]
    #[schema(min_length = 1, max_length = 200)]
    pub name: String,
    #[garde(length(max = 2000))]
    #[schema(max_length = 2000)]
    #[serde(default)]
    pub description: String,
}

#[derive(Debug, Deserialize, garde::Validate, ToSchema)]
#[serde(deny_unknown_fields)]
pub struct UpdateConceptRequest {
    #[garde(inner(length(min = 1, max = 200)))]
    #[schema(min_length = 1, max_length = 200)]
    pub name: Option<String>,
    #[garde(inner(length(max = 2000)))]
    #[schema(max_length = 2000)]
    pub description: Option<String>,
    /// `suggested`, `approved` or `rejected`.
    #[garde(custom(valid_optional_status))]
    pub status: Option<String>,
}

#[derive(Debug, Deserialize, garde::Validate, ToSchema)]
#[serde(deny_unknown_fields)]
pub struct PrerequisitesRequest {
    /// The concepts this one requires (replaces the set).
    #[garde(length(max = 50))]
    #[schema(max_items = 50)]
    pub requires: Vec<ConceptId>,
}

#[derive(Debug, Deserialize, garde::Validate, ToSchema)]
#[serde(deny_unknown_fields)]
pub struct CreateConceptTagRequest {
    #[garde(skip)]
    pub concept_id: ConceptId,
    #[garde(skip)]
    pub activity_id: ActivityId,
    /// A question of the activity; absent tags the whole activity.
    #[garde(skip)]
    pub item_id: Option<uuid::Uuid>,
    /// (0, 1], default 1.
    #[garde(custom(valid_weight))]
    #[serde(default = "default_weight")]
    pub weight: f32,
}

#[derive(Debug, Deserialize, garde::Validate, ToSchema)]
#[serde(deny_unknown_fields)]
pub struct UpdateConceptTagRequest {
    #[garde(custom(valid_optional_status))]
    pub status: Option<String>,
    #[garde(custom(valid_optional_weight))]
    pub weight: Option<f32>,
}

#[derive(Debug, Deserialize, garde::Validate, ToSchema)]
#[serde(deny_unknown_fields)]
pub struct ConceptReviewRequest {
    /// `approved` or `rejected`.
    #[garde(custom(valid_decision))]
    pub status: String,
    #[garde(length(max = 500))]
    #[schema(max_items = 500)]
    #[serde(default)]
    pub concept_ids: Vec<ConceptId>,
    #[garde(length(max = 2000))]
    #[schema(max_items = 2000)]
    #[serde(default)]
    pub tag_ids: Vec<ConceptTagId>,
}

#[derive(Debug, Default, Deserialize, garde::Validate, ToSchema)]
#[serde(deny_unknown_fields)]
pub struct SuggestConceptsRequest {
    /// Map one chapter only.
    #[garde(skip)]
    pub chapter_id: Option<ab_core::id::ChapterId>,
}

#[derive(Debug, Deserialize, garde::Validate, ToSchema)]
#[serde(deny_unknown_fields)]
pub struct SearchRequest {
    #[garde(length(min = 1, max = 500))]
    #[schema(min_length = 1, max_length = 500)]
    pub query: String,
    /// 1..=20 (default 8).
    #[garde(range(min = 1, max = 20))]
    #[schema(minimum = 1, maximum = 20)]
    #[serde(default = "default_limit")]
    pub limit: usize,
}

const fn default_limit() -> usize {
    8
}

#[derive(Debug, Default, Deserialize, garde::Validate, ToSchema)]
#[serde(deny_unknown_fields)]
pub struct QueueDraftsRequest {
    /// Only these works (submission or file attempt ids); absent = every work waiting for a grade.
    #[garde(inner(length(max = 200)))]
    #[schema(max_items = 200)]
    pub subject_ids: Option<Vec<uuid::Uuid>>,
}

#[derive(Debug, Deserialize, garde::Validate, ToSchema)]
#[serde(deny_unknown_fields)]
pub struct ApproveDraftItem {
    #[garde(skip)]
    pub draft_id: GradeDraftId,
    /// A work-level percentage instead of the draft's.
    #[garde(custom(valid_optional_score))]
    pub score: Option<f64>,
    /// Overall feedback instead of the draft's.
    #[garde(inner(length(max = 20_000)))]
    #[schema(max_length = 20_000)]
    pub feedback: Option<String>,
}

#[derive(Debug, Deserialize, garde::Validate, ToSchema)]
#[serde(deny_unknown_fields)]
pub struct ApproveDraftsRequest {
    #[garde(length(min = 1, max = 200), dive)]
    #[schema(min_items = 1, max_items = 200)]
    pub items: Vec<ApproveDraftItem>,
    #[garde(skip)]
    pub action: ApproveAction,
}

impl ApproveDraftsRequest {
    #[must_use]
    pub fn items(&self) -> Vec<ApproveItem> {
        self.items
            .iter()
            .map(|i| ApproveItem {
                draft_id: i.draft_id,
                score: i.score,
                feedback: i.feedback.clone(),
            })
            .collect()
    }
}

#[derive(Debug, Deserialize, garde::Validate, ToSchema)]
#[serde(deny_unknown_fields)]
pub struct GradingSettingsRequest {
    #[garde(skip)]
    pub auto_grade_drafts: bool,
}

#[derive(Debug, Deserialize, ToSchema, utoipa::IntoParams)]
#[serde(deny_unknown_fields)]
pub struct MetricsQuery {
    /// 1..=365 (default 30).
    pub days: Option<i64>,
}
