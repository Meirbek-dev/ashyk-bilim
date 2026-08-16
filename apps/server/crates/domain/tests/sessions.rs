//! Session store semantics against real Redis.
//! Local: `podman run -d --rm --name ashyq-test-redis -p 6380:6379 redis:8-alpine`
//! CI: redis service, `TEST_REDIS_URL` env.
#![allow(clippy::unwrap_used, clippy::expect_used, clippy::panic)]

use ab_core::id::UserId;
use ab_domain::identity::{NewSession, SessionStore, sessions};

fn redis_url() -> String {
    std::env::var("TEST_REDIS_URL").unwrap_or_else(|_| "redis://localhost:6380".into())
}

fn new_session(user_id: UserId, perms: &[&str]) -> NewSession {
    NewSession {
        user_id,
        zitadel_user_id: "z-1".into(),
        zitadel_session_id: "zs-1".into(),
        zitadel_session_token: "ztok".into(),
        roles: vec!["user".into()],
        permissions: perms.iter().map(ToString::to_string).collect(),
        rbac_version: 1,
        ip: Some("127.0.0.1".into()),
        user_agent: Some("test".into()),
    }
}

#[tokio::test]
async fn create_get_touch_revoke_roundtrip() {
    let store = SessionStore::connect(&redis_url()).await.unwrap();
    let user = UserId::new();

    let id = store
        .create(new_session(user, &["course:read:all"]))
        .await
        .unwrap();
    assert_eq!(id.len(), 64, "opaque 256-bit hex id");

    let record = store
        .get_and_touch(&id)
        .await
        .unwrap()
        .expect("live session");
    assert_eq!(record.user_id, user);
    assert_eq!(record.permissions, vec!["course:read:all"]);

    store.revoke(user, &id).await.unwrap();
    assert!(store.get_and_touch(&id).await.unwrap().is_none());
    assert!(store.list(user).await.unwrap().is_empty());
}

#[tokio::test]
async fn unknown_session_is_none() {
    let store = SessionStore::connect(&redis_url()).await.unwrap();
    assert!(
        store
            .get_and_touch("no-such-session")
            .await
            .unwrap()
            .is_none()
    );
}

#[tokio::test]
async fn concurrent_sessions_are_capped_with_oldest_evicted() {
    let store = SessionStore::connect(&redis_url()).await.unwrap();
    let user = UserId::new();

    let mut ids = Vec::new();
    for _ in 0..(sessions::MAX_SESSIONS_PER_USER + 3) {
        ids.push(store.create(new_session(user, &[])).await.unwrap());
        // zset scores are unix seconds; nudge ordering determinism.
        tokio::time::sleep(std::time::Duration::from_millis(5)).await;
    }

    let live = store.list(user).await.unwrap();
    assert_eq!(live.len(), sessions::MAX_SESSIONS_PER_USER);
    // The first three (oldest) are gone; the newest survives.
    assert!(store.get_and_touch(&ids[0]).await.unwrap().is_none());
    assert!(
        store
            .get_and_touch(ids.last().unwrap())
            .await
            .unwrap()
            .is_some()
    );

    store.revoke_all(user).await.unwrap();
    assert!(store.list(user).await.unwrap().is_empty());
}

#[tokio::test]
async fn rewrite_propagates_permissions_to_live_sessions() {
    let store = SessionStore::connect(&redis_url()).await.unwrap();
    let user = UserId::new();
    let a = store
        .create(new_session(user, &["course:read:all"]))
        .await
        .unwrap();
    let b = store
        .create(new_session(user, &["course:read:all"]))
        .await
        .unwrap();

    let updated = store
        .rewrite_user_sessions(
            user,
            &["instructor".into()],
            &["course:read:all".into(), "course:update:own".into()],
            2,
        )
        .await
        .unwrap();
    assert_eq!(updated, 2);

    for id in [&a, &b] {
        let record = store.get_and_touch(id).await.unwrap().unwrap();
        assert_eq!(record.rbac_version, 2);
        assert_eq!(record.roles, vec!["instructor"]);
        assert_eq!(record.permissions.len(), 2);
    }
    store.revoke_all(user).await.unwrap();
}
