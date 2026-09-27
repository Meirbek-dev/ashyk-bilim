//! Grading events on the real test Redis: publish → replay after an id,
//! blocking reads that wake on a publish, and the per-user connection cap.
#![allow(clippy::unwrap_used, clippy::expect_used, clippy::panic)]

use std::time::Duration;

use ab_core::id::{SubmissionId, UserId};
use ab_domain::events::{GradingEvents, MAX_CONNECTIONS_PER_USER};
use ab_domain::identity::SessionStore;

async fn events() -> GradingEvents {
    events_and_redis().await.0
}

async fn events_and_redis() -> (GradingEvents, redis::aio::ConnectionManager) {
    let url = std::env::var("TEST_REDIS_URL").unwrap_or_else(|_| "redis://localhost:6380".into());
    let store = SessionStore::connect(&url)
        .await
        .expect("test redis reachable (see AGENTS.md local dev stack)");
    (
        GradingEvents::new(store.client(), store.redis()),
        store.redis(),
    )
}

#[tokio::test]
async fn publish_replay_and_blocking_read() {
    let events = events().await;
    let submission = SubmissionId::new();
    let first = events
        .publish(
            submission,
            "grade.published",
            &serde_json::json!({ "final_score": 90.0 }),
        )
        .await
        .unwrap();
    let second = events
        .publish(submission, "submission.returned", &serde_json::json!({}))
        .await
        .unwrap();
    assert!(first < second, "stream ids are monotonic");

    let all = events.replay(submission, "0-0", 100).await.unwrap();
    assert_eq!(all.len(), 2);
    assert_eq!(all[0].event, "grade.published");
    assert_eq!(all[0].event_id, first);
    assert_eq!(all[0].payload["final_score"], 90.0);
    assert_eq!(all[0].submission_id, Some(submission));
    let after_first = events.replay(submission, &first, 100).await.unwrap();
    assert_eq!(after_first.len(), 1);
    assert_eq!(after_first[0].event_id, second);

    let mut subscriber = events.subscriber().await.unwrap();
    // Longer than the redis crate's 500 ms default response timeout: an
    // idle blocking read must wait out its own window, not error.
    let nothing = subscriber
        .read(submission, &second, Duration::from_millis(800), 10)
        .await
        .unwrap();
    assert!(nothing.is_empty(), "no new events → timeout → empty");

    let publisher = events.clone();
    tokio::spawn(async move {
        tokio::time::sleep(Duration::from_millis(100)).await;
        publisher
            .publish(
                submission,
                "deadline.extended",
                &serde_json::json!({ "new_due_at": 1 }),
            )
            .await
            .unwrap();
    });
    let woken = subscriber
        .read(submission, &second, Duration::from_secs(5), 10)
        .await
        .unwrap();
    assert_eq!(woken.len(), 1);
    assert_eq!(woken[0].event, "deadline.extended");
}

#[tokio::test]
async fn connection_slots_are_capped_per_user() {
    let events = events().await;
    let user = UserId::new();
    let mut held = Vec::new();
    for _ in 0..MAX_CONNECTIONS_PER_USER {
        held.push(events.acquire_slot(user).await.unwrap().expect("slot"));
    }
    assert!(events.acquire_slot(user).await.unwrap().is_none());
    assert_eq!(
        events.slots_in_use(user).await.unwrap(),
        MAX_CONNECTIONS_PER_USER
    );
    drop(held.pop());
    // The release runs on a spawned task.
    tokio::time::sleep(Duration::from_millis(200)).await;
    assert_eq!(
        events.slots_in_use(user).await.unwrap(),
        MAX_CONNECTIONS_PER_USER - 1
    );
    assert!(events.acquire_slot(user).await.unwrap().is_some());
}

/// BUG-343 (AUD-005): a release removes only its own lease. With the old
/// counter a late release (after the key expired and a new connection took
/// a slot) ran DECR→0 then DEL and erased the new connection's slot.
#[tokio::test]
async fn late_release_never_erases_another_connection() {
    let (events, mut redis) = events_and_redis().await;
    let user = UserId::new();
    let old = events.acquire_slot(user).await.unwrap().expect("slot");
    // The set expires while `old` is still open…
    let _: i64 = redis::AsyncCommands::del(&mut redis, format!("sse_leases:{user}"))
        .await
        .unwrap();
    // …a new connection takes a slot, then `old` finally disconnects.
    let new = events.acquire_slot(user).await.unwrap().expect("slot");
    drop(old);
    // The release runs on a spawned task.
    tokio::time::sleep(Duration::from_millis(200)).await;
    assert_eq!(events.slots_in_use(user).await.unwrap(), 1);
    drop(new);
}

/// BUG-343 (AUD-006): rejected attempts must not extend leaked slots — each
/// lease keeps its own expiry, and expired leases free their slots.
#[tokio::test]
async fn rejected_attempts_do_not_keep_leaked_slots_alive() {
    let (events, mut redis) = events_and_redis().await;
    let user = UserId::new();
    let key = format!("sse_leases:{user}");
    // Five leaked leases (their releases were lost), expiring in 10 minutes.
    let now = i64::try_from(
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_secs(),
    )
    .unwrap();
    for n in 0..MAX_CONNECTIONS_PER_USER {
        let _: i64 = redis::AsyncCommands::zadd(&mut redis, &key, format!("leak-{n}"), now + 600)
            .await
            .unwrap();
    }
    for _ in 0..3 {
        assert!(events.acquire_slot(user).await.unwrap().is_none());
    }
    let unchanged: i64 = redis::AsyncCommands::zcount(&mut redis, &key, now + 600, now + 600)
        .await
        .unwrap();
    assert_eq!(
        unchanged, MAX_CONNECTIONS_PER_USER,
        "a rejected attempt must not add a lease or touch lease expiry"
    );
    // Once the leaked leases expire, the user can connect again.
    for n in 0..MAX_CONNECTIONS_PER_USER {
        let _: i64 = redis::AsyncCommands::zadd(&mut redis, &key, format!("leak-{n}"), now - 1)
            .await
            .unwrap();
    }
    assert_eq!(events.slots_in_use(user).await.unwrap(), 0);
    assert!(events.acquire_slot(user).await.unwrap().is_some());
}
