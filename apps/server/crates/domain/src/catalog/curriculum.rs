//! Chapters + activities: the course curriculum. Ordering ports the legacy
//! semantics — 1-based contiguous positions per parent, moves clamp the
//! target position and renumber all siblings.

use ab_core::id::{ActivityId, ChapterId, CourseId};
use ab_core::{Error, FieldError, Result};
use sqlx::PgPool;

pub use ab_db::catalog::{ActivityRow as Activity, ChapterRow as Chapter};

use crate::catalog::courses::CoursesService;
use crate::identity::Actor;

/// The legacy `_VALID_SUBTYPES` map, mirrored by the DB CHECK constraint.
pub const TYPE_SUBTYPES: &[(&str, &[&str])] = &[
    ("dynamic", &["dynamic_page"]),
    ("video", &["video_youtube", "video_hosted"]),
    ("document", &["document_pdf", "document_doc"]),
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

#[derive(Clone)]
pub struct CurriculumService {
    pool: PgPool,
    courses: CoursesService,
}

impl CurriculumService {
    #[must_use]
    pub const fn new(pool: PgPool, courses: CoursesService) -> Self {
        Self { pool, courses }
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
        // Read access via the courses service (404 semantics included).
        self.courses.get(actor, course_id).await?;
        let chapters = ab_db::catalog::list_chapters(&self.pool, course_id).await?;
        let activities = ab_db::catalog::list_activities(&self.pool, course_id).await?;
        let mut out: Vec<CurriculumChapter> = chapters
            .into_iter()
            .map(|chapter| CurriculumChapter {
                chapter,
                activities: Vec::new(),
            })
            .collect();
        for activity in activities {
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
        self.writable_course(actor, chapter.course_id).await?;
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
        ab_db::catalog::update_chapter(&self.pool, chapter_id, name, description).await?;
        ab_db::catalog::get_chapter(&self.pool, chapter_id)
            .await?
            .ok_or_else(|| Error::not_found("chapter"))
    }

    pub async fn delete_chapter(&self, actor: &Actor, chapter_id: ChapterId) -> Result<()> {
        let chapter = self.writable_chapter(actor, chapter_id).await?;
        ab_db::catalog::delete_chapter(&self.pool, chapter_id).await?;
        // Close the gap left behind.
        let remaining: Vec<ChapterId> =
            ab_db::catalog::list_chapters(&self.pool, chapter.course_id)
                .await?
                .into_iter()
                .map(|c| c.id)
                .collect();
        ab_db::catalog::renumber_chapters(&self.pool, &remaining).await
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
        self.writable_course(actor, activity.course_id).await?;
        Ok(activity)
    }

    pub async fn update_activity(
        &self,
        actor: &Actor,
        activity_id: ActivityId,
        name: Option<&str>,
        published: Option<bool>,
    ) -> Result<Activity> {
        self.writable_activity(actor, activity_id).await?;
        ab_db::catalog::update_activity(&self.pool, activity_id, name, published).await?;
        ab_db::catalog::get_activity(&self.pool, activity_id)
            .await?
            .ok_or_else(|| Error::not_found("activity"))
    }

    pub async fn delete_activity(&self, actor: &Actor, activity_id: ActivityId) -> Result<()> {
        let activity = self.writable_activity(actor, activity_id).await?;
        ab_db::catalog::delete_activity(&self.pool, activity_id).await?;
        let remaining =
            ab_db::catalog::list_chapter_activity_ids(&self.pool, activity.chapter_id).await?;
        ab_db::catalog::renumber_activities(&self.pool, &remaining).await
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
                let chapter = ab_db::catalog::get_chapter(&self.pool, chapter_id)
                    .await?
                    .ok_or_else(|| Error::not_found("chapter"))?;
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
}
