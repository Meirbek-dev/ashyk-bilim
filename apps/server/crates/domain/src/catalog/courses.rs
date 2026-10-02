//! Course CRUD + visibility lifecycle.
//!
//! Access semantics: read = public OR author OR active reporter OR cohort
//! member OR platform manager; write = author OR `course:update:platform`.
//! "Author" is `Course::is_author` - the creator or an active maintainer /
//! contributor (`resource_authors`, see `contributors.rs`) - the one
//! predicate every authoring gate in the workspace (curriculum, assessments,
//! files, grading, AI, certificates) goes through. Authorship IS the `:own`
//! scope: no role grant is needed on top (DECISIONS 2026-09-12, "active
//! maintainers/contributors author on the course like the creator").
//!
//! Archive (docs/COURSE_ARCHIVING.md): `archived_at` freezes the course for
//! every role - each mutating method here and in the other course-scoped
//! services calls `Course::ensure_not_archived` after its access gate (never
//! inside the shared gates, which author reads go through too). Archive and
//! restore take the roster-manager gate (`contributors.rs`).

use ab_core::id::{CourseId, UserId};
use ab_core::permission::{Action, Permission, ResourceType, Scope};
use ab_core::{Error, Result};
use sqlx::PgPool;

use ab_core::id::CourseUpdateId;
pub use ab_db::catalog::{
    CourseRow as Course, CourseSummaryRow as CourseSummary, CourseUpdateRow as CourseUpdate,
};
use uuid::Uuid;

use crate::assessments::items::normalize_tags;
use crate::catalog::sees_private;
use crate::files::uploads::{UNREFERENCED_GRACE, claim_upload};
use crate::identity::Actor;

pub(crate) const fn perm(action: Action, scope: Scope) -> Permission {
    Permission {
        resource: ResourceType::Course,
        action,
        scope: Some(scope),
    }
}

/// What the caller may do to a course right now (`Course.allowed_actions`).
/// Each variant is the gate of the mutation it names - [`CoursesService::allowed_actions`].
#[derive(Debug, Clone, Copy, PartialEq, Eq, serde::Serialize, utoipa::ToSchema)]
#[serde(rename_all = "snake_case")]
pub enum CourseAction {
    /// `PATCH /courses/{id}`, announcements, the curriculum (chapters,
    /// activities, blocks), certificates.
    Update,
    /// Lifecycle `publish` (currently a draft).
    Publish,
    /// Lifecycle `unpublish` (currently published).
    Unpublish,
    /// Lifecycle `archive` (+ `GET archive-preview`).
    Archive,
    /// Lifecycle `restore` (currently archived).
    Restore,
    /// `DELETE /courses/{id}`.
    Delete,
    /// Roster writes (`/courses/{id}/contributors`).
    ManageContributors,
}

#[derive(Debug, Default)]
pub struct CourseChanges {
    pub name: Option<String>,
    pub description: Option<String>,
    pub about: Option<String>,
    pub tags: Option<Vec<String>>,
    pub open_to_contributors: Option<bool>,
    /// `Some(Some(id))`: claim that finalized `course-thumbnail` upload;
    /// `Some(None)`: remove the thumbnail. The replaced object is released
    /// for reaping either way.
    pub thumbnail_upload_id: Option<Option<Uuid>>,
    /// Replaces the whole "What you'll learn" list; blank ids are generated.
    pub learnings: Option<Vec<Learning>>,
}

/// One "What you'll learn" entry (`courses.learnings` jsonb element).
#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
pub struct Learning {
    #[serde(default)]
    pub id: String,
    pub text: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub emoji: Option<String>,
}

/// The stored list as typed entries. Legacy / hand-edited jsonb is tolerated:
/// a non-array is `[]`, a non-conforming or blank entry is skipped.
#[must_use]
pub fn learnings(value: &serde_json::Value) -> Vec<Learning> {
    let Some(items) = value.as_array() else {
        return Vec::new();
    };
    items
        .iter()
        .filter_map(|item| serde_json::from_value::<Learning>(item.clone()).ok())
        .filter(|l| !l.text.trim().is_empty())
        .collect()
}

/// Trim text/emoji, reject blank text and duplicate ids (422 `learnings`/
/// `duplicate`: the landing keys its list by id - BUG-334), fill blank ids.
fn normalize_learnings(items: Vec<Learning>) -> Result<Vec<Learning>> {
    let mut seen = std::collections::HashSet::new();
    items
        .into_iter()
        .map(|l| {
            let text = ab_core::required_str("learnings", &l.text)?.to_owned();
            let id = l.id.trim();
            let id = if id.is_empty() {
                Uuid::now_v7().simple().to_string()
            } else {
                id.to_owned()
            };
            if !seen.insert(id.clone()) {
                return Err(Error::validation(vec![ab_core::FieldError {
                    field: "learnings".into(),
                    code: "duplicate".into(),
                    message: format!("duplicate learning id {id:?}"),
                }]));
            }
            let emoji = l
                .emoji
                .map(|e| e.trim().to_owned())
                .filter(|e| !e.is_empty());
            Ok(Learning { id, text, emoji })
        })
        .collect()
}

/// `GET /courses` filters (see `ab_db::catalog::CourseFilter`).
#[derive(Debug, Default, Clone)]
pub struct ListParams<'a> {
    pub mine: bool,
    pub q: Option<&'a str>,
    pub sort: &'a str,
    pub preset: &'a str,
}

/// What archiving a course would freeze (`GET /courses/{id}/archive-preview`).
#[derive(Debug, Clone)]
pub struct ArchivePreview {
    pub learners_enrolled: i64,
    pub learners_in_progress: i64,
    pub ungraded_submissions: i64,
    pub open_attempts: i64,
    pub scheduled_assessments: i64,
    pub public: bool,
}

#[derive(Clone)]
pub struct CoursesService {
    pub(crate) pool: PgPool,
}

impl CoursesService {
    #[must_use]
    pub const fn new(pool: PgPool) -> Self {
        Self { pool }
    }

    /// `course:create:platform`.
    /// UX-311: the write handlers check it before reading the body.
    pub fn require_create(actor: &Actor) -> Result<()> {
        actor.require(perm(Action::Create, Scope::Platform))
    }

    /// The course's write gate on its own: visible (404), `require_write`
    /// (403), not archived (409). UX-311: the write handlers check it
    /// before reading the body.
    pub async fn require_writable(&self, actor: &Actor, id: CourseId) -> Result<()> {
        let course = self.get(actor, id).await?;
        Self::require_write(actor, &course)?;
        course.ensure_not_archived()
    }

    /// [`Self::require_writable`] for an announcement's course.
    pub async fn require_writable_update(&self, actor: &Actor, id: CourseUpdateId) -> Result<()> {
        self.writable_update(actor, id).await.map(drop)
    }

    /// Write access: platform-wide updaters, or an author (the creator or an
    /// active maintainer / contributor - authorship is the `:own` scope).
    /// Shared with the curriculum service (chapters/activities inherit it).
    pub(crate) fn require_write(actor: &Actor, course: &Course) -> Result<()> {
        if actor.has(perm(Action::Update, Scope::Platform)) || course.is_author(actor.user_id) {
            return Ok(());
        }
        Err(Error::forbidden("no write access to this course"))
    }

    /// The delete gate: platform deleters, or the creator with the delete
    /// grant (legacy matrix: course:delete:own) - stricter than update.
    fn may_delete(actor: &Actor, course: &Course) -> bool {
        actor.has(perm(Action::Delete, Scope::Platform))
            || (course.creator_id == Some(actor.user_id)
                && actor.has(perm(Action::Delete, Scope::Own)))
    }

    /// `Course.allowed_actions`: the same predicates the mutations enforce
    /// (write, roster manager, delete) plus the archive state - an action
    /// that would answer 403 or 409 is not listed.
    #[must_use]
    pub fn allowed_actions(actor: &Actor, course: &Course) -> Vec<CourseAction> {
        let write = Self::require_write(actor, course).is_ok();
        let roster = Self::manages_roster(actor, course);
        let open = course.archived_at.is_none();
        [
            (CourseAction::Update, write && open),
            (CourseAction::Publish, write && open && !course.public),
            (CourseAction::Unpublish, write && open && course.public),
            (CourseAction::Archive, roster && open),
            (CourseAction::Restore, roster && !open),
            (CourseAction::Delete, Self::may_delete(actor, course)),
            (CourseAction::ManageContributors, roster && open),
        ]
        .into_iter()
        .filter_map(|(action, ok)| ok.then_some(action))
        .collect()
    }

    /// Visibility: public, author (creator / active contributor), active
    /// reporter, platform manager, or membership of a usergroup linked to
    /// the course (cohort access) - SQL `course_visible`, the predicate the
    /// catalogue, search and collections list by (BUG-190). Invisible = 404.
    pub(crate) async fn require_read(&self, actor: &Actor, course: &Course) -> Result<()> {
        let see_all = sees_private(actor, ResourceType::Course);
        if course.public
            || see_all
            || course.is_author(actor.user_id)
            || ab_db::catalog::course_visible(&self.pool, course.id, Some(actor.user_id), see_all)
                .await?
        {
            Ok(())
        } else {
            Err(Error::not_found("course"))
        }
    }

    pub async fn create(
        &self,
        actor: &Actor,
        name: &str,
        description: &str,
        about: &str,
        tags: Vec<String>,
    ) -> Result<Course> {
        actor.require(perm(Action::Create, Scope::Platform))?;
        // BUG-168: names are trimmed and never blank (shared rule, UX-106);
        // UX-137: free text is trimmed, tags trimmed + de-duplicated.
        let name = ab_core::required_str("name", name)?;
        let id = ab_db::catalog::insert_course(
            &self.pool,
            name,
            description.trim(),
            about.trim(),
            &normalize_tags(&tags),
            actor.user_id,
        )
        .await?;
        ab_db::catalog::get_course(&self.pool, id)
            .await?
            .ok_or_else(|| Error::not_found("course"))
    }

    pub async fn get(&self, actor: &Actor, id: CourseId) -> Result<Course> {
        let course = ab_db::catalog::get_course(&self.pool, id)
            .await?
            .ok_or_else(|| Error::not_found("course"))?;
        self.require_read(actor, &course).await?;
        Ok(course)
    }

    /// One page of the catalogue; returns (courses, next_cursor). With
    /// `mine`, only courses the caller may edit (author, or platform
    /// updater/manager who sees everything).
    pub async fn list(
        &self,
        actor: &Actor,
        params: &ListParams<'_>,
        cursor: Option<CourseId>,
        limit: i64,
    ) -> Result<(Vec<Course>, Option<CourseId>)> {
        // UX-154: out-of-range `limit` is a 422 like the other lists (UX-146).
        let limit = ab_core::page_limit(limit, 100)?;
        // The archive is a workspace view: only over the caller's own set.
        if params.preset == "archived" && !params.mine {
            return Err(Error::validation(vec![ab_core::FieldError {
                field: "preset".into(),
                code: "invalid".into(),
                message: "preset=archived requires mine=true".into(),
            }]));
        }
        let filter = ab_db::catalog::CourseFilter {
            viewer: Some(actor.user_id),
            see_all: sees_private(actor, ResourceType::Course),
            mine: params.mine,
            q: params.q.map(str::trim).filter(|q| !q.is_empty()),
            sort: params.sort,
            preset: params.preset,
        };
        let mut rows = ab_db::catalog::list_courses(&self.pool, &filter, cursor, limit + 1).await?;
        let next = if i64::try_from(rows.len()).unwrap_or(i64::MAX) > limit {
            rows.truncate(usize::try_from(limit).unwrap_or(usize::MAX));
            rows.last().map(|c| c.id)
        } else {
            None
        };
        Ok((rows, next))
    }

    /// Counts over the caller's editable set (the `mine=true` summary block).
    pub async fn summary(&self, actor: &Actor) -> Result<CourseSummary> {
        ab_db::catalog::summarize_courses(
            &self.pool,
            actor.user_id,
            sees_private(actor, ResourceType::Course),
        )
        .await
    }

    /// Courses `user` created or actively co-authors, newest first, filtered
    /// by the shared `course_visible` rule (BUG-190).
    pub async fn list_by_user(
        &self,
        actor: &Actor,
        user: UserId,
        cursor: Option<CourseId>,
        limit: i64,
    ) -> Result<(Vec<Course>, Option<CourseId>)> {
        let limit = ab_core::page_limit(limit, 100)?;
        let mut rows = ab_db::catalog::list_user_courses(
            &self.pool,
            user,
            actor.user_id,
            sees_private(actor, ResourceType::Course),
            cursor,
            limit + 1,
        )
        .await?;
        let next = if i64::try_from(rows.len()).unwrap_or(i64::MAX) > limit {
            rows.truncate(usize::try_from(limit).unwrap_or(usize::MAX));
            rows.last().map(|c| c.id)
        } else {
            None
        };
        Ok((rows, next))
    }

    pub async fn update(
        &self,
        actor: &Actor,
        id: CourseId,
        changes: CourseChanges,
    ) -> Result<Course> {
        // Invisible courses do not exist (404), even to would-be writers.
        let course = self.get(actor, id).await?;
        Self::require_write(actor, &course)?;
        course.ensure_not_archived()?;
        let name = changes
            .name
            .as_deref()
            .map(|n| ab_core::required_str("name", n))
            .transpose()?;
        let mut tx = self.pool.begin().await?;
        let tags = changes.tags.as_deref().map(normalize_tags);
        let learnings = changes
            .learnings
            .map(normalize_learnings)
            .transpose()?
            .map(|l| serde_json::to_value(l).map_err(|e| Error::internal("course learnings", e)))
            .transpose()?;
        ab_db::catalog::update_course(
            &mut *tx,
            id,
            ab_db::catalog::CourseChanges {
                name,
                description: changes.description.as_deref().map(str::trim),
                about: changes.about.as_deref().map(str::trim),
                tags: tags.as_deref(),
                open_to_contributors: changes.open_to_contributors,
                learnings: learnings.as_ref(),
            },
        )
        .await?
        .ok_or_else(|| Error::not_found("course"))?;
        // BUG-234: the claim commits with the UPDATE that references it; a
        // concurrent course DELETE turns the UPDATE into a 404 and the
        // rollback drops the reference instead of leaking the upload.
        // BUG-261: the UPDATE above locked the course row before the claim
        // touches an upload row - the course → uploads order every course
        // delete takes, so PATCH ∥ DELETE (or PATCH ∥ PATCH) cannot deadlock.
        let thumbnail_key = match changes.thumbnail_upload_id {
            Some(Some(upload_id)) => Some(Some(
                claim_upload(
                    &mut tx,
                    actor,
                    upload_id,
                    "course-thumbnail",
                    "thumbnail_upload_id",
                )
                .await?,
            )),
            Some(None) => Some(None),
            None => None,
        };
        // UX-143: the key the UPDATE actually replaced is released - not the
        // one this request read, which a concurrent PATCH may have replaced.
        // BUG-209: also when it equals the new key - the claim above counted
        // it once more, so releasing the "old" one nets to a no-op (holds
        // for two identical concurrent PATCHes: each swap returns one key).
        if let Some(key) = thumbnail_key
            && let Some(old) =
                ab_db::catalog::set_course_thumbnail(&mut *tx, id, key.as_deref()).await?
        {
            ab_db::uploads::release_reference_by_key(
                &mut *tx,
                &old,
                UNREFERENCED_GRACE.as_secs_f64(),
            )
            .await?;
        }
        tx.commit().await?;
        ab_db::catalog::get_course(&self.pool, id)
            .await?
            .ok_or_else(|| Error::not_found("course"))
    }

    /// Publish/unpublish (legacy `CourseLifecycleUpdate` semantics).
    pub async fn set_public(&self, actor: &Actor, id: CourseId, public: bool) -> Result<Course> {
        // Invisible courses do not exist (404), even to would-be writers.
        let course = self.get(actor, id).await?;
        Self::require_write(actor, &course)?;
        course.ensure_not_archived()?;
        ab_db::catalog::set_course_public(&self.pool, id, public).await?;
        ab_db::catalog::get_course(&self.pool, id)
            .await?
            .ok_or_else(|| Error::not_found("course"))
    }

    /// Archive (roster managers: creator / active maintainer /
    /// `course:manage:platform`). One transaction: lock the course row,
    /// 409 `conflict` if already archived, stamp `archived_at/by`, and pull
    /// every `scheduled` assessment back to `draft` (audited) - otherwise
    /// `assessments:publish-due` would publish into a frozen course, or a
    /// stale schedule would fire on restore. `public` is untouched.
    pub async fn archive(&self, actor: &Actor, id: CourseId) -> Result<Course> {
        self.manageable(actor, id).await?;
        let mut tx = self.pool.begin().await?;
        match ab_db::catalog::lock_course_archive(&mut tx, id).await? {
            None => return Err(Error::not_found("course")),
            Some(Some(_)) => return Err(Error::conflict("course is already archived")),
            Some(None) => {}
        }
        ab_db::catalog::set_course_archived(&mut tx, id, Some(actor.user_id)).await?;
        let unscheduled = ab_db::assessments::draft_scheduled_in_course(&mut tx, id).await?;
        for assessment_id in &unscheduled {
            ab_db::assessments::insert_audit_event(
                &mut *tx,
                *assessment_id,
                Some(actor.user_id),
                "lifecycle-transition",
                serde_json::json!({
                    "from": "scheduled", "to": "draft", "scheduled_at": null,
                    "note": "course archived",
                }),
            )
            .await?;
        }
        tx.commit().await?;
        tracing::info!(course_id = %id, actor = %actor.user_id, action = "archive",
            unscheduled = unscheduled.len(), "course archived");
        ab_db::catalog::get_course(&self.pool, id)
            .await?
            .ok_or_else(|| Error::not_found("course"))
    }

    /// Restore (same gate as [`Self::archive`]): 409 `conflict` when not
    /// archived. No readiness check - the content did not change and
    /// `public` comes back as it was; assessments drafted by the archive
    /// stay drafts.
    pub async fn restore(&self, actor: &Actor, id: CourseId) -> Result<Course> {
        self.manageable(actor, id).await?;
        let mut tx = self.pool.begin().await?;
        match ab_db::catalog::lock_course_archive(&mut tx, id).await? {
            None => return Err(Error::not_found("course")),
            Some(None) => return Err(Error::conflict("course is not archived")),
            Some(Some(_)) => {}
        }
        ab_db::catalog::set_course_archived(&mut tx, id, None).await?;
        tx.commit().await?;
        tracing::info!(course_id = %id, actor = %actor.user_id, action = "restore",
            "course restored");
        ab_db::catalog::get_course(&self.pool, id)
            .await?
            .ok_or_else(|| Error::not_found("course"))
    }

    /// The archive dialog's numbers (roster-manager gate). Warnings only:
    /// an archive goes through whatever they are.
    pub async fn archive_preview(&self, actor: &Actor, id: CourseId) -> Result<ArchivePreview> {
        let course = self.manageable(actor, id).await?;
        let row = ab_db::catalog::course_archive_preview(&self.pool, id).await?;
        Ok(ArchivePreview {
            learners_enrolled: row.learners_enrolled,
            learners_in_progress: row.learners_in_progress,
            ungraded_submissions: row.ungraded_submissions,
            open_attempts: row.open_attempts,
            scheduled_assessments: row.scheduled_assessments,
            public: course.public,
        })
    }

    /// Announcements feed, newest first (read = course visibility).
    pub async fn list_updates(&self, actor: &Actor, id: CourseId) -> Result<Vec<CourseUpdate>> {
        self.get(actor, id).await?;
        ab_db::catalog::list_course_updates(&self.pool, id).await
    }

    pub async fn create_update(
        &self,
        actor: &Actor,
        id: CourseId,
        title: &str,
        content: &str,
    ) -> Result<CourseUpdate> {
        let course = self.get(actor, id).await?;
        Self::require_write(actor, &course)?;
        course.ensure_not_archived()?;
        let update_id =
            ab_db::catalog::insert_course_update(&self.pool, id, title, content).await?;
        ab_db::catalog::get_course_update(&self.pool, update_id)
            .await?
            .ok_or_else(|| Error::not_found("course update"))
    }

    /// Write access follows the parent course.
    async fn writable_update(&self, actor: &Actor, id: CourseUpdateId) -> Result<CourseUpdate> {
        let update = ab_db::catalog::get_course_update(&self.pool, id)
            .await?
            .ok_or_else(|| Error::not_found("course update"))?;
        let course = self.get(actor, update.course_id).await?;
        Self::require_write(actor, &course)?;
        course.ensure_not_archived()?;
        Ok(update)
    }

    pub async fn edit_update(
        &self,
        actor: &Actor,
        id: CourseUpdateId,
        title: Option<&str>,
        content: Option<&str>,
    ) -> Result<CourseUpdate> {
        self.writable_update(actor, id).await?;
        ab_db::catalog::update_course_update(&self.pool, id, title, content).await?;
        ab_db::catalog::get_course_update(&self.pool, id)
            .await?
            .ok_or_else(|| Error::not_found("course update"))
    }

    pub async fn delete_update(&self, actor: &Actor, id: CourseUpdateId) -> Result<()> {
        self.writable_update(actor, id).await?;
        ab_db::catalog::delete_course_update(&self.pool, id).await?;
        Ok(())
    }

    pub async fn delete(&self, actor: &Actor, id: CourseId) -> Result<()> {
        let course = self.get(actor, id).await?;
        if !Self::may_delete(actor, &course) {
            return Err(Error::forbidden("no delete access to this course"));
        }
        // BUG-209: the cascade drops the rows; the thumbnail and block
        // uploads are released inside the same statement.
        ab_db::catalog::delete_course(&self.pool, id, UNREFERENCED_GRACE.as_secs_f64()).await?;
        Ok(())
    }
}
