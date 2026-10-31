//! `ab-testdb` - a fresh migrated database per test, cloned from a template (dev-dependency only).
//!
//! `#[sqlx::test]` creates an empty database and replays every migration for each test: about 1.5 s of
//! the median 1.8 s server test. `#[ab_testdb::test]` migrates one template per migration set, shared by
//! every test process and checkout on the cluster (built once under an advisory lock), and gives each test
//! `CREATE DATABASE ... TEMPLATE` (about 0.2 s).
//!
//! ```ignore
//! #[ab_testdb::test]
//! async fn creates_a_course(pool: PgPool) { /* ... */ }
//! ```
//!
//! The database of a passing test is dropped; a failing test's stays for inspection (`just db ls`) and is
//! replaced by the next run of the same test. `just db test-reset` drops leftovers and old templates.
#![allow(
    clippy::expect_used,
    clippy::panic,
    clippy::missing_panics_doc,
    clippy::print_stderr
)]

use std::future::Future;
use std::path::PathBuf;
use std::str::FromStr;
use std::time::Duration;

use sqlx::migrate::Migrator;
use sqlx::postgres::{PgConnectOptions, PgPoolOptions};
use sqlx::{AssertSqlSafe, Connection, Executor, PgConnection, PgPool};

pub use ab_testdb_macros::test;

/// Templates kept on the cluster: a worktree on another migration set keeps its own while it runs.
const KEEP_TEMPLATES: i64 = 3;
/// `pg_advisory_lock` key for template builds: ASCII "abtpl".
const LOCK: i64 = 0x61_62_74_70_6c;

/// Body of a `#[ab_testdb::test]`: runs `test` on a current-thread runtime, like `#[sqlx::test]`.
pub fn run<F, Fut>(test_path: &str, test: F)
where
    F: FnOnce(PgPool) -> Fut,
    Fut: Future<Output = ()>,
{
    let runtime = tokio::runtime::Builder::new_current_thread()
        .enable_all()
        .build()
        .expect("tokio runtime");
    runtime.block_on(async {
        let url = std::env::var("DATABASE_URL").expect(
            "DATABASE_URL: run tests through `just server test` / `just check` (dev stack up)",
        );
        let master = PgConnectOptions::from_str(&url).expect("DATABASE_URL is not a Postgres URL");
        let mut admin = PgConnection::connect_with(&master)
            .await
            .expect("connect to the test cluster");
        let template = ensure_template(&mut admin, &master, &ab_db::MIGRATOR).await;
        let name = database_name(test_path);
        clone(&mut admin, &template, &name).await;
        let pool = PgPoolOptions::new()
            // Like `#[sqlx::test]`: no test takes the whole cluster.
            .max_connections(5)
            .idle_timeout(Some(Duration::from_secs(1)))
            .connect_lazy_with(master.clone().database(&name));
        test(pool.clone()).await;
        pool.close().await;
        drop_database(&mut admin, &name).await;
        let _ = admin.close().await;
    });
}

/// `_ab_test_<hash>` of the test binary and test path: unique per checkout, stable across runs.
fn database_name(test_path: &str) -> String {
    let exe = std::env::current_exe().unwrap_or_else(|_| PathBuf::from("test"));
    let mut hash = Fnv::default();
    hash.write(exe.to_string_lossy().as_bytes());
    hash.write(test_path.as_bytes());
    format!("_ab_test_{:016x}", hash.0)
}

/// `_ab_template_<hash of every migration's version and checksum>`; built if missing.
async fn ensure_template(
    admin: &mut PgConnection,
    master: &PgConnectOptions,
    migrator: &Migrator,
) -> String {
    let mut hash = Fnv::default();
    for migration in migrator.iter() {
        hash.write(&migration.version.to_le_bytes());
        hash.write(&migration.checksum);
    }
    let name = format!("_ab_template_{:016x}", hash.0);
    if is_template(admin, &name).await {
        return name;
    }
    admin
        .execute(sqlx::query("SELECT pg_advisory_lock($1)").bind(LOCK))
        .await
        .expect("template lock");
    // Another process may have built it while this one waited.
    if !is_template(admin, &name).await {
        let build = format!("{name}_build");
        drop_database(admin, &build).await;
        admin
            .execute(AssertSqlSafe(format!("CREATE DATABASE \"{build}\"")))
            .await
            .expect("create the template database");
        let mut conn = PgConnection::connect_with(&master.clone().database(&build))
            .await
            .expect("connect to the template database");
        migrator
            .run(&mut conn)
            .await
            .expect("migrate the template database");
        conn.close().await.expect("close the template connection");
        for publish in [
            format!("ALTER DATABASE \"{build}\" RENAME TO \"{name}\""),
            format!("ALTER DATABASE \"{name}\" IS_TEMPLATE true"),
        ] {
            admin
                .execute(AssertSqlSafe(publish))
                .await
                .expect("publish the template database");
        }
        prune_templates(admin).await;
    }
    admin
        .execute(sqlx::query("SELECT pg_advisory_unlock($1)").bind(LOCK))
        .await
        .expect("template unlock");
    name
}

async fn is_template(admin: &mut PgConnection, name: &str) -> bool {
    sqlx::query_scalar::<_, bool>(
        "SELECT EXISTS (SELECT 1 FROM pg_database WHERE datname = $1 AND datistemplate)",
    )
    .bind(name)
    .fetch_one(&mut *admin)
    .await
    .expect("look up the template database")
}

/// Drops all but the newest templates; one still being cloned by another run stays (the drop fails).
async fn prune_templates(admin: &mut PgConnection) {
    let old: Vec<String> = sqlx::query_scalar(
        "SELECT datname::text FROM pg_database WHERE datname LIKE '\\_ab\\_template\\_%' AND datistemplate
          ORDER BY oid DESC OFFSET $1",
    )
    .bind(KEEP_TEMPLATES)
    .fetch_all(&mut *admin)
    .await
    .unwrap_or_default();
    for name in old {
        // DROP DATABASE cannot share a statement batch (an implicit transaction).
        let unmarked = admin
            .execute(AssertSqlSafe(format!(
                "ALTER DATABASE \"{name}\" IS_TEMPLATE false"
            )))
            .await;
        if unmarked.is_ok() {
            let _ = admin
                .execute(AssertSqlSafe(format!("DROP DATABASE IF EXISTS \"{name}\"")))
                .await;
        }
    }
}

async fn clone(admin: &mut PgConnection, template: &str, name: &str) {
    drop_database(admin, name).await;
    // Postgres refuses a copy while another session is connected to the template; a concurrent build's
    // last connection may still be closing.
    for attempt in 1..=20 {
        match admin
            .execute(AssertSqlSafe(format!(
                "CREATE DATABASE \"{name}\" TEMPLATE \"{template}\""
            )))
            .await
        {
            Ok(_) => return,
            Err(error)
                if attempt < 20 && error.to_string().contains("being accessed by other users") =>
            {
                tokio::time::sleep(Duration::from_millis(50 * attempt)).await;
            }
            Err(error) => panic!("clone {template} into {name}: {error}"),
        }
    }
}

async fn drop_database(admin: &mut PgConnection, name: &str) {
    admin
        .execute(AssertSqlSafe(format!(
            "DROP DATABASE IF EXISTS \"{name}\" WITH (FORCE)"
        )))
        .await
        .expect("drop a test database");
}

/// FNV-1a: stable across processes and Rust versions, unlike `DefaultHasher`.
struct Fnv(u64);

impl Default for Fnv {
    fn default() -> Self {
        Self(0xcbf2_9ce4_8422_2325)
    }
}

impl Fnv {
    fn write(&mut self, bytes: &[u8]) {
        for byte in bytes {
            self.0 ^= u64::from(*byte);
            self.0 = self.0.wrapping_mul(0x0100_0000_01b3);
        }
    }
}
