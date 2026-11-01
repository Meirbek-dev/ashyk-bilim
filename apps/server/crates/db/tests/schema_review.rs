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
//! - item 1: a row repeating its parent's course_id cannot disagree with it,
//!   and follows a parent that changes course.
//! - item 5: sibling positions are unique at commit; a reorder inside one
//!   transaction passes through duplicates.
//! - items 6, 7, 28: the coherence / bounds / shape checks exist (none was
//!   skipped on the clean test database) and bite.
//! - item 16: the reconciliation re-derives gamification totals from the
//!   journals: a drifted profile is fixed, a sound one is left alone.
//! - item 18: notification kinds and upload purposes are lookup tables; every
//!   kind the code sends is a row, and an unknown kind or purpose is refused
//!   (also inside a preference's `disabled` list).
#![allow(clippy::unwrap_used, clippy::expect_used, clippy::panic)]

use ab_core::{assessments::NotificationType, config::RetentionConfig};
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
        "INSERT INTO assessments (activity_id, course_id, kind, title, lifecycle, published_at,
                                  grading_mode, grade_release_mode, completion_rule)
         VALUES ($1, $2, 'quiz', 'Q', 'published', now(), 'auto', 'immediate', 'passed')
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

#[ab_testdb::test]
async fn course_scoped_children_follow_their_parent(pool: PgPool) {
    let w = world(&pool).await;
    let other: Uuid =
        sqlx::query_scalar("INSERT INTO courses (name) VALUES ('other') RETURNING id")
            .fetch_one(&pool)
            .await
            .unwrap();
    // A submission claiming another course than its assessment's is refused.
    let wrong = sqlx::query(
        "INSERT INTO submissions (assessment_id, course_id, user_id, attempt_number)
         VALUES ($1, $2, $3, 1)",
    )
    .bind(w.assessment)
    .bind(other)
    .bind(w.user)
    .execute(&pool)
    .await;
    assert!(wrong.is_err(), "course_id must match the assessment's");
    // A reply lives in its post's course.
    let post: Uuid = sqlx::query_scalar(
        "INSERT INTO course_discussions (course_id, user_id, content) VALUES ($1, $2, 'p') RETURNING id",
    )
    .bind(w.course)
    .bind(w.user)
    .fetch_one(&pool)
    .await
    .unwrap();
    let reply = sqlx::query(
        "INSERT INTO course_discussions (course_id, user_id, parent_id, kind, content)
         VALUES ($1, $2, $3, 'reply', 'r')",
    )
    .bind(other)
    .bind(w.user)
    .bind(post)
    .execute(&pool)
    .await;
    assert!(reply.is_err(), "a reply must stay in its post's course");
    let no_parent = sqlx::query(
        "INSERT INTO course_discussions (course_id, user_id, kind, content) VALUES ($1, $2, 'reply', 'r')",
    )
    .bind(w.course)
    .bind(w.user)
    .execute(&pool)
    .await;
    assert!(no_parent.is_err(), "a reply needs its post");
}

#[ab_testdb::test]
async fn sibling_positions_are_unique_at_commit(pool: PgPool) {
    let w = world(&pool).await;
    let chapter: Uuid = sqlx::query_scalar("SELECT chapter_id FROM activities WHERE id = $1")
        .bind(w.activity)
        .fetch_one(&pool)
        .await
        .unwrap();
    let second: Uuid = sqlx::query_scalar(
        "INSERT INTO activities (chapter_id, course_id, name, activity_type, activity_sub_type, position)
         VALUES ($1, $2, 'b', 'dynamic', 'dynamic_page', 2) RETURNING id",
    )
    .bind(chapter)
    .bind(w.course)
    .fetch_one(&pool)
    .await
    .unwrap();
    // A swap one row at a time passes through a duplicate inside the transaction.
    let mut tx = pool.begin().await.unwrap();
    for (id, position) in [(second, 1), (w.activity, 2)] {
        sqlx::query("UPDATE activities SET position = $2 WHERE id = $1")
            .bind(id)
            .bind(position)
            .execute(&mut *tx)
            .await
            .unwrap();
    }
    tx.commit().await.unwrap();
    // A duplicate that outlives its statement is refused.
    let dup = sqlx::query("UPDATE activities SET position = 1 WHERE id = $1")
        .bind(w.activity)
        .execute(&pool)
        .await;
    assert!(dup.is_err(), "two activities at position 1");
}

#[ab_testdb::test]
async fn integrity_checks_exist_and_bite(pool: PgPool) {
    let skipped: i64 = sqlx::query_scalar("SELECT count(*) FROM schema_skipped_checks")
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(skipped, 0, "a review check was skipped on a clean database");
    let w = world(&pool).await;
    for bad in [
        "INSERT INTO submissions (assessment_id, course_id, user_id, attempt_number, status)
         VALUES ($1, $2, $3, 7, 'pending')",
        "INSERT INTO submissions (assessment_id, course_id, user_id, attempt_number, final_score)
         VALUES ($1, $2, $3, 8, 100.5)",
        "INSERT INTO submissions (assessment_id, course_id, user_id, attempt_number, answers)
         VALUES ($1, $2, $3, 9, '[]')",
    ] {
        let refused = sqlx::query(bad)
            .bind(w.assessment)
            .bind(w.course)
            .bind(w.user)
            .execute(&pool)
            .await;
        assert!(refused.is_err(), "{bad}");
    }
    let mismatched = sqlx::query(
        "INSERT INTO assessment_items (assessment_id, kind, body) VALUES ($1, 'code', '{\"kind\": \"choice\"}')",
    )
    .bind(w.assessment)
    .execute(&pool)
    .await;
    assert!(mismatched.is_err(), "an item body is tagged with its kind");
    let unpublished = sqlx::query("UPDATE assessments SET published_at = NULL WHERE id = $1")
        .bind(w.assessment)
        .execute(&pool)
        .await;
    assert!(
        unpublished.is_err(),
        "a published assessment keeps published_at"
    );
    let regional = sqlx::query("UPDATE users SET locale = 'ru-RU' WHERE id = $1")
        .bind(w.user)
        .execute(&pool)
        .await;
    assert!(
        regional.is_err(),
        "users store the short locale tag (item 20)"
    );
}

#[ab_testdb::test]
async fn kinds_and_purposes_are_lookup_rows(pool: PgPool) {
    let kinds: Vec<String> = sqlx::query_scalar("SELECT kind FROM notification_kinds")
        .fetch_all(&pool)
        .await
        .unwrap();
    for kind in NotificationType::ALL {
        assert!(
            kinds.iter().any(|k| k == kind.as_str()),
            "{kind:?} has no row"
        );
    }
    let w = world(&pool).await;
    // The same row with a known value (accepted) and an unknown one (refused).
    let cases = [
        (
            "INSERT INTO notifications (user_id, kind, payload) VALUES ($1, $2, '{}')",
            "course_update",
            "bogus",
        ),
        (
            "INSERT INTO notification_preferences (user_id, disabled) VALUES ($1, $2::text[])              ON CONFLICT (user_id) DO UPDATE SET disabled = EXCLUDED.disabled",
            "{course_update}",
            "{course_update,bogus}",
        ),
        (
            "INSERT INTO uploads (created_by, purpose, bucket, key, mime, size_bytes)              VALUES ($1, $2, 'public', uuidv7()::text, 'image/png', 1)",
            "avatar",
            "bogus",
        ),
    ];
    for (sql, good, bad) in cases {
        sqlx::query(sql)
            .bind(w.user)
            .bind(good)
            .execute(&pool)
            .await
            .unwrap();
        let refused = sqlx::query(sql).bind(w.user).bind(bad).execute(&pool).await;
        assert!(refused.is_err(), "{sql} with {bad}");
    }
}

#[ab_testdb::test]
async fn gamification_totals_are_reconciled_from_the_journals(pool: PgPool) {
    let drifted = user(&pool, "drifted").await;
    let sound = user(&pool, "sound").await;
    for id in [drifted, sound] {
        sqlx::query(
            "INSERT INTO gamification_profiles (user_id, total_xp, level, total_activities_completed)              VALUES ($1, 150, 2, 1)",
        )
        .bind(id)
        .execute(&pool)
        .await
        .unwrap();
        sqlx::query(
            "INSERT INTO gamification_completions (user_id, kind, source_id) VALUES ($1, 'activity', 'a')",
        )
        .bind(id)
        .execute(&pool)
        .await
        .unwrap();
    }
    for (id, amount) in [(drifted, 100), (drifted, 50), (sound, 150)] {
        sqlx::query(
            "INSERT INTO xp_transactions (user_id, amount, source, source_id, previous_level)              VALUES ($1, $2, 'admin_award', uuidv7()::text, 1)",
        )
        .bind(id)
        .bind(amount)
        .execute(&pool)
        .await
        .unwrap();
    }
    // A lost counter update: the journals say 150 XP and one completion.
    sqlx::query(
        "UPDATE gamification_profiles SET total_xp = 40, level = 1, total_activities_completed = 0          WHERE user_id = $1",
    )
    .bind(drifted)
    .execute(&pool)
    .await
    .unwrap();

    let fixed = ab_db::gamification::reconcile_profiles(&pool)
        .await
        .unwrap();
    assert_eq!(fixed.iter().map(|u| u.0).collect::<Vec<_>>(), vec![drifted]);
    let row: (i32, i32, i32) = sqlx::query_as(
        "SELECT total_xp, level, total_activities_completed FROM gamification_profiles WHERE user_id = $1",
    )
    .bind(drifted)
    .fetch_one(&pool)
    .await
    .unwrap();
    assert_eq!(row, (150, 2, 1));
    assert!(
        ab_db::gamification::reconcile_profiles(&pool)
            .await
            .unwrap()
            .is_empty()
    );
}
