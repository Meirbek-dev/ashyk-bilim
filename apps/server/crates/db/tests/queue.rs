//! Queue semantics against real Postgres (`#[sqlx::test]` gives each test a
//! fresh migrated database). Runs in CI; locally requires `just services`.
#![allow(clippy::unwrap_used, clippy::expect_used)]

use std::time::Duration;

use ab_db::queue::{self, NewJob};
use sqlx::PgPool;

#[sqlx::test(migrations = "../../migrations")]
async fn enqueue_claim_succeed_roundtrip(pool: PgPool) {
    let id = queue::enqueue(
        &pool,
        &NewJob::new("email:send", serde_json::json!({"to": "x"})),
    )
    .await
    .unwrap()
    .expect("enqueued");

    let claimed = queue::claim(&pool, "w1", 10).await.unwrap();
    assert_eq!(claimed.len(), 1);
    assert_eq!(claimed[0].id, id);
    assert_eq!(claimed[0].kind, "email:send");
    assert_eq!(claimed[0].attempts, 1);

    // Claimed jobs are invisible to other workers.
    assert!(queue::claim(&pool, "w2", 10).await.unwrap().is_empty());

    queue::succeed(&pool, id).await.unwrap();
    let status: String = sqlx::query_scalar("SELECT status FROM jobs WHERE id = $1")
        .bind(id)
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(status, "succeeded");
}

#[sqlx::test(migrations = "../../migrations")]
async fn transactional_enqueue_rolls_back_with_caller(pool: PgPool) {
    let mut tx = pool.begin().await.unwrap();
    queue::enqueue(&mut *tx, &NewJob::new("xp:award", serde_json::json!({})))
        .await
        .unwrap();
    tx.rollback().await.unwrap();

    assert!(queue::claim(&pool, "w1", 10).await.unwrap().is_empty());
}

#[sqlx::test(migrations = "../../migrations")]
async fn dedupe_drops_duplicate_live_jobs(pool: PgPool) {
    let job = NewJob::new("plagiarism:sweep", serde_json::json!({})).dedupe("sweep");
    assert!(queue::enqueue(&pool, &job).await.unwrap().is_some());
    assert!(queue::enqueue(&pool, &job).await.unwrap().is_none());

    // Once the live job resolves, the key is reusable.
    let claimed = queue::claim(&pool, "w1", 1).await.unwrap();
    queue::succeed(&pool, claimed[0].id).await.unwrap();
    assert!(queue::enqueue(&pool, &job).await.unwrap().is_some());
}

#[sqlx::test(migrations = "../../migrations")]
async fn delayed_jobs_are_not_claimable_early(pool: PgPool) {
    queue::enqueue(
        &pool,
        &NewJob::new("assessment:auto-publish", serde_json::json!({}))
            .delayed(Duration::from_hours(1)),
    )
    .await
    .unwrap();
    assert!(queue::claim(&pool, "w1", 10).await.unwrap().is_empty());
}

#[sqlx::test(migrations = "../../migrations")]
async fn priority_orders_claims(pool: PgPool) {
    queue::enqueue(&pool, &NewJob::new("low", serde_json::json!({})))
        .await
        .unwrap();
    queue::enqueue(
        &pool,
        &NewJob::new("high", serde_json::json!({})).priority(10),
    )
    .await
    .unwrap();

    let claimed = queue::claim(&pool, "w1", 1).await.unwrap();
    assert_eq!(claimed[0].kind, "high");
}

#[sqlx::test(migrations = "../../migrations")]
async fn fail_requeues_with_backoff_then_dead_letters(pool: PgPool) {
    queue::enqueue(
        &pool,
        &NewJob::new("ai:execute_run", serde_json::json!({})).max_attempts(2),
    )
    .await
    .unwrap();

    // Attempt 1 fails → requeued in the future.
    let claimed = queue::claim(&pool, "w1", 1).await.unwrap();
    queue::fail(&pool, &claimed[0], "provider timeout")
        .await
        .unwrap();
    let (status, future): (String, bool) =
        sqlx::query_as("SELECT status, run_at > now() FROM jobs WHERE id = $1")
            .bind(claimed[0].id)
            .fetch_one(&pool)
            .await
            .unwrap();
    assert_eq!(status, "queued");
    assert!(future, "backoff must schedule the retry in the future");

    // Make it due now, fail again → attempts exhausted → dead.
    sqlx::query("UPDATE jobs SET run_at = now()")
        .execute(&pool)
        .await
        .unwrap();
    let claimed = queue::claim(&pool, "w1", 1).await.unwrap();
    assert_eq!(claimed[0].attempts, 2);
    queue::fail(&pool, &claimed[0], "provider timeout")
        .await
        .unwrap();
    let (status, error): (String, Option<String>) =
        sqlx::query_as("SELECT status, last_error FROM jobs WHERE id = $1")
            .bind(claimed[0].id)
            .fetch_one(&pool)
            .await
            .unwrap();
    assert_eq!(status, "dead");
    assert_eq!(error.as_deref(), Some("provider timeout"));
}

#[sqlx::test(migrations = "../../migrations")]
async fn reaper_recovers_stale_running_jobs(pool: PgPool) {
    queue::enqueue(&pool, &NewJob::new("audit:write", serde_json::json!({})))
        .await
        .unwrap();
    let claimed = queue::claim(&pool, "w-dead", 1).await.unwrap();

    // Fresh heartbeat: reaper must not touch it.
    assert_eq!(
        queue::reap(&pool, Duration::from_mins(1)).await.unwrap(),
        0
    );

    // Simulate a dead worker (stale heartbeat).
    sqlx::query("UPDATE jobs SET heartbeat_at = now() - interval '10 minutes'")
        .execute(&pool)
        .await
        .unwrap();
    assert_eq!(
        queue::reap(&pool, Duration::from_mins(1)).await.unwrap(),
        1
    );

    // Recovered job is claimable again by a healthy worker.
    let reclaimed = queue::claim(&pool, "w-alive", 1).await.unwrap();
    assert_eq!(reclaimed[0].id, claimed[0].id);
}

#[sqlx::test(migrations = "../../migrations")]
async fn heartbeat_updates_only_own_running_jobs(pool: PgPool) {
    queue::enqueue(&pool, &NewJob::new("k", serde_json::json!({})))
        .await
        .unwrap();
    let claimed = queue::claim(&pool, "w1", 1).await.unwrap();
    let ids: Vec<_> = claimed.iter().map(|j| j.id).collect();

    sqlx::query("UPDATE jobs SET heartbeat_at = now() - interval '5 minutes'")
        .execute(&pool)
        .await
        .unwrap();
    // Wrong worker: no effect.
    queue::heartbeat(&pool, "w2", &ids).await.unwrap();
    let stale: bool =
        sqlx::query_scalar("SELECT heartbeat_at < now() - interval '1 minute' FROM jobs")
            .fetch_one(&pool)
            .await
            .unwrap();
    assert!(stale);
    // Owning worker: refreshed.
    queue::heartbeat(&pool, "w1", &ids).await.unwrap();
    let fresh: bool =
        sqlx::query_scalar("SELECT heartbeat_at > now() - interval '1 minute' FROM jobs")
            .fetch_one(&pool)
            .await
            .unwrap();
    assert!(fresh);
}
