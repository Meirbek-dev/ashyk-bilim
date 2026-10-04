//! S-04 `If-Match`: the current `version` of one versioned row (bumped by
//! the `bump_version` trigger, migration `20261003000002`).

use ab_core::Result;
use ab_core::id::{
    AssessmentId, CertificationId, ChapterId, CourseId, CourseUpdateId, DiscussionId,
    FileSubmissionId, InterventionId, UserId, UsergroupId,
};
use sqlx::PgPool;

/// A row whose `version` an `If-Match` can guard.
#[derive(Debug, Clone, Copy)]
pub enum Versioned<'a> {
    Course(CourseId),
    Chapter(ChapterId),
    CourseUpdate(CourseUpdateId),
    Certification(CertificationId),
    Contributor(CourseId, UserId),
    Usergroup(UsergroupId),
    Role(&'a str),
    Platform,
    Assessment(AssessmentId),
    Intervention(InterventionId),
    Discussion(DiscussionId),
    FileSubmission(FileSubmissionId),
    GamificationConfig,
    /// A learner's override on an assessment.
    AssessmentOverride(AssessmentId, UserId),
}

/// `None` when the row does not exist.
pub async fn current_version(pool: &PgPool, of: Versioned<'_>) -> Result<Option<i32>> {
    let version = match of {
        Versioned::Course(id) => {
            sqlx::query_scalar!("SELECT version FROM courses WHERE id = $1", id.0)
                .fetch_optional(pool)
                .await?
        }
        Versioned::Chapter(id) => {
            sqlx::query_scalar!("SELECT version FROM chapters WHERE id = $1", id.0)
                .fetch_optional(pool)
                .await?
        }
        Versioned::CourseUpdate(id) => {
            sqlx::query_scalar!("SELECT version FROM course_updates WHERE id = $1", id.0)
                .fetch_optional(pool)
                .await?
        }
        Versioned::Certification(id) => {
            sqlx::query_scalar!("SELECT version FROM certifications WHERE id = $1", id.0)
                .fetch_optional(pool)
                .await?
        }
        Versioned::Contributor(course_id, user_id) => {
            sqlx::query_scalar!(
                "SELECT version FROM resource_authors WHERE course_id = $1 AND user_id = $2",
                course_id.0,
                user_id.0
            )
            .fetch_optional(pool)
            .await?
        }
        Versioned::Usergroup(id) => {
            sqlx::query_scalar!("SELECT version FROM usergroups WHERE id = $1", id.0)
                .fetch_optional(pool)
                .await?
        }
        Versioned::Role(slug) => {
            sqlx::query_scalar!("SELECT version FROM roles WHERE slug = $1", slug)
                .fetch_optional(pool)
                .await?
        }
        Versioned::Platform => {
            sqlx::query_scalar!("SELECT version FROM platforms WHERE singleton")
                .fetch_optional(pool)
                .await?
        }
        Versioned::Assessment(id) => {
            sqlx::query_scalar!("SELECT version FROM assessments WHERE id = $1", id.0)
                .fetch_optional(pool)
                .await?
        }
        Versioned::Intervention(id) => {
            sqlx::query_scalar!(
                "SELECT version FROM teacher_interventions WHERE id = $1",
                id.0
            )
            .fetch_optional(pool)
            .await?
        }
        Versioned::Discussion(id) => {
            sqlx::query_scalar!("SELECT version FROM course_discussions WHERE id = $1", id.0)
                .fetch_optional(pool)
                .await?
        }
        Versioned::FileSubmission(id) => {
            sqlx::query_scalar!("SELECT version FROM file_submissions WHERE id = $1", id.0)
                .fetch_optional(pool)
                .await?
        }
        Versioned::GamificationConfig => {
            sqlx::query_scalar!("SELECT version FROM gamification_config WHERE id = 1")
                .fetch_optional(pool)
                .await?
        }
        Versioned::AssessmentOverride(id, user_id) => sqlx::query_scalar!(
            "SELECT version FROM assessment_overrides WHERE assessment_id = $1 AND user_id = $2",
            id.0,
            user_id.0
        )
        .fetch_optional(pool)
        .await?,
    };
    Ok(version)
}
