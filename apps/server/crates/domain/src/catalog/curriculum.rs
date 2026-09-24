//! Chapters + activities: the course curriculum. Ordering ports the legacy
//! semantics — 1-based contiguous positions per parent, moves clamp the
//! target position and renumber all siblings.

use ab_core::assessments::{FileSubmissionLifecycle, Lifecycle};
use ab_core::id::{ActivityId, BlockId, ChapterId, CourseId};
use ab_core::{Error, ErrorCode, FieldError, Result};
use sqlx::PgPool;
use uuid::Uuid;

pub use ab_db::catalog::{
    ActivityContentRow as ActivityContent, ActivityRow as Activity, BlockRow as Block,
    ChapterRow as Chapter,
};

use crate::catalog::courses::{Course, CoursesService};
use crate::files::uploads::UNREFERENCED_GRACE;
use crate::identity::Actor;
use crate::progress::ProgressProjector;

/// The legacy `_VALID_SUBTYPES` map, mirrored by the DB CHECK constraint.
pub const TYPE_SUBTYPES: &[(&str, &[&str])] = &[
    ("dynamic", &["dynamic_page"]),
    ("video", &["video_youtube", "video_hosted"]),
    ("document", &["document_pdf", "document_doc"]),
    ("quiz", &["quiz_standard"]),
    ("exam", &["exam_standard"]),
    ("code_challenge", &["code_general", "code_competitive"]),
    ("file_submission", &["file_submission_standard"]),
    ("custom", &["custom"]),
];

fn valid_pair(activity_type: &str, sub_type: &str) -> bool {
    TYPE_SUBTYPES
        .iter()
        .any(|(t, subs)| *t == activity_type && subs.contains(&sub_type))
}

/// Clamp a 1-based position into `[0, len]` as a vec index.
fn clamp_position(position: i32, len: usize) -> usize {
    usize::try_from(position.saturating_sub(1).max(0))
        .unwrap_or(0)
        .min(len)
}

/// A chapter with its ordered activities (curriculum view).
#[derive(Debug)]
pub struct CurriculumChapter {
    pub chapter: Chapter,
    pub activities: Vec<Activity>,
}

/// Partial activity update. `type_pair` changes type+subtype together —
/// changing one alone can't be validated against the closed set.
#[derive(Debug, Default)]
pub struct ActivityChanges<'a> {
    pub name: Option<&'a str>,
    pub published: Option<bool>,
    pub type_pair: Option<(&'a str, &'a str)>,
    pub content: Option<&'a serde_json::Value>,
    pub details: Option<&'a serde_json::Value>,
    pub settings: Option<&'a serde_json::Value>,
    /// `If-Match` version of the row the editor loaded; a mismatch is 412.
    pub expected_version: Option<i32>,
}

/// An activity with its heavy jsonb columns (single-activity view).
pub struct ActivityDetail {
    pub activity: Activity,
    pub content: ActivityContent,
}

/// Block create request: file-backed types claim a finalized upload; the
/// legacy `custom` type only exists for ETL'd rows and cannot be created.
fn purpose_for_block(block_type: &str) -> Option<&'static str> {
    match block_type {
        "image" => Some("block-image"),
        "pdf" => Some("block-pdf"),
        "video" => Some("block-video"),
        _ => None,
    }
}

#[derive(Clone)]
pub struct CurriculumService {
    pool: PgPool,
    courses: CoursesService,
    projector: ProgressProjector,
}

impl CurriculumService {
    #[must_use]
    pub fn new(pool: PgPool, courses: CoursesService) -> Self {
        Self {
            projector: ProgressProjector::new(pool.clone()),
            pool,
            courses,
        }
    }

    /// Whether the actor may see draft (unpublished) activities: the
    /// authoring gate (creator / active contributor / platform updater).
    fn is_editor(actor: &Actor, course: &Course) -> bool {
        CoursesService::require_write(actor, course).is_ok()
    }

    /// UX-147: an activity of an invisible course reads exactly like an
    /// unknown one (BUG-209 did the same for chapters).
    fn as_activity_404(err: Error) -> Error {
        match err.code() {
            ab_core::ErrorCode::NotFound => Error::not_found("activity"),
            _ => err,
        }
    }

    /// An activity the actor may read: the course must be visible and,
    /// unless the actor edits the course, the activity published — drafts
    /// do not exist for learners (404, no leak).
    async fn readable_activity(&self, actor: &Actor, activity_id: ActivityId) -> Result<Activity> {
        let activity = ab_db::catalog::get_activity(&self.pool, activity_id)
            .await?
            .ok_or_else(|| Error::not_found("activity"))?;
        let course = self
            .courses
            .get(actor, activity.course_id)
            .await
            .map_err(Self::as_activity_404)?;
        if !activity.published && !Self::is_editor(actor, &course) {
            return Err(Error::not_found("activity"));
        }
        Ok(activity)
    }

    /// Load the course and require write access (shared authoring gate):
    /// 404 for invisible courses, 403 for visible-but-not-writable.
    async fn writable_course(&self, actor: &Actor, course_id: CourseId) -> Result<()> {
        let course = self.courses.get(actor, course_id).await?;
        CoursesService::require_write(actor, &course)
    }

    pub async fn curriculum(
        &self,
        actor: &Actor,
        course_id: CourseId,
    ) -> Result<Vec<CurriculumChapter>> {
        // Read access via the courses service (404 semantics included);
        // drafts are listed for editors only.
        let course = self.courses.get(actor, course_id).await?;
        let editor = Self::is_editor(actor, &course);
        let chapters = ab_db::catalog::list_chapters(&self.pool, course_id).await?;
        let activities = ab_db::catalog::list_activities(&self.pool, course_id).await?;
        let mut out: Vec<CurriculumChapter> = chapters
            .into_iter()
            .map(|chapter| CurriculumChapter {
                chapter,
                activities: Vec::new(),
            })
            .collect();
        for activity in activities.into_iter().filter(|a| editor || a.published) {
            if let Some(entry) = out.iter_mut().find(|c| c.chapter.id == activity.chapter_id) {
                entry.activities.push(activity);
            }
        }
        Ok(out)
    }

    pub async fn add_chapter(
        &self,
        actor: &Actor,
        course_id: CourseId,
        name: &str,
        description: &str,
    ) -> Result<Chapter> {
        self.writable_course(actor, course_id).await?;
        // BUG-168: names are trimmed and never blank (shared rule, UX-106).
        let name = ab_core::required_str("name", name)?;
        let id =
            ab_db::catalog::insert_chapter(&self.pool, course_id, name, description, actor.user_id)
                .await?;
        ab_db::catalog::get_chapter(&self.pool, id)
            .await?
            .ok_or_else(|| Error::not_found("chapter"))
    }

    async fn writable_chapter(&self, actor: &Actor, chapter_id: ChapterId) -> Result<Chapter> {
        let chapter = ab_db::catalog::get_chapter(&self.pool, chapter_id)
            .await?
            .ok_or_else(|| Error::not_found("chapter"))?;
        // BUG-209: an invisible course's chapter reads exactly like an
        // unknown one — the detail must not leak that the chapter exists.
        self.writable_course(actor, chapter.course_id)
            .await
            .map_err(|err| match err.code() {
                ab_core::ErrorCode::NotFound => Error::not_found("chapter"),
                _ => err,
            })?;
        Ok(chapter)
    }

    pub async fn update_chapter(
        &self,
        actor: &Actor,
        chapter_id: ChapterId,
        name: Option<&str>,
        description: Option<&str>,
    ) -> Result<Chapter> {
        self.writable_chapter(actor, chapter_id).await?;
        let name = name.map(|n| ab_core::required_str("name", n)).transpose()?;
        ab_db::catalog::update_chapter(&self.pool, chapter_id, name, description).await?;
        ab_db::catalog::get_chapter(&self.pool, chapter_id)
            .await?
            .ok_or_else(|| Error::not_found("chapter"))
    }

    pub async fn delete_chapter(&self, actor: &Actor, chapter_id: ChapterId) -> Result<()> {
        let chapter = self.writable_chapter(actor, chapter_id).await?;
        // BUG-209: block uploads under it are released with the cascade.
        ab_db::catalog::delete_chapter(&self.pool, chapter_id, UNREFERENCED_GRACE.as_secs_f64())
            .await?;
        // Close the gap left behind.
        let remaining: Vec<ChapterId> =
            ab_db::catalog::list_chapters(&self.pool, chapter.course_id)
                .await?
                .into_iter()
                .map(|c| c.id)
                .collect();
        ab_db::catalog::renumber_chapters(&self.pool, &remaining).await?;
        // Its activities' progress rows cascaded away; refresh the totals.
        self.projector
            .recalculate_course_for_all(chapter.course_id)
            .await
    }

    /// Move a chapter to a 1-based position (clamped), renumbering siblings.
    pub async fn move_chapter(
        &self,
        actor: &Actor,
        chapter_id: ChapterId,
        position: i32,
    ) -> Result<()> {
        let chapter = self.writable_chapter(actor, chapter_id).await?;
        let mut ids: Vec<ChapterId> = ab_db::catalog::list_chapters(&self.pool, chapter.course_id)
            .await?
            .into_iter()
            .map(|c| c.id)
            .collect();
        ids.retain(|id| *id != chapter_id);
        let target = clamp_position(position, ids.len());
        ids.insert(target, chapter_id);
        ab_db::catalog::renumber_chapters(&self.pool, &ids).await
    }

    pub async fn add_activity(
        &self,
        actor: &Actor,
        chapter_id: ChapterId,
        name: &str,
        activity_type: &str,
        activity_sub_type: &str,
    ) -> Result<Activity> {
        if !valid_pair(activity_type, activity_sub_type) {
            return Err(Error::validation(vec![FieldError {
                field: "activity_sub_type".into(),
                code: "invalid".into(),
                message: format!("'{activity_sub_type}' is not valid for '{activity_type}'"),
            }]));
        }
        let name = ab_core::required_str("name", name)?;
        let chapter = self.writable_chapter(actor, chapter_id).await?;
        let id = ab_db::catalog::insert_activity(
            &self.pool,
            chapter_id,
            chapter.course_id,
            name,
            activity_type,
            activity_sub_type,
            actor.user_id,
        )
        .await?;
        ab_db::catalog::get_activity(&self.pool, id)
            .await?
            .ok_or_else(|| Error::not_found("activity"))
    }

    async fn writable_activity(&self, actor: &Actor, activity_id: ActivityId) -> Result<Activity> {
        let activity = ab_db::catalog::get_activity(&self.pool, activity_id)
            .await?
            .ok_or_else(|| Error::not_found("activity"))?;
        self.writable_course(actor, activity.course_id)
            .await
            .map_err(Self::as_activity_404)?;
        Ok(activity)
    }

    /// Full activity view including content/details/settings.
    pub async fn activity_detail(
        &self,
        actor: &Actor,
        activity_id: ActivityId,
    ) -> Result<ActivityDetail> {
        let activity = self.readable_activity(actor, activity_id).await?;
        let content = ab_db::catalog::get_activity_content(&self.pool, activity_id)
            .await?
            .ok_or_else(|| Error::not_found("activity"))?;
        Ok(ActivityDetail { activity, content })
    }

    /// An activity goes live only behind a published backing object: a
    /// file-submission config (`POST /file-submissions/{id}/publish` flips
    /// both) or, for quiz/exam/code, a `published` assessment (its lifecycle
    /// transition flips the activity). The raw toggle refuses otherwise so
    /// learners never see an activity that answers 404 when opened.
    ///
    /// BUG-232: the lifecycle is read under the backing row's lock, inside
    /// the toggle's transaction — a transition in flight commits its flag
    /// first or sees this one.
    async fn require_publishable(
        tx: &mut sqlx::PgConnection,
        activity_id: ActivityId,
        activity_type: &str,
    ) -> Result<()> {
        let reason = match activity_type {
            "file_submission" => {
                let published =
                    ab_db::file_submissions::lock_file_submission_by_activity(tx, activity_id)
                        .await?
                        .is_some_and(|c| c.lifecycle == FileSubmissionLifecycle::Published);
                (!published).then_some("file-submission-unpublished")
            }
            "quiz" | "exam" | "code_challenge" => {
                match ab_db::assessments::lock_assessment_by_activity(tx, activity_id).await? {
                    None if activity_type == "code_challenge" => {
                        Some("code-challenge-unconfigured")
                    }
                    Some(a) if a.lifecycle == Lifecycle::Published => None,
                    _ => Some("assessment-not-ready"),
                }
            }
            _ => None,
        };
        match reason {
            None => Ok(()),
            Some(reason) => Err(Error::app_with_details(
                ErrorCode::ActivityNotReady,
                "publish the activity's assessment or config before the activity",
                serde_json::json!({ "reason": reason }),
            )),
        }
    }

    /// An assessment or file-submission config attached to this activity,
    /// whatever its lifecycle (BUG-201): a draft or archived assessment can
    /// still be published later, and its transition flips the activity
    /// `published` — so a `dynamic` row would go live with a quiz behind it.
    async fn has_attached_content(
        &self,
        activity_id: ActivityId,
        activity_type: &str,
    ) -> Result<bool> {
        Ok(match activity_type {
            "quiz" | "exam" | "code_challenge" => {
                ab_db::assessments::get_assessment_by_activity(&self.pool, activity_id)
                    .await?
                    .is_some()
            }
            "file_submission" => {
                ab_db::file_submissions::get_file_submission_by_activity(&self.pool, activity_id)
                    .await?
                    .is_some()
            }
            _ => false,
        })
    }

    pub async fn update_activity(
        &self,
        actor: &Actor,
        activity_id: ActivityId,
        changes: ActivityChanges<'_>,
    ) -> Result<ActivityDetail> {
        let activity = self.writable_activity(actor, activity_id).await?;
        if let Some(expected) = changes.expected_version
            && expected != activity.version
        {
            return Err(Error::app_with_details(
                ErrorCode::PreconditionFailed,
                "activity changed since you loaded it",
                serde_json::json!({ "expected": expected, "actual": activity.version }),
            ));
        }
        if let Some((activity_type, sub_type)) = changes.type_pair
            && !valid_pair(activity_type, sub_type)
        {
            return Err(Error::validation(vec![FieldError {
                field: "activity_sub_type".into(),
                code: "invalid".into(),
                message: format!("'{sub_type}' is not valid for '{activity_type}'"),
            }]));
        }
        let name = changes
            .name
            .map(|n| ab_core::required_str("name", n))
            .transpose()?;
        // The publish gate reads the MERGED row: the type this PATCH sets
        // (or keeps) and the published flag it asks for. It runs whenever
        // the merged row is published and either the flag flips or the type
        // changes — a live activity cannot become a quiz with no assessment.
        let merged_type = changes
            .type_pair
            .map_or(activity.activity_type.as_str(), |(t, _)| t);
        let merged_published = changes.published.unwrap_or(activity.published);
        let type_changes = merged_type != activity.activity_type;
        let mut tx = self.pool.begin().await?;
        if merged_published && (type_changes || !activity.published) {
            Self::require_publishable(&mut tx, activity_id, merged_type).await?;
        }
        // UX-104/UX-112/BUG-201: an assessment or file-submission config
        // stays attached to its activity in every lifecycle; the type cannot
        // move away from it while the row exists.
        if type_changes
            && self
                .has_attached_content(activity_id, &activity.activity_type)
                .await?
        {
            return Err(Error::conflict(
                "the activity has an assessment attached; delete it before changing the type",
            ));
        }
        // UX-112/UX-120: one name — the assessment title follows the activity
        // name under the assessment lock (scheduled / archived /
        // published-with-submissions → 409). BUG-186: every refusal above runs
        // before the first write, and the writes share one transaction.
        // BUG-262: the lifecycle is read under the assessment row lock
        // (assessment → activity, the order the assessments title PATCH
        // takes), so a schedule cannot commit between the gate and the write.
        let assessment = match name {
            Some(_) => {
                ab_db::assessments::lock_assessment_by_activity(&mut tx, activity_id).await?
            }
            None => None,
        };
        if let Some(assessment) = &assessment {
            crate::assessments::service::ensure_editable(&self.pool, assessment).await?;
        }

        if let Some((activity_type, sub_type)) = changes.type_pair {
            ab_db::catalog::set_activity_type(&mut *tx, activity_id, activity_type, sub_type)
                .await?;
        }
        if let (Some(assessment), Some(name)) = (&assessment, name) {
            ab_db::assessments::update_assessment_details(
                &mut *tx,
                assessment.id,
                Some(name),
                None,
                None,
                None,
            )
            .await?;
        }
        let published = changes.published.filter(|p| *p != activity.published);
        ab_db::catalog::update_activity(&mut *tx, activity_id, name, published).await?;
        if changes.content.is_some() || changes.details.is_some() || changes.settings.is_some() {
            let updated = ab_db::catalog::update_activity_content(
                &mut *tx,
                activity_id,
                changes.content,
                changes.details,
                changes.settings,
                changes.expected_version,
            )
            .await?;
            if !updated {
                // Lost the race between the check above and the write; the
                // dropped transaction rolls the other writes back.
                return Err(Error::app_with_details(
                    ErrorCode::PreconditionFailed,
                    "activity changed since you loaded it",
                    serde_json::json!({ "expected": changes.expected_version }),
                ));
            }
        }
        tx.commit().await?;
        if published.is_some() {
            self.projector
                .recalculate_course_for_all(activity.course_id)
                .await?;
        }
        self.activity_detail(actor, activity_id).await
    }

    pub async fn delete_activity(&self, actor: &Actor, activity_id: ActivityId) -> Result<()> {
        let activity = self.writable_activity(actor, activity_id).await?;
        // BUG-209: block uploads under it are released with the cascade.
        ab_db::catalog::delete_activity(&self.pool, activity_id, UNREFERENCED_GRACE.as_secs_f64())
            .await?;
        let remaining =
            ab_db::catalog::list_chapter_activity_ids(&self.pool, activity.chapter_id).await?;
        ab_db::catalog::renumber_activities(&self.pool, &remaining).await?;
        // Its progress rows cascaded away; refresh the learner totals.
        self.projector
            .recalculate_course_for_all(activity.course_id)
            .await
    }

    /// Move within its chapter, or into another chapter of the SAME course.
    pub async fn move_activity(
        &self,
        actor: &Actor,
        activity_id: ActivityId,
        position: i32,
        target_chapter: Option<ChapterId>,
    ) -> Result<()> {
        let activity = self.writable_activity(actor, activity_id).await?;
        let destination = match target_chapter {
            None => activity.chapter_id,
            Some(chapter_id) => {
                // BUG-208: 404 for a chapter the actor cannot see — the
                // same-course 422 must not be an existence oracle.
                let chapter = self.writable_chapter(actor, chapter_id).await?;
                if chapter.course_id != activity.course_id {
                    return Err(Error::validation(vec![FieldError {
                        field: "chapter_id".into(),
                        code: "invalid".into(),
                        message: "activities can only move within their course".into(),
                    }]));
                }
                chapter_id
            }
        };

        if destination != activity.chapter_id {
            ab_db::catalog::set_activity_chapter(&self.pool, activity_id, destination).await?;
            // Close the gap in the source chapter.
            let source =
                ab_db::catalog::list_chapter_activity_ids(&self.pool, activity.chapter_id).await?;
            ab_db::catalog::renumber_activities(&self.pool, &source).await?;
        }
        let mut ids = ab_db::catalog::list_chapter_activity_ids(&self.pool, destination).await?;
        ids.retain(|id| *id != activity_id);
        let target = clamp_position(position, ids.len());
        ids.insert(target, activity_id);
        ab_db::catalog::renumber_activities(&self.pool, &ids).await
    }

    /// Attach a file block: claims a finalized upload the actor owns whose
    /// purpose matches the block type, and freezes its metadata as content.
    pub async fn add_block(
        &self,
        actor: &Actor,
        activity_id: ActivityId,
        block_type: &str,
        upload_id: Uuid,
        file_name: Option<&str>,
    ) -> Result<Block> {
        let Some(required_purpose) = purpose_for_block(block_type) else {
            return Err(Error::validation(vec![FieldError {
                field: "block_type".into(),
                code: "invalid".into(),
                message: format!("'{block_type}' is not a creatable block type"),
            }]));
        };
        self.writable_activity(actor, activity_id).await?;

        let upload = ab_db::uploads::get_upload(&self.pool, upload_id)
            .await?
            .ok_or_else(|| Error::not_found("upload"))?;
        if upload.created_by != actor.user_id {
            return Err(Error::forbidden("not your upload"));
        }
        if upload.purpose != required_purpose {
            return Err(Error::validation(vec![FieldError {
                field: "upload_id".into(),
                code: "wrong-purpose".into(),
                message: format!(
                    "a {block_type} block needs a '{required_purpose}' upload, \
                     got '{}'",
                    upload.purpose
                ),
            }]));
        }
        // BUG-234: the claim and the row that holds it commit together.
        // BUG-242/243: the activity row is locked before the upload row (the
        // order every delete takes), so a concurrent activity/chapter/course
        // DELETE either sees this block or makes this a 404 — never a
        // deadlock, never a leaked reference.
        let mut tx = self.pool.begin().await?;
        if !ab_db::catalog::lock_activity_for_blocks(&mut tx, activity_id).await? {
            return Err(Error::not_found("activity"));
        }
        if !ab_db::uploads::add_reference(&mut *tx, upload_id).await? {
            return Err(Error::conflict("upload is not finalized"));
        }

        let content = serde_json::json!({
            "upload_id": upload.id,
            "file_key": upload.key,
            "file_name": file_name.unwrap_or(""),
            "file_size": upload.size_bytes,
            "file_type": upload.mime,
        });
        let id = ab_db::catalog::insert_block(&mut *tx, activity_id, block_type, &content).await?;
        tx.commit().await?;
        ab_db::catalog::get_block(&self.pool, id)
            .await?
            .ok_or_else(|| Error::not_found("block"))
    }

    pub async fn list_blocks(&self, actor: &Actor, activity_id: ActivityId) -> Result<Vec<Block>> {
        self.readable_activity(actor, activity_id).await?;
        ab_db::catalog::list_blocks(&self.pool, activity_id).await
    }

    pub async fn get_block(&self, actor: &Actor, block_id: BlockId) -> Result<Block> {
        let block = ab_db::catalog::get_block(&self.pool, block_id)
            .await?
            .ok_or_else(|| Error::not_found("block"))?;
        self.readable_activity(actor, block.activity_id)
            .await
            .map_err(|_| Error::not_found("block"))?;
        Ok(block)
    }

    /// Delete a block and release its upload reference (the reaper collects
    /// the object once nothing references it).
    ///
    /// BUG-244: one tx, activity locked first (BUG-243 order), and the
    /// release counts only a block row this DELETE removed — a concurrent
    /// second DELETE or activity DELETE releases nothing twice.
    pub async fn delete_block(&self, actor: &Actor, block_id: BlockId) -> Result<()> {
        let block = ab_db::catalog::get_block(&self.pool, block_id)
            .await?
            .ok_or_else(|| Error::not_found("block"))?;
        self.writable_activity(actor, block.activity_id).await?;
        let mut tx = self.pool.begin().await?;
        if ab_db::catalog::lock_activity_for_blocks(&mut tx, block.activity_id).await? {
            ab_db::catalog::delete_blocks_releasing(
                &mut tx,
                &[block.activity_id.0],
                Some(block_id),
                UNREFERENCED_GRACE.as_secs_f64(),
            )
            .await?;
        }
        tx.commit().await?;
        Ok(())
    }
}
