//! `ab-db` — Postgres access: pool construction, embedded migrations, and
//! (slice 0.8) the transactional job queue.
//!
//! Conventions (see ARCHITECTURE §8): `query!`/`query_as!` for static SQL with
//! the committed `.sqlx` offline cache; `QueryBuilder` for dynamic SQL;
//! `AssertSqlSafe` only with a `// SAFETY:` comment.

pub mod assessments;
pub mod catalog;
pub mod certifications;
pub mod collections;
pub mod discussions;
pub mod file_submissions;
pub mod gamification;
pub mod identity;
pub mod platform;
pub mod progress;
pub mod queue;
pub mod schedule;
pub mod search;
pub mod submissions;
pub mod uploads;
pub mod usergroups;
pub mod work_queue;

use std::time::Duration;

use ab_core::Result;
use ab_core::config::DatabaseConfig;
use secrecy::ExposeSecret;
use sqlx::PgPool;
use sqlx::postgres::PgPoolOptions;

/// All migrations, embedded at compile time from `apps/server/migrations/`.
pub static MIGRATOR: sqlx::migrate::Migrator = sqlx::migrate!("../../migrations");

/// Build the application pool. Fail-fast: connection errors surface at boot,
/// not on the first request.
pub async fn connect(config: &DatabaseConfig) -> Result<PgPool> {
    let pool = PgPoolOptions::new()
        .max_connections(config.max_connections)
        .min_connections(config.min_connections)
        .acquire_timeout(Duration::from_secs(10))
        .connect(config.url.expose_secret())
        .await?;
    Ok(pool)
}

/// Cheap connectivity probe for readiness checks.
pub async fn ping(pool: &PgPool) -> Result<()> {
    sqlx::query("SELECT 1").execute(pool).await?;
    Ok(())
}
