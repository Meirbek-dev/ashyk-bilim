//! `ab-db` - Postgres access: pool construction, embedded migrations, and
//! (slice 0.8) the transactional job queue.
//!
//! Conventions (see ARCHITECTURE §8): `query!`/`query_as!` for static SQL with
//! the committed `.sqlx` offline cache; `QueryBuilder` for dynamic SQL;
//! `AssertSqlSafe` only with a `// SAFETY:` comment.

pub mod ai;
pub mod analytics;
pub mod assessment_versions;
pub mod assessments;
pub mod catalog;
pub mod certifications;
pub mod collections;
pub mod concepts;
pub mod course_copy;
pub mod discussions;
pub mod file_submissions;
pub mod gamification;
pub mod grade_drafts;
pub mod identity;
pub mod maintenance;
pub mod notifications;
pub mod platform;
pub mod progress;
pub mod queue;
pub mod retention;
pub mod retrieval;
pub mod schedule;
pub mod schema_snapshot;
pub mod search;
pub mod submissions;
pub mod uploads;
pub mod usergroups;
pub mod versions;
pub mod work_queue;

use std::str::FromStr;
use std::time::Duration;

use ab_core::Result;
use ab_core::config::DatabaseConfig;
use secrecy::ExposeSecret;
use sqlx::PgPool;
use sqlx::postgres::{PgConnectOptions, PgPoolOptions};

/// All migrations, embedded at compile time from `apps/server/migrations/`.
pub static MIGRATOR: sqlx::migrate::Migrator = sqlx::migrate!("../../migrations");

/// Every session's `search_path` (ARCHITECTURE §8 rule 8).
///
/// SQL names tables unqualified and they live in `core`, `learning`, `ai`,
/// `analytics`, `ops`. `public` (the sqlx ledger, extensions, functions) comes first: sqlx creates
/// its ledger with `CREATE TABLE IF NOT EXISTS`, which looks only in the
/// first schema. Same text as `app_search_path()` (migration 20261102090000).
pub const SEARCH_PATH: &str = "public, core, learning, ai, analytics, ops, extensions";

/// Apply the pending migrations, then set [`SEARCH_PATH`] on the database again.
///
/// `ensure_app_search_path()`: a database cloned from a template or
/// restored without `--create` has lost it, and psql, the sqlx CLI and older
/// binaries rely on it.
pub async fn migrate(pool: &PgPool) -> Result<()> {
    MIGRATOR
        .run(pool)
        .await
        .map_err(|e| ab_core::Error::internal("migrate", e))?;
    sqlx::query_scalar!(r#"SELECT ensure_app_search_path() AS "level!""#)
        .fetch_one(pool)
        .await?;
    Ok(())
}

/// The process that opens a pool: names its sessions (`application_name`,
/// seen in `pg_stat_activity`, `pg_stat_statements` and the Postgres log)
/// and picks its limits (`DatabaseLimits`).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Process {
    Serve,
    Worker,
    /// `ashyq admin ...`: one-shot backfills an operator watches; no
    /// statement limit.
    Admin,
    /// `ashyq migrate`: no statement or lock limit (index builds; each
    /// transactional file sets its own `lock_timeout`).
    Migrate,
}

impl Process {
    #[must_use]
    pub const fn application_name(self) -> &'static str {
        match self {
            Self::Serve => "ashyq-serve",
            Self::Worker => "ashyq-worker",
            Self::Admin => "ashyq-admin",
            Self::Migrate => "ashyq-migrate",
        }
    }
}

/// Build the application pool. Fail-fast: connection errors surface at boot,
/// not on the first request.
pub async fn connect(config: &DatabaseConfig, process: Process) -> Result<PgPool> {
    let options = PgConnectOptions::from_str(config.url.expose_secret())?;
    connect_with(options, config, process).await
}

/// [`connect`] with parsed options (tests reuse a test database's options).
///
/// The limits, [`SEARCH_PATH`] and the platform zone ([`with_platform_zone`])
/// go into the startup packet, so they hold for any role and override its
/// `ALTER ROLE ... SET` defaults.
pub async fn connect_with(
    options: PgConnectOptions,
    config: &DatabaseConfig,
    process: Process,
) -> Result<PgPool> {
    let limits = config.limits;
    let statement = match process {
        Process::Serve | Process::Worker => limits.statement_timeout_secs,
        Process::Admin | Process::Migrate => 0,
    };
    let lock = match process {
        Process::Migrate => 0,
        _ => limits.lock_timeout_secs,
    };
    let options = options
        .application_name(process.application_name())
        .options([
            ("statement_timeout", format!("{statement}s")),
            (
                "idle_in_transaction_session_timeout",
                format!("{}s", limits.idle_in_transaction_timeout_secs),
            ),
            ("lock_timeout", format!("{lock}s")),
            ("search_path", SEARCH_PATH.to_owned()),
        ]);
    let options = with_platform_zone(options);
    let pool = PgPoolOptions::new()
        .max_connections(config.max_connections)
        .min_connections(config.min_connections)
        .acquire_timeout(Duration::from_secs(10))
        .connect_with(options)
        .await?;
    Ok(pool)
}

/// Pass the platform zone to the session as `ab.time_zone`.
///
/// SQL that needs the platform day (`platform_date()`,
/// `platform_day_start()`) reads it through `platform_time_zone()`, so Rust
/// ([`ab_core::time::Day`], `AB__SERVER__TIME_ZONE`) and SQL cut days at the
/// same midnight. A session without it (psql, `just db sql`) falls back to
/// `Asia/Almaty`. Every pool goes through here, the test pools of
/// `ab-testdb` too.
#[must_use]
pub fn with_platform_zone(options: PgConnectOptions) -> PgConnectOptions {
    match ab_core::time::time_zone().iana_name() {
        Some(zone) => options.options([("ab.time_zone", zone)]),
        None => options,
    }
}

/// Cheap connectivity probe for readiness checks.
pub async fn ping(pool: &PgPool) -> Result<()> {
    sqlx::query("SELECT 1").execute(pool).await?;
    Ok(())
}

/// Escape user text for a `LIKE`/`ILIKE … ESCAPE '\'` pattern.
///
/// Every character then matches literally: `\` first (it is the escape
/// character), then `%` and `_` (UX-143, UX-183, UX-184). Every user-text
/// LIKE search routes through here.
#[must_use]
pub fn like_escape(s: &str) -> String {
    s.replace('\\', r"\\")
        .replace('%', r"\%")
        .replace('_', r"\_")
}

#[cfg(test)]
mod tests {
    #[test]
    fn like_escape_makes_metacharacters_literal() {
        assert_eq!(super::like_escape(r"a\x%_b"), r"a\\x\%\_b");
        assert_eq!(super::like_escape("plain"), "plain");
    }

    // sqlx checksums the bytes: a CRLF working copy (Windows) builds a binary whose
    // `ashyq migrate` refuses every database migrated from LF (CI, prod).
    #[test]
    fn migrations_are_embedded_with_lf() {
        let crlf: Vec<i64> = super::MIGRATOR
            .iter()
            .filter(|m| m.sql.as_str().contains('\r'))
            .map(|m| m.version)
            .collect();
        assert!(
            crlf.is_empty(),
            "CRLF in migrations {crlf:?}: run `just eol`"
        );
    }
}
