//! Erasing a person (schema review 2, REWRITE 5.7; `ashyq admin erase-user`,
//! self-service deletion):
//!
//! - every foreign key onto `users` is classified: either
//!   [`ab_db::identity::erase_personal_data`] deletes the rows, or they stay
//!   with the anonymised row and the reason is written here. A new key fails
//!   until it is classified;
//! - erasure removes the person's AI conversations, work embeddings and
//!   token ledger, and keeps their submission and its grade.
#![allow(clippy::unwrap_used, clippy::expect_used, clippy::panic)]

use std::collections::BTreeSet;

use ab_core::id::UserId;
use sqlx::PgPool;
use uuid::Uuid;

const ERASED: &str = "erase_personal_data deletes the rows";
const GOOGLE: &str = "anonymise_user deletes the Google link";
/// Learning records reference users with RESTRICT (schema review item 2):
/// grades and certificates others rely on stay valid, pointing at an
/// anonymised row.
const RECORD: &str = "learning record: kept, the row is anonymised";
/// Work the person did for others (courses, grades given, decisions): it
/// stays; the anonymised row names nobody.
const ACTOR: &str = "authored or decided by the person: kept, unattributed";
/// Memberships and settings carry no personal content; the account is
/// disabled, so they grant nothing.
const SETTING: &str = "membership or setting of a disabled account";
const AUDIT: &str = "security log: kept, ages out after AB__RETENTION__AUTH_AUDIT_DAYS";

/// `(table, first key column)` → what erasure does.
const CLASSIFIED: &[(&str, &str, &str)] = &[
    ("activities", "creator_id", ACTOR),
    ("activity_progress", "user_id", RECORD),
    ("ai_approvals", "requested_by", ACTOR),
    ("ai_approvals", "resolved_by", ACTOR),
    ("ai_course_analyses", "triggered_by", ACTOR),
    ("ai_course_settings", "enabled_by", ACTOR),
    ("ai_feature_switches", "updated_by", ACTOR),
    ("ai_grade_corrections", "teacher_id", ACTOR),
    ("ai_grade_drafts", "decided_by", ACTOR),
    ("ai_grade_drafts", "learner_id", ERASED),
    ("ai_grade_drafts", "requested_by", ACTOR),
    ("ai_lecture_reviews", "triggered_by", ACTOR),
    ("ai_qa_messages", "user_id", ERASED),
    ("ai_remediation_sessions", "student_user_id", ERASED),
    ("ai_runs", "triggered_by", ACTOR),
    ("ai_student_memory", "student_user_id", ERASED),
    ("ai_submission_analyses", "triggered_by", ACTOR),
    ("ai_threads", "user_id", ERASED),
    ("ai_token_ledger", "user_id", ERASED),
    ("analytics_events", "actor_id", ACTOR),
    ("analytics_events", "user_id", ERASED),
    ("analytics_saved_views", "teacher_user_id", SETTING),
    ("assessment_access_users", "user_id", SETTING),
    ("assessment_audit_events", "actor_id", ACTOR),
    ("assessment_overrides", "granted_by", ACTOR),
    ("assessment_overrides", "user_id", SETTING),
    ("assessments", "creator_id", ACTOR),
    ("auth_audit_log", "user_id", AUDIT),
    ("bulk_actions", "performed_by", ACTOR),
    ("certificate_users", "user_id", RECORD),
    ("chapters", "creator_id", ACTOR),
    ("code_runs", "user_id", RECORD),
    ("collections", "creator_id", ACTOR),
    ("concept_mastery", "user_id", ERASED),
    ("concept_tags", "decided_by", ACTOR),
    ("course_concepts", "decided_by", ACTOR),
    ("course_discussions", "user_id", ACTOR),
    ("course_progress", "user_id", RECORD),
    ("course_updates", "author_id", ACTOR),
    ("courses", "archived_by", ACTOR),
    ("courses", "creator_id", ACTOR),
    ("daily_course_metrics", "teacher_user_id", SETTING),
    ("daily_teacher_metrics", "teacher_user_id", SETTING),
    ("daily_user_course_progress", "user_id", ERASED),
    ("discussion_reactions", "user_id", SETTING),
    ("file_grading_entries", "graded_by", ACTOR),
    ("file_submission_attempts", "graded_by", ACTOR),
    ("file_submission_attempts", "user_id", RECORD),
    ("file_submission_overrides", "granted_by", ACTOR),
    ("file_submission_overrides", "user_id", SETTING),
    ("file_submissions", "creator_id", ACTOR),
    ("gamification_completions", "user_id", RECORD),
    ("gamification_profiles", "user_id", RECORD),
    ("google_accounts", "user_id", GOOGLE),
    ("grading_entries", "graded_by", ACTOR),
    ("idempotency_keys", "user_id", ERASED),
    ("item_feedback", "graded_by", ACTOR),
    ("learner_risk_snapshots", "teacher_user_id", SETTING),
    ("learner_risk_snapshots", "user_id", ERASED),
    ("mastery_evidence", "user_id", ERASED),
    ("notification_preferences", "user_id", SETTING),
    ("notifications", "user_id", ERASED),
    ("resource_authors", "user_id", SETTING),
    ("submissions", "user_id", RECORD),
    ("teacher_interventions", "teacher_user_id", ACTOR),
    ("teacher_interventions", "user_id", ERASED),
    ("trail_runs", "user_id", RECORD),
    ("trail_steps", "user_id", RECORD),
    ("trails", "user_id", RECORD),
    ("uploads", "created_by", RECORD),
    ("user_roles", "user_id", SETTING),
    ("usergroup_members", "user_id", SETTING),
    ("usergroups", "creator_id", ACTOR),
    ("xp_transactions", "user_id", RECORD),
];

#[ab_testdb::test]
async fn every_key_onto_users_is_classified(pool: PgPool) {
    let keys: Vec<(String, String)> = sqlx::query_as(
        "SELECT c.conrelid::regclass::text, a.attname::text
           FROM pg_constraint c
           JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = c.conkey[1]
          WHERE c.contype = 'f' AND c.confrelid = 'users'::regclass",
    )
    .fetch_all(&pool)
    .await
    .unwrap();
    let actual: BTreeSet<(String, String)> = keys.into_iter().collect();
    let listed: BTreeSet<(String, String)> = CLASSIFIED
        .iter()
        .map(|(t, c, _)| ((*t).to_owned(), (*c).to_owned()))
        .collect();
    let missing: Vec<_> = actual.difference(&listed).collect();
    let stale: Vec<_> = listed.difference(&actual).collect();
    assert!(
        missing.is_empty(),
        "classify these keys onto users in CLASSIFIED (and erase them in erase_personal_data if they hold personal data): {missing:?}"
    );
    assert!(stale.is_empty(), "no longer keys onto users: {stale:?}");

    let source = include_str!("../src/identity.rs");
    let body = &source[source.find("pub async fn erase_personal_data").unwrap()..];
    // Through its private helpers, up to the next public function.
    let body = &body[..body[1..].find("\npub async fn").unwrap()];
    let unhandled: Vec<_> = CLASSIFIED
        .iter()
        .filter(|(table, _, what)| {
            *what == ERASED && !body.contains(&format!("DELETE FROM {table} "))
        })
        .collect();
    assert!(
        unhandled.is_empty(),
        "marked ERASED but erase_personal_data does not delete them: {unhandled:?}"
    );
}

#[ab_testdb::test]
async fn erasure_removes_derived_data_and_keeps_the_grade(pool: PgPool) {
    let user: Uuid = sqlx::query_scalar(
        "INSERT INTO users (zitadel_user_id, username, email)
         VALUES ('z-erase', 'erase-me', 'erase-me@example.com') RETURNING id",
    )
    .fetch_one(&pool)
    .await
    .unwrap();
    let course: Uuid =
        sqlx::query_scalar("INSERT INTO courses (name, creator_id) VALUES ('c', $1) RETURNING id")
            .bind(user)
            .fetch_one(&pool)
            .await
            .unwrap();
    let chapter: Uuid = sqlx::query_scalar(
        "INSERT INTO chapters (course_id, name, creator_id) VALUES ($1, 'ch', $2) RETURNING id",
    )
    .bind(course)
    .bind(user)
    .fetch_one(&pool)
    .await
    .unwrap();
    let activity: Uuid = sqlx::query_scalar(
        "INSERT INTO activities (chapter_id, course_id, name, activity_type, activity_sub_type)
         VALUES ($1, $2, 'q', 'quiz', 'quiz_standard') RETURNING id",
    )
    .bind(chapter)
    .bind(course)
    .fetch_one(&pool)
    .await
    .unwrap();
    let assessment: Uuid = sqlx::query_scalar(
        "INSERT INTO assessments (activity_id, course_id, kind, title, lifecycle, published_at,
                                  grading_mode, grade_release_mode, completion_rule)
         VALUES ($1, $2, 'quiz', 'Q', 'published', now(), 'auto', 'immediate', 'passed')
         RETURNING id",
    )
    .bind(activity)
    .bind(course)
    .fetch_one(&pool)
    .await
    .unwrap();
    let submission: Uuid = sqlx::query_scalar(
        "INSERT INTO submissions (assessment_id, course_id, user_id, status, attempt_number, submitted_at)
         VALUES ($1, $2, $3, 'graded', 1, now()) RETURNING id",
    )
    .bind(assessment)
    .bind(course)
    .bind(user)
    .fetch_one(&pool)
    .await
    .unwrap();
    sqlx::query(
        "INSERT INTO grading_entries (submission_id, raw_score, final_score) VALUES ($1, 90, 90)",
    )
    .bind(submission)
    .execute(&pool)
    .await
    .unwrap();
    let thread: Uuid = sqlx::query_scalar(
        "INSERT INTO ai_threads (user_id, role, course_id) VALUES ($1, 'student', $2) RETURNING id",
    )
    .bind(user)
    .bind(course)
    .fetch_one(&pool)
    .await
    .unwrap();
    sqlx::query(
        "INSERT INTO ai_qa_messages (thread_id, course_id, user_id, role, content)
         VALUES ($1, $2, $3, 'user', 'my question')",
    )
    .bind(thread)
    .bind(course)
    .bind(user)
    .execute(&pool)
    .await
    .unwrap();
    sqlx::query(
        "INSERT INTO ai_work_embeddings (subject_id, part_key, activity_id, text_hash, embedding_model, embedding)
         VALUES ($1, 'p', $2, 'h', 'm', array_fill(0.1::real, ARRAY[1024])::vector)",
    )
    .bind(submission)
    .bind(activity)
    .execute(&pool)
    .await
    .unwrap();
    sqlx::query("INSERT INTO ai_token_ledger (month, user_id) VALUES (date_trunc('month', now())::date, $1)")
        .bind(user)
        .execute(&pool)
        .await
        .unwrap();

    let mut tx = pool.begin().await.unwrap();
    assert!(
        ab_db::identity::anonymise_user(&mut tx, UserId(user), "deleted-x")
            .await
            .unwrap()
    );
    let removed = ab_db::identity::erase_personal_data(&mut tx, UserId(user))
        .await
        .unwrap();
    tx.commit().await.unwrap();
    // The thread (its message cascades), the embedding and the ledger row.
    assert_eq!(removed, 3);

    let count = |sql: &'static str| {
        let pool = pool.clone();
        async move {
            sqlx::query_scalar::<_, i64>(sql)
                .bind(user)
                .fetch_one(&pool)
                .await
                .unwrap()
        }
    };
    assert_eq!(
        count("SELECT count(*) FROM ai_qa_messages WHERE user_id = $1").await,
        0
    );
    assert_eq!(
        count("SELECT count(*) FROM ai_work_embeddings e JOIN submissions s ON s.id = e.subject_id WHERE s.user_id = $1").await,
        0
    );
    assert_eq!(
        count("SELECT count(*) FROM ai_token_ledger WHERE user_id = $1").await,
        0
    );
    assert_eq!(
        count("SELECT count(*) FROM submissions WHERE user_id = $1").await,
        1
    );
    assert_eq!(
        count("SELECT count(*) FROM grading_entries g JOIN submissions s ON s.id = g.submission_id WHERE s.user_id = $1").await,
        1
    );
    assert_eq!(
        count("SELECT count(*) FROM users WHERE id = $1 AND username = 'deleted-x' AND deleted_at IS NOT NULL").await,
        1
    );
}
