//! Work-queue reads (legacy `services/work_queue.py`).
//!
//! A learner's open `activity_progress` rows, and the rows a teacher must
//! grade or release across the courses they created or actively co-author.
//! Everything is read from the canonical progress projection joined with
//! its activity, course and (for teachers) learner. Timestamps as epoch
//! seconds.

use ab_core::Result;
use ab_core::assessments::ActivityProgressState;
use ab_core::id::{ActivityId, ActivityProgressId, CourseId, UserId};
use sqlx::PgPool;

/// One open activity of the learner (published activities only).
#[derive(Debug, Clone)]
pub struct LearnerWorkRow {
    pub progress_id: ActivityProgressId,
    pub state: ActivityProgressState,
    pub course_id: CourseId,
    pub course_title: String,
    pub activity_id: ActivityId,
    pub activity_title: String,
    pub started_at: Option<i64>,
    pub submitted_at: Option<i64>,
    pub graded_at: Option<i64>,
    pub due_at: Option<i64>,
    pub updated_at: i64,
}

/// Legacy `_LEARNER_OPEN_STATES`: everything but `not_started`, `graded`
/// (teacher-only until release) and `completed`.
pub async fn list_learner_work(pool: &PgPool, user_id: UserId) -> Result<Vec<LearnerWorkRow>> {
    let rows = sqlx::query_as!(
        LearnerWorkRow,
        r#"SELECT p.id AS "progress_id: ActivityProgressId",
                  p.state AS "state: ActivityProgressState",
                  c.id AS "course_id: CourseId", c.name AS course_title,
                  a.id AS "activity_id: ActivityId", a.name AS activity_title,
                  (extract(epoch FROM p.started_at))::bigint AS "started_at?",
                  (extract(epoch FROM p.submitted_at))::bigint AS "submitted_at?",
                  (extract(epoch FROM p.graded_at))::bigint AS "graded_at?",
                  (extract(epoch FROM p.due_at))::bigint AS "due_at?",
                  (extract(epoch FROM p.updated_at))::bigint AS "updated_at!"
           FROM activity_progress p
           JOIN activities a ON a.id = p.activity_id
           JOIN courses c ON c.id = p.course_id
           WHERE p.user_id = $1
             AND a.published
             AND p.state IN ('in_progress', 'submitted', 'needs_grading', 'returned',
                             'passed', 'failed')"#,
        user_id.0
    )
    .fetch_all(pool)
    .await?;
    Ok(rows)
}

/// One learner's activity a teacher has to act on, with the learner and the
/// submission or file attempt the review page should open.
#[derive(Debug, Clone)]
pub struct TeacherWorkRow {
    pub progress_id: ActivityProgressId,
    pub course_id: CourseId,
    pub course_title: String,
    pub activity_id: ActivityId,
    pub activity_title: String,
    pub learner_display_name: String,
    pub learner_username: String,
    pub submitted_at: Option<i64>,
    pub graded_at: Option<i64>,
    pub due_at: Option<i64>,
    pub updated_at: i64,
    /// Submission id, else the newest matching file attempt id; `None` when
    /// neither exists (a release row without one is not shown).
    pub review_ref: Option<uuid::Uuid>,
}

/// Rows flagged `teacher_action_required` in the teacher's courses (creator,
/// or active `resource_authors` entry). The review target is the latest
/// submission, else the newest `submitted` file attempt.
pub async fn list_teacher_grading_work(
    pool: &PgPool,
    teacher_id: UserId,
) -> Result<Vec<TeacherWorkRow>> {
    let rows = sqlx::query_as!(
        TeacherWorkRow,
        r#"SELECT p.id AS "progress_id: ActivityProgressId",
                  c.id AS "course_id: CourseId", c.name AS course_title,
                  a.id AS "activity_id: ActivityId", a.name AS activity_title,
                  u.display_name AS learner_display_name, u.username AS learner_username,
                  (extract(epoch FROM p.submitted_at))::bigint AS "submitted_at?",
                  (extract(epoch FROM p.graded_at))::bigint AS "graded_at?",
                  (extract(epoch FROM p.due_at))::bigint AS "due_at?",
                  (extract(epoch FROM p.updated_at))::bigint AS "updated_at!",
                  COALESCE(
                      p.latest_submission_id,
                      (SELECT fa.id FROM file_submission_attempts fa
                       JOIN file_submissions f ON f.id = fa.file_submission_id
                       WHERE f.activity_id = p.activity_id AND fa.user_id = p.user_id
                         AND fa.status = 'submitted'
                       ORDER BY fa.updated_at DESC LIMIT 1)
                  ) AS "review_ref?"
           FROM activity_progress p
           JOIN activities a ON a.id = p.activity_id
           JOIN courses c ON c.id = p.course_id
           JOIN users u ON u.id = p.user_id
           WHERE p.teacher_action_required
             AND (c.creator_id = $1 OR EXISTS (
                     SELECT 1 FROM resource_authors ra
                     WHERE ra.course_id = c.id AND ra.user_id = $1 AND ra.status = 'active'))"#,
        teacher_id.0
    )
    .fetch_all(pool)
    .await?;
    Ok(rows)
}

/// Rows in state `graded` (saved, unreleased) in the teacher's courses. The
/// review target is the latest submission when it is `graded`, else the
/// newest `graded` file attempt.
pub async fn list_teacher_release_work(
    pool: &PgPool,
    teacher_id: UserId,
) -> Result<Vec<TeacherWorkRow>> {
    let rows = sqlx::query_as!(
        TeacherWorkRow,
        r#"SELECT p.id AS "progress_id: ActivityProgressId",
                  c.id AS "course_id: CourseId", c.name AS course_title,
                  a.id AS "activity_id: ActivityId", a.name AS activity_title,
                  u.display_name AS learner_display_name, u.username AS learner_username,
                  (extract(epoch FROM p.submitted_at))::bigint AS "submitted_at?",
                  (extract(epoch FROM p.graded_at))::bigint AS "graded_at?",
                  (extract(epoch FROM p.due_at))::bigint AS "due_at?",
                  (extract(epoch FROM p.updated_at))::bigint AS "updated_at!",
                  COALESCE(
                      (SELECT s.id FROM submissions s
                       WHERE s.id = p.latest_submission_id AND s.status = 'graded'),
                      (SELECT fa.id FROM file_submission_attempts fa
                       JOIN file_submissions f ON f.id = fa.file_submission_id
                       WHERE f.activity_id = p.activity_id AND fa.user_id = p.user_id
                         AND fa.status = 'graded'
                       ORDER BY fa.updated_at DESC LIMIT 1)
                  ) AS "review_ref?"
           FROM activity_progress p
           JOIN activities a ON a.id = p.activity_id
           JOIN courses c ON c.id = p.course_id
           JOIN users u ON u.id = p.user_id
           WHERE p.state = 'graded'
             AND (c.creator_id = $1 OR EXISTS (
                     SELECT 1 FROM resource_authors ra
                     WHERE ra.course_id = c.id AND ra.user_id = $1 AND ra.status = 'active'))"#,
        teacher_id.0
    )
    .fetch_all(pool)
    .await?;
    Ok(rows)
}
