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
///
/// Member courses only (run ∧
/// ¬staff, as `has_trail_run`): a leaver's or a staffer's kept rows are not
/// their work (BUG-299). Archived courses are frozen - nothing is due there.
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
                             'passed', 'failed')
             AND c.archived_at IS NULL
             AND EXISTS (SELECT 1 FROM trail_runs r
                         WHERE r.course_id = p.course_id AND r.user_id = p.user_id
                           AND NOT is_course_staff(r.course_id, r.user_id))"#,
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

/// Rows flagged `teacher_action_required` in the courses the teacher may grade.
///
/// Never the teacher's own attempts, never a staff preview as the review
/// target (BUG-301 - a grader never grades their own, BUG-286).
///
/// BUG-309: a non-member's row (leaver, or now staff) is never re-projected
/// (grader writes on it record the grade only, BUG-260/270), so for them
/// the flag is read from the attempts: the latest submission `pending`, or a
/// `submitted` file attempt. Their pending work stays gradable (pass 23).
///
/// Grading courses: creator, or an active non-reporter `resource_authors`
/// entry (the authorship rule of `Course::is_author`), never archived ones
/// (grading is frozen with the course). The review target is
/// the latest submission, else the newest `submitted` file attempt.
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
                         AND fa.status = 'submitted' AND NOT fa.preview
                       ORDER BY fa.updated_at DESC LIMIT 1)
                  ) AS "review_ref?"
           FROM activity_progress p
           JOIN activities a ON a.id = p.activity_id
           JOIN courses c ON c.id = p.course_id
           JOIN users u ON u.id = p.user_id
           WHERE p.user_id <> $1
             AND CASE WHEN EXISTS (SELECT 1 FROM trail_runs r
                                   WHERE r.course_id = p.course_id AND r.user_id = p.user_id
                                     AND NOT is_course_staff(r.course_id, r.user_id))
                 THEN p.teacher_action_required
                 ELSE EXISTS (SELECT 1 FROM submissions s
                              WHERE s.id = p.latest_submission_id AND s.status = 'pending')
                   OR EXISTS (SELECT 1 FROM file_submission_attempts fa
                              JOIN file_submissions f ON f.id = fa.file_submission_id
                              WHERE f.activity_id = p.activity_id AND fa.user_id = p.user_id
                                AND fa.status = 'submitted' AND NOT fa.preview)
             END
             AND c.archived_at IS NULL
             AND (c.creator_id = $1 OR EXISTS (
                     SELECT 1 FROM resource_authors ra
                     WHERE ra.course_id = c.id AND ra.user_id = $1 AND ra.status = 'active'
                       AND ra.authorship <> 'reporter'))"#,
        teacher_id.0
    )
    .fetch_all(pool)
    .await?;
    Ok(rows)
}

/// Rows in state `graded` (saved, unreleased) in the teacher's courses.
///
/// The review target is the latest submission when it is `graded`, else the
/// newest `graded` file attempt. Same exclusions as the grading work (BUG-301).
/// A non-member's frozen row (BUG-309) qualifies by that target alone: the
/// service drops a release row without one.
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
                         AND fa.status = 'graded' AND NOT fa.preview
                       ORDER BY fa.updated_at DESC LIMIT 1)
                  ) AS "review_ref?"
           FROM activity_progress p
           JOIN activities a ON a.id = p.activity_id
           JOIN courses c ON c.id = p.course_id
           JOIN users u ON u.id = p.user_id
           WHERE p.user_id <> $1
             AND (p.state = 'graded' OR NOT EXISTS (
                     SELECT 1 FROM trail_runs r
                     WHERE r.course_id = p.course_id AND r.user_id = p.user_id
                       AND NOT is_course_staff(r.course_id, r.user_id)))
             AND c.archived_at IS NULL
             AND (c.creator_id = $1 OR EXISTS (
                     SELECT 1 FROM resource_authors ra
                     WHERE ra.course_id = c.id AND ra.user_id = $1 AND ra.status = 'active'
                       AND ra.authorship <> 'reporter'))"#,
        teacher_id.0
    )
    .fetch_all(pool)
    .await?;
    Ok(rows)
}

// ── Learner agenda + deadline reminders (S-09, S-07) ───────────────────────

/// A dated, gradable activity of a member: an assessment (with the
/// learner's override applied, BUG-300 semantics) or a file submission.
#[derive(Debug, Clone)]
pub struct DeadlineRow {
    pub user_id: UserId,
    pub course_id: CourseId,
    pub course_name: String,
    pub activity_id: ActivityId,
    pub activity_name: String,
    pub activity_type: String,
    pub assessment_id: Option<ab_core::id::AssessmentId>,
    pub file_submission_id: Option<ab_core::id::FileSubmissionId>,
    pub due_at: i64,
    pub cutoff_at: Option<i64>,
    pub state: ActivityProgressState,
}

/// Every member's (or one member's) gradable work due in `(from, until]`.
///
/// Soonest first. Membership as the work queue
/// (run ∧ ¬staff, course not archived); assessments must be published and
/// reach the learner (course-wide or on an allowlist, direct or via a
/// group); the override's due date applies while in force or when it is an
/// extension; a file submission's per-learner due date always applies (S-GAPS).
pub async fn upcoming_deadlines(
    pool: &PgPool,
    user_id: Option<UserId>,
    from: i64,
    until: i64,
) -> Result<Vec<DeadlineRow>> {
    let rows = sqlx::query_as!(
        DeadlineRow,
        r#"WITH members AS (
               SELECT DISTINCT r.user_id, r.course_id FROM trail_runs r
               JOIN courses c ON c.id = r.course_id
               WHERE c.archived_at IS NULL
                 AND ($1::uuid IS NULL OR r.user_id = $1)
                 AND NOT is_course_staff(r.course_id, r.user_id)
           ),
           work AS (
               SELECT m.user_id, m.course_id, s.activity_id, s.id AS assessment_id,
                      NULL::uuid AS file_submission_id,
                      COALESCE(CASE WHEN o.expires_at IS NULL OR o.expires_at > now()
                                         OR o.due_extended
                                    THEN o.due_at_override END,
                               s.due_at) AS due_at,
                      s.late_cutoff_at AS cutoff_at
               FROM members m
               JOIN assessments s ON s.course_id = m.course_id AND s.lifecycle = 'published'
               LEFT JOIN assessment_overrides o
                      ON o.assessment_id = s.id AND o.user_id = m.user_id
               WHERE s.access_mode = 'all_course_learners'
                  OR EXISTS (SELECT 1 FROM assessment_access_users u
                             WHERE u.assessment_id = s.id AND u.user_id = m.user_id)
                  OR EXISTS (SELECT 1 FROM assessment_access_usergroups g
                             JOIN usergroup_members gm ON gm.usergroup_id = g.usergroup_id
                             WHERE g.assessment_id = s.id AND gm.user_id = m.user_id)
               UNION ALL
               SELECT m.user_id, m.course_id, f.activity_id, NULL, f.id,
                      COALESCE(fo.due_at, f.due_at), f.late_cutoff_at
               FROM members m
               JOIN file_submissions f ON f.course_id = m.course_id AND f.lifecycle = 'published'
               LEFT JOIN file_submission_overrides fo
                      ON fo.file_submission_id = f.id AND fo.user_id = m.user_id
           )
           SELECT w.user_id AS "user_id!: UserId", w.course_id AS "course_id!: CourseId",
                  c.name AS course_name, w.activity_id AS "activity_id!: ActivityId",
                  a.name AS activity_name, a.activity_type,
                  w.assessment_id AS "assessment_id: ab_core::id::AssessmentId",
                  w.file_submission_id AS "file_submission_id: ab_core::id::FileSubmissionId",
                  (extract(epoch FROM w.due_at))::bigint AS "due_at!",
                  (extract(epoch FROM w.cutoff_at))::bigint AS "cutoff_at?",
                  COALESCE(p.state, 'not_started') AS "state!: ActivityProgressState"
           FROM work w
           JOIN activities a ON a.id = w.activity_id AND a.published
           JOIN courses c ON c.id = w.course_id
           LEFT JOIN activity_progress p
                  ON p.activity_id = w.activity_id AND p.user_id = w.user_id
           WHERE w.due_at > to_timestamp($2::bigint) AND w.due_at <= to_timestamp($3::bigint)
           ORDER BY w.due_at, w.activity_id, w.user_id"#,
        user_id.map(|u| u.0),
        from,
        until,
    )
    .fetch_all(pool)
    .await?;
    Ok(rows)
}

/// A grade released or work returned to the learner since `since`.
#[derive(Debug, Clone)]
pub struct RecentResultRow {
    pub course_id: CourseId,
    pub course_name: String,
    pub activity_id: ActivityId,
    pub activity_name: String,
    pub state: ActivityProgressState,
    pub score: Option<f64>,
    pub submission_id: Option<ab_core::id::SubmissionId>,
    pub at: i64,
}

/// The learner's `passed` / `failed` (a released grade) and `returned`
/// activities that changed since `since`, newest first.
pub async fn recent_results(
    pool: &PgPool,
    user_id: UserId,
    since: i64,
    limit: i64,
) -> Result<Vec<RecentResultRow>> {
    let rows = sqlx::query_as!(
        RecentResultRow,
        r#"SELECT c.id AS "course_id: CourseId", c.name AS course_name,
                  a.id AS "activity_id: ActivityId", a.name AS activity_name,
                  p.state AS "state: ActivityProgressState", p.score,
                  p.latest_submission_id AS "submission_id: ab_core::id::SubmissionId",
                  (extract(epoch FROM CASE WHEN p.state = 'returned' THEN p.updated_at
                                           ELSE COALESCE(p.graded_at, p.updated_at) END
                  ))::bigint AS "at!"
           FROM activity_progress p
           JOIN activities a ON a.id = p.activity_id AND a.published
           JOIN courses c ON c.id = p.course_id AND c.archived_at IS NULL
           WHERE p.user_id = $1
             AND p.state IN ('passed', 'failed', 'returned')
             AND CASE WHEN p.state = 'returned' THEN p.updated_at
                      ELSE COALESCE(p.graded_at, p.updated_at) END >= to_timestamp($2::bigint)
             AND EXISTS (SELECT 1 FROM trail_runs r
                         WHERE r.course_id = p.course_id AND r.user_id = p.user_id
                           AND NOT is_course_staff(r.course_id, r.user_id))
           ORDER BY "at!" DESC
           LIMIT $3"#,
        user_id.0,
        since,
        limit,
    )
    .fetch_all(pool)
    .await?;
    Ok(rows)
}

#[derive(Debug, Clone)]
pub struct RecentUpdateRow {
    pub id: ab_core::id::CourseUpdateId,
    pub course_id: CourseId,
    pub course_name: String,
    pub title: String,
    pub created_at: i64,
}

/// Announcements posted since `since` on the member's courses, newest first.
pub async fn recent_course_updates(
    pool: &PgPool,
    user_id: UserId,
    since: i64,
    limit: i64,
) -> Result<Vec<RecentUpdateRow>> {
    let rows = sqlx::query_as!(
        RecentUpdateRow,
        r#"SELECT u.id AS "id: ab_core::id::CourseUpdateId", c.id AS "course_id: CourseId",
                  c.name AS course_name, u.title,
                  (extract(epoch FROM u.created_at))::bigint AS "created_at!"
           FROM course_updates u
           JOIN courses c ON c.id = u.course_id AND c.archived_at IS NULL
           WHERE u.created_at >= to_timestamp($2::bigint)
             AND EXISTS (SELECT 1 FROM trail_runs r
                         WHERE r.course_id = u.course_id AND r.user_id = $1
                           AND NOT is_course_staff(r.course_id, r.user_id))
           ORDER BY u.created_at DESC
           LIMIT $3"#,
        user_id.0,
        since,
        limit,
    )
    .fetch_all(pool)
    .await?;
    Ok(rows)
}
