//! Guarantees added by the 2026-11 schema review (docs/ARCHITECTURE.md §8):
//!
//! - item 2: deleting a user with learning records is refused (RESTRICT);
//!   a user without them still goes, with their roles.
//! - item 4: a learner's counted attempts have unique numbers per task;
//!   staff previews stay outside the key.
//! - item 9: a notification's course / activity are real keys: deleting
//!   either removes the notifications that link into it.
//! - item 24: the retention sweep deletes old operational logs and keeps
//!   learner work (graded code-run output, live jobs).
#![allow(clippy::unwrap_used, clippy::expect_used, clippy::panic)]

use ab_core::config::RetentionConfig;
use sqlx::PgPool;
use uuid::Uuid;

struct World {
    user: Uuid,
    course: Uuid,
    activity: Uuid,
    assessment: Uuid,
}

async fn user(pool: &PgPool, name: &str) -> Uuid {
    sqlx::query_scalar(
        "INSERT INTO users (zitadel_user_id, username, email)
         VALUES ('z-' || $1, $1, $1 || '@example.com') RETURNING id",
    )
    .bind(name)
    .fetch_one(pool)
    .await
    .unwrap()
}

/// User → course → chapter → quiz activity → assessment.
async fn world(pool: &PgPool) -> World {
    let user = user(pool, "learner").await;
    let course: Uuid =
        sqlx::query_scalar("INSERT INTO courses (name, creator_id) VALUES ('c', $1) RETURNING id")
            .bind(user)
            .fetch_one(pool)
            .await
            .unwrap();
    let chapter: Uuid = sqlx::query_scalar(
        "INSERT INTO chapters (course_id, name, creator_id) VALUES ($1, 'ch', $2) RETURNING id",
    )
    .bind(course)
    .bind(user)
    .fetch_one(pool)
    .await
    .unwrap();
    let activity: Uuid = sqlx::query_scalar(
        "INSERT INTO activities (chapter_id, course_id, name, activity_type, activity_sub_type)
         VALUES ($1, $2, 'q', 'quiz', 'quiz_standard') RETURNING id",
    )
    .bind(chapter)
    .bind(course)
    .fetch_one(pool)
    .await
    .unwrap();
    let assessment: Uuid = sqlx::query_scalar(
        "INSERT INTO assessments (activity_id, course_id, kind, title, lifecycle,
                                  grading_mode, grade_release_mode, completion_rule)
         VALUES ($1, $2, 'quiz', 'Q', 'published', 'auto', 'immediate', 'passed')
         RETURNING id",
    )
    .bind(activity)
    .bind(course)
    .fetch_one(pool)
    .await
    .unwrap();
    World {
        user,
        course,
        activity,
        assessment,
    }
}

async fn submission(pool: &PgPool, w: &World, number: i32, preview: bool) -> sqlx::Result<Uuid> {
    sqlx::query_scalar(
        "INSERT INTO submissions (assessment_id, course_id, user_id, status, attempt_number,
                                  preview, submitted_at)
         VALUES ($1, $2, $3, 'pending', $4, $5, now()) RETURNING id",
    )
    .bind(w.assessment)
    .bind(w.course)
    .bind(w.user)
    .bind(number)
    .bind(preview)
    .fetch_one(pool)
    .await
}

#[ab_testdb::test]
async fn deleting_a_user_with_learning_records_is_refused(pool: PgPool) {
    let w = world(&pool).await;
    submission(&pool, &w, 1, false).await.unwrap();
    let refused = sqlx::query("DELETE FROM users WHERE id = $1")
        .bind(w.user)
        .execute(&pool)
        .await;
    let err = refused.expect_err("a learner with a submission cannot be deleted");
    assert_eq!(
        err.as_database_error()
            .and_then(sqlx::error::DatabaseError::code)
            .as_deref(),
        Some("23001"),
        "restrict_violation expected: {err}"
    );
    // A person without learning records still goes (with their roles).
    let other = user(&pool, "nobody").await;
    sqlx::query("INSERT INTO user_roles (user_id, role_id) SELECT $1, id FROM roles LIMIT 1")
        .bind(other)
        .execute(&pool)
        .await
        .unwrap();
    sqlx::query("DELETE FROM users WHERE id = $1")
        .bind(other)
        .execute(&pool)
        .await
        .unwrap();
}

#[ab_testdb::test]
async fn attempt_numbers_are_unique_per_learner_and_task(pool: PgPool) {
    let w = world(&pool).await;
    submission(&pool, &w, 1, false).await.unwrap();
    let dup = submission(&pool, &w, 1, false).await;
    assert!(dup.is_err(), "a second counted attempt #1 must be refused");
    // Previews number on their own.
    submission(&pool, &w, 1, true).await.unwrap();
    submission(&pool, &w, 1, true).await.unwrap();
    submission(&pool, &w, 2, false).await.unwrap();
}

#[ab_testdb::test]
async fn notifications_go_with_their_course_and_activity(pool: PgPool) {
    let w = world(&pool).await;
    for payload in [
        serde_json::json!({ "type": "course_update", "course_id": w.course }),
        serde_json::json!({ "type": "x", "course_id": w.course, "activity_id": w.activity }),
        serde_json::json!({}),
    ] {
        sqlx::query(
            "INSERT INTO notifications (user_id, kind, payload) VALUES ($1, 'course_update', $2)",
        )
        .bind(w.user)
        .bind(payload)
        .execute(&pool)
        .await
        .unwrap();
    }
    let linked: (i64, i64) =
        sqlx::query_as("SELECT count(course_id), count(activity_id) FROM notifications")
            .fetch_one(&pool)
            .await
            .unwrap();
    assert_eq!(linked, (2, 1));

    // An activity delete takes its notification; a course delete the rest.
    sqlx::query("DELETE FROM assessments WHERE activity_id = $1")
        .bind(w.activity)
        .execute(&pool)
        .await
        .unwrap();
    sqlx::query("DELETE FROM activities WHERE id = $1")
        .bind(w.activity)
        .execute(&pool)
        .await
        .unwrap();
    let left: i64 = sqlx::query_scalar("SELECT count(*) FROM notifications")
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(left, 2);
    sqlx::query("DELETE FROM courses WHERE id = $1")
        .bind(w.course)
        .execute(&pool)
        .await
        .unwrap();
    let left: i64 = sqlx::query_scalar("SELECT count(*) FROM notifications")
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(left, 1, "only the unlinked notification stays");
}

#[ab_testdb::test]
async fn retention_sweeps_old_logs_and_keeps_learner_work(pool: PgPool) {
    let w = world(&pool).await;
    let item: Uuid = sqlx::query_scalar(
        "INSERT INTO assessment_items (assessment_id, kind, position, body)
         VALUES ($1, 'code', 1, '{\"kind\": \"code\"}') RETURNING id",
    )
    .bind(w.assessment)
    .fetch_one(&pool)
    .await
    .unwrap();
    // Jobs: an old finished one goes, a recent one and an old queued one stay.
    sqlx::query(
        "INSERT INTO jobs (kind, status, created_at) VALUES
           ('t:old', 'succeeded', now() - interval '30 days'),
           ('t:new', 'succeeded', now()),
           ('t:dead', 'dead', now() - interval '30 days'),
           ('t:queued', 'queued', now() - interval '300 days')",
    )
    .execute(&pool)
    .await
    .unwrap();
    sqlx::query(
        "INSERT INTO auth_audit_log (event, created_at) VALUES
           ('login', now() - interval '400 days'), ('login', now())",
    )
    .execute(&pool)
    .await
    .unwrap();
    // Code runs: an old practice run loses its output, a graded run keeps it.
    for purpose in ["custom", "final"] {
        let run: Uuid = sqlx::query_scalar(
            "INSERT INTO code_runs (assessment_id, item_id, user_id, purpose, status, language_id,
                                    source_sha256, compile_output, created_at)
             VALUES ($1, $2, $3, $4, 'accepted', 71, 'x', 'warning', now() - interval '200 days')
             RETURNING id",
        )
        .bind(w.assessment)
        .bind(item)
        .bind(w.user)
        .bind(purpose)
        .fetch_one(&pool)
        .await
        .unwrap();
        sqlx::query(
            "INSERT INTO code_run_cases (run_id, position, test_id, passed, stdout, stderr)
             VALUES ($1, 1, 't1', true, 'out', 'err')",
        )
        .bind(run)
        .execute(&pool)
        .await
        .unwrap();
    }

    let swept = ab_db::retention::sweep(&pool, &RetentionConfig::default())
        .await
        .unwrap();
    assert_eq!(swept.jobs, 1);
    assert_eq!(swept.auth_audit, 1);
    assert_eq!(swept.code_run_outputs, 1);

    let jobs: Vec<String> = sqlx::query_scalar("SELECT kind FROM jobs ORDER BY kind")
        .fetch_all(&pool)
        .await
        .unwrap();
    assert_eq!(jobs, ["t:dead", "t:new", "t:queued"]);
    let outputs: Vec<(String, Option<String>, Option<String>, bool)> = sqlx::query_as(
        "SELECT r.purpose, r.compile_output, c.stdout, c.passed
         FROM code_runs r JOIN code_run_cases c ON c.run_id = r.id ORDER BY r.purpose",
    )
    .fetch_all(&pool)
    .await
    .unwrap();
    assert_eq!(
        outputs,
        [
            ("custom".to_owned(), None, None, true),
            (
                "final".to_owned(),
                Some("warning".to_owned()),
                Some("out".to_owned()),
                true
            ),
        ]
    );
    // Idempotent: a second sweep finds nothing.
    let again = ab_db::retention::sweep(&pool, &RetentionConfig::default())
        .await
        .unwrap();
    assert_eq!(again, ab_db::retention::RetentionCounts::default());
}
