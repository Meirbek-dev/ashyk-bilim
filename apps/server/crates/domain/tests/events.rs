//! Grading events on the real test Redis: publish → replay after an id,
//! blocking reads that wake on a publish, and the per-user connection cap.
#![allow(clippy::unwrap_used, clippy::expect_used, clippy::panic)]

use std::time::Duration;

use ab_core::id::{SubmissionId, UserId};
use ab_domain::events::{GradingEvents, MAX_CONNECTIONS_PER_USER};
use ab_domain::identity::SessionStore;

async fn events() -> GradingEvents {
    let url = std::env::var("TEST_REDIS_URL").unwrap_or_else(|_| "redis://localhost:6380".into());
    let store = SessionStore::connect(&url)
        .await
        .expect("test redis reachable (see AGENTS.md local dev stack)");
    GradingEvents::new(store.client(), store.redis())
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
    assert_eq!(all[0].submission_id, submission);
    let after_first = events.replay(submission, &first, 100).await.unwrap();
    assert_eq!(after_first.len(), 1);
    assert_eq!(after_first[0].event_id, second);

    let mut subscriber = events.subscriber().await.unwrap();
    let nothing = subscriber
        .read(submission, &second, Duration::from_millis(200), 10)
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
