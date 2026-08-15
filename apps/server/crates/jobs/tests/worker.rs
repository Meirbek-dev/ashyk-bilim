//! Worker runtime against real Postgres: execution, retry/dead-letter,
//! unknown-kind handling, graceful drain.
#![allow(clippy::unwrap_used, clippy::expect_used)]

use std::sync::Arc;
use std::sync::atomic::{AtomicUsize, Ordering};
use std::time::Duration;

use ab_core::{Error, ErrorCode, Result};
use ab_db::queue::{self, NewJob};
use ab_jobs::{JobHandler, Worker, WorkerConfig};
use futures::FutureExt;
use futures::future::BoxFuture;
use sqlx::PgPool;
use tokio_util::sync::CancellationToken;

const fn fast_config() -> WorkerConfig {
    WorkerConfig {
        concurrency: 4,
        poll_interval: Duration::from_millis(50),
        heartbeat_interval: Duration::from_millis(500),
        reap_after: Duration::from_secs(30),
        reap_interval: Duration::from_secs(30),
    }
}

struct Counting {
    hits: Arc<AtomicUsize>,
}

impl JobHandler for Counting {
    fn kind(&self) -> &'static str {
        "test:ok"
    }
    fn handle(&self, _payload: serde_json::Value) -> BoxFuture<'static, Result<()>> {
        let hits = Arc::clone(&self.hits);
        async move {
            hits.fetch_add(1, Ordering::SeqCst);
            Ok(())
        }
        .boxed()
    }
}

struct AlwaysFails;

impl JobHandler for AlwaysFails {
    fn kind(&self) -> &'static str {
        "test:fail"
    }
    fn handle(&self, _payload: serde_json::Value) -> BoxFuture<'static, Result<()>> {
        async { Err(Error::app(ErrorCode::Internal, "intentional test failure")) }.boxed()
    }
}

/// Poll the DB until `query` returns the expected count or time out.
async fn wait_for_status(pool: &PgPool, status: &str, expected: i64) {
    let deadline = tokio::time::Instant::now() + Duration::from_secs(10);
    loop {
        let count: i64 = sqlx::query_scalar("SELECT count(*) FROM jobs WHERE status = $1")
            .bind(status)
            .fetch_one(pool)
            .await
            .unwrap();
        if count == expected {
            return;
        }
        assert!(
            tokio::time::Instant::now() < deadline,
            "timed out waiting for {expected} jobs with status '{status}' (have {count})"
        );
        tokio::time::sleep(Duration::from_millis(25)).await;
    }
}

#[sqlx::test(migrations = "../../migrations")]
async fn worker_executes_jobs_and_drains_on_cancel(pool: PgPool) {
    let hits = Arc::new(AtomicUsize::new(0));
    let worker = Worker::new(pool.clone(), fast_config())
        .register(Counting {
            hits: Arc::clone(&hits),
        })
        .unwrap();

    for i in 0..3 {
        queue::enqueue(
            &pool,
            &NewJob::new("test:ok", serde_json::json!({ "n": i })),
        )
        .await
        .unwrap();
    }

    let cancel = CancellationToken::new();
    let handle = tokio::spawn(worker.run(cancel.clone()));

    wait_for_status(&pool, "succeeded", 3).await;
    assert_eq!(hits.load(Ordering::SeqCst), 3);

    cancel.cancel();
    handle.await.unwrap().unwrap();
}

#[sqlx::test(migrations = "../../migrations")]
async fn failing_job_exhausts_attempts_and_dead_letters(pool: PgPool) {
    let worker = Worker::new(pool.clone(), fast_config())
        .register(AlwaysFails)
        .unwrap();

    queue::enqueue(
        &pool,
        &NewJob::new("test:fail", serde_json::json!({})).max_attempts(1),
    )
    .await
    .unwrap();

    let cancel = CancellationToken::new();
    let handle = tokio::spawn(worker.run(cancel.clone()));

    wait_for_status(&pool, "dead", 1).await;
    let error: Option<String> = sqlx::query_scalar("SELECT last_error FROM jobs")
        .fetch_one(&pool)
        .await
        .unwrap();
    assert!(error.unwrap().contains("intentional test failure"));

    cancel.cancel();
    handle.await.unwrap().unwrap();
}

#[sqlx::test(migrations = "../../migrations")]
async fn unknown_kind_is_dead_lettered_not_retried(pool: PgPool) {
    let worker = Worker::new(pool.clone(), fast_config());

    queue::enqueue(
        &pool,
        &NewJob::new("nobody:handles-this", serde_json::json!({})),
    )
    .await
    .unwrap();

    let cancel = CancellationToken::new();
    let handle = tokio::spawn(worker.run(cancel.clone()));

    wait_for_status(&pool, "dead", 1).await;
    let (attempts, error): (i32, Option<String>) =
        sqlx::query_as("SELECT attempts, last_error FROM jobs")
            .fetch_one(&pool)
            .await
            .unwrap();
    assert_eq!(attempts, 1, "unknown kinds must not be retried");
    assert!(error.unwrap().contains("no handler registered"));

    cancel.cancel();
    handle.await.unwrap().unwrap();
}

#[test]
fn duplicate_handler_registration_is_rejected() {
    // Pure wiring check — no DB. Worker::new needs a pool, so use a lazy one.
    let pool = sqlx::postgres::PgPoolOptions::new().connect_lazy("postgres://unused/unused");
    let worker = Worker::new(pool.unwrap(), WorkerConfig::default());
    let hits = Arc::new(AtomicUsize::new(0));
    let worker = worker
        .register(Counting {
            hits: Arc::clone(&hits),
        })
        .unwrap();
    assert!(worker.register(Counting { hits }).is_err());
}
