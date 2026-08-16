//! Identity schema + seed integrity on real Postgres.
#![allow(clippy::unwrap_used, clippy::expect_used, clippy::panic)]

use ab_core::permission::{Action, Permission, PermissionSet, ResourceType, Scope};
use sqlx::PgPool;

#[sqlx::test(migrations = "../../migrations")]
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

/// Every seeded grant string must parse through the typed permission engine —
/// the DB seeds and the Rust registry cannot drift apart.
#[sqlx::test(migrations = "../../migrations")]
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
#[sqlx::test(migrations = "../../migrations")]
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

#[sqlx::test(migrations = "../../migrations")]
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
