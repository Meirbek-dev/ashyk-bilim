use ab_core::id::{ActivityId, ChapterId, CourseId};
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
}

impl From<ab_domain::catalog::curriculum::Chapter> for Chapter {
    fn from(c: ab_domain::catalog::curriculum::Chapter) -> Self {
        Self {
            id: c.id,
            course_id: c.course_id,
            name: c.name,
            description: c.description,
            position: c.position,
        }
    }
}

#[derive(Debug, Serialize, ToSchema)]
pub struct Activity {
    pub id: ActivityId,
    pub chapter_id: ChapterId,
    pub course_id: CourseId,
    pub name: String,
    pub activity_type: String,
    pub activity_sub_type: String,
    pub published: bool,
    /// 1-based, contiguous within the chapter.
    pub position: i32,
}

impl From<ab_domain::catalog::curriculum::Activity> for Activity {
    fn from(a: ab_domain::catalog::curriculum::Activity) -> Self {
        Self {
            id: a.id,
            chapter_id: a.chapter_id,
            course_id: a.course_id,
            name: a.name,
            activity_type: a.activity_type,
            activity_sub_type: a.activity_sub_type,
            published: a.published,
            position: a.position,
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
            chapter: c.chapter.into(),
            activities: c.activities.into_iter().map(Into::into).collect(),
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
    #[garde(length(min = 1, max = 500))]
    pub name: String,
    #[garde(length(max = 5000))]
    pub description: Option<String>,
}

#[derive(Debug, Deserialize, garde::Validate, ToSchema)]
#[serde(deny_unknown_fields)]
pub struct UpdateChapterRequest {
    #[garde(inner(length(min = 1, max = 500)))]
    pub name: Option<String>,
    #[garde(inner(length(max = 5000)))]
    pub description: Option<String>,
}

/// Target slot for a chapter move; out-of-range positions clamp.
#[derive(Debug, Deserialize, garde::Validate, ToSchema)]
#[serde(deny_unknown_fields)]
pub struct MoveChapterRequest {
    /// 1-based target position.
    #[garde(range(min = 1))]
    pub position: i32,
}

#[derive(Debug, Deserialize, garde::Validate, ToSchema)]
#[serde(deny_unknown_fields)]
pub struct CreateActivityRequest {
    #[garde(length(min = 1, max = 500))]
    pub name: String,
    /// One of the closed activity-type set (e.g. `video`, `exam`).
    #[garde(length(min = 1, max = 64))]
    pub activity_type: String,
    /// Must pair with `activity_type` (e.g. `video_youtube`).
    #[garde(length(min = 1, max = 64))]
    pub activity_sub_type: String,
}

#[derive(Debug, Deserialize, garde::Validate, ToSchema)]
#[serde(deny_unknown_fields)]
pub struct UpdateActivityRequest {
    #[garde(inner(length(min = 1, max = 500)))]
    pub name: Option<String>,
    #[garde(skip)]
    pub published: Option<bool>,
}

/// Target slot for an activity move; `chapter_id` reparents within the same
/// course, omitted keeps the current chapter.
#[derive(Debug, Deserialize, garde::Validate, ToSchema)]
#[serde(deny_unknown_fields)]
pub struct MoveActivityRequest {
    /// 1-based target position (in the destination chapter).
    #[garde(range(min = 1))]
    pub position: i32,
    #[garde(skip)]
    pub chapter_id: Option<ChapterId>,
}
