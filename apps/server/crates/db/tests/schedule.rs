//! Recurring-schedule semantics on real Postgres.
#![allow(clippy::unwrap_used, clippy::expect_used)]

use std::time::Duration;

use ab_db::{queue, schedule};
use sqlx::PgPool;

async fn make_due(pool: &PgPool, kind: &str) {
    sqlx::query(
        "UPDATE job_schedules SET next_run_at = now() - interval '1 second' WHERE kind = $1",
    )
    .bind(kind)
    .execute(pool)
    .await
    .unwrap();
}

#[sqlx::test(migrations = "../../migrations")]
async fn due_schedule_enqueues_and_advances(pool: PgPool) {
    schedule::upsert(
        &pool,
        "assessment:auto-publish",
        Duration::from_mins(2),
        serde_json::json!({}),
    )
    .await
    .unwrap();

    // Not due yet — tick is a no-op.
    assert_eq!(schedule::tick(&pool).await.unwrap(), 0);

    make_due(&pool, "assessment:auto-publish").await;
    assert_eq!(schedule::tick(&pool).await.unwrap(), 1);

    // The occurrence was enqueued and next_run_at advanced into the future.
    let claimed = queue::claim(&pool, "w1", 10).await.unwrap();
    assert_eq!(claimed.len(), 1);
    assert_eq!(claimed[0].kind, "assessment:auto-publish");
    let future: bool = sqlx::query_scalar("SELECT next_run_at > now() FROM job_schedules")
        .fetch_one(&pool)
        .await
        .unwrap();
    assert!(future);

    // Re-tick without the schedule being due again: nothing new.
    assert_eq!(schedule::tick(&pool).await.unwrap(), 0);
}

#[sqlx::test(migrations = "../../migrations")]
async fn upsert_is_idempotent_and_tightens_interval(pool: PgPool) {
    schedule::upsert(
        &pool,
        "upload:reap",
        Duration::from_hours(6),
        serde_json::json!({}),
    )
    .await
    .unwrap();
    schedule::upsert(
        &pool,
        "upload:reap",
        Duration::from_mins(10),
        serde_json::json!({}),
    )
    .await
    .unwrap();

    let (count, secs): (i64, i64) = sqlx::query_as(
        "SELECT count(*), min(interval_seconds) FROM job_schedules WHERE kind = 'upload:reap'",
    )
    .fetch_one(&pool)
    .await
    .unwrap();
    assert_eq!(count, 1);
    assert_eq!(secs, 600);

    // next_run_at tightened to the new (smaller) interval, not left 6h out.
    let soon: bool = sqlx::query_scalar(
        "SELECT next_run_at <= now() + interval '11 minutes' FROM job_schedules",
    )
    .fetch_one(&pool)
    .await
    .unwrap();
    assert!(soon);
}

#[sqlx::test(migrations = "../../migrations")]
async fn disabled_schedules_do_not_fire(pool: PgPool) {
    schedule::upsert(
        &pool,
        "plagiarism:sweep",
        Duration::from_mins(10),
        serde_json::json!({}),
    )
    .await
    .unwrap();
    schedule::set_enabled(&pool, "plagiarism:sweep", false)
        .await
        .unwrap();
    make_due(&pool, "plagiarism:sweep").await;

    assert_eq!(schedule::tick(&pool).await.unwrap(), 0);
    assert!(queue::claim(&pool, "w1", 10).await.unwrap().is_empty());
}

#[sqlx::test(migrations = "../../migrations")]
async fn same_occurrence_cannot_double_enqueue(pool: PgPool) {
    schedule::upsert(
        &pool,
        "assessment:timer",
        Duration::from_mins(1),
        serde_json::json!({}),
    )
    .await
    .unwrap();
    make_due(&pool, "assessment:timer").await;
    let occurrence: i64 =
        sqlx::query_scalar("SELECT (extract(epoch FROM next_run_at))::bigint FROM job_schedules")
            .fetch_one(&pool)
            .await
            .unwrap();
    assert_eq!(schedule::tick(&pool).await.unwrap(), 1);

    // Rewind to the SAME occurrence (simulates a crash between enqueue and
    // advance): the per-occurrence dedupe key absorbs the re-enqueue while the
    // first job is still live.
    sqlx::query("UPDATE job_schedules SET next_run_at = to_timestamp($1)")
        .bind(occurrence)
        .execute(&pool)
        .await
        .unwrap();
    assert_eq!(
        schedule::tick(&pool).await.unwrap(),
        0,
        "dedupe must absorb the rerun"
    );
    let jobs: i64 = sqlx::query_scalar("SELECT count(*) FROM jobs")
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(jobs, 1);
}
