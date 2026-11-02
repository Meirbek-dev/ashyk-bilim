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
//! - item 1: a row repeating its parent's course_id cannot disagree with it;
//!   review 3, item 23: a parent's course change is refused while it has
//!   children (ON UPDATE RESTRICT).
//! - item 5: sibling positions are unique at commit; a reorder inside one
//!   transaction passes through duplicates.
//! - items 6, 7, 28: the coherence / bounds / shape checks exist (none was
//!   skipped on the clean test database) and bite.
//! - item 16: the reconciliation re-derives gamification totals from the
//!   journals: a drifted profile is fixed, a sound one is left alone.
//! - item 18: notification kinds and upload purposes are lookup tables; every
//!   kind the code sends is a row, and an unknown kind or purpose is refused
//!   (also as a notification opt-out).
//! - review 2, items 11-12: both grade journals guard the whole row: only a
//!   grade's published_at changes, a file grade never changes, and a file
//!   grade goes only with its attempt.
//! - a grader can be erased by hand: both journals keep the grade with
//!   `graded_by` cleared, and still refuse naming another grader.
//! - a deleted account cannot be active again.
//! - review item 19: a course update links activities through keys; a
//!   deleted activity leaves the update, an unknown one is refused.
//! - review 3, item 43: every session finds the tables in their schemas: the
//!   database carries the search_path (a plain connection, like the previous
//!   release's, gets it), the server's startup option wins over a stale one,
//!   and `app_table_schema()` places a table it does not name by its prefix.
//! - review item 30: a course's tags are a bounded text[], its learnings a
//!   jsonb array of `{id, text, emoji?}` within the API's bounds.
//! - review item 36: embeddings are halfvec(1024); a model's nearest-chunk
//!   search walks that model's partial HNSW index; the previous release's
//!   `::vector` statements still run.
//! - review item 35 (REWRITE 5.6 n11): `/search` over 10 000 courses walks
//!   the trigram index on the folded text.
//! - review item 21: course staff live in `course_staff` (collection staff
//!   in `collection_staff`); until the contract, a write on either side of
//!   `resource_authors` reaches the other, so both releases see one roster.
//! - review item 18 (REWRITE 5.6 n4): every media key carries its upload id;
//!   the reaper keeps a referenced file whose counter drifted to 0 and still
//!   collects a real orphan.
//! - review 3, item 24 (reverted by the release review): a check old rows
//!   violate is not added, so their rows stay editable; it is added after the
//!   repair.
//! - review 3, item 20: every submission / file-attempt arc table names
//!   exactly one of the two.
//! - lane C, item 17: one platform day (`AB__SERVER__TIME_ZONE`, default
//!   Asia/Almaty): `platform_date` and `platform_day_start` cut days at the
//!   midnight of the zone the pool passes as `ab.time_zone`, and a `Day`
//!   binds as `date`.
//! - lane C, item 11: membership is an `enrolments` row; the previous
//!   release's trail-run writes are mirrored into it until the contract.
//! - lane C, items 14/15: course_progress derives its percent and the
//!   certificate flag from the counts and completed_at; the counts cohere.
//! - lane C, item 40: projections and rollups are keyed by their natural key.
//! - lane C, item 38: the event prune removes events past 400 days and
//!   keeps the rest, whether or not analytics_events is partitioned.
//! - lane C, item 12: a completion the previous release projects (or
//!   clears) in activity_progress is mirrored into completions.
//! - review 2, item 25: a code-run case stores the platform's own verdict;
//!   the previous release's Judge0 code and the verdict fill each other.
//! - review 2, item 9: a handed-in attempt has both snapshots (checked at
//!   commit, so they may follow the hand-in within its transaction), and a
//!   snapshot once written never changes.
//! - review 2, item 8: a submission's current grade is its latest journal
//!   entry's; a grade written to only one side fails at commit.
//! - review 2, item 5: an assessment's title and kind are its activity's;
//!   a rename shows at once, and the activity cannot change its type.
//! - review 2, item 4: each distinct (items, policy) pair handed in is one
//!   numbered, frozen assessment version; a hand-in names it once.
//! - review 2, item 6: a grade entry keeps its points of the attempt's
//!   version (`points_of_percent`, two decimals, half away from zero); a
//!   percentage that goes through points comes back within 0.5 / max_points.
//! - review 2, item 8 (rest): a submission's breakdown is its latest grade
//!   entry's, else its hand-in's `auto_breakdown`; until the contract the old
//!   `grading` column follows both for the previous release.
//! - review 2, item 2: attempts share one status vocabulary (`submitted`,
//!   `released`); a new spelling is accepted and reads back as the same
//!   status, and until the contract it is stored in the previous spelling.
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
        "INSERT INTO assessments (activity_id, course_id, lifecycle, published_at,
                                  grading_mode, grade_release_mode, completion_rule)
         VALUES ($1, $2, 'published', now(), 'auto', 'immediate', 'passed')
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
                                  preview, submitted_at, items_snapshot, policy_snapshot)
         VALUES ($1, $2, $3, 'submitted', $4, $5, now(), '{}', '{}') RETURNING id",
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
async fn ai_records_age_out_except_what_a_grade_or_a_page_shows(pool: PgPool) {
    let w = world(&pool).await;
    let thread = |title: &str, days: i32| {
        sqlx::query_scalar::<_, Uuid>(
            "INSERT INTO ai_threads (user_id, course_id, title, updated_at)
             VALUES ($1, $2, $3, now() - make_interval(days => $4)) RETURNING id",
        )
        .bind(w.user)
        .bind(w.course)
        .bind(title.to_owned())
        .bind(days)
        .fetch_one(&pool)
    };
    let message = |thread: Uuid, content: &str, days: i32| {
        sqlx::query(
            "INSERT INTO ai_qa_messages (thread_id, course_id, user_id, role, content, created_at)
             VALUES ($1, $2, $3, 'user', $4, now() - make_interval(days => $5))",
        )
        .bind(thread)
        .bind(w.course)
        .bind(w.user)
        .bind(content.to_owned())
        .bind(days)
        .execute(&pool)
    };
    // Threads: one with an old and a new message, one with only an old message and an old run.
    let live = thread("live", 0).await.unwrap();
    message(live, "old", 401).await.unwrap();
    message(live, "new", 0).await.unwrap();
    let stale = thread("stale", 401).await.unwrap();
    message(stale, "old", 401).await.unwrap();
    sqlx::query(
        "INSERT INTO ai_runs (thread_id, kind, status, created_at, completed_at)
         VALUES ($1, 'course_qa', 'succeeded', now() - interval '401 days',
                 now() - interval '401 days')",
    )
    .bind(stale)
    .execute(&pool)
    .await
    .unwrap();
    // Course analyses: the newest (4) and the newest published (2) stay; lecture reviews.
    sqlx::query(
        "INSERT INTO ai_course_analyses (course_id, status, public_score, created_at) VALUES
           ($1, 'draft', 1, now() - interval '700 days'),
           ($1, 'published', 2, now() - interval '600 days'),
           ($1, 'draft', 3, now() - interval '500 days'),
           ($1, 'draft', 4, now() - interval '450 days')",
    )
    .bind(w.course)
    .execute(&pool)
    .await
    .unwrap();
    sqlx::query(
        "INSERT INTO ai_lecture_reviews (course_id, activity_id, status, created_at) VALUES
           ($1, $2, 'superseded', now() - interval '401 days'),
           ($1, $2, 'active', now() - interval '401 days')",
    )
    .bind(w.course)
    .bind(w.activity)
    .execute(&pool)
    .await
    .unwrap();
    // Grade drafts: an old applied one stays with its grade, an old discarded one goes.
    let sub = submission(&pool, &w, 1, false).await.unwrap();
    sqlx::query(
        "INSERT INTO ai_grade_drafts (course_id, activity_id, submission_id, learner_id, status,
                                      subject_version, agreement, created_at)
         VALUES ($1, $2, $3, $4, 'applied', 1, 'exact', now() - interval '401 days'),
                ($1, $2, $3, $4, 'discarded', 1, NULL, now() - interval '401 days')",
    )
    .bind(w.course)
    .bind(w.activity)
    .bind(sub)
    .bind(w.user)
    .execute(&pool)
    .await
    .unwrap();

    let swept = ab_db::retention::sweep(&pool, &RetentionConfig::default())
        .await
        .unwrap();
    assert_eq!(
        (
            swept.ai_grade_drafts,
            swept.ai_runs,
            swept.ai_messages,
            swept.ai_threads,
            swept.ai_analyses
        ),
        (1, 1, 2, 1, 3)
    );
    let left = |sql: &'static str| {
        let pool = pool.clone();
        async move {
            sqlx::query_scalar::<_, String>(sql)
                .fetch_all(&pool)
                .await
                .unwrap()
        }
    };
    assert_eq!(left("SELECT title FROM ai_threads").await, ["live"]);
    assert_eq!(left("SELECT content FROM ai_qa_messages").await, ["new"]);
    assert_eq!(
        left("SELECT public_score::text FROM ai_course_analyses ORDER BY public_score").await,
        ["2", "4"]
    );
    assert_eq!(
        left("SELECT status FROM ai_lecture_reviews").await,
        ["active"]
    );
    assert_eq!(
        left("SELECT status FROM ai_grade_drafts").await,
        ["applied"]
    );
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
         VALUES ($1, $2, $3, 7, 'submitted')",
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
            "INSERT INTO notification_opt_outs (user_id, kind) VALUES ($1, $2)",
            "course_update",
            "bogus",
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

#[ab_testdb::test]
async fn grade_journals_guard_the_whole_row(pool: PgPool) {
    let w = world(&pool).await;
    let submission = submission(&pool, &w, 1, false).await.unwrap();
    let entry: Uuid = sqlx::query_scalar(
        "WITH e AS (INSERT INTO grading_entries (submission_id, raw_score, final_score)
                    VALUES ($1, 80, 80) RETURNING id, submission_id, effective_breakdown),
              current AS (UPDATE submissions s SET final_score = 80
                          FROM e WHERE s.id = e.submission_id)
         SELECT id FROM e",
    )
    .bind(submission)
    .fetch_one(&pool)
    .await
    .unwrap();
    sqlx::query("UPDATE grading_entries SET published_at = now() WHERE id = $1")
        .bind(entry)
        .execute(&pool)
        .await
        .unwrap();
    let rewritten = sqlx::query("UPDATE grading_entries SET overall_feedback = 'x' WHERE id = $1")
        .bind(entry)
        .execute(&pool)
        .await;
    assert!(rewritten.is_err(), "only published_at changes");

    let task: Uuid = sqlx::query_scalar(
        "INSERT INTO file_submissions (activity_id, course_id) VALUES ($1, $2) RETURNING id",
    )
    .bind(w.activity)
    .bind(w.course)
    .fetch_one(&pool)
    .await
    .unwrap();
    let attempt: Uuid = sqlx::query_scalar(
        "INSERT INTO file_submission_attempts (file_submission_id, course_id, user_id)
         VALUES ($1, $2, $3) RETURNING id",
    )
    .bind(task)
    .bind(w.course)
    .bind(w.user)
    .fetch_one(&pool)
    .await
    .unwrap();
    let file_entry: Uuid = sqlx::query_scalar(
        "INSERT INTO file_grading_entries (attempt_id, status, raw_score, final_score)
         VALUES ($1, 'graded', 70, 70) RETURNING id",
    )
    .bind(attempt)
    .fetch_one(&pool)
    .await
    .unwrap();
    for bad in [
        "UPDATE file_grading_entries SET final_score = 100 WHERE id = $1",
        "DELETE FROM file_grading_entries WHERE id = $1",
    ] {
        let refused = sqlx::query(bad).bind(file_entry).execute(&pool).await;
        assert!(refused.is_err(), "{bad}");
    }
    // The cascade from the attempt still removes its history.
    sqlx::query("DELETE FROM file_submission_attempts WHERE id = $1")
        .bind(attempt)
        .execute(&pool)
        .await
        .unwrap();
    let left: i64 = sqlx::query_scalar("SELECT count(*) FROM file_grading_entries WHERE id = $1")
        .bind(file_entry)
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(left, 0);
}

#[ab_testdb::test]
async fn erasing_a_grader_keeps_both_journals(pool: PgPool) {
    let w = world(&pool).await;
    let grader = user(&pool, "grader").await;
    let submission = submission(&pool, &w, 1, false).await.unwrap();
    let entry: Uuid = sqlx::query_scalar(
        "WITH e AS (INSERT INTO grading_entries (submission_id, graded_by, raw_score, final_score)
                    VALUES ($1, $2, 80, 80) RETURNING id, submission_id, effective_breakdown),
              current AS (UPDATE submissions s SET final_score = 80
                          FROM e WHERE s.id = e.submission_id)
         SELECT id FROM e",
    )
    .bind(submission)
    .bind(grader)
    .fetch_one(&pool)
    .await
    .unwrap();
    let task: Uuid = sqlx::query_scalar(
        "INSERT INTO file_submissions (activity_id, course_id) VALUES ($1, $2) RETURNING id",
    )
    .bind(w.activity)
    .bind(w.course)
    .fetch_one(&pool)
    .await
    .unwrap();
    let attempt: Uuid = sqlx::query_scalar(
        "INSERT INTO file_submission_attempts (file_submission_id, course_id, user_id)
         VALUES ($1, $2, $3) RETURNING id",
    )
    .bind(task)
    .bind(w.course)
    .bind(w.user)
    .fetch_one(&pool)
    .await
    .unwrap();
    let file_entry: Uuid = sqlx::query_scalar(
        "INSERT INTO file_grading_entries (attempt_id, graded_by, status, raw_score, final_score)
         VALUES ($1, $2, 'graded', 70, 70) RETURNING id",
    )
    .bind(attempt)
    .bind(grader)
    .fetch_one(&pool)
    .await
    .unwrap();

    for reassign in [
        "UPDATE grading_entries SET graded_by = $1",
        "UPDATE file_grading_entries SET graded_by = $1",
    ] {
        let refused = sqlx::query(reassign).bind(w.user).execute(&pool).await;
        assert!(refused.is_err(), "{reassign}");
    }

    sqlx::query("DELETE FROM users WHERE id = $1")
        .bind(grader)
        .execute(&pool)
        .await
        .unwrap();
    let graded_by: Option<Uuid> =
        sqlx::query_scalar("SELECT graded_by FROM grading_entries WHERE id = $1")
            .bind(entry)
            .fetch_one(&pool)
            .await
            .unwrap();
    assert_eq!(graded_by, None);
    let graded_by: Option<Uuid> =
        sqlx::query_scalar("SELECT graded_by FROM file_grading_entries WHERE id = $1")
            .bind(file_entry)
            .fetch_one(&pool)
            .await
            .unwrap();
    assert_eq!(graded_by, None);
}

#[ab_testdb::test]
async fn a_deleted_account_stays_disabled(pool: PgPool) {
    let id = user(&pool, "gone").await;
    let active = sqlx::query("UPDATE users SET deleted_at = now() WHERE id = $1")
        .bind(id)
        .execute(&pool)
        .await;
    assert!(active.is_err(), "deleted_at needs disabled_at");
    let named =
        sqlx::query("UPDATE users SET disabled_at = now(), deleted_at = now() WHERE id = $1")
            .bind(id)
            .execute(&pool)
            .await
            .unwrap_err();
    assert!(
        named.to_string().contains("users_deleted_anonymised_check"),
        "a deleted account keeps no personal field: {named}"
    );
    sqlx::query(
        "UPDATE users SET disabled_at = now(), deleted_at = now(), username = 'deleted-gone',
                          email = 'deleted-gone@deleted.invalid', display_name = ''
         WHERE id = $1",
    )
    .bind(id)
    .execute(&pool)
    .await
    .unwrap();
    let reenabled = sqlx::query("UPDATE users SET disabled_at = NULL WHERE id = $1")
        .bind(id)
        .execute(&pool)
        .await;
    assert!(reenabled.is_err(), "a deleted account is not re-enabled");
}

#[ab_testdb::test]
async fn a_course_update_links_activities_by_key(pool: PgPool) {
    let w = world(&pool).await;
    let update: Uuid = sqlx::query_scalar(
        "INSERT INTO course_updates (course_id, title, content) VALUES ($1, 't', 'c') RETURNING id",
    )
    .bind(w.course)
    .fetch_one(&pool)
    .await
    .unwrap();
    let link = "INSERT INTO course_update_activities (update_id, activity_id, position)
                VALUES ($1, $2, 1)";
    let unknown = sqlx::query(link)
        .bind(update)
        .bind(Uuid::now_v7())
        .execute(&pool)
        .await;
    assert!(unknown.is_err(), "an unknown activity is refused");
    sqlx::query(link)
        .bind(update)
        .bind(w.activity)
        .execute(&pool)
        .await
        .unwrap();
    sqlx::query("DELETE FROM assessments WHERE id = $1")
        .bind(w.assessment)
        .execute(&pool)
        .await
        .unwrap();
    sqlx::query("DELETE FROM activities WHERE id = $1")
        .bind(w.activity)
        .execute(&pool)
        .await
        .unwrap();
    let links: i64 =
        sqlx::query_scalar("SELECT count(*) FROM course_update_activities WHERE update_id = $1")
            .bind(update)
            .fetch_one(&pool)
            .await
            .unwrap();
    assert_eq!(links, 0, "the deleted activity left the update");
    let kept: i64 = sqlx::query_scalar("SELECT count(*) FROM course_updates WHERE id = $1")
        .bind(update)
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(kept, 1, "the update itself stays");
}

#[ab_testdb::test]
async fn course_lists_keep_the_api_bounds(pool: PgPool) {
    let w = world(&pool).await;
    let skipped: i64 = sqlx::query_scalar(
        "SELECT count(*) FROM schema_skipped_checks
          WHERE name IN ('courses_tags_check', 'courses_learnings_check')",
    )
    .fetch_one(&pool)
    .await
    .unwrap();
    assert_eq!(skipped, 0);
    let set = |sql: &'static str| sqlx::query(sql).bind(w.course).execute(&pool);
    set("UPDATE courses SET tags = '{Rust,SQL}',
                learnings = '[{\"id\":\"a\",\"text\":\"T\",\"emoji\":\"x\"},{\"id\":\"b\",\"text\":\"U\"}]'
          WHERE id = $1")
    .await
    .unwrap();
    for refused in [
        "UPDATE courses SET tags = '{Rust,rust}' WHERE id = $1",
        "UPDATE courses SET tags = '{\" padded\"}' WHERE id = $1",
        "UPDATE courses SET tags = '{\"\"}' WHERE id = $1",
        "UPDATE courses SET tags = (SELECT array_agg(g::text) FROM generate_series(1, 21) g) WHERE id = $1",
        "UPDATE courses SET learnings = '[\"raw\"]' WHERE id = $1",
        "UPDATE courses SET learnings = '{}' WHERE id = $1",
        "UPDATE courses SET learnings = '[{\"id\":\"a\",\"text\":\" \"}]' WHERE id = $1",
        "UPDATE courses SET learnings = '[{\"text\":\"no id\"}]' WHERE id = $1",
        "UPDATE courses SET learnings = '[{\"id\":\"a\",\"text\":\"T\",\"emoji\":1}]' WHERE id = $1",
    ] {
        assert!(set(refused).await.is_err(), "{refused}");
    }
}

#[ab_testdb::test]
async fn embeddings_are_half_precision_with_one_index_per_model(pool: PgPool) {
    let w = world(&pool).await;
    for table in ["content_chunks", "ai_work_embeddings"] {
        let ty: String = sqlx::query_scalar(
            "SELECT format_type(atttypid, atttypmod) FROM pg_attribute
              WHERE attrelid = $1::regclass AND attname = 'embedding'",
        )
        .bind(table)
        .fetch_one(&pool)
        .await
        .unwrap();
        assert_eq!(ty, "halfvec(1024)", "{table}");
    }
    // The previous release binds `::vector`: insert and search still work.
    for (ordinal, value) in [(0, "0.1"), (1, "-0.1")] {
        sqlx::query(
            "INSERT INTO content_chunks (course_id, source_type, source_id, ordinal, audience,
                                         published, label, body, token_estimate,
                                         embedding, embedding_model)
             VALUES ($1, 'course', $1, $2, 'learner', true, 'l', 'b', 1,
                     array_fill($3::real, ARRAY[1024])::vector::text::vector, 'hash-ngram-v1')",
        )
        .bind(w.course)
        .bind(ordinal)
        .bind(value.parse::<f32>().unwrap())
        .execute(&pool)
        .await
        .unwrap();
    }
    let probe = format!("[{}]", vec!["0.2"; 1024].join(","));
    let nearest: i32 = sqlx::query_scalar(
        "SELECT ordinal FROM content_chunks
          WHERE course_id = $1 AND embedding_model = 'hash-ngram-v1'
          ORDER BY embedding <=> $2::text::vector LIMIT 1",
    )
    .bind(w.course)
    .bind(&probe)
    .fetch_one(&pool)
    .await
    .unwrap();
    assert_eq!(nearest, 0);

    let mut tx = pool.begin().await.unwrap();
    sqlx::query("SET LOCAL enable_seqscan = off")
        .execute(&mut *tx)
        .await
        .unwrap();
    let plan: Vec<String> = sqlx::query_scalar(sqlx::AssertSqlSafe(format!(
        "EXPLAIN SELECT id FROM content_chunks WHERE embedding_model = 'hash-ngram-v1'
          ORDER BY embedding <=> '{probe}'::halfvec LIMIT 5"
    )))
    .fetch_all(&mut *tx)
    .await
    .unwrap();
    let plan = plan.join("\n");
    assert!(plan.contains("content_chunks_embedding_hash_idx"), "{plan}");
}

#[ab_testdb::test]
async fn course_search_walks_the_trigram_index(pool: PgPool) {
    let creator = user(&pool, "author").await;
    sqlx::query(
        "INSERT INTO courses (name, description, creator_id, public)
         SELECT 'Course ' || md5(g::text) || ' базы данных', 'about ' || md5((g * 7)::text), $1, true
           FROM generate_series(1, 10000) g",
    )
    .bind(creator)
    .execute(&pool)
    .await
    .unwrap();
    sqlx::query("ANALYZE courses").execute(&pool).await.unwrap();
    let plan = ab_db::search::explain_search_courses(&pool, "a1b2c3")
        .await
        .unwrap();
    assert!(
        plan.contains("Bitmap Index Scan on courses_search_trgm_idx"),
        "{plan}"
    );
}

/// Item 35 (rest): the `q` filter of the course and collection listings uses `/search`'s terms,
/// so the trigram index answers it too (first page, newest first, anonymous viewer).
#[ab_testdb::test]
async fn listing_filters_walk_the_trigram_indexes(pool: PgPool) {
    let creator = user(&pool, "author").await;
    sqlx::query(
        "INSERT INTO courses (name, description, creator_id, public)
         SELECT 'Course ' || md5(g::text) || ' базы данных', 'about ' || md5((g * 7)::text), $1, true
           FROM generate_series(1, 10000) g",
    )
    .bind(creator)
    .execute(&pool)
    .await
    .unwrap();
    sqlx::query(
        "INSERT INTO collections (name, description, creator_id, public)
         SELECT 'Collection ' || md5(g::text), 'about ' || md5((g * 7)::text), $1, true
           FROM generate_series(1, 10000) g",
    )
    .bind(creator)
    .execute(&pool)
    .await
    .unwrap();
    sqlx::query("ANALYZE courses").execute(&pool).await.unwrap();
    sqlx::query("ANALYZE collections")
        .execute(&pool)
        .await
        .unwrap();
    for sort in ["", "name"] {
        let filter = ab_db::catalog::CourseFilter {
            q: Some("a1b2c3"),
            sort,
            ..ab_db::catalog::CourseFilter::default()
        };
        let plan = ab_db::catalog::explain_list_courses(&pool, &filter)
            .await
            .unwrap();
        assert!(
            plan.contains("Bitmap Index Scan on courses_search_trgm_idx"),
            "{sort}: {plan}"
        );
        let filter = ab_db::collections::CollectionFilter {
            q: Some("a1b2c3"),
            sort,
        };
        let plan = ab_db::collections::explain_list_collections(&pool, &filter)
            .await
            .unwrap();
        assert!(
            plan.contains("Bitmap Index Scan on collections_search_trgm_idx"),
            "{sort}: {plan}"
        );
    }
}

#[ab_testdb::test]
async fn staff_writes_reach_both_rosters_until_the_contract(pool: PgPool) {
    let w = world(&pool).await;
    let helper = user(&pool, "helper").await;
    let staff = |table: &'static str| {
        let pool = pool.clone();
        async move {
            let sql = format!(
                "SELECT authorship || '/' || status || '/' || version FROM {table}
                  WHERE course_id = $1 AND user_id = $2"
            );
            // SAFETY: `table` is one of the two literal table names below.
            sqlx::query_scalar::<_, String>(sqlx::AssertSqlSafe(sql))
                .bind(w.course)
                .bind(helper)
                .fetch_optional(&pool)
                .await
                .unwrap()
        }
    };
    // The previous release adds and edits through resource_authors.
    sqlx::query(
        "INSERT INTO resource_authors (course_id, user_id, authorship, status)
         VALUES ($1, $2, 'contributor', 'pending')",
    )
    .bind(w.course)
    .bind(helper)
    .execute(&pool)
    .await
    .unwrap();
    assert_eq!(
        staff("course_staff").await.as_deref(),
        Some("contributor/pending/1")
    );
    sqlx::query("UPDATE resource_authors SET status = 'active' WHERE user_id = $1")
        .bind(helper)
        .execute(&pool)
        .await
        .unwrap();
    assert_eq!(
        staff("course_staff").await.as_deref(),
        Some("contributor/active/2")
    );
    // This release writes course_staff; the old table follows, versions equal.
    sqlx::query("UPDATE course_staff SET authorship = 'maintainer' WHERE user_id = $1")
        .bind(helper)
        .execute(&pool)
        .await
        .unwrap();
    assert_eq!(
        staff("course_staff").await.as_deref(),
        Some("maintainer/active/3")
    );
    assert_eq!(
        staff("resource_authors").await.as_deref(),
        Some("maintainer/active/3")
    );
    sqlx::query("DELETE FROM course_staff WHERE user_id = $1")
        .bind(helper)
        .execute(&pool)
        .await
        .unwrap();
    assert_eq!(staff("resource_authors").await, None);
    // A course's staff go with it.
    sqlx::query(
        "INSERT INTO course_staff (course_id, user_id, authorship) VALUES ($1, $2, 'reporter')",
    )
    .bind(w.course)
    .bind(helper)
    .execute(&pool)
    .await
    .unwrap();
    assert_eq!(
        staff("resource_authors").await.as_deref(),
        Some("reporter/active/1")
    );
    let twice = sqlx::query(
        "INSERT INTO course_staff (course_id, user_id, authorship) VALUES ($1, $2, 'reporter')",
    )
    .bind(w.course)
    .bind(helper)
    .execute(&pool)
    .await;
    assert!(twice.is_err(), "one row per (course, user)");
}

#[ab_testdb::test]
async fn the_reaper_keeps_referenced_files_whatever_the_counter_says(pool: PgPool) {
    let w = world(&pool).await;
    let upload = |purpose: &'static str, key: &'static str| {
        let pool = pool.clone();
        async move {
            sqlx::query_scalar::<_, Uuid>(
                "INSERT INTO uploads (created_by, purpose, bucket, key, mime, size_bytes, status)
                 VALUES ($1, $2, 'public', $3, 'image/png', 1, 'finalized') RETURNING id",
            )
            .bind(w.user)
            .bind(purpose)
            .bind(key)
            .fetch_one(&pool)
            .await
            .unwrap()
        }
    };
    let avatar = upload("avatar", "k/avatar").await;
    let thumb = upload("course-thumbnail", "k/thumb").await;
    // Named only by key below: the reaper must keep them too.
    upload("course-thumbnail", "k/chapter").await;
    upload("collection-cover", "k/cover").await;
    upload("platform-logo", "k/logo").await;
    let media = upload("block-image", "k/block").await;
    let image = upload(
        "discussion-image",
        "discussion-image/0123456789abcdef0123456789abcdef",
    )
    .await;
    let orphan = upload("block-image", "k/orphan").await;
    for sql in [
        "UPDATE users SET avatar_key = 'k/avatar' WHERE id = $1",
        "UPDATE courses SET thumbnail_image_key = 'k/thumb' WHERE id = $2",
        "UPDATE chapters SET thumbnail_key = 'k/chapter' WHERE course_id = $2",
        "INSERT INTO collections (name, creator_id, cover_key) VALUES ('col', $1, 'k/cover')",
        "UPDATE platforms SET logo_key = 'k/logo'",
        "INSERT INTO blocks (activity_id, block_type, content)
         VALUES ($3, 'image', '{\"file_key\": \"k/block\"}')",
        "INSERT INTO course_discussions (course_id, user_id, content)
         VALUES ($2, $1, '{\"type\":\"doc\",\"content\":[{\"type\":\"image\",\"attrs\":
                 {\"src\":\"/content/discussion-image/0123456789abcdef0123456789abcdef\"}}]}')",
    ] {
        sqlx::query(sql)
            .bind(w.user)
            .bind(w.course)
            .bind(w.activity)
            .execute(&pool)
            .await
            .unwrap();
    }
    let ids: (Option<Uuid>, Option<Uuid>, Option<Uuid>, Option<Uuid>) = sqlx::query_as(
        "SELECT (SELECT avatar_upload_id FROM users WHERE id = $1),
                (SELECT thumbnail_image_upload_id FROM courses WHERE id = $2),
                (SELECT upload_id FROM block_uploads),
                (SELECT upload_id FROM post_uploads)",
    )
    .bind(w.user)
    .bind(w.course)
    .fetch_one(&pool)
    .await
    .unwrap();
    assert_eq!(ids, (Some(avatar), Some(thumb), Some(media), Some(image)));

    // Every counter drifted to 0 with the reaper clock run out.
    sqlx::query("UPDATE uploads SET referenced_count = 0, expires_at = now() - interval '1 hour'")
        .execute(&pool)
        .await
        .unwrap();
    let reaped: Vec<Uuid> = ab_db::uploads::expired(&pool, 100)
        .await
        .unwrap()
        .into_iter()
        .map(|u| u.id)
        .collect();
    assert_eq!(reaped, vec![orphan]);

    // A replaced key releases the old upload to the reaper, and so does a
    // block that left its page (unclaimed) or a post that stopped showing it.
    sqlx::query("UPDATE blocks SET content = '{}'")
        .execute(&pool)
        .await
        .unwrap();
    sqlx::query("UPDATE course_discussions SET content = 'no image'")
        .execute(&pool)
        .await
        .unwrap();
    let mut reaped: Vec<Uuid> = ab_db::uploads::expired(&pool, 100)
        .await
        .unwrap()
        .into_iter()
        .map(|u| u.id)
        .collect();
    reaped.sort();
    let mut expected = vec![orphan, media, image];
    expected.sort();
    assert_eq!(reaped, expected);

    let block = upload("block-image", "k/unclaimed").await;
    sqlx::query(
        "INSERT INTO blocks (activity_id, block_type, content, claimed)
         VALUES ($1, 'image', '{\"file_key\": \"k/unclaimed\"}', false)",
    )
    .bind(w.activity)
    .execute(&pool)
    .await
    .unwrap();
    sqlx::query("UPDATE uploads SET expires_at = now() - interval '1 hour' WHERE id = $1")
        .bind(block)
        .execute(&pool)
        .await
        .unwrap();
    let held = |id: Uuid| {
        let pool = pool.clone();
        async move {
            sqlx::query_scalar::<_, bool>("SELECT upload_referenced($1)")
                .bind(id)
                .fetch_one(&pool)
                .await
                .unwrap()
        }
    };
    assert!(!held(block).await, "an unclaimed block holds nothing");
    sqlx::query("UPDATE blocks SET claimed = true WHERE content->>'file_key' = 'k/unclaimed'")
        .execute(&pool)
        .await
        .unwrap();
    assert!(
        held(block).await,
        "a re-claimed block holds its upload again"
    );
}

/// Item 18, rollback: the previous release moves `referenced_count` by hand
/// and starts the clock when it reaches 0. Its counts miss this release's
/// claims, so it may reach 0 while a row still names the file: the guard
/// keeps that file off the clock, and an unreferenced one still goes.
#[ab_testdb::test]
async fn the_previous_release_cannot_start_the_clock_of_a_referenced_upload(pool: PgPool) {
    let w = world(&pool).await;
    let mut ids = Vec::new();
    for key in ["k/held", "k/free"] {
        ids.push(
            sqlx::query_scalar::<_, Uuid>(
                "INSERT INTO uploads (created_by, purpose, bucket, key, mime, size_bytes, status,
                                      referenced_count, expires_at)
                 VALUES ($1, 'course-thumbnail', 'public', $2, 'image/png', 1, 'finalized', 1, NULL)
                 RETURNING id",
            )
            .bind(w.user)
            .bind(key)
            .fetch_one(&pool)
            .await
            .unwrap(),
        );
    }
    sqlx::query("UPDATE courses SET thumbnail_image_key = 'k/held' WHERE id = $1")
        .bind(w.course)
        .execute(&pool)
        .await
        .unwrap();
    // The previous release's release_reference, verbatim.
    sqlx::query(
        "UPDATE uploads
         SET referenced_count = referenced_count - 1,
             expires_at = CASE WHEN referenced_count - 1 = 0
                               THEN now() + make_interval(secs => 60)
                               ELSE expires_at END
         WHERE id = ANY($1) AND referenced_count > 0",
    )
    .bind(&ids)
    .execute(&pool)
    .await
    .unwrap();
    let clocks: Vec<bool> = sqlx::query_scalar(
        "SELECT expires_at IS NOT NULL FROM uploads WHERE id = ANY($1) ORDER BY key",
    )
    .bind(&ids)
    .fetch_all(&pool)
    .await
    .unwrap();
    assert_eq!(clocks, vec![true, false], "k/free released, k/held kept");
}

/// Review 3, item 24, as the release review left it: a check that old rows
/// violate is not added (kept NOT VALID it would refuse every later UPDATE of
/// those rows, a backfill's included), is recorded, and is added once the rows
/// are repaired and the check is tried again. A check already on the table is
/// validated, not added twice.
#[ab_testdb::test]
async fn a_violated_check_is_skipped_until_repaired(pool: PgPool) {
    sqlx::query("CREATE TABLE try_check_probe (n int NOT NULL, note text)")
        .execute(&pool)
        .await
        .unwrap();
    sqlx::query("INSERT INTO try_check_probe VALUES (1, NULL), (-1, NULL)")
        .execute(&pool)
        .await
        .unwrap();
    let try_check =
        "SELECT schema_try_check('try_check_probe', 'try_check_probe_n_check', 'n >= 0')";
    let on_table = || async {
        sqlx::query_scalar::<_, bool>(
            "SELECT convalidated FROM pg_constraint WHERE conname = 'try_check_probe_n_check'",
        )
        .fetch_optional(&pool)
        .await
        .unwrap()
    };
    let recorded = || async {
        sqlx::query_scalar::<_, i64>(
            "SELECT count(*) FROM schema_skipped_checks WHERE name = 'try_check_probe_n_check'",
        )
        .fetch_one(&pool)
        .await
        .unwrap()
    };
    let added: bool = sqlx::query_scalar(try_check)
        .fetch_one(&pool)
        .await
        .unwrap();
    assert!(!added);
    assert_eq!(
        on_table().await,
        None,
        "the violated check is dropped again"
    );
    assert_eq!(recorded().await, 1);
    sqlx::query("UPDATE try_check_probe SET note = 'edited'")
        .execute(&pool)
        .await
        .expect("an old violating row stays editable");

    sqlx::query("UPDATE try_check_probe SET n = 0 WHERE n < 0")
        .execute(&pool)
        .await
        .unwrap();
    for _ in 0..2 {
        let added: bool = sqlx::query_scalar(try_check)
            .fetch_one(&pool)
            .await
            .unwrap();
        assert!(
            added,
            "the repaired table takes the check, and keeps it on a second try"
        );
    }
    assert_eq!(on_table().await, Some(true));
    assert_eq!(recorded().await, 0);
    let refused = sqlx::query("INSERT INTO try_check_probe VALUES (-2, NULL)")
        .execute(&pool)
        .await;
    assert!(refused.is_err(), "a new violating row is refused");
}

/// Review 3, item 20: until the file-task pipeline merges into submissions,
/// every table keyed onto both a submission and a file attempt names exactly
/// one of them (a validated CHECK over both columns). A new arc table fails
/// here until it gets one.
#[ab_testdb::test]
async fn every_submission_or_file_attempt_arc_names_exactly_one(pool: PgPool) {
    let arcs: Vec<(String, String, String, bool)> = sqlx::query_as(
        "SELECT s.conrelid::regclass::text, sa.attname::text, fa.attname::text,
                EXISTS (SELECT 1 FROM pg_constraint c
                         WHERE c.conrelid = s.conrelid AND c.contype = 'c' AND c.convalidated
                           AND c.conkey @> ARRAY[s.conkey[1], f.conkey[1]]
                           AND cardinality(c.conkey) = 2
                           AND pg_get_constraintdef(c.oid) ~ '(num_nonnulls\\(.*\\) = 1|IS NULL\\) <> \\()')
           FROM pg_constraint s
           JOIN pg_constraint f ON f.conrelid = s.conrelid AND f.contype = 'f'
                               AND f.confrelid = 'file_submission_attempts'::regclass
           JOIN pg_attribute sa ON sa.attrelid = s.conrelid AND sa.attnum = s.conkey[1]
           JOIN pg_attribute fa ON fa.attrelid = f.conrelid AND fa.attnum = f.conkey[1]
          WHERE s.contype = 'f' AND s.confrelid = 'submissions'::regclass
          ORDER BY 1",
    )
    .fetch_all(&pool)
    .await
    .unwrap();
    let tables: Vec<&str> = arcs.iter().map(|(t, ..)| t.as_str()).collect();
    assert_eq!(
        tables,
        [
            "ai_grade_drafts",
            "ai_remediation_sessions",
            "ai_submission_analyses"
        ],
        "the arc tables changed: update this list (and the check)"
    );
    let unchecked: Vec<String> = arcs
        .iter()
        .filter(|(.., checked)| !checked)
        .map(|(t, s, f, _)| format!("{t}({s}, {f})"))
        .collect();
    assert!(
        unchecked.is_empty(),
        "arc without a CHECK num_nonnulls(..) = 1: {unchecked:?}"
    );
}

/// Review 3, item 23: a parent's course never changes under its children:
/// every composite `(parent_id, course_id)` key is ON UPDATE RESTRICT (or NO
/// ACTION, which refuses too), so moving a chapter (or activity, assessment,
/// post) to another course is refused instead of silently carrying learner
/// work along.
#[ab_testdb::test]
async fn a_parent_cannot_change_course_under_its_children(pool: PgPool) {
    let cascading: Vec<String> = sqlx::query_scalar(
        "SELECT conname::text FROM pg_constraint c
          WHERE c.contype = 'f' AND cardinality(c.conkey) > 1 AND c.confupdtype NOT IN ('r', 'a')
            AND EXISTS (SELECT 1 FROM pg_attribute a WHERE a.attrelid = c.conrelid
                         AND a.attnum = ANY (c.conkey) AND a.attname = 'course_id')
          ORDER BY 1",
    )
    .fetch_all(&pool)
    .await
    .unwrap();
    assert!(
        cascading.is_empty(),
        "course-scoped keys that follow an update: {cascading:?}"
    );

    let w = world(&pool).await;
    let other: Uuid =
        sqlx::query_scalar("INSERT INTO courses (name) VALUES ('other') RETURNING id")
            .fetch_one(&pool)
            .await
            .unwrap();
    for parent in [
        "UPDATE chapters SET course_id = $1 WHERE id = (SELECT chapter_id FROM activities WHERE id = $2)",
        "UPDATE activities SET course_id = $1 WHERE id = $2",
    ] {
        let moved = sqlx::query(parent)
            .bind(other)
            .bind(w.activity)
            .execute(&pool)
            .await;
        assert!(moved.is_err(), "{parent}");
    }
    let course: Uuid = sqlx::query_scalar("SELECT course_id FROM assessments WHERE id = $1")
        .bind(w.assessment)
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(course, w.course);
}

/// Review 3, item 26: switched-off kinds are rows; until the contract
/// migration a write to either the rows (this release) or the old
/// `notification_preferences.disabled` array (the previous one) shows up on
/// the other side.
#[ab_testdb::test]
async fn notification_opt_outs_mirror_the_old_array(pool: PgPool) {
    use ab_core::id::UserId;
    let w = world(&pool).await;
    let user = UserId(w.user);
    ab_db::notifications::set_disabled_types(
        &pool,
        user,
        &[
            NotificationType::CourseUpdate,
            NotificationType::DiscussionReply,
        ],
    )
    .await
    .unwrap();
    let kinds = ab_db::notifications::disabled_types(&pool, user)
        .await
        .unwrap();
    assert_eq!(kinds.len(), 2);
    ab_db::notifications::set_disabled_types(&pool, user, &[NotificationType::DiscussionReply])
        .await
        .unwrap();
    assert_eq!(
        ab_db::notifications::disabled_types(&pool, user)
            .await
            .unwrap(),
        vec![NotificationType::DiscussionReply]
    );

    let old_table: Option<String> =
        sqlx::query_scalar("SELECT to_regclass('notification_preferences')::text")
            .fetch_one(&pool)
            .await
            .unwrap();
    if old_table.is_none() {
        return; // contracted: nothing left to mirror
    }
    let array: Vec<String> =
        sqlx::query_scalar("SELECT disabled FROM notification_preferences WHERE user_id = $1")
            .bind(w.user)
            .fetch_one(&pool)
            .await
            .unwrap();
    assert_eq!(
        array,
        ["discussion_reply"],
        "the previous release reads the array"
    );
    // The previous release writes the array: the rows follow.
    sqlx::query(
        "UPDATE notification_preferences SET disabled = '{course_update}' WHERE user_id = $1",
    )
    .bind(w.user)
    .execute(&pool)
    .await
    .unwrap();
    assert_eq!(
        ab_db::notifications::disabled_types(&pool, user)
            .await
            .unwrap(),
        vec![NotificationType::CourseUpdate]
    );
    // A user without learning records still goes, opt-outs and all.
    let gone = user_with_opt_out(&pool).await;
    sqlx::query("DELETE FROM users WHERE id = $1")
        .bind(gone)
        .execute(&pool)
        .await
        .unwrap();
}

async fn user_with_opt_out(pool: &PgPool) -> uuid::Uuid {
    let id = user(pool, "quiet").await;
    ab_db::notifications::set_disabled_types(
        pool,
        ab_core::id::UserId(id),
        &[NotificationType::CourseUpdate],
    )
    .await
    .unwrap();
    id
}

#[ab_testdb::test]
async fn the_platform_day_is_almatys(pool: PgPool) {
    use ab_core::time::Day;
    let (before, after, start): (String, String, String) = sqlx::query_as(
        "SELECT platform_date('2026-11-01 18:59:59Z')::text,
                platform_date('2026-11-01 19:00:00Z')::text,
                to_char(platform_day_start('2026-11-02') AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI')",
    )
    .fetch_one(&pool)
    .await
    .unwrap();
    assert_eq!(
        (before.as_str(), after.as_str()),
        ("2026-11-01", "2026-11-02")
    );
    assert_eq!(start, "2026-11-01 19:00");
    // A day binds as Postgres `date` (binary on the wire).
    let day: Day = "2024-02-29".parse().unwrap();
    let text: String = sqlx::query_scalar("SELECT $1::date::text")
        .bind(day)
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(text, "2024-02-29");

    // The zone is the session's `ab.time_zone`, which the pool sets from the
    // config (the default here); without it SQL keeps Asia/Almaty.
    let mut conn = pool.acquire().await.unwrap();
    let zone: String = sqlx::query_scalar("SELECT current_setting('ab.time_zone')")
        .fetch_one(&mut *conn)
        .await
        .unwrap();
    assert_eq!(zone, "Asia/Almaty");
    let at_utc_evening = "SELECT platform_date('2026-11-01 20:00:00Z')::text";
    for (setting, date) in [("UTC", "2026-11-01"), ("", "2026-11-02")] {
        sqlx::query("SELECT set_config('ab.time_zone', $1, false)")
            .bind(setting)
            .execute(&mut *conn)
            .await
            .unwrap();
        let got: String = sqlx::query_scalar(at_utc_evening)
            .fetch_one(&mut *conn)
            .await
            .unwrap();
        assert_eq!(got, date, "ab.time_zone = {setting:?}");
    }
    // The connection goes back to the pool with a changed zone: close it.
    conn.close().await.unwrap();
}

#[ab_testdb::test]
async fn trail_runs_of_the_previous_release_mirror_into_enrolments(pool: PgPool) {
    let w = world(&pool).await;
    let trail: Uuid = sqlx::query_scalar("INSERT INTO trails (user_id) VALUES ($1) RETURNING id")
        .bind(w.user)
        .fetch_one(&pool)
        .await
        .unwrap();
    sqlx::query("INSERT INTO trail_runs (trail_id, course_id, user_id) VALUES ($1, $2, $3)")
        .bind(trail)
        .bind(w.course)
        .bind(w.user)
        .execute(&pool)
        .await
        .unwrap();
    let enrolled = || async {
        sqlx::query_scalar::<_, i64>(
            "SELECT count(*) FROM enrolments WHERE course_id = $1 AND user_id = $2",
        )
        .bind(w.course)
        .bind(w.user)
        .fetch_one(&pool)
        .await
        .unwrap()
    };
    assert_eq!(enrolled().await, 1);
    sqlx::query("DELETE FROM trail_runs WHERE trail_id = $1")
        .bind(trail)
        .execute(&pool)
        .await
        .unwrap();
    assert_eq!(enrolled().await, 0);
}

#[ab_testdb::test]
async fn course_progress_derives_percent_and_eligibility(pool: PgPool) {
    let w = world(&pool).await;
    let derived = || async {
        sqlx::query_as::<_, (f64, bool)>(
            "SELECT progress_pct, certificate_eligible FROM course_progress
             WHERE course_id = $1 AND user_id = $2",
        )
        .bind(w.course)
        .bind(w.user)
        .fetch_one(&pool)
        .await
        .unwrap()
    };
    sqlx::query(
        "INSERT INTO course_progress (course_id, user_id, completed_required_count,
                                      total_required_count)
         VALUES ($1, $2, 1, 32)",
    )
    .bind(w.course)
    .bind(w.user)
    .execute(&pool)
    .await
    .unwrap();
    // 3.125 rounds away from zero, as the projector's round2.
    assert_eq!(derived().await, (3.13, false));
    let set = |sql: &'static str| {
        let pool = pool.clone();
        async move {
            sqlx::query(sql)
                .bind(w.course)
                .bind(w.user)
                .execute(&pool)
                .await
        }
    };
    // All done but no completion stamp (a leaver): not eligible.
    set("UPDATE course_progress SET completed_required_count = 32
         WHERE course_id = $1 AND user_id = $2")
    .await
    .unwrap();
    assert_eq!(derived().await, (100.0, false));
    set("UPDATE course_progress SET completed_at = now() WHERE course_id = $1 AND user_id = $2")
        .await
        .unwrap();
    assert_eq!(derived().await, (100.0, true));
    // More done than required, or a completion before the end, is refused.
    let over = set("UPDATE course_progress SET completed_required_count = 33
                    WHERE course_id = $1 AND user_id = $2")
    .await;
    assert!(over.is_err(), "completed <= total");
    let early = set("UPDATE course_progress SET completed_required_count = 31
                     WHERE course_id = $1 AND user_id = $2")
    .await;
    assert!(early.is_err(), "completed_at only on a completed course");

    // The previous release's leaver write clears the stamp: the course stays not completed.
    set(
        "UPDATE course_progress SET completed_at = NULL, certificate_eligible = false
         WHERE course_id = $1 AND user_id = $2",
    )
    .await
    .unwrap();
    assert_eq!(derived().await, (100.0, false));
    // Its member write of a course done by state alone (no stamp, the flag set): the stamp is the
    // last activity, as the new projector's.
    set(
        "UPDATE course_progress SET certificate_eligible = true, last_activity_at = '2026-10-01Z'
         WHERE course_id = $1 AND user_id = $2",
    )
    .await
    .unwrap();
    assert_eq!(derived().await, (100.0, true));
    let stamped: bool = sqlx::query_scalar(
        "SELECT completed_at = '2026-10-01Z' FROM course_progress WHERE course_id = $1 AND user_id = $2",
    )
    .bind(w.course)
    .bind(w.user)
    .fetch_one(&pool)
    .await
    .unwrap();
    assert!(stamped);
}

#[ab_testdb::test]
async fn projections_and_rollups_are_keyed_by_what_they_describe(pool: PgPool) {
    let keys: Vec<(String, String)> = sqlx::query_as(
        "SELECT c.conrelid::regclass::text,
                string_agg(a.attname, ',' ORDER BY k.ord)
         FROM pg_constraint c
         CROSS JOIN LATERAL unnest(c.conkey) WITH ORDINALITY k(attnum, ord)
         JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = k.attnum
         WHERE c.contype = 'p'
           AND c.conrelid::regclass::text IN ('activity_progress', 'course_progress',
               'gamification_profiles', 'daily_course_metrics', 'daily_course_engagement',
               'daily_assessment_metrics', 'daily_user_course_progress', 'learner_risk_snapshots')
         GROUP BY 1 ORDER BY 1",
    )
    .fetch_all(&pool)
    .await
    .unwrap();
    let keys: Vec<(&str, &str)> = keys.iter().map(|(t, k)| (t.as_str(), k.as_str())).collect();
    assert_eq!(
        keys,
        [
            ("activity_progress", "activity_id,user_id"),
            ("course_progress", "course_id,user_id"),
            ("daily_assessment_metrics", "metric_date,assessment_id"),
            ("daily_course_engagement", "metric_date,activity_id"),
            ("daily_course_metrics", "metric_date,course_id"),
            (
                "daily_user_course_progress",
                "metric_date,user_id,course_id"
            ),
            ("gamification_profiles", "user_id"),
            ("learner_risk_snapshots", "snapshot_date,user_id,course_id"),
        ]
    );
}

#[ab_testdb::test]
async fn the_event_prune_keeps_400_days(pool: PgPool) {
    sqlx::query(
        "INSERT INTO analytics_events (event_type, occurred_at)
         VALUES ('login', now() - interval '401 days'), ('login', now() - interval '399 days'),
                ('login', now())",
    )
    .execute(&pool)
    .await
    .unwrap();
    let pruned = ab_db::analytics::prune_retention(&pool).await.unwrap();
    assert_eq!(pruned.events + pruned.event_partitions, 1, "{pruned:?}");
    let left: i64 = sqlx::query_scalar("SELECT count(*) FROM analytics_events")
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(left, 2);
}

#[ab_testdb::test]
async fn completions_mirror_the_previous_releases_projection(pool: PgPool) {
    let w = world(&pool).await;
    let completions = || async {
        sqlx::query_scalar::<_, i64>(
            "SELECT count(*) FROM completions WHERE activity_id = $1 AND user_id = $2",
        )
        .bind(w.activity)
        .bind(w.user)
        .fetch_one(&pool)
        .await
        .unwrap()
    };
    let write = |sql: &'static str| {
        let pool = pool.clone();
        async move {
            sqlx::query(sql)
                .bind(w.course)
                .bind(w.activity)
                .bind(w.user)
                .execute(&pool)
                .await
                .unwrap();
        }
    };
    write(
        "INSERT INTO activity_progress (course_id, activity_id, user_id, state)
         VALUES ($1, $2, $3, 'submitted')",
    )
    .await;
    assert_eq!(completions().await, 0);
    // A passing grade released: the old binary sets completed_at.
    write(
        "UPDATE activity_progress SET state = 'completed', completed_at = now()
         WHERE course_id = $1 AND activity_id = $2 AND user_id = $3",
    )
    .await;
    assert_eq!(completions().await, 1);
    // A regrade below the pass mark clears it again.
    write(
        "UPDATE activity_progress SET state = 'failed', completed_at = NULL
         WHERE course_id = $1 AND activity_id = $2 AND user_id = $3",
    )
    .await;
    assert_eq!(completions().await, 0);
}

#[ab_testdb::test]
async fn a_code_run_case_keeps_its_verdict_and_the_legacy_code_in_step(pool: PgPool) {
    let w = world(&pool).await;
    let item: Uuid = sqlx::query_scalar(
        "INSERT INTO assessment_items (assessment_id, kind, position, body)
         VALUES ($1, 'code', 1, '{\"kind\": \"code\"}') RETURNING id",
    )
    .bind(w.assessment)
    .fetch_one(&pool)
    .await
    .unwrap();
    let run: Uuid = sqlx::query_scalar(
        "INSERT INTO code_runs (assessment_id, item_id, user_id, purpose, status, language_id,
                                source_sha256)
         VALUES ($1, $2, $3, 'visible', 'runtime_error', 71, 'x') RETURNING id",
    )
    .bind(w.assessment)
    .bind(item)
    .bind(w.user)
    .fetch_one(&pool)
    .await
    .unwrap();
    // The previous release writes Judge0's code, this one the verdict.
    sqlx::query(
        "INSERT INTO code_run_cases (run_id, position, test_id, status_id, status_description)
         VALUES ($1, 1, 'old', 7, 'Runtime Error (SIGSEGV)'),
                ($1, 2, 'old-mle', 12, 'Memory Limit Exceeded'),
                ($1, 3, 'old-none', NULL, '')",
    )
    .bind(run)
    .execute(&pool)
    .await
    .unwrap();
    sqlx::query(
        "INSERT INTO code_run_cases (run_id, position, test_id, verdict, status_description)
         VALUES ($1, 4, 'new', 'output_limit', 'Output Limit Exceeded')",
    )
    .bind(run)
    .execute(&pool)
    .await
    .unwrap();
    let rows: Vec<(String, String, Option<i32>)> = sqlx::query_as(
        "SELECT test_id, verdict, status_id FROM code_run_cases WHERE run_id = $1 ORDER BY position",
    )
    .bind(run)
    .fetch_all(&pool)
    .await
    .unwrap();
    let rows: Vec<(&str, &str, Option<i32>)> = rows
        .iter()
        .map(|(t, v, s)| (t.as_str(), v.as_str(), *s))
        .collect();
    assert_eq!(
        rows,
        [
            ("old", "runtime_error", Some(7)),
            ("old-mle", "memory_limit", Some(12)),
            ("old-none", "wrong_answer", Some(4)),
            ("new", "output_limit", Some(8)),
        ]
    );
    let unknown = sqlx::query(
        "INSERT INTO code_run_cases (run_id, position, test_id, verdict) VALUES ($1, 5, 'x', 'ok')",
    )
    .bind(run)
    .execute(&pool)
    .await;
    assert!(unknown.is_err(), "verdicts are a closed list");
}

#[ab_testdb::test]
async fn a_handed_in_attempt_keeps_its_snapshots(pool: PgPool) {
    let w = world(&pool).await;
    let draft: Uuid = sqlx::query_scalar(
        "INSERT INTO submissions (assessment_id, course_id, user_id, attempt_number)
         VALUES ($1, $2, $3, 1) RETURNING id",
    )
    .bind(w.assessment)
    .bind(w.course)
    .bind(w.user)
    .fetch_one(&pool)
    .await
    .unwrap();
    let hand_in = "UPDATE submissions SET status = 'submitted', submitted_at = now() WHERE id = $1";

    // Without snapshots the hand-in fails at commit.
    let mut tx = pool.begin().await.unwrap();
    sqlx::query(hand_in)
        .bind(draft)
        .execute(&mut *tx)
        .await
        .unwrap();
    assert!(tx.commit().await.is_err(), "handed in without snapshots");

    // The previous release's order: hand in, then write the snapshots.
    let mut tx = pool.begin().await.unwrap();
    sqlx::query(hand_in)
        .bind(draft)
        .execute(&mut *tx)
        .await
        .unwrap();
    sqlx::query(
        "UPDATE submissions SET items_snapshot = '{\"items\": []}', policy_snapshot = '{}'
         WHERE id = $1",
    )
    .bind(draft)
    .execute(&mut *tx)
    .await
    .unwrap();
    tx.commit().await.unwrap();

    for rewrite in [
        "UPDATE submissions SET items_snapshot = '{}' WHERE id = $1",
        "UPDATE submissions SET policy_snapshot = '{\"passing_score\": 0}' WHERE id = $1",
        "UPDATE submissions SET policy_snapshot = NULL WHERE id = $1",
    ] {
        let refused = sqlx::query(rewrite).bind(draft).execute(&pool).await;
        assert!(refused.is_err(), "{rewrite}");
    }
    // Grading the attempt still works.
    sqlx::query("UPDATE submissions SET status = 'graded', final_score = 50 WHERE id = $1")
        .bind(draft)
        .execute(&pool)
        .await
        .unwrap();
    let not_object = sqlx::query(
        "INSERT INTO submissions (assessment_id, course_id, user_id, attempt_number, items_snapshot)
         VALUES ($1, $2, $3, 2, '[]')",
    )
    .bind(w.assessment)
    .bind(w.course)
    .bind(w.user)
    .execute(&pool)
    .await;
    assert!(not_object.is_err(), "a snapshot is an object");
}

#[ab_testdb::test]
async fn the_current_grade_is_the_latest_journal_entry(pool: PgPool) {
    let w = world(&pool).await;
    let sub = submission(&pool, &w, 1, false).await.unwrap();
    // No entry yet: the current value is free (a hand-in awaiting review).
    sqlx::query("UPDATE submissions SET final_score = 40 WHERE id = $1")
        .bind(sub)
        .execute(&pool)
        .await
        .unwrap();
    let entry =
        "INSERT INTO grading_entries (submission_id, raw_score, final_score, effective_breakdown)
                 VALUES ($1, 80, $2, '{\"feedback\": \"ok\"}')";
    let refused = sqlx::query(entry).bind(sub).bind(80.0).execute(&pool).await;
    assert!(
        refused.is_err(),
        "a journal entry the submission does not show"
    );

    let mut tx = pool.begin().await.unwrap();
    sqlx::query(entry)
        .bind(sub)
        .bind(80.0)
        .execute(&mut *tx)
        .await
        .unwrap();
    sqlx::query("UPDATE submissions SET final_score = 80 WHERE id = $1")
        .bind(sub)
        .execute(&mut *tx)
        .await
        .unwrap();
    tx.commit().await.unwrap();

    let refused = sqlx::query("UPDATE submissions SET final_score = 90 WHERE id = $1")
        .bind(sub)
        .execute(&pool)
        .await;
    assert!(refused.is_err(), "a score the journal does not hold");
    // The breakdown is read from the journal (item 8, rest).
    let breakdown: serde_json::Value = sqlx::query_scalar(
        "SELECT submission_breakdown(id, auto_breakdown) FROM submissions WHERE id = $1",
    )
    .bind(sub)
    .fetch_one(&pool)
    .await
    .unwrap();
    assert_eq!(breakdown, serde_json::json!({ "feedback": "ok" }));
}

#[ab_testdb::test]
async fn an_assessment_is_named_and_typed_by_its_activity(pool: PgPool) {
    let w = world(&pool).await;
    let id = ab_core::id::AssessmentId(w.assessment);
    let row = ab_db::assessments::get_assessment(&pool, id)
        .await
        .unwrap()
        .unwrap();
    assert_eq!(row.title, "q");
    assert_eq!(row.kind, ab_core::assessments::AssessmentKind::Quiz);

    sqlx::query("UPDATE activities SET name = 'renamed' WHERE id = $1")
        .bind(w.activity)
        .execute(&pool)
        .await
        .unwrap();
    let row = ab_db::assessments::get_assessment(&pool, id)
        .await
        .unwrap()
        .unwrap();
    assert_eq!(row.title, "renamed");

    let retyped = sqlx::query(
        "UPDATE activities SET activity_type = 'exam', activity_sub_type = 'exam_standard'
         WHERE id = $1",
    )
    .bind(w.activity)
    .execute(&pool)
    .await;
    assert!(
        retyped.is_err(),
        "an activity with an assessment keeps its type"
    );
}

#[ab_testdb::test]
async fn a_hand_in_names_one_frozen_assessment_version(pool: PgPool) {
    let w = world(&pool).await;
    let id = ab_core::id::AssessmentId(w.assessment);
    let items = serde_json::json!({ "items": [{ "max_score": 2.5 }, { "max_score": 1 }] });
    let policy = serde_json::json!({ "max_attempts": 1 });
    let first = ab_db::assessment_versions::ensure(&pool, id, &items, &policy)
        .await
        .unwrap();
    let same = ab_db::assessment_versions::ensure(&pool, id, &items, &policy)
        .await
        .unwrap();
    assert_eq!(first, same, "the same content is one version");
    let other = serde_json::json!({ "max_attempts": 2 });
    let second = ab_db::assessment_versions::ensure(&pool, id, &items, &other)
        .await
        .unwrap();
    let rows: Vec<(i32, f64)> = sqlx::query_as(
        "SELECT number, max_points::float8 FROM assessment_versions
         WHERE assessment_id = $1 ORDER BY number",
    )
    .bind(w.assessment)
    .fetch_all(&pool)
    .await
    .unwrap();
    assert_eq!(rows, vec![(1, 3.5), (2, 3.5)]);

    let frozen = sqlx::query("UPDATE assessment_versions SET policy = '{}' WHERE id = $1")
        .bind(first.0)
        .execute(&pool)
        .await;
    assert!(frozen.is_err(), "a version never changes");

    let sub = submission(&pool, &w, 1, false).await.unwrap();
    sqlx::query("UPDATE submissions SET assessment_version_id = $2 WHERE id = $1")
        .bind(sub)
        .bind(first.0)
        .execute(&pool)
        .await
        .unwrap();
    let moved = sqlx::query("UPDATE submissions SET assessment_version_id = $2 WHERE id = $1")
        .bind(sub)
        .bind(second.0)
        .execute(&pool)
        .await;
    assert!(moved.is_err(), "a hand-in names its version once");
}

#[ab_testdb::test]
async fn attempts_share_one_status_vocabulary(pool: PgPool) {
    use ab_core::assessments::{FileAttemptStatus, SubmissionStatus};
    let w = world(&pool).await;
    let expand: bool = sqlx::query_scalar(
        "SELECT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'submissions_status_previous_spelling')",
    )
    .fetch_one(&pool)
    .await
    .unwrap();
    let sub = submission(&pool, &w, 1, false).await.unwrap();
    let stored = async |sql: &'static str, id: Uuid| -> String {
        sqlx::query_scalar(sql)
            .bind(id)
            .fetch_one(&pool)
            .await
            .unwrap()
    };
    let read = "SELECT status FROM submissions WHERE id = $1";
    assert_eq!(
        stored(read, sub).await,
        if expand { "pending" } else { "submitted" }
    );
    let status: SubmissionStatus = sqlx::query_scalar(read)
        .bind(sub)
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(status, SubmissionStatus::Pending);
    assert_eq!(status.as_str(), "pending", "the API keeps its spelling");
    sqlx::query("UPDATE submissions SET status = $2 WHERE id = $1")
        .bind(sub)
        .bind(SubmissionStatus::Published)
        .execute(&pool)
        .await
        .unwrap();
    assert_eq!(
        stored(read, sub).await,
        if expand { "published" } else { "released" }
    );

    let task: Uuid = sqlx::query_scalar(
        "INSERT INTO file_submissions (activity_id, course_id) VALUES ($1, $2) RETURNING id",
    )
    .bind(w.activity)
    .bind(w.course)
    .fetch_one(&pool)
    .await
    .unwrap();
    let attempt: Uuid = sqlx::query_scalar(
        "INSERT INTO file_submission_attempts (file_submission_id, course_id, user_id, status, submitted_at)
         VALUES ($1, $2, $3, 'released', now()) RETURNING id",
    )
    .bind(task)
    .bind(w.course)
    .bind(w.user)
    .fetch_one(&pool)
    .await
    .unwrap();
    let attempt_read = "SELECT status FROM file_submission_attempts WHERE id = $1";
    assert_eq!(
        stored(attempt_read, attempt).await,
        if expand { "published" } else { "released" }
    );
    let status: FileAttemptStatus = sqlx::query_scalar(attempt_read)
        .bind(attempt)
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(status, FileAttemptStatus::Published);

    for bad in [
        "UPDATE submissions SET status = 'done' WHERE id = $1",
        "UPDATE file_submission_attempts SET status = 'pending' WHERE id = $1",
    ] {
        let id = if bad.contains("file_") { attempt } else { sub };
        let refused = sqlx::query(bad).bind(id).execute(&pool).await;
        assert!(refused.is_err(), "{bad}");
    }
}

#[ab_testdb::test]
async fn a_grade_entry_keeps_its_points(pool: PgPool) {
    let w = world(&pool).await;
    let id = ab_core::id::AssessmentId(w.assessment);
    let items = serde_json::json!({ "items": [{ "max_score": 2 }, { "max_score": 1 }] });
    let version = ab_db::assessment_versions::ensure(&pool, id, &items, &serde_json::json!({}))
        .await
        .unwrap();
    let sub = submission(&pool, &w, 1, false).await.unwrap();
    sqlx::query("UPDATE submissions SET assessment_version_id = $2 WHERE id = $1")
        .bind(sub)
        .bind(version.0)
        .execute(&pool)
        .await
        .unwrap();
    let mut tx = pool.begin().await.unwrap();
    // A writer's own points are ignored: the database derives them.
    let points: (f64, f64, f64) = sqlx::query_as(
        "INSERT INTO grading_entries (submission_id, raw_score, final_score, effective_breakdown,
                                      max_points, raw_points, final_points)
         VALUES ($1, 100, 33.33, '{}', 50, 50, 50)
         RETURNING max_points::float8, raw_points::float8, final_points::float8",
    )
    .bind(sub)
    .fetch_one(&mut *tx)
    .await
    .unwrap();
    assert_eq!(points, (3.0, 3.0, 1.0), "round(33.33 * 3 / 100, 2) = 1.00");
    sqlx::query("UPDATE submissions SET final_score = 33.33 WHERE id = $1")
        .bind(sub)
        .execute(&mut *tx)
        .await
        .unwrap();
    tx.commit().await.unwrap();

    // Round trip: within 0.5 / max_points percentage points.
    for (percent, max_points) in [(33.33, 3.0), (66.67, 3.0), (12.34, 7.0), (99.99, 1.0)] {
        let back: f64 = sqlx::query_scalar(
            "SELECT percent_of_points(points_of_percent($1::numeric, $2::numeric), $2::numeric)::float8",
        )
        .bind(percent)
        .bind(max_points)
        .fetch_one(&pool)
        .await
        .unwrap();
        assert!(
            (back - percent).abs() <= 0.5 / max_points + 1e-9,
            "{percent} of {max_points} came back as {back}"
        );
    }
    let half_up: f64 = sqlx::query_scalar("SELECT points_of_percent(12.5, 0.1)::float8")
        .fetch_one(&pool)
        .await
        .unwrap();
    assert!(
        (half_up - 0.01).abs() < 1e-9,
        "0.0125 rounds half away from zero"
    );

    // An entry of a hand-in without a version has no points.
    let legacy = submission(&pool, &w, 2, false).await.unwrap();
    let mut tx = pool.begin().await.unwrap();
    let none: Option<f64> = sqlx::query_scalar(
        "INSERT INTO grading_entries (submission_id, raw_score, final_score, effective_breakdown)
         VALUES ($1, 80, 80, '{}') RETURNING final_points::float8",
    )
    .bind(legacy)
    .fetch_one(&mut *tx)
    .await
    .unwrap();
    assert_eq!(none, None);
    tx.rollback().await.unwrap();
}

#[ab_testdb::test]
async fn the_breakdown_is_read_from_the_journal(pool: PgPool) {
    let w = world(&pool).await;
    let expand: bool = sqlx::query_scalar(
        "SELECT EXISTS (SELECT 1 FROM information_schema.columns
                        WHERE table_name = 'submissions' AND column_name = 'grading')",
    )
    .fetch_one(&pool)
    .await
    .unwrap();
    let draft: Uuid = sqlx::query_scalar(
        "INSERT INTO submissions (assessment_id, course_id, user_id, attempt_number)
         VALUES ($1, $2, $3, 1) RETURNING id",
    )
    .bind(w.assessment)
    .bind(w.course)
    .bind(w.user)
    .fetch_one(&pool)
    .await
    .unwrap();
    let current = async |id: Uuid| -> serde_json::Value {
        sqlx::query_scalar(
            "SELECT submission_breakdown(id, auto_breakdown) FROM submissions WHERE id = $1",
        )
        .bind(id)
        .fetch_one(&pool)
        .await
        .unwrap()
    };
    let old_column = async |id: Uuid| -> serde_json::Value {
        sqlx::query_scalar("SELECT grading FROM submissions WHERE id = $1")
            .bind(id)
            .fetch_one(&pool)
            .await
            .unwrap()
    };
    assert_eq!(current(draft).await, serde_json::json!({}));

    // This release's hand-in writes auto_breakdown.
    let auto = serde_json::json!({ "items": [], "needs_manual_review": true });
    sqlx::query(
        "UPDATE submissions SET status = 'submitted', submitted_at = now(), auto_breakdown = $2,
                items_snapshot = '{}', policy_snapshot = '{}'
         WHERE id = $1",
    )
    .bind(draft)
    .bind(&auto)
    .execute(&pool)
    .await
    .unwrap();
    assert_eq!(current(draft).await, auto, "no entry yet: the hand-in's");
    if expand {
        assert_eq!(
            old_column(draft).await,
            auto,
            "the previous release reads it"
        );
    }

    // A grade entry is the breakdown from then on.
    let graded = serde_json::json!({ "items": [], "feedback": "ok" });
    let mut tx = pool.begin().await.unwrap();
    sqlx::query(
        "INSERT INTO grading_entries (submission_id, raw_score, final_score, raw_breakdown, effective_breakdown)
         VALUES ($1, 70, 70, $2, $3)",
    )
    .bind(draft)
    .bind(&auto)
    .bind(&graded)
    .execute(&mut *tx)
    .await
    .unwrap();
    sqlx::query("UPDATE submissions SET status = 'graded', final_score = 70 WHERE id = $1")
        .bind(draft)
        .execute(&mut *tx)
        .await
        .unwrap();
    tx.commit().await.unwrap();
    assert_eq!(current(draft).await, graded);
    if expand {
        assert_eq!(
            old_column(draft).await,
            graded,
            "mirrored for the previous release"
        );
        // The previous release's hand-in writes grading only.
        let theirs = serde_json::json!({ "items": [], "theirs": true });
        let previous: Uuid = sqlx::query_scalar(
            "INSERT INTO submissions (assessment_id, course_id, user_id, attempt_number)
             VALUES ($1, $2, $3, 2) RETURNING id",
        )
        .bind(w.assessment)
        .bind(w.course)
        .bind(w.user)
        .fetch_one(&pool)
        .await
        .unwrap();
        sqlx::query(
            "UPDATE submissions SET status = 'pending', submitted_at = now(), grading = $2,
                    items_snapshot = '{}', policy_snapshot = '{}'
             WHERE id = $1",
        )
        .bind(previous)
        .bind(&theirs)
        .execute(&pool)
        .await
        .unwrap();
        assert_eq!(current(previous).await, theirs);
    }
}

#[ab_testdb::test]
async fn every_session_gets_the_app_search_path(pool: PgPool) {
    use sqlx::{ConnectOptions, Connection};

    let path = |sql: &'static str| sqlx::query_scalar::<_, String>(sql);
    assert_eq!(
        path("SELECT app_search_path()")
            .fetch_one(&pool)
            .await
            .unwrap(),
        ab_db::SEARCH_PATH
    );
    // A connection without a search_path option (psql, sqlx CLI, the previous release).
    let options = (*pool.connect_options()).clone();
    let mut plain = options.connect().await.unwrap();
    assert_eq!(
        path("SELECT current_setting('search_path')")
            .fetch_one(&mut plain)
            .await
            .unwrap(),
        ab_db::SEARCH_PATH
    );
    sqlx::query("SELECT count(*) FROM users, courses, submissions, jobs")
        .execute(&mut plain)
        .await
        .unwrap();

    // A database that lost or changed the setting: the server's own option still wins,
    // and `ashyq migrate` (ensure_app_search_path) puts it back for everyone else.
    sqlx::raw_sql(
        "DO $$ BEGIN EXECUTE format('ALTER DATABASE %I SET search_path = public', current_database()); END $$",
    )
    .execute(&mut plain)
    .await
    .unwrap();
    plain.close().await.unwrap();
    let mut stale = options.connect().await.unwrap();
    assert_eq!(
        path("SELECT current_setting('search_path')")
            .fetch_one(&mut stale)
            .await
            .unwrap(),
        "public"
    );
    let config = ab_core::config::DatabaseConfig {
        url: secrecy::SecretString::from("unused: connect_with takes the options"),
        max_connections: 1,
        min_connections: 0,
        limits: ab_core::config::DatabaseLimits::default(),
    };
    let server = ab_db::connect_with(options.clone(), &config, ab_db::Process::Serve)
        .await
        .unwrap();
    assert_eq!(
        path("SELECT current_setting('search_path')")
            .fetch_one(&server)
            .await
            .unwrap(),
        ab_db::SEARCH_PATH
    );
    assert_eq!(
        path("SELECT ensure_app_search_path()")
            .fetch_one(&mut stale)
            .await
            .unwrap(),
        "database"
    );
    stale.close().await.unwrap();
    let mut healed = options.connect().await.unwrap();
    assert_eq!(
        path("SELECT current_setting('search_path')")
            .fetch_one(&mut healed)
            .await
            .unwrap(),
        ab_db::SEARCH_PATH
    );
}

/// The roles review: every plpgsql function of the app finds its tables through
/// the app's path with pg_temp last, so a TEMP table of the caller cannot stand
/// in for the table a trigger checks (20261102091000). A new function sets
/// `SET search_path` itself; the one that sets the caller's path cannot.
#[ab_testdb::test]
async fn app_functions_pin_their_search_path(pool: PgPool) {
    let unpinned: Vec<String> = sqlx::query_scalar(
        "SELECT p.oid::regprocedure::text FROM pg_proc p
         JOIN pg_language l ON l.oid = p.prolang
         WHERE p.pronamespace::regnamespace::name = ANY (ARRAY['public']::name[] || app_schemas())
           AND l.lanname = 'plpgsql'
           AND NOT EXISTS (SELECT FROM pg_depend d
                           WHERE d.classid = 'pg_proc'::regclass AND d.objid = p.oid AND d.deptype = 'e')
           AND NOT EXISTS (SELECT FROM unnest(p.proconfig) c
                           WHERE c LIKE 'search\\_path=%pg\\_temp')
         ORDER BY 1",
    )
    .fetch_all(&pool)
    .await
    .unwrap();
    assert_eq!(unpinned, ["ensure_app_search_path()"]);
}

#[ab_testdb::test]
async fn app_table_schema_places_tables_by_area(pool: PgPool) {
    let cases = [
        ("users", "core"),
        ("courses", "core"),
        ("uploads", "core"),
        ("submissions", "learning"),
        ("grading_entries", "learning"),
        ("enrolments", "learning"),
        ("content_chunks", "ai"),
        ("ai_runs", "ai"),
        ("analytics_events", "analytics"),
        ("analytics_events_202612", "analytics"),
        ("daily_course_metrics", "analytics"),
        ("jobs", "ops"),
        ("auth_audit_log", "ops"),
        // Tables the mapping does not name: by prefix, else core.
        ("attempt_files", "learning"),
        ("assessment_something", "learning"),
        ("ai_new_ledger", "ai"),
        ("job_runs", "ops"),
        ("lesson_notes", "core"),
    ];
    for (table, schema) in cases {
        let got: String = sqlx::query_scalar("SELECT app_table_schema($1)::text")
            .bind(table)
            .fetch_one(&pool)
            .await
            .unwrap();
        assert_eq!(got, schema, "{table}");
    }
    let schemas: Vec<String> = sqlx::query_scalar(
        "SELECT nspname::text FROM pg_namespace WHERE nspname = ANY (app_schemas()) ORDER BY 1",
    )
    .fetch_all(&pool)
    .await
    .unwrap();
    assert_eq!(schemas, ["ai", "analytics", "core", "learning", "ops"]);
}

#[ab_testdb::test]
async fn a_finished_ai_run_says_when_it_finished(pool: PgPool) {
    let thread: Uuid = sqlx::query_scalar("INSERT INTO ai_threads DEFAULT VALUES RETURNING id")
        .fetch_one(&pool)
        .await
        .unwrap();
    let run = |status: &'static str| {
        sqlx::query("INSERT INTO ai_runs (thread_id, kind, status) VALUES ($1, 'course_qa', $2)")
            .bind(thread)
            .bind(status)
            .execute(&pool)
    };
    run("running").await.unwrap();
    for status in ["succeeded", "failed", "aborted"] {
        let err = run(status).await.unwrap_err();
        assert!(
            err.to_string().contains("ai_runs_finished_at_check"),
            "{status}: {err}"
        );
    }
}

#[ab_testdb::test]
async fn unclocked_unreferenced_uploads_get_the_reaper_clock(pool: PgPool) {
    let w = world(&pool).await;
    let upload = |key: &'static str, status: &'static str, clocked: bool| {
        let pool = pool.clone();
        async move {
            sqlx::query_scalar::<_, Uuid>(
                "INSERT INTO uploads (created_by, purpose, bucket, key, mime, size_bytes, status, expires_at)
                 VALUES ($1, 'avatar', 'public', $2, 'image/png', 1, $3,
                         CASE WHEN $4 THEN now() + interval '1 day' END) RETURNING id",
            )
            .bind(w.user)
            .bind(key)
            .bind(status)
            .bind(clocked)
            .fetch_one(&pool)
            .await
            .unwrap()
        }
    };
    upload("k/avatar", "finalized", false).await;
    let orphan = upload("k/orphan", "finalized", false).await;
    upload("k/clocked", "finalized", true).await;
    upload("k/pending", "pending", true).await;
    sqlx::query("UPDATE users SET avatar_key = 'k/avatar' WHERE id = $1")
        .bind(w.user)
        .execute(&pool)
        .await
        .unwrap();

    assert_eq!(
        ab_db::uploads::count_unclocked_unreferenced(&pool)
            .await
            .unwrap(),
        1
    );
    assert_eq!(
        ab_db::uploads::clock_unclocked_unreferenced(&pool, 3600.0)
            .await
            .unwrap(),
        1
    );
    let unclocked: Vec<Uuid> =
        sqlx::query_scalar("SELECT id FROM uploads WHERE expires_at IS NULL")
            .fetch_all(&pool)
            .await
            .unwrap();
    assert_eq!(unclocked.len(), 1, "only the avatar stays without a clock");
    assert_ne!(unclocked[0], orphan);
    assert_eq!(
        ab_db::uploads::count_unclocked_unreferenced(&pool)
            .await
            .unwrap(),
        0
    );
}

/// REWRITE 5.6 n13: one `touch_row` trigger keeps `updated_at` and `version` (on chapters: a table with a
/// generated column, like courses, sees every write as a change, since BEFORE triggers see it unset).
#[ab_testdb::test]
async fn one_touch_trigger_keeps_updated_at_and_version(pool: PgPool) {
    let w = world(&pool).await;
    let chapter = async || {
        sqlx::query_as::<_, (i32, f64)>(
            "SELECT version, extract(epoch FROM updated_at)::float8 FROM chapters WHERE course_id = $1",
        )
        .bind(w.course)
        .fetch_one(&pool)
        .await
        .unwrap()
    };
    let write = async |sql: &str| {
        sqlx::raw_sql(sqlx::AssertSqlSafe(
            sql.replace("$course", &format!("'{}'", w.course)),
        ))
        .execute(&pool)
        .await
        .unwrap();
    };
    let (v0, t0) = chapter().await;
    write("UPDATE chapters SET name = 'renamed' WHERE course_id = $course").await;
    let (v1, t1) = chapter().await;
    assert_eq!((v1, t1 > t0), (v0 + 1, true), "a change bumps both");
    write("UPDATE chapters SET name = name WHERE course_id = $course").await;
    let (v2, t2) = chapter().await;
    assert_eq!(
        (v2, t2 > t1),
        (v1, true),
        "a no-op write touches, keeps the version"
    );
    write("UPDATE chapters SET name = 'set', version = 40 WHERE course_id = $course").await;
    assert_eq!(chapter().await.0, 40, "a version the caller sets stands");
    write(
        "BEGIN; SET LOCAL ab.bookkeeping = 'on';
         UPDATE chapters SET name = 'kept' WHERE course_id = $course; COMMIT;",
    )
    .await;
    let (v3, t3) = chapter().await;
    assert_eq!(
        (v3, t3),
        (41, chapter().await.1),
        "bookkeeping keeps updated_at"
    );
    assert!(t3 > t2);

    // course_discussions: only content and status move the version.
    let post: Uuid = sqlx::query_scalar(
        "INSERT INTO course_discussions (course_id, user_id, content) VALUES ($1, $2, 'p') RETURNING id",
    )
    .bind(w.course)
    .bind(w.user)
    .fetch_one(&pool)
    .await
    .unwrap();
    let version = async |sql: &str| -> i32 {
        sqlx::query_scalar(sqlx::AssertSqlSafe(format!(
            "{sql} WHERE id = $1 RETURNING version"
        )))
        .bind(post)
        .fetch_one(&pool)
        .await
        .unwrap()
    };
    let v = version("UPDATE course_discussions SET likes_count = likes_count + 1").await;
    assert_eq!(
        version("UPDATE course_discussions SET content = 'edited'").await,
        v + 1
    );
    assert_eq!(
        version("UPDATE course_discussions SET replies_count = 3").await,
        v + 1
    );

    let old: Option<String> = sqlx::query_scalar(
        "SELECT string_agg(proname, ', ') FROM pg_proc WHERE proname IN ('set_updated_at', 'bump_version')",
    )
    .fetch_one(&pool)
    .await
    .unwrap();
    assert_eq!(old, None, "the pair is gone");
}
