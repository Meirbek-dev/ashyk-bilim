//! `POST /courses/{id}/duplicate`: a private draft copy of a course's
//! content for its authors.
//!
//! Copied: the course fields (name from the request, private, not
//! archived), chapters, activities (unpublished) with their blocks and
//! file-submission configs (draft), assessments through
//! [`AssessmentsService::copy_assessment`] (policy and items; drafts).
//! Not copied: learners, progress, submissions, grades, discussions,
//! announcements, contributors, group links, certification, access lists
//! and overrides.
//!
//! Uploaded media is shared, not duplicated: the copy points at the same
//! storage keys and adds one reference per use to each counted upload (the
//! course thumbnail, claimed blocks), so an object stays while either course
//! shows it and is reaped after both let go.

use ab_core::id::{ChapterId, CourseId};
use ab_core::{Error, Result};
use uuid::Uuid;

use crate::assessments::service::AssessmentsService;
use crate::catalog::CoursesService;
use crate::catalog::courses::Course;
use crate::identity::Actor;

impl AssessmentsService {
    /// Course create right plus write access to the source (404 when
    /// invisible); an archived source copies too.
    pub async fn duplicate_course(
        &self,
        actor: &Actor,
        source_id: CourseId,
        name: Option<&str>,
    ) -> Result<Course> {
        CoursesService::require_create(actor)?;
        let source = self.courses.get(actor, source_id).await?;
        CoursesService::require_write(actor, &source)?;
        let name = match name {
            Some(name) => ab_core::required_str("name", name)?.to_owned(),
            None => format!("{} (copy)", source.name),
        };
        let mut tx = self.pool.begin().await?;
        let course =
            ab_db::course_copy::copy_course(&mut tx, source_id, &name, actor.user_id).await?;
        let (chapters, activities) = ab_db::course_copy::source_outline(&mut tx, source_id).await?;
        let new_chapters: Vec<Uuid> = chapters.iter().map(|_| Uuid::now_v7()).collect();
        ab_db::course_copy::copy_chapters(
            &mut tx,
            course,
            actor.user_id,
            (&chapters, &new_chapters),
        )
        .await?;
        let chapter_of = |old: Uuid| {
            chapters
                .iter()
                .position(|c| *c == old)
                .map(|i| new_chapters[i])
                .ok_or_else(|| Error::not_found("chapter"))
        };
        let assessments =
            ab_db::assessments::list_assessments_for_course(&self.pool, source_id).await?;
        let (mut old, mut new, mut into) = (Vec::new(), Vec::new(), Vec::new());
        let mut assessed = Vec::new();
        for activity in &activities {
            if let Some(assessment) = assessments.iter().find(|a| a.activity_id.0 == activity.id) {
                assessed.push((assessment, activity));
            } else {
                old.push(activity.id);
                new.push(Uuid::now_v7());
                into.push(chapter_of(activity.chapter_id)?);
            }
        }
        ab_db::course_copy::copy_activities(&mut tx, course, actor.user_id, (&old, &new, &into))
            .await?;
        for (assessment, activity) in assessed {
            let chapter = ChapterId(chapter_of(activity.chapter_id)?);
            let (_, copied) = Self::copy_assessment(
                &mut tx,
                assessment,
                (course, chapter),
                &assessment.title,
                actor.user_id,
            )
            .await?;
            // Appended by the copy; back to the source's place.
            ab_db::course_copy::set_activity_position(&mut tx, copied.0, activity.position).await?;
        }
        ab_db::course_copy::reference_shared_media(&mut tx, course).await?;
        tx.commit().await?;
        ab_db::catalog::get_course(&self.pool, course)
            .await?
            .ok_or_else(|| Error::not_found("course"))
    }
}
