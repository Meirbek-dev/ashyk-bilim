//! Schema guarantees of migration 0011 that the domain leans on: one open
//! draft per learner, an append-only grading ledger, idempotency replay; and the prune of final code runs a
//! retry replaced.
#![allow(clippy::unwrap_used, clippy::expect_used, clippy::panic)]

use ab_core::assessments::{
    AutoSubmitReason, CodeRunPurpose, CodeRunStatus, SubmissionStatus, TestVerdict,
};
use ab_core::id::{AssessmentId, AssessmentItemId, CodeRunId, CourseId, SubmissionId, UserId};
use ab_db::submissions::{self, NewCodeRun, NewGradingEntry, SubmitOutcome};
use sqlx::PgPool;

const HASH_1: &str = "1111111111111111111111111111111111111111111111111111111111111111";
const HASH_2: &str = "2222222222222222222222222222222222222222222222222222222222222222";

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
    (UserId(user), CourseId(course), AssessmentId(assessment))
}

#[ab_testdb::test]
async fn one_open_draft_per_learner_and_submit_flow(pool: PgPool) {
    let (user, course, assessment) = seed(&pool).await;

    let first = submissions::insert_draft(&pool, assessment, course, user, 1, 1, false)
        .await
        .unwrap()
        .expect("first draft opens");
    let second = submissions::insert_draft(&pool, assessment, course, user, 1, 1, false)
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
    let snapshot = serde_json::json!({});
    let version = ab_db::assessment_versions::ensure(&pool, assessment, &snapshot, &snapshot)
        .await
        .unwrap();
    let outcome = SubmitOutcome {
        status: SubmissionStatus::Published,
        answers: &answers,
        auto_breakdown: &grading,
        auto_score: Some(80.0),
        final_score: Some(80.0),
        is_late: false,
        late_penalty_pct: 0.0,
        violation_count: 0,
        auto_submit_reason: Some(AutoSubmitReason::TimeExpired),
        graded: true,
        duration_seconds: Some(42),
        submitted_at: None,
        read_draft_version: 2,
        read_violation_count: 0,
        items_snapshot: &snapshot,
        policy_snapshot: &snapshot,
        assessment_version_id: version,
    };
    assert!(
        submissions::persist_submit(&pool, first, outcome)
            .await
            .unwrap()
    );
    let again = SubmitOutcome {
        status: SubmissionStatus::Published,
        answers: &answers,
        auto_breakdown: &grading,
        auto_score: Some(1.0),
        final_score: Some(1.0),
        is_late: false,
        late_penalty_pct: 0.0,
        violation_count: 0,
        auto_submit_reason: None,
        graded: true,
        duration_seconds: None,
        submitted_at: None,
        read_draft_version: 2,
        read_violation_count: 0,
        items_snapshot: &snapshot,
        policy_snapshot: &snapshot,
        assessment_version_id: version,
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
    let prior = submissions::list_user_submissions(&pool, assessment, user, false)
        .await
        .unwrap();
    assert_eq!(prior.len(), 1);
    assert_ne!(prior[0].status, SubmissionStatus::Draft);
    assert!(
        submissions::insert_draft(&pool, assessment, course, user, 2, 1, false)
            .await
            .unwrap()
            .is_some()
    );
}

#[ab_testdb::test]
async fn grading_ledger_is_append_only(pool: PgPool) {
    let (user, course, assessment) = seed(&pool).await;
    let submission = submissions::insert_draft(&pool, assessment, course, user, 1, 1, false)
        .await
        .unwrap()
        .unwrap();
    let breakdown = serde_json::json!({ "items": [] });
    // The submission shows its latest entry (checked at commit).
    let mut tx = pool.begin().await.unwrap();
    let entry = submissions::insert_grading_entry(
        &mut *tx,
        NewGradingEntry {
            submission_id: submission,
            graded_by: None,
            raw_score: 70.0,
            penalty_pct: 10.0,
            final_score: Some(63.0),
            raw_breakdown: &breakdown,
            effective_breakdown: &breakdown,
            overall_feedback: "ok",
            published: false,
        },
    )
    .await
    .unwrap();
    sqlx::query("UPDATE submissions SET final_score = 63 WHERE id = $1")
        .bind(submission.0)
        .execute(&mut *tx)
        .await
        .unwrap();
    tx.commit().await.unwrap();

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

#[ab_testdb::test]
async fn idempotency_keys_replay_and_sweep(pool: PgPool) {
    let (user, _, _) = seed(&pool).await;
    let response = serde_json::json!({ "id": "x" });
    submissions::store_idempotent(&pool, user, "k1", HASH_1, 201, &response)
        .await
        .unwrap();
    // A second store under the same key is a no-op (first writer wins).
    submissions::store_idempotent(&pool, user, "k1", HASH_2, 500, &serde_json::json!({}))
        .await
        .unwrap();
    let stored = submissions::get_idempotent(&pool, user, "k1")
        .await
        .unwrap()
        .unwrap();
    assert_eq!(stored.request_hash, HASH_1);
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

/// BUG-212 nit: a heartbeat keeps a long-running reservation from being
/// taken over; without one the stale window (30 s) still applies.
#[ab_testdb::test]
async fn idempotency_heartbeat_defers_the_stale_takeover(pool: PgPool) {
    let (user, _, _) = seed(&pool).await;
    let backdate = async |secs: i32| {
        sqlx::query("UPDATE idempotency_keys SET created_at = now() - make_interval(secs => $1)")
            .bind(f64::from(secs))
            .execute(&pool)
            .await
            .unwrap();
    };
    assert!(
        submissions::reserve_idempotent(&pool, user, "k", HASH_1)
            .await
            .unwrap()
    );
    backdate(31).await;
    submissions::touch_idempotent(&pool, user, "k")
        .await
        .unwrap();
    assert!(
        !submissions::reserve_idempotent(&pool, user, "k", HASH_1)
            .await
            .unwrap()
    );
    backdate(31).await;
    assert!(
        submissions::reserve_idempotent(&pool, user, "k", HASH_1)
            .await
            .unwrap()
    );
    // A completed key is never touched back to life.
    submissions::complete_idempotent(&pool, user, "k", 200, &serde_json::json!({}))
        .await
        .unwrap();
    backdate(31).await;
    submissions::touch_idempotent(&pool, user, "k")
        .await
        .unwrap();
    assert!(
        !submissions::reserve_idempotent(&pool, user, "k", HASH_1)
            .await
            .unwrap()
    );
}

/// One code run of `item` on `submission`, finished with `status`; `cleared` releases its key the way a retry
/// does (`clear_idempotency_key`).
async fn code_run(
    pool: &PgPool,
    w: (UserId, AssessmentId, AssessmentItemId, SubmissionId),
    purpose: CodeRunPurpose,
    status: CodeRunStatus,
    key: &str,
    cleared: bool,
) -> CodeRunId {
    let (user, assessment, item, submission) = w;
    let id = submissions::insert_code_run(
        pool,
        NewCodeRun {
            assessment_id: assessment,
            item_id: item,
            submission_id: Some(submission),
            user_id: user,
            purpose,
            language_id: 71,
            source_sha256: HASH_1,
            stdin_sha256: None,
            idempotency_key: Some(key),
            total: 1,
        },
    )
    .await
    .unwrap()
    .expect("a fresh key");
    submissions::finish_code_run(pool, id, status, 0, None, None, Some("runner down"))
        .await
        .unwrap();
    if cleared {
        submissions::clear_idempotency_key(pool, id).await.unwrap();
    }
    id
}

/// `prune-superseded-code-runs`: a final run that never executed and that a retry replaced goes; the newest
/// final run (what grading reads), a run with cases, a practice run and a run still holding its key stay.
#[ab_testdb::test]
async fn superseded_failed_final_runs_are_pruned(pool: PgPool) {
    use CodeRunPurpose::{Final, Visible};
    use CodeRunStatus::{Accepted, Degraded, InternalError};
    let (user, course, assessment) = seed(&pool).await;
    let item: uuid::Uuid = sqlx::query_scalar(
        "INSERT INTO assessment_items (assessment_id, kind, position, body)
         VALUES ($1, 'code', 1, '{\"kind\": \"code\"}') RETURNING id",
    )
    .bind(assessment.0)
    .fetch_one(&pool)
    .await
    .unwrap();
    let item = AssessmentItemId(item);
    let draft = submissions::insert_draft(&pool, assessment, course, user, 1, 1, false)
        .await
        .unwrap()
        .unwrap();
    let w = (user, assessment, item, draft);

    let practice = code_run(&pool, w, Visible, Degraded, "v", true).await;
    let gone_1 = code_run(&pool, w, Final, Degraded, "f1", true).await;
    let gone_2 = code_run(&pool, w, Final, InternalError, "f2", true).await;
    let with_cases = code_run(&pool, w, Final, InternalError, "f3", true).await;
    submissions::insert_code_run_cases(
        &pool,
        with_cases,
        &[submissions::CodeRunCaseRow {
            position: 1,
            test_id: "t1".into(),
            stdin: None,
            expected_output: None,
            description: String::new(),
            weight: 1.0,
            is_visible: true,
            verdict: TestVerdict::Accepted,
            status_description: "Accepted".into(),
            passed: true,
            stdout: None,
            stderr: None,
            compile_output: None,
            message: None,
            time_seconds: None,
            memory_kb: None,
        }],
    )
    .await
    .unwrap();
    let keyed = code_run(&pool, w, Final, Degraded, "f4", false).await;
    let latest = code_run(&pool, w, Final, Accepted, "f5", false).await;
    // The newest final run stays even when it failed: nothing replaced it.
    let other_item: uuid::Uuid = sqlx::query_scalar(
        "INSERT INTO assessment_items (assessment_id, kind, position, body)
         VALUES ($1, 'code', 2, '{\"kind\": \"code\"}') RETURNING id",
    )
    .bind(assessment.0)
    .fetch_one(&pool)
    .await
    .unwrap();
    let alone = code_run(
        &pool,
        (user, assessment, AssessmentItemId(other_item), draft),
        Final,
        Degraded,
        "o1",
        true,
    )
    .await;

    assert_eq!(
        submissions::count_superseded_failed_final_runs(&pool)
            .await
            .unwrap(),
        2
    );
    assert_eq!(
        submissions::delete_superseded_failed_final_runs(&pool)
            .await
            .unwrap(),
        2
    );
    let left: Vec<uuid::Uuid> = sqlx::query_scalar("SELECT id FROM code_runs ORDER BY id")
        .fetch_all(&pool)
        .await
        .unwrap();
    let mut kept = vec![practice.0, with_cases.0, keyed.0, latest.0, alone.0];
    kept.sort();
    assert_eq!(left, kept);
    assert!(!left.contains(&gone_1.0) && !left.contains(&gone_2.0));
    assert_eq!(
        submissions::latest_final_run(&pool, draft, item)
            .await
            .unwrap()
            .unwrap()
            .id,
        latest
    );
    // Idempotent.
    assert_eq!(
        submissions::delete_superseded_failed_final_runs(&pool)
            .await
            .unwrap(),
        0
    );
}
