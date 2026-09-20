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
    /// Storage key of the thumbnail image, served at `/content/<key>`.
    pub thumbnail_key: Option<String>,
    pub creator_id: Option<UserId>,
    /// Active maintainers / contributors (`GET /courses/{id}/contributors`,
    /// status `active`, role not `reporter`); they edit the course like the
    /// creator without any role grant — authorship is the `:own` scope.
    /// Reporters are read-only and not listed.
    pub contributor_ids: Vec<UserId>,
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
            thumbnail_key: c.thumbnail_key,
            creator_id: c.creator_id,
            contributor_ids: c.contributor_ids,
            created_at_unix: c.created_at,
            updated_at_unix: c.updated_at,
        }
    }
}

/// Counts over the caller's editable courses (only with `mine=true`;
/// unaffected by `q`, `preset` or paging).
#[derive(Debug, Serialize, ToSchema)]
pub struct CourseSummary {
    pub total: i64,
    /// Published courses.
    pub ready: i64,
    /// Drafts.
    pub private: i64,
    /// Courses matching the `attention` preset.
    pub attention: i64,
}

impl From<ab_domain::catalog::courses::CourseSummary> for CourseSummary {
    fn from(s: ab_domain::catalog::courses::CourseSummary) -> Self {
        Self {
            total: s.total,
            ready: s.ready,
            private: s.private,
            attention: s.attention,
        }
    }
}

/// Keyset page (ARCHITECTURE §6): pass `next_cursor` back as `cursor`.
#[derive(Debug, Serialize, ToSchema)]
pub struct CoursePage {
    pub items: Vec<Course>,
    pub next_cursor: Option<CourseId>,
    /// Present only when the request had `mine=true`.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub summary: Option<CourseSummary>,
}

#[derive(Debug, Deserialize, garde::Validate, ToSchema)]
#[serde(deny_unknown_fields)]
pub struct CreateCourseRequest {
    #[garde(length(chars, max = 500))]
    pub name: String,
    #[garde(length(chars, max = 5000))]
    pub description: Option<String>,
    #[garde(length(chars, max = 20_000))]
    pub about: Option<String>,
    #[garde(inner(inner(length(min = 1, max = 64))), inner(length(max = 20)))]
    pub tags: Option<Vec<String>>,
}

#[derive(Debug, Deserialize, garde::Validate, ToSchema)]
#[serde(deny_unknown_fields)]
pub struct UpdateCourseRequest {
    #[garde(inner(length(max = 500)))]
    pub name: Option<String>,
    #[garde(inner(length(max = 5000)))]
    pub description: Option<String>,
    #[garde(inner(length(max = 20_000)))]
    pub about: Option<String>,
    #[garde(inner(inner(length(min = 1, max = 64))), inner(length(max = 20)))]
    pub tags: Option<Vec<String>>,
    #[garde(skip)]
    pub open_to_contributors: Option<bool>,
    /// Finalized `course-thumbnail` upload to claim as the thumbnail;
    /// `null` removes the current one.
    #[garde(skip)]
    #[serde(default, deserialize_with = "super::double_option")]
    #[schema(value_type = Option<uuid::Uuid>)]
    pub thumbnail_upload_id: Option<Option<uuid::Uuid>>,
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

/// `GET /courses` filters. Everything is optional; the default is the public
/// catalogue plus the caller's own courses, newest update first.
#[derive(Debug, Default, Deserialize, ToSchema)]
pub struct CourseListQuery {
    /// `next_cursor` from the previous page.
    pub cursor: Option<CourseId>,
    /// 1..=100, default 20.
    pub limit: Option<i64>,
    /// Only courses the caller may edit: creator, active contributor, or a
    /// holder of `course:update|manage:platform` (who edits every course).
    /// Adds the `summary` block to the page.
    pub mine: Option<bool>,
    /// Case-insensitive substring over name and description.
    pub q: Option<String>,
    /// `updated` (default, newest update first) or `name` (A→Z).
    pub sort: Option<String>,
    /// `all` (default) | `drafts` (unpublished) | `published` | `recent`
    /// (updated in the last 7 days) | `attention` — published with no live
    /// activity, or a draft created more than 30 days ago.
    pub preset: Option<String>,
}

/// One roster entry.
///
/// The creator is always listed first as `creator/active`; the other roles
/// are `maintainer | contributor | reporter`, statuses `pending | active |
/// inactive`. Any active entry authors on the course like the creator.
#[derive(Debug, Serialize, ToSchema)]
pub struct Contributor {
    pub user_id: UserId,
    pub username: String,
    pub display_name: String,
    pub avatar_key: Option<String>,
    pub role: String,
    pub status: String,
    pub created_at_unix: i64,
}

impl From<ab_domain::catalog::contributors::Contributor> for Contributor {
    fn from(c: ab_domain::catalog::contributors::Contributor) -> Self {
        Self {
            user_id: c.user_id,
            username: c.username,
            display_name: c.display_name,
            avatar_key: c.avatar_key,
            role: c.role,
            status: c.status,
            created_at_unix: c.created_at,
        }
    }
}

// garde's custom-validator contract fixes this signature (&field, &context).
#[allow(clippy::trivially_copy_pass_by_ref)]
fn valid_role(value: &str, _ctx: &()) -> garde::Result {
    if ab_domain::catalog::contributors::ROLES.contains(&value) {
        Ok(())
    } else {
        Err(garde::Error::new(
            "role must be maintainer, contributor or reporter",
        ))
    }
}

#[allow(clippy::trivially_copy_pass_by_ref)]
fn valid_status(value: &str, _ctx: &()) -> garde::Result {
    if ab_domain::catalog::contributors::STATUSES.contains(&value) {
        Ok(())
    } else {
        Err(garde::Error::new(
            "status must be pending, active or inactive",
        ))
    }
}

/// Add someone to the roster by id or username (exactly one).
#[derive(Debug, Deserialize, garde::Validate, ToSchema)]
#[serde(deny_unknown_fields)]
pub struct AddContributorRequest {
    #[garde(skip)]
    pub user_id: Option<UserId>,
    #[garde(inner(length(min = 1, max = 100)))]
    pub username: Option<String>,
    /// `maintainer | contributor | reporter` (default `contributor`).
    #[garde(inner(custom(valid_role)))]
    pub role: Option<String>,
}

#[derive(Debug, Deserialize, garde::Validate, ToSchema)]
#[serde(deny_unknown_fields)]
pub struct UpdateContributorRequest {
    /// `maintainer | contributor | reporter`.
    #[garde(inner(custom(valid_role)))]
    pub role: Option<String>,
    /// `pending | active | inactive` (`active` approves an application).
    #[garde(inner(custom(valid_status)))]
    pub status: Option<String>,
}

/// Course publish readiness. `ready` is `blockers.is_empty()`; the codes are
/// listed on `ab_domain::catalog::readiness` and localized by the web.
#[derive(Debug, Serialize, ToSchema)]
pub struct CourseReadiness {
    pub ready: bool,
    pub blockers: Vec<ReadinessItem>,
    pub warnings: Vec<ReadinessItem>,
}

/// `code` ∈ `no-live-activity | assessment-not-ready |
/// code-challenge-unconfigured | file-submission-unpublished |
/// file-submission-not-ready | activity-unpublished | thumbnail-missing | certificate-not-configured`.
#[derive(Debug, Serialize, ToSchema)]
pub struct ReadinessItem {
    pub code: String,
    pub activity_id: Option<ab_core::id::ActivityId>,
    pub title: Option<String>,
}

impl From<ab_domain::catalog::readiness::CourseReadiness> for CourseReadiness {
    fn from(r: ab_domain::catalog::readiness::CourseReadiness) -> Self {
        let map = |items: Vec<ab_domain::catalog::readiness::ReadinessItem>| {
            items
                .into_iter()
                .map(|i| ReadinessItem {
                    code: i.code.to_owned(),
                    activity_id: i.activity_id,
                    title: i.title,
                })
                .collect()
        };
        Self {
            ready: r.ready,
            blockers: map(r.blockers),
            warnings: map(r.warnings),
        }
    }
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
    #[garde(length(chars, min = 1, max = 500))]
    pub title: String,
    #[garde(length(chars, min = 1, max = 50_000))]
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
