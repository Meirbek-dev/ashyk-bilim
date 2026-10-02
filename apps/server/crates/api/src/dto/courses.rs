use ab_core::id::{CourseId, UserId};
use ab_domain::identity::Actor;
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
    /// Storage key of the legacy video thumbnail (migrated courses only;
    /// read-only), served at `/content/<key>`.
    pub thumbnail_video_key: Option<String>,
    /// "What you'll learn", in display order.
    pub learnings: Vec<CourseLearning>,
    pub creator_id: Option<UserId>,
    /// Active maintainers / contributors (`GET /courses/{id}/contributors`,
    /// status `active`, role not `reporter`); they edit the course like the
    /// creator without any role grant - authorship is the `:own` scope.
    /// Reporters are read-only and not listed.
    pub contributor_ids: Vec<UserId>,
    /// Set while the course is archived: undiscoverable and read-only for
    /// every role (writes answer 409 `course-archived`); enrolled learners
    /// keep reading it. Orthogonal to `public`.
    pub archived_at_unix: Option<i64>,
    pub archived_by: Option<UserId>,
    /// What the caller may do to this course now - draw only these actions.
    pub allowed_actions: Vec<ab_domain::catalog::courses::CourseAction>,
    pub created_at_unix: i64,
    pub updated_at_unix: i64,
}

impl Course {
    /// The course as `actor` sees it (`allowed_actions` are theirs).
    pub fn for_actor(c: ab_domain::catalog::courses::Course, actor: &Actor) -> Self {
        Self {
            allowed_actions: ab_domain::catalog::CoursesService::allowed_actions(actor, &c),
            id: c.id,
            name: c.name,
            description: c.description,
            about: c.about,
            tags: c.tags,
            public: c.public,
            open_to_contributors: c.open_to_contributors,
            learnings: ab_domain::catalog::courses::learnings(&c.learnings)
                .into_iter()
                .map(Into::into)
                .collect(),
            thumbnail_key: c.thumbnail_key,
            thumbnail_video_key: c.thumbnail_video_key,
            creator_id: c.creator_id,
            contributor_ids: c.contributor_ids,
            archived_at_unix: c.archived_at,
            archived_by: c.archived_by,
            created_at_unix: c.created_at,
            updated_at_unix: c.updated_at,
        }
    }
}

/// What archiving the course would freeze (`GET /courses/{id}/archive-preview`,
/// roster managers). Warnings for the confirmation dialog, never blockers.
#[derive(Debug, Serialize, ToSchema)]
pub struct CourseArchivePreview {
    /// Learners with a run on the course (staff never count).
    pub learners_enrolled: i64,
    /// Of those, the ones below 100% progress.
    pub learners_in_progress: i64,
    /// Handed-in quiz / code / file attempts without a released grade.
    pub ungraded_submissions: i64,
    /// Unfinished drafts (quiz, code, file); timed ones auto-submit when
    /// they expire, the rest stay drafts.
    pub open_attempts: i64,
    /// `scheduled` assessments - the archive returns them to `draft`.
    pub scheduled_assessments: i64,
    pub public: bool,
}

impl From<ab_domain::catalog::courses::ArchivePreview> for CourseArchivePreview {
    fn from(p: ab_domain::catalog::courses::ArchivePreview) -> Self {
        Self {
            learners_enrolled: p.learners_enrolled,
            learners_in_progress: p.learners_in_progress,
            ungraded_submissions: p.ungraded_submissions,
            open_attempts: p.open_attempts,
            scheduled_assessments: p.scheduled_assessments,
            public: p.public,
        }
    }
}

/// One "What you'll learn" entry.
#[derive(Debug, Serialize, ToSchema)]
pub struct CourseLearning {
    pub id: String,
    pub text: String,
    pub emoji: Option<String>,
}

impl From<ab_domain::catalog::courses::Learning> for CourseLearning {
    fn from(l: ab_domain::catalog::courses::Learning) -> Self {
        Self {
            id: l.id,
            text: l.text,
            emoji: l.emoji,
        }
    }
}

/// One "What you'll learn" entry on write; omit `id` for a new one.
#[derive(Debug, Deserialize, garde::Validate, ToSchema)]
#[serde(deny_unknown_fields)]
pub struct LearningInput {
    #[garde(inner(length(chars, max = 64)))]
    pub id: Option<String>,
    /// 1..=300 characters after trimming.
    #[garde(custom(valid_learning_text))]
    pub text: String,
    #[garde(inner(length(chars, max = 16)))]
    pub emoji: Option<String>,
}

impl From<LearningInput> for ab_domain::catalog::courses::Learning {
    fn from(l: LearningInput) -> Self {
        Self {
            id: l.id.unwrap_or_default(),
            text: l.text,
            emoji: l.emoji,
        }
    }
}

// garde's custom-validator contract fixes this signature (&field, &context).
#[allow(clippy::trivially_copy_pass_by_ref)]
fn valid_learning_text(value: &str, _ctx: &()) -> garde::Result {
    if (1..=300).contains(&value.trim().chars().count()) {
        Ok(())
    } else {
        Err(garde::Error::new("text must be 1..=300 characters"))
    }
}

/// Counts over the caller's editable courses (only with `mine=true`;
/// unaffected by `q`, `preset` or paging). Archived courses count under
/// `archived` only.
#[derive(Debug, Serialize, ToSchema)]
pub struct CourseSummary {
    pub total: i64,
    /// Published courses.
    pub ready: i64,
    /// Drafts.
    pub private: i64,
    /// Courses matching the `attention` preset.
    pub attention: i64,
    /// Archived courses (the `archived` preset).
    pub archived: i64,
}

impl From<ab_domain::catalog::courses::CourseSummary> for CourseSummary {
    fn from(s: ab_domain::catalog::courses::CourseSummary) -> Self {
        Self {
            total: s.total,
            ready: s.ready,
            private: s.private,
            attention: s.attention,
            archived: s.archived,
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
    /// Replaces the whole "What you'll learn" list (≤ 30 entries).
    #[garde(dive, length(max = 30))]
    pub learnings: Option<Vec<LearningInput>>,
}

#[derive(Debug, Deserialize, garde::Validate, ToSchema)]
#[serde(deny_unknown_fields)]
pub struct CourseLifecycleRequest {
    /// `publish` | `unpublish` (course write access, readiness-gated) |
    /// `archive` | `restore` (creator, active maintainer or
    /// `course:manage:platform`).
    #[garde(custom(valid_action))]
    pub action: String,
}

// garde's custom-validator contract fixes this signature (&field, &context).
#[allow(clippy::trivially_copy_pass_by_ref)]
fn valid_action(value: &str, _ctx: &()) -> garde::Result {
    if matches!(value, "publish" | "unpublish" | "archive" | "restore") {
        Ok(())
    } else {
        Err(garde::Error::new(
            "action must be publish, unpublish, archive or restore",
        ))
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
    /// Words matched like `/search` (word-start prefix, one letter whole,
    /// `-word` excludes) over name, description and about.
    pub q: Option<String>,
    /// `updated` (default, newest update first), `name` (A→Z) or `progress`
    /// (the caller's in-progress courses first by `progress_pct`, then
    /// newest update - UX-274).
    pub sort: Option<String>,
    /// `all` (default) | `drafts` (unpublished) | `published` | `recent`
    /// (updated in the last 7 days) | `attention` - published with no live
    /// activity, or a draft created more than 30 days ago | `archived`
    /// (only with `mine=true`, else 422). Archived courses are excluded
    /// from every other preset.
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

/// One readiness blocker.
///
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
