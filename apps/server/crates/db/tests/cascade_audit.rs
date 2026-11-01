//! Gate 9c: every `ON DELETE CASCADE` foreign key is reviewed.
//!
//! A cascade onto data a person made or earned (submissions, attempts,
//! grades, certificates, files, discussions, progress) silently destroys it
//! when its parent row goes. Each such key is listed in [`ALLOWED`] with the
//! reason the cascade is intended (DECISIONS style: what deletes the parent,
//! and why losing the children is right). Every other table a cascade
//! reaches is listed in [`NOT_USER_DATA`]. A new cascade - or a new table -
//! fails this test until it is classified here.
#![allow(clippy::unwrap_used, clippy::expect_used, clippy::panic)]

use std::collections::BTreeSet;

use sqlx::PgPool;

/// Users are never hard-deleted by the app (`PATCH /users/{id}/status`
/// disables an account; no code path deletes a `users` row): the cascade is
/// the manual erasure path (a person's right to have their data removed).
/// Learning records (attempts, submissions, code runs, certificates,
/// progress, enrolments, XP, uploads) are RESTRICT instead (schema review
/// item 2): an erasure removes or anonymises them explicitly first.
const USER_ERASURE: &str = "users are only erased by hand: the app disables accounts";
/// A notification links into its course / activity (generated key columns):
/// without them the link answers «not found».
const NOTIFICATION_LINK: &str = "a notification links into it; dead links go with it";
/// `DELETE /courses/{id}` is the owner's explicit "delete with its history"
/// (DECISIONS 2026-10-02 "Course archive is orthogonal to `public`"): archive
/// is the way out that keeps learner work; the UI confirms the delete.
const COURSE_DELETE: &str = "course delete drops its history by design; archive keeps it";
/// An activity (or its chapter) with learner work - a submission, file
/// attempt or code run that is no staff preview - is never deleted: 409
/// `activity-has-learner-work`, the webs offer unpublish (owner 2026-10-14,
/// `deleting_an_activity_with_learner_work_is_refused`). What still cascades
/// is staff previews and learner progress on lessons without hand-ins.
const ACTIVITY_DELETE: &str =
    "activity/chapter delete is refused while learners have work there; previews and progress go";
/// A submission is deleted only as a staff preview draft
/// (`discard_preview_draft`, BUG-295) or with its activity/course.
const SUBMISSION_DELETE: &str = "only preview drafts are deleted on their own";
/// A file attempt is deleted only as a stale preview
/// (`delete_preview_attempts`) or with its task/course.
const ATTEMPT_DELETE: &str = "only preview attempts are deleted on their own";

/// `(child table, child columns, parent table)` → reason.
const ALLOWED: &[(&str, &str, &str, &str)] = &[
    (
        "activity_progress",
        "course_id,activity_id",
        "activities",
        ACTIVITY_DELETE,
    ),
    ("activity_progress", "course_id", "courses", COURSE_DELETE),
    ("ai_qa_messages", "course_id", "courses", COURSE_DELETE),
    (
        "ai_qa_messages",
        "thread_id",
        "ai_threads",
        "the owner deletes their own Q&A thread with its messages",
    ),
    (
        "ai_remediation_sessions",
        "activity_id",
        "activities",
        ACTIVITY_DELETE,
    ),
    (
        "ai_remediation_sessions",
        "file_submission_attempt_id",
        "file_submission_attempts",
        ATTEMPT_DELETE,
    ),
    (
        "ai_remediation_sessions",
        "student_user_id",
        "users",
        USER_ERASURE,
    ),
    (
        "ai_remediation_sessions",
        "submission_id",
        "submissions",
        SUBMISSION_DELETE,
    ),
    ("ai_student_memory", "course_id", "courses", COURSE_DELETE),
    (
        "ai_student_memory",
        "student_user_id",
        "users",
        USER_ERASURE,
    ),
    (
        "ai_submission_analyses",
        "file_submission_attempt_id",
        "file_submission_attempts",
        ATTEMPT_DELETE,
    ),
    (
        "ai_submission_analyses",
        "submission_id",
        "submissions",
        SUBMISSION_DELETE,
    ),
    (
        "certificate_users",
        "certification_id",
        "certifications",
        "a certification with issued certificates is disabled, never deleted (delete_certification)",
    ),
    (
        "code_run_cases",
        "run_id",
        "code_runs",
        "a run's per-test output belongs to the run",
    ),
    (
        "code_runs",
        "assessment_id",
        "assessments",
        "an assessment goes only with its activity/course",
    ),
    (
        "code_runs",
        "item_id",
        "assessment_items",
        "scratch runs; item delete is refused once graded work locks the content",
    ),
    ("course_discussions", "course_id", "courses", COURSE_DELETE),
    (
        "course_discussions",
        "course_id,parent_id",
        "course_discussions",
        "a post others replied to stays as a tombstone (2026-10-14); only its author's own replies cascade",
    ),
    ("course_progress", "course_id", "courses", COURSE_DELETE),
    (
        "discussion_reactions",
        "discussion_id",
        "course_discussions",
        "reactions are part of the post they react to",
    ),
    ("discussion_reactions", "user_id", "users", USER_ERASURE),
    (
        "file_grading_entries",
        "attempt_id",
        "file_submission_attempts",
        ATTEMPT_DELETE,
    ),
    (
        "file_submission_attempts",
        "course_id",
        "courses",
        COURSE_DELETE,
    ),
    (
        "file_submission_attempts",
        "file_submission_id,course_id",
        "file_submissions",
        "a file task goes only with its activity or course (ACTIVITY_DELETE)",
    ),
    (
        "file_submission_files",
        "attempt_id",
        "file_submission_attempts",
        ATTEMPT_DELETE,
    ),
    (
        "grading_entries",
        "submission_id",
        "submissions",
        SUBMISSION_DELETE,
    ),
    (
        "item_feedback",
        "grading_entry_id",
        "grading_entries",
        "grading entries are history: never deleted on their own",
    ),
    (
        "item_feedback",
        "submission_id",
        "submissions",
        SUBMISSION_DELETE,
    ),
    (
        "notifications",
        "activity_id",
        "activities",
        NOTIFICATION_LINK,
    ),
    ("notifications", "course_id", "courses", NOTIFICATION_LINK),
    ("notifications", "user_id", "users", USER_ERASURE),
    (
        "submissions",
        "assessment_id,course_id",
        "assessments",
        "an assessment goes only with its activity or course (ACTIVITY_DELETE)",
    ),
    ("submissions", "course_id", "courses", COURSE_DELETE),
    ("trail_runs", "course_id", "courses", COURSE_DELETE),
    (
        "trail_runs",
        "trail_id",
        "trails",
        "a trail is the user's own enrolment list",
    ),
    (
        "trail_steps",
        "activity_id,course_id",
        "activities",
        ACTIVITY_DELETE,
    ),
    ("trail_steps", "course_id", "courses", COURSE_DELETE),
    (
        "trail_steps",
        "trail_id",
        "trails",
        "a trail is the user's own enrolment list",
    ),
    (
        "trail_steps",
        "trail_run_id",
        "trail_runs",
        "leaving a course resets its lesson completions (DECISIONS 2026-09-12)",
    ),
];

/// Tables a cascade may reach without review: authored content, settings,
/// derived/rollup data that is rebuilt, sessions and bookkeeping.
const NOT_USER_DATA: &[&str] = &[
    // Authored course content and its configuration.
    "activities",
    "assessment_access_usergroups",
    "assessment_access_users",
    "assessment_audit_events",
    "assessment_items",
    "assessment_overrides",
    "assessments",
    "blocks",
    "bulk_actions",
    "certifications",
    "chapters",
    "collection_courses",
    "course_updates",
    "file_submission_overrides",
    "file_submissions",
    "resource_authors",
    "usergroup_courses",
    "usergroup_members",
    // Accounts, roles and preferences (not work).
    "google_accounts",
    "idempotency_keys",
    "notification_preferences",
    "role_permissions",
    "user_roles",
    // Derived / rebuilt analytics and teacher tooling.
    "analytics_events",
    "analytics_saved_views",
    "daily_assessment_metrics",
    "daily_course_engagement",
    "daily_course_metrics",
    "daily_teacher_metrics",
    "daily_user_course_progress",
    "learner_risk_snapshots",
    "teacher_interventions",
    // AI bookkeeping (runs, their events/artifacts, budgets, teacher reports).
    "ai_approvals",
    "ai_artifacts",
    "ai_course_analyses",
    "ai_events",
    "ai_evidence",
    "ai_lecture_reviews",
    "ai_runs",
    "ai_token_ledger",
    "ai_token_reservations",
    // docs/AI-FIRST.md: the material index and the teacher's concept graph (rebuilt from course
    // content); mastery evidence and estimates (re-derived from the graded work by
    // `mastery:rebuild`); AI grade drafts, their calibration rows, settings and answer embeddings
    // (advice around a grade - the grade itself lives on the submission / attempt).
    "ai_course_settings",
    "ai_grade_corrections",
    "ai_grade_drafts",
    "ai_work_embeddings",
    "concept_mastery",
    "concept_prerequisites",
    "concept_tags",
    "content_chunks",
    "content_index_state",
    "course_concepts",
    "mastery_evidence",
];

#[ab_testdb::test]
async fn every_cascade_onto_user_data_is_reviewed(pool: PgPool) {
    let cascades: Vec<(String, String, String)> = sqlx::query_as(
        "SELECT c.conrelid::regclass::text, \
                (SELECT string_agg(a.attname, ',' ORDER BY a.attnum) FROM pg_attribute a \
                  WHERE a.attrelid = c.conrelid AND a.attnum = ANY(c.conkey)), \
                c.confrelid::regclass::text \
           FROM pg_constraint c WHERE c.contype = 'f' AND c.confdeltype = 'c' ORDER BY 1, 2",
    )
    .fetch_all(&pool)
    .await
    .unwrap();
    assert!(
        cascades.len() > 50,
        "only {} cascades found",
        cascades.len()
    );

    let mut unreviewed = Vec::new();
    let mut seen = BTreeSet::new();
    for (child, columns, parent) in &cascades {
        if NOT_USER_DATA.contains(&child.as_str()) {
            continue;
        }
        let key = (child.as_str(), columns.as_str(), parent.as_str());
        if ALLOWED.iter().any(|(c, k, p, _)| (*c, *k, *p) == key) {
            seen.insert(key);
        } else {
            unreviewed.push(format!("{child}.{columns} -> {parent}"));
        }
    }
    assert!(
        unreviewed.is_empty(),
        "ON DELETE CASCADE onto data people made or earned, not reviewed (add the key to ALLOWED \
         with the reason the loss is intended - or make it RESTRICT / guard the delete - or list \
         the table in NOT_USER_DATA if it holds no one's work):\n{}",
        unreviewed.join("\n")
    );
    let stale: Vec<String> = ALLOWED
        .iter()
        .filter(|(c, k, p, _)| !seen.contains(&(*c, *k, *p)))
        .map(|(c, k, p, _)| format!("{c}.{k} -> {p}"))
        .collect();
    assert!(
        stale.is_empty(),
        "ALLOWED lists cascades that no longer exist:\n{}",
        stale.join("\n")
    );
}
