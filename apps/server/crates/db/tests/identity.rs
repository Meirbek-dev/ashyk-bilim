//! Identity schema + seed integrity on real Postgres.
#![allow(clippy::unwrap_used, clippy::expect_used, clippy::panic)]

use ab_core::permission::{Action, Permission, PermissionSet, ResourceType, Scope};
use sqlx::PgPool;

#[ab_testdb::test]
async fn six_system_roles_are_seeded(pool: PgPool) {
    let roles: Vec<(String, i32)> =
        sqlx::query_as("SELECT slug, priority FROM roles WHERE is_system ORDER BY priority DESC")
            .fetch_all(&pool)
            .await
            .unwrap();
    let expected = [
        ("admin", 100),
        ("maintainer", 70),
        ("instructor", 50),
        ("moderator", 40),
        ("user", 10),
        ("guest", 0),
    ];
    assert_eq!(roles.len(), expected.len());
    for ((slug, prio), (exp_slug, exp_prio)) in roles.iter().zip(expected) {
        assert_eq!(slug, exp_slug);
        assert_eq!(*prio, exp_prio);
    }
}

/// Every seeded grant string must parse through the typed permission engine -
/// the DB seeds and the Rust registry cannot drift apart.
#[ab_testdb::test]
async fn all_seeded_grants_parse(pool: PgPool) {
    let grants: Vec<String> =
        sqlx::query_scalar("SELECT DISTINCT permission FROM role_permissions")
            .fetch_all(&pool)
            .await
            .unwrap();
    assert!(!grants.is_empty());
    let refs: Vec<&str> = grants.iter().map(String::as_str).collect();
    let set = PermissionSet::parse(refs.iter().copied())
        .unwrap_or_else(|e| panic!("seeded grant failed to parse: {e}"));
    // Sanity: the parsed set behaves (admin wildcard is in the union).
    assert!(set.grants(&Permission {
        resource: ResourceType::Course,
        action: Action::Delete,
        scope: Some(Scope::Platform),
    }));
}

/// Spot-check ported semantics: instructor can grade own assessments, a plain
/// user cannot; guest reads courses.
#[ab_testdb::test]
async fn role_grant_semantics_spot_checks(pool: PgPool) {
    let load = |slug: &'static str| {
        let pool = pool.clone();
        async move {
            let grants: Vec<String> = sqlx::query_scalar(
                "SELECT permission FROM role_permissions rp
                 JOIN roles r ON r.id = rp.role_id WHERE r.slug = $1",
            )
            .bind(slug)
            .fetch_all(&pool)
            .await
            .unwrap();
            PermissionSet::parse(grants.iter().map(String::as_str)).unwrap()
        }
    };
    let grade_own = Permission {
        resource: ResourceType::Assessment,
        action: Action::Grade,
        scope: Some(Scope::Own),
    };
    let read_courses = Permission {
        resource: ResourceType::Course,
        action: Action::Read,
        scope: Some(Scope::All),
    };

    assert!(load("instructor").await.grants(&grade_own));
    assert!(!load("user").await.grants(&grade_own));
    assert!(load("guest").await.grants(&read_courses));
    assert!(!load("guest").await.grants(&grade_own));
}

#[ab_testdb::test]
async fn user_constraints_and_role_cascade(pool: PgPool) {
    let user_id: uuid::Uuid = sqlx::query_scalar(
        "INSERT INTO users (zitadel_user_id, username, email)
         VALUES ('z-1', 'meirbek', 'm@example.com') RETURNING id",
    )
    .fetch_one(&pool)
    .await
    .unwrap();

    // Unique zitadel link + username + email all enforced.
    for dup in [
        "INSERT INTO users (zitadel_user_id, username, email) VALUES ('z-1', 'other', 'o@example.com')",
        "INSERT INTO users (zitadel_user_id, username, email) VALUES ('z-2', 'meirbek', 'o@example.com')",
        "INSERT INTO users (zitadel_user_id, username, email) VALUES ('z-2', 'other', 'm@example.com')",
    ] {
        assert!(sqlx::query(dup).execute(&pool).await.is_err());
    }

    sqlx::query(
        "INSERT INTO user_roles (user_id, role_id)
         SELECT $1, id FROM roles WHERE slug = 'instructor'",
    )
    .bind(user_id)
    .execute(&pool)
    .await
    .unwrap();

    // Deleting the user cascades the assignment, not the role.
    sqlx::query("DELETE FROM users WHERE id = $1")
        .bind(user_id)
        .execute(&pool)
        .await
        .unwrap();
    let assignments: i64 = sqlx::query_scalar("SELECT count(*) FROM user_roles")
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(assignments, 0);
    let roles: i64 = sqlx::query_scalar("SELECT count(*) FROM roles")
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(roles, 6);
}

/// Review 3, item 27: audit IPs are `inet`; a forwarded value that is not an
/// address is kept as NULL instead of rejecting the audit row.
#[ab_testdb::test]
async fn audit_ips_are_inet_and_junk_is_null(pool: PgPool) {
    for (ip, want) in [
        (Some("203.0.113.7"), Some("203.0.113.7")),
        (Some("2001:db8::1"), Some("2001:db8::1")),
        (Some("unknown, 10.0.0.1"), None),
        (None, None),
    ] {
        ab_db::identity::insert_auth_audit(
            &pool,
            None,
            "probe-new",
            ip,
            None,
            serde_json::json!({}),
        )
        .await
        .unwrap();
        let stored: Vec<Option<String>> = sqlx::query_scalar(
            "DELETE FROM auth_audit_log WHERE event LIKE 'probe-%' RETURNING host(ip_address)",
        )
        .fetch_all(&pool)
        .await
        .unwrap();
        assert_eq!(stored, vec![want.map(str::to_owned)], "{ip:?}");
    }
}

async fn state(pool: &PgPool, id: uuid::Uuid) -> (bool, Option<bool>, bool) {
    sqlx::query_as(
        "SELECT disabled_at IS NOT NULL, email_verified, email_verified_at IS NOT NULL
         FROM users WHERE id = $1",
    )
    .bind(id)
    .fetch_one(pool)
    .await
    .unwrap()
}

/// Review 3, items 28-29: the account state is `disabled_at` /
/// `email_verified_at`; a write to either email column (the old one stays
/// while it still means "not known yet") shows up on the other side, and a
/// deleted account keeps a `disabled_at`.
#[ab_testdb::test]
async fn account_state_timestamps_mirror_the_old_columns(pool: PgPool) {
    use ab_core::id::UserId;
    let id = ab_db::identity::create_user_with_default_role(
        &pool,
        "z-state",
        "state",
        "state@example.com",
        "S",
        None,
        "",
        false,
    )
    .await
    .unwrap()
    .unwrap();
    assert_eq!(state(&pool, id.0).await, (false, Some(false), false));

    // This release writes the new columns.
    ab_db::identity::set_email_verified(&pool, id, true)
        .await
        .unwrap();
    let mut conn = pool.acquire().await.unwrap();
    ab_db::identity::set_user_status(&mut conn, id, "disabled")
        .await
        .unwrap();
    assert_eq!(state(&pool, id.0).await, (true, Some(true), true));
    assert_eq!(
        ab_db::identity::user_status(&pool, id)
            .await
            .unwrap()
            .as_deref(),
        Some("disabled")
    );

    // The old email column still moves the new one.
    sqlx::query("UPDATE users SET disabled_at = NULL, email_verified = false WHERE id = $1")
        .bind(id.0)
        .execute(&pool)
        .await
        .unwrap();
    assert_eq!(state(&pool, id.0).await, (false, Some(false), false));
    let profile = ab_db::identity::get_profile(&pool, id)
        .await
        .unwrap()
        .unwrap();
    assert_eq!(profile.email_verified, Some(false));
    let old: uuid::Uuid = sqlx::query_scalar(
        "INSERT INTO users (zitadel_user_id, username, email, disabled_at, email_verified)
         VALUES ('z-old', 'old', 'old@example.com', now(), true) RETURNING id",
    )
    .fetch_one(&pool)
    .await
    .unwrap();
    assert_eq!(state(&pool, old).await, (true, Some(true), true));
    // An account older than `email_verified` stays "not known yet".
    let unknown: uuid::Uuid = sqlx::query_scalar(
        "INSERT INTO users (zitadel_user_id, username, email) VALUES ('z-u', 'u', 'u@example.com')
         RETURNING id",
    )
    .fetch_one(&pool)
    .await
    .unwrap();
    let profile = ab_db::identity::get_profile(&pool, UserId(unknown))
        .await
        .unwrap()
        .unwrap();
    assert_eq!(profile.email_verified, None);

    // A deleted account is disabled on both sides.
    let mut tx = pool.begin().await.unwrap();
    assert!(
        ab_db::identity::anonymise_user(&mut tx, id, "deleted-x")
            .await
            .unwrap()
    );
    tx.commit().await.unwrap();
    assert_eq!(state(&pool, id.0).await, (true, Some(true), true));
    let revived = sqlx::query("UPDATE users SET disabled_at = NULL WHERE id = $1")
        .bind(id.0)
        .execute(&pool)
        .await;
    assert!(revived.is_err(), "a deleted account keeps disabled_at");
}
