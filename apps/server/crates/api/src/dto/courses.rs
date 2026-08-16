use ab_core::id::{CourseId, UserId};
use serde::{Deserialize, Serialize};
use utoipa::ToSchema;

#[derive(Debug, Serialize, ToSchema)]
pub struct Course {
    pub id: CourseId,
    pub name: String,
    pub description: String,
    pub about: String,
    pub tags: Vec<String>,
    pub public: bool,
    pub open_to_contributors: bool,
    pub creator_id: Option<UserId>,
    pub created_at_unix: i64,
    pub updated_at_unix: i64,
}

impl From<ab_domain::catalog::courses::Course> for Course {
    fn from(c: ab_domain::catalog::courses::Course) -> Self {
        Self {
            id: c.id,
            name: c.name,
            description: c.description,
            about: c.about,
            tags: c.tags,
            public: c.public,
            open_to_contributors: c.open_to_contributors,
            creator_id: c.creator_id,
            created_at_unix: c.created_at,
            updated_at_unix: c.updated_at,
        }
    }
}

/// Keyset page (ARCHITECTURE §6): pass `next_cursor` back as `cursor`.
#[derive(Debug, Serialize, ToSchema)]
pub struct CoursePage {
    pub items: Vec<Course>,
    pub next_cursor: Option<CourseId>,
}

#[derive(Debug, Deserialize, garde::Validate, ToSchema)]
#[serde(deny_unknown_fields)]
pub struct CreateCourseRequest {
    #[garde(length(min = 1, max = 500))]
    pub name: String,
    #[garde(length(max = 5000))]
    pub description: Option<String>,
    #[garde(length(max = 20_000))]
    pub about: Option<String>,
    #[garde(inner(inner(length(min = 1, max = 64))), inner(length(max = 20)))]
    pub tags: Option<Vec<String>>,
}

#[derive(Debug, Deserialize, garde::Validate, ToSchema)]
#[serde(deny_unknown_fields)]
pub struct UpdateCourseRequest {
    #[garde(inner(length(min = 1, max = 500)))]
    pub name: Option<String>,
    #[garde(inner(length(max = 5000)))]
    pub description: Option<String>,
    #[garde(inner(length(max = 20_000)))]
    pub about: Option<String>,
    #[garde(inner(inner(length(min = 1, max = 64))), inner(length(max = 20)))]
    pub tags: Option<Vec<String>>,
    #[garde(skip)]
    pub open_to_contributors: Option<bool>,
}

#[derive(Debug, Deserialize, garde::Validate, ToSchema)]
#[serde(deny_unknown_fields)]
pub struct CourseLifecycleRequest {
    /// `publish` or `unpublish`.
    #[garde(custom(valid_action))]
    pub action: String,
}

// garde's custom-validator contract fixes this signature (&field, &context).
#[allow(clippy::trivially_copy_pass_by_ref)]
fn valid_action(value: &str, _ctx: &()) -> garde::Result {
    if matches!(value, "publish" | "unpublish") {
        Ok(())
    } else {
        Err(garde::Error::new("action must be publish or unpublish"))
    }
}

#[derive(Debug, Deserialize, ToSchema)]
pub struct CourseListQuery {
    /// `next_cursor` from the previous page.
    pub cursor: Option<CourseId>,
    /// 1..=100, default 20.
    pub limit: Option<i64>,
}

/// One announcement in the course changelog feed.
#[derive(Debug, Serialize, ToSchema)]
pub struct CourseUpdate {
    pub id: ab_core::id::CourseUpdateId,
    pub course_id: CourseId,
    pub title: String,
    pub content: String,
    pub created_at_unix: i64,
    pub updated_at_unix: i64,
}

impl From<ab_domain::catalog::courses::CourseUpdate> for CourseUpdate {
    fn from(u: ab_domain::catalog::courses::CourseUpdate) -> Self {
        Self {
            id: u.id,
            course_id: u.course_id,
            title: u.title,
            content: u.content,
            created_at_unix: u.created_at,
            updated_at_unix: u.updated_at,
        }
    }
}

#[derive(Debug, Deserialize, garde::Validate, ToSchema)]
#[serde(deny_unknown_fields)]
pub struct CreateCourseUpdateRequest {
    #[garde(length(min = 1, max = 500))]
    pub title: String,
    #[garde(length(min = 1, max = 50_000))]
    pub content: String,
}

#[derive(Debug, Deserialize, garde::Validate, ToSchema)]
#[serde(deny_unknown_fields)]
pub struct EditCourseUpdateRequest {
    #[garde(inner(length(min = 1, max = 500)))]
    pub title: Option<String>,
    #[garde(inner(length(min = 1, max = 50_000)))]
    pub content: Option<String>,
}
