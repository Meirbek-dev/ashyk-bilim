use ab_core::id::{ActivityId, BlockId, ChapterId, CourseId};
use ab_domain::catalog::curriculum::{ActivityAction, ChapterAction};
use serde::{Deserialize, Serialize};
use utoipa::ToSchema;

#[derive(Debug, Serialize, ToSchema)]
pub struct Chapter {
    pub id: ChapterId,
    pub course_id: CourseId,
    pub name: String,
    pub description: String,
    /// 1-based, contiguous within the course.
    pub position: i32,
    /// Optimistic lock: `If-Match` on `PATCH` (stale → 412). Moves (this
    /// chapter's or a sibling's) renumber positions and bump it too.
    pub version: i32,
    /// What the caller may do to this chapter now.
    pub allowed_actions: Vec<ChapterAction>,
}

impl Chapter {
    /// `editable`: the caller passes the course's curriculum write gate
    /// (`CurriculumService::editable`).
    pub fn new(c: ab_domain::catalog::curriculum::Chapter, editable: bool) -> Self {
        Self {
            allowed_actions: ChapterAction::allowed(editable),
            id: c.id,
            course_id: c.course_id,
            name: c.name,
            description: c.description,
            position: c.position,
            version: c.version,
        }
    }
}

#[derive(Debug, Serialize, ToSchema)]
pub struct Activity {
    pub id: ActivityId,
    pub chapter_id: ChapterId,
    pub course_id: CourseId,
    pub name: String,
    #[schema(value_type = crate::dto::enums::ActivityType)]
    pub activity_type: String,
    #[schema(value_type = crate::dto::enums::ActivitySubType)]
    pub activity_sub_type: String,
    pub published: bool,
    /// 1-based, contiguous within the chapter.
    pub position: i32,
    /// Optimistic lock - send back as `If-Match` on the content PATCH.
    pub version: i32,
    /// What the caller may do to this activity now.
    pub allowed_actions: Vec<ActivityAction>,
}

impl Activity {
    /// `editable`: the caller passes the course's curriculum write gate
    /// (`CurriculumService::editable`).
    pub fn new(a: ab_domain::catalog::curriculum::Activity, editable: bool) -> Self {
        Self {
            allowed_actions: ActivityAction::allowed(editable),
            id: a.id,
            chapter_id: a.chapter_id,
            course_id: a.course_id,
            name: a.name,
            activity_type: a.activity_type,
            activity_sub_type: a.activity_sub_type,
            published: a.published,
            position: a.position,
            version: a.version,
        }
    }
}

/// A chapter with its activities, in curriculum order.
#[derive(Debug, Serialize, ToSchema)]
pub struct CurriculumChapter {
    #[serde(flatten)]
    pub chapter: Chapter,
    pub activities: Vec<Activity>,
}

impl From<ab_domain::catalog::curriculum::CurriculumChapter> for CurriculumChapter {
    fn from(c: ab_domain::catalog::curriculum::CurriculumChapter) -> Self {
        Self {
            chapter: Chapter::new(c.chapter, c.editable),
            activities: c
                .activities
                .into_iter()
                .map(|a| Activity::new(a, c.editable))
                .collect(),
        }
    }
}

#[derive(Debug, Serialize, ToSchema)]
pub struct Curriculum {
    pub chapters: Vec<CurriculumChapter>,
}

#[derive(Debug, Deserialize, garde::Validate, ToSchema)]
#[serde(deny_unknown_fields)]
pub struct CreateChapterRequest {
    #[garde(length(chars, max = 500))]
    #[schema(max_length = 500)]
    pub name: String,
    #[garde(length(chars, max = 5000))]
    #[schema(max_length = 5000)]
    pub description: Option<String>,
}

#[derive(Debug, Deserialize, garde::Validate, ToSchema)]
#[serde(deny_unknown_fields)]
pub struct UpdateChapterRequest {
    #[garde(inner(length(max = 500)))]
    #[schema(max_length = 500)]
    pub name: Option<String>,
    #[garde(inner(length(max = 5000)))]
    #[schema(max_length = 5000)]
    pub description: Option<String>,
}

/// Target slot for a chapter move; out-of-range positions clamp.
#[derive(Debug, Deserialize, garde::Validate, ToSchema)]
#[serde(deny_unknown_fields)]
pub struct MoveChapterRequest {
    /// 1-based target position.
    #[garde(range(min = 1))]
    #[schema(minimum = 1)]
    pub position: i32,
}

#[derive(Debug, Deserialize, garde::Validate, ToSchema)]
#[serde(deny_unknown_fields)]
pub struct CreateActivityRequest {
    #[garde(length(chars, max = 500))]
    #[schema(max_length = 500)]
    pub name: String,
    /// One of the closed activity-type set (e.g. `video`, `exam`).
    #[garde(length(min = 1, max = 64))]
    #[schema(value_type = crate::dto::enums::ActivityType)]
    pub activity_type: String,
    /// Must pair with `activity_type` (e.g. `video_youtube`).
    #[garde(length(min = 1, max = 64))]
    #[schema(value_type = crate::dto::enums::ActivitySubType)]
    pub activity_sub_type: String,
}

/// Full activity view with the heavy jsonb columns.
#[derive(Debug, Serialize, ToSchema)]
pub struct ActivityDetail {
    #[serde(flatten)]
    pub activity: Activity,
    /// Editor content (dynamic pages) or type-specific payload.
    #[schema(value_type = ab_domain::wire::ActivityContent)]
    pub content: serde_json::Value,
    #[schema(value_type = ab_domain::wire::ActivityDetails)]
    pub details: serde_json::Value,
    #[schema(value_type = ab_domain::wire::ActivitySettings)]
    pub settings: serde_json::Value,
}

impl From<ab_domain::catalog::curriculum::ActivityDetail> for ActivityDetail {
    fn from(d: ab_domain::catalog::curriculum::ActivityDetail) -> Self {
        Self {
            activity: Activity::new(d.activity, d.editable),
            content: d.content.content,
            details: d.content.details,
            settings: d.content.settings,
        }
    }
}

// garde's custom-validator contract fixes this signature (&field, &context).
#[allow(clippy::trivially_copy_pass_by_ref, clippy::ref_option)]
fn json_object(value: &Option<serde_json::Value>, _ctx: &()) -> garde::Result {
    match value {
        Some(v) if !v.is_object() => Err(garde::Error::new("must be a JSON object")),
        _ => Ok(()),
    }
}

#[derive(Debug, Deserialize, garde::Validate, ToSchema)]
#[serde(deny_unknown_fields)]
pub struct UpdateActivityRequest {
    #[garde(inner(length(max = 500)))]
    #[schema(max_length = 500)]
    pub name: Option<String>,
    #[garde(skip)]
    pub published: Option<bool>,
    /// Change together with `activity_sub_type` (both or neither).
    #[garde(inner(length(min = 1, max = 64)))]
    #[schema(value_type = Option<crate::dto::enums::ActivityType>)]
    pub activity_type: Option<String>,
    #[garde(inner(length(min = 1, max = 64)))]
    #[schema(value_type = Option<crate::dto::enums::ActivitySubType>)]
    pub activity_sub_type: Option<String>,
    #[garde(custom(json_object))]
    #[schema(value_type = Option<ab_domain::wire::ActivityContent>)]
    pub content: Option<serde_json::Value>,
    #[garde(custom(json_object))]
    #[schema(value_type = Option<ab_domain::wire::ActivityDetails>)]
    pub details: Option<serde_json::Value>,
    #[garde(custom(json_object))]
    #[schema(value_type = Option<ab_domain::wire::ActivitySettings>)]
    pub settings: Option<serde_json::Value>,
}

#[derive(Debug, Serialize, ToSchema)]
pub struct Block {
    pub id: BlockId,
    pub activity_id: ActivityId,
    /// `image`, `pdf`, `video` (or `custom` for migrated legacy rows).
    pub block_type: String,
    #[schema(value_type = ab_domain::wire::BlockContent)]
    pub content: serde_json::Value,
    pub created_at_unix: i64,
}

impl From<ab_domain::catalog::curriculum::Block> for Block {
    fn from(b: ab_domain::catalog::curriculum::Block) -> Self {
        Self {
            id: b.id,
            activity_id: b.activity_id,
            block_type: b.block_type,
            content: b.content,
            created_at_unix: b.created_at,
        }
    }
}

#[derive(Debug, Deserialize, garde::Validate, ToSchema)]
#[serde(deny_unknown_fields)]
pub struct CreateBlockRequest {
    /// `image`, `pdf`, or `video`.
    #[garde(length(min = 1, max = 32))]
    #[schema(value_type = crate::dto::enums::BlockType)]
    pub block_type: String,
    /// A finalized upload (purpose must match the block type).
    #[garde(skip)]
    pub upload_id: uuid::Uuid,
    /// Original client-side file name, for display.
    #[garde(inner(length(max = 500)))]
    #[schema(max_length = 500)]
    pub file_name: Option<String>,
}

/// Target slot for an activity move; `chapter_id` reparents within the same
/// course, omitted keeps the current chapter.
#[derive(Debug, Deserialize, garde::Validate, ToSchema)]
#[serde(deny_unknown_fields)]
pub struct MoveActivityRequest {
    /// 1-based target position (in the destination chapter).
    #[garde(range(min = 1))]
    #[schema(minimum = 1)]
    pub position: i32,
    #[garde(skip)]
    pub chapter_id: Option<ChapterId>,
}
