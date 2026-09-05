//! Schema guarantees of migration 0011 that the domain leans on: one open
//! draft per learner, an append-only grading ledger, idempotency replay.
#![allow(clippy::unwrap_used, clippy::expect_used, clippy::panic)]

use ab_core::assessments::{AutoSubmitReason, SubmissionStatus};
use ab_core::id::{AssessmentId, CourseId, SubmissionId, UserId};
use ab_db::submissions::{self, NewGradingEntry, SubmitOutcome};
use sqlx::PgPool;

/// User → course → chapter → quiz activity → assessment.
async fn seed(pool: &PgPool) -> (UserId, CourseId, AssessmentId) {
    let user: uuid::Uuid = sqlx::query_scalar(
        "INSERT INTO users (zitadel_user_id, username, email)
         VALUES ('z-s', 'submitter', 's@example.com') RETURNING id",
    )
    .fetch_one(pool)
    .await
    .unwrap();
    let course: uuid::Uuid =
        sqlx::query_scalar("INSERT INTO courses (name, creator_id) VALUES ('c', $1) RETURNING id")
            .bind(user)
            .fetch_one(pool)
            .await
            .unwrap();
    let chapter: uuid::Uuid = sqlx::query_scalar(
        "INSERT INTO chapters (course_id, name, creator_id) VALUES ($1, 'ch', $2) RETURNING id",
    )
    .bind(course)
    .bind(user)
    .fetch_one(pool)
    .await
    .unwrap();
    let activity: uuid::Uuid = sqlx::query_scalar(
        "INSERT INTO activities (chapter_id, course_id, name, activity_type, activity_sub_type)
         VALUES ($1, $2, 'q', 'quiz', 'quiz_standard') RETURNING id",
    )
    .bind(chapter)
    .bind(course)
    .fetch_one(pool)
    .await
    .unwrap();
    let assessment: uuid::Uuid = sqlx::query_scalar(
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
    (UserId(user), CourseId(course), AssessmentId(assessment))
}

#[sqlx::test(migrations = "../../migrations")]
async fn one_open_draft_per_learner_and_submit_flow(pool: PgPool) {
    let (user, course, assessment) = seed(&pool).await;

    let first = submissions::insert_draft(&pool, assessment, course, user, 1, 1, 1)
        .await
        .unwrap()
        .expect("first draft opens");
    let second = submissions::insert_draft(&pool, assessment, course, user, 1, 1, 1)
        .await
        .unwrap();
    assert!(second.is_none(), "a second open draft must be refused");

    // Draft saves are optimistically locked.
    let answers = serde_json::json!({ "item-a": { "kind": "choice", "selected": ["a"] } });
    assert!(
        submissions::save_draft_answers(&pool, first, &answers, 1)
            .await
            .unwrap()
    );
    assert!(
        !submissions::save_draft_answers(&pool, first, &answers, 1)
            .await
            .unwrap(),
        "stale draft_version must not write"
    );
    let row = submissions::get_submission(&pool, first)
        .await
        .unwrap()
        .unwrap();
    assert_eq!(row.draft_version, 2);
    assert!(row.started_at.is_some());

    // Submit happens once; the second attempt sees no draft.
    let grading = serde_json::json!({ "items": [], "needs_manual_review": false });
    let outcome = SubmitOutcome {
        status: SubmissionStatus::Published,
        answers: &answers,
        grading: &grading,
        auto_score: Some(80.0),
        final_score: Some(80.0),
        is_late: false,
        late_penalty_pct: 0.0,
        violation_count: 0,
        auto_submit_reason: Some(AutoSubmitReason::TimeExpired),
        graded: true,
        duration_seconds: Some(42),
    };
    assert!(
        submissions::persist_submit(&pool, first, outcome)
            .await
            .unwrap()
    );
    let again = SubmitOutcome {
        status: SubmissionStatus::Published,
        answers: &answers,
        grading: &grading,
        auto_score: Some(1.0),
        final_score: Some(1.0),
        is_late: false,
        late_penalty_pct: 0.0,
        violation_count: 0,
        auto_submit_reason: None,
        graded: true,
        duration_seconds: None,
    };
    assert!(
        !submissions::persist_submit(&pool, first, again)
            .await
            .unwrap(),
        "only a draft can be submitted"
    );
    let row = submissions::get_submission(&pool, first)
        .await
        .unwrap()
        .unwrap();
    assert_eq!(row.status, SubmissionStatus::Published);
    assert_eq!(row.final_score, Some(80.0));
    assert_eq!(row.auto_submit_reason, Some(AutoSubmitReason::TimeExpired));
    assert!(row.auto_submitted_at.is_some());
    assert!(row.submitted_at.is_some() && row.graded_at.is_some());

    // The draft slot is free again; the next attempt counts from the first.
    assert_eq!(
        submissions::count_completed_attempts(&pool, assessment, user)
            .await
            .unwrap(),
        1
    );
    assert!(
        submissions::insert_draft(&pool, assessment, course, user, 2, 1, 1)
            .await
            .unwrap()
            .is_some()
    );
}

#[sqlx::test(migrations = "../../migrations")]
async fn grading_ledger_is_append_only(pool: PgPool) {
    let (user, course, assessment) = seed(&pool).await;
    let submission = submissions::insert_draft(&pool, assessment, course, user, 1, 1, 1)
        .await
        .unwrap()
        .unwrap();
    let breakdown = serde_json::json!({ "items": [] });
    let entry = submissions::insert_grading_entry(
        &pool,
        NewGradingEntry {
            submission_id: submission,
            graded_by: None,
            raw_score: 70.0,
            penalty_pct: 10.0,
            final_score: 63.0,
            raw_breakdown: &breakdown,
            effective_breakdown: &breakdown,
            overall_feedback: "ok",
            published: false,
        },
    )
    .await
    .unwrap();

    // Scores are frozen; only publication may change.
    let frozen = sqlx::query("UPDATE grading_entries SET raw_score = 99 WHERE id = $1")
        .bind(entry.0)
        .execute(&pool)
        .await;
    assert!(frozen.is_err(), "raw_score must be immutable");
    sqlx::query("UPDATE grading_entries SET published_at = now() WHERE id = $1")
        .bind(entry.0)
        .execute(&pool)
        .await
        .unwrap();
    assert!(
        submissions::has_published_entry(&pool, submission)
            .await
            .unwrap()
    );
    let deleted = sqlx::query("DELETE FROM grading_entries WHERE id = $1")
        .bind(entry.0)
        .execute(&pool)
        .await;
    assert!(deleted.is_err(), "entries are never deleted directly");

    // …but the parent cascade still works.
    sqlx::query("DELETE FROM submissions WHERE id = $1")
        .bind(submission.0)
        .execute(&pool)
        .await
        .unwrap();
    let remaining: i64 = sqlx::query_scalar("SELECT count(*) FROM grading_entries")
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(remaining, 0);
}

#[sqlx::test(migrations = "../../migrations")]
async fn idempotency_keys_replay_and_sweep(pool: PgPool) {
    let (user, _, _) = seed(&pool).await;
    let response = serde_json::json!({ "id": "x" });
    submissions::store_idempotent(&pool, user, "k1", "h1", 201, &response)
        .await
        .unwrap();
    // A second store under the same key is a no-op (first writer wins).
    submissions::store_idempotent(&pool, user, "k1", "h2", 500, &serde_json::json!({}))
        .await
        .unwrap();
    let stored = submissions::get_idempotent(&pool, user, "k1")
        .await
        .unwrap()
        .unwrap();
    assert_eq!(stored.request_hash, "h1");
    assert_eq!(stored.status_code, 201);
    assert_eq!(stored.response, response);
    assert!(
        submissions::get_idempotent(&pool, user, "other")
            .await
            .unwrap()
            .is_none()
    );
    // Nothing is old enough to sweep yet; a zero-second window sweeps all.
    assert_eq!(
        submissions::sweep_idempotency(&pool, 3600.0).await.unwrap(),
        0
    );
    assert_eq!(submissions::sweep_idempotency(&pool, 0.0).await.unwrap(), 1);
    let _ = SubmissionId::new();
}
