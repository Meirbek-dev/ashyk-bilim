//! Review 3, item 39: the pool sets session limits and a name on connect
//! (startup options, so any role gets them and they win over the role's
//! `ALTER ROLE ... SET`); migrate and admin run without a statement limit.
//! The platform zone goes in the same way (`ab.time_zone`).
#![allow(clippy::unwrap_used, clippy::expect_used, clippy::panic)]

use ab_core::config::{DatabaseConfig, DatabaseLimits};
use ab_db::Process;
use secrecy::SecretString;
use sqlx::PgPool;

async fn settings(pool: &PgPool) -> (String, String, String, String) {
    sqlx::query_as(
        "SELECT current_setting('application_name'), current_setting('statement_timeout'),
                current_setting('idle_in_transaction_session_timeout'),
                current_setting('lock_timeout')",
    )
    .fetch_one(pool)
    .await
    .unwrap()
}

#[ab_testdb::test]
async fn the_pool_names_its_sessions_and_bounds_them(pool: PgPool) {
    let config = DatabaseConfig {
        url: SecretString::from("unused: connect_with takes the options"),
        max_connections: 1,
        min_connections: 0,
        limits: DatabaseLimits {
            statement_timeout_secs: 90,
            idle_in_transaction_timeout_secs: 45,
            lock_timeout_secs: 7,
        },
    };
    let options = (*pool.connect_options()).clone();

    let worker = ab_db::connect_with(options.clone(), &config, Process::Worker)
        .await
        .unwrap();
    assert_eq!(
        settings(&worker).await,
        (
            "ashyq-worker".into(),
            "90s".into(),
            "45s".into(),
            "7s".into()
        )
    );
    // The platform zone rides along for SQL's platform day (default config).
    let zone: Option<String> = sqlx::query_scalar("SELECT current_setting('ab.time_zone', true)")
        .fetch_one(&worker)
        .await
        .unwrap();
    assert_eq!(zone.as_deref(), Some("Asia/Almaty"));
    let timed_out = sqlx::query("SELECT pg_sleep(2)")
        .execute(
            &ab_db::connect_with(
                options.clone(),
                &DatabaseConfig {
                    limits: DatabaseLimits {
                        statement_timeout_secs: 1,
                        ..config.limits
                    },
                    ..config.clone()
                },
                Process::Serve,
            )
            .await
            .unwrap(),
        )
        .await;
    assert!(
        timed_out.is_err(),
        "a statement past the limit is cancelled"
    );

    let migrate = ab_db::connect_with(options.clone(), &config, Process::Migrate)
        .await
        .unwrap();
    assert_eq!(
        settings(&migrate).await,
        ("ashyq-migrate".into(), "0".into(), "45s".into(), "0".into())
    );
    let admin = ab_db::connect_with(options, &config, Process::Admin)
        .await
        .unwrap();
    assert_eq!(
        settings(&admin).await,
        ("ashyq-admin".into(), "0".into(), "45s".into(), "7s".into())
    );
}
