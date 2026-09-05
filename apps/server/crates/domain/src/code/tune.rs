//! `ashyq admin judge0-tune`: the legacy `judge0_patch.py`, run on demand.
//!
//! Judge0's `languages` table ships compiler/run commands that blow the
//! sandbox's memory and thread limits for managed runtimes. The legacy API
//! patched them from a daemon thread on every boot (polling for two minutes
//! until Judge0 had created the table); v2 makes it an operator command in
//! the cutover runbook — idempotent, so it may be repeated after a Judge0
//! image upgrade re-seeds the table.

use ab_core::{Error, Result};
use sqlx::postgres::PgPoolOptions;

/// Verbatim from the legacy patch, keyed by Judge0 language id.
const PATCHES: &[(i32, &str)] = &[
    (
        60,
        "UPDATE languages SET compile_cmd = 'CGO_ENABLED=0 GOMAXPROCS=1 GOGC=30 \
         GOCACHE=/tmp/.cache/go-build /usr/local/go-1.13.5/bin/go build -p 1 %s main.go' \
         WHERE id = 60",
    ),
    (
        22,
        "UPDATE languages SET compile_cmd = 'CGO_ENABLED=0 GOMAXPROCS=1 GOGC=30 \
         GOCACHE=/tmp/.cache/go-build /usr/local/go-1.9/bin/go build -p 1 %s main.go' \
         WHERE id = 22",
    ),
    (
        62,
        "UPDATE languages SET compile_cmd = '/usr/local/openjdk13/bin/javac -J-Xmx96m -J-Xms16m \
         -J-XX:MaxMetaspaceSize=96m -J-XX:CompressedClassSpaceSize=16m \
         -J-XX:ReservedCodeCacheSize=16m -J-XX:+UseSerialGC -J-XX:TieredStopAtLevel=1 %s Main.java', \
         run_cmd = '/usr/bin/env MALLOC_ARENAS_MAX=1 /usr/local/openjdk13/bin/java -Xint -Xmx64m \
         -Xms8m -Xss512k -XX:VMThreadStackSize=512 -XX:CompilerThreadStackSize=512 \
         -XX:MaxMetaspaceSize=64m -XX:CompressedClassSpaceSize=16m -XX:ReservedCodeCacheSize=16m \
         -XX:+UseSerialGC Main' WHERE id = 62",
    ),
    (
        26,
        "UPDATE languages SET compile_cmd = '/usr/local/openjdk9-openj9/bin/javac -J-Xmx64m %s Main.java', \
         run_cmd = '/usr/bin/env MALLOC_ARENAS_MAX=1 /usr/local/openjdk9-openj9/bin/java -Xint -Xmx16m \
         -Xms8m -Xss256k Main' WHERE id = 26",
    ),
    (
        27,
        "UPDATE languages SET compile_cmd = '/usr/lib/jvm/java-8-openjdk-amd64/bin/javac -J-Xmx96m \
         -J-Xms16m -J-XX:MaxMetaspaceSize=96m -J-XX:CompressedClassSpaceSize=16m \
         -J-XX:ReservedCodeCacheSize=16m -J-XX:+UseSerialGC -J-XX:TieredStopAtLevel=1 %s Main.java', \
         run_cmd = '/usr/bin/env MALLOC_ARENAS_MAX=1 /usr/lib/jvm/java-8-openjdk-amd64/bin/java -Xint \
         -Xmx64m -Xms8m -Xss512k -XX:VMThreadStackSize=512 -XX:CompilerThreadStackSize=512 \
         -XX:MaxMetaspaceSize=64m -XX:CompressedClassSpaceSize=16m -XX:ReservedCodeCacheSize=16m \
         -XX:+UseSerialGC Main' WHERE id = 27",
    ),
    (
        28,
        "UPDATE languages SET compile_cmd = '/usr/lib/jvm/java-7-openjdk-amd64/bin/javac -J-Xmx96m \
         -J-Xms16m -J-XX:MaxPermSize=96m -J-XX:ReservedCodeCacheSize=16m -J-XX:+UseSerialGC \
         -J-XX:TieredStopAtLevel=1 %s Main.java', \
         run_cmd = '/usr/bin/env MALLOC_ARENAS_MAX=1 /usr/lib/jvm/java-7-openjdk-amd64/bin/java -Xint \
         -Xmx64m -Xms8m -Xss512k -XX:VMThreadStackSize=512 -XX:CompilerThreadStackSize=512 \
         -XX:MaxPermSize=64m -XX:ReservedCodeCacheSize=16m -XX:+UseSerialGC Main' WHERE id = 28",
    ),
    (
        78,
        "UPDATE languages SET compile_cmd = '/usr/bin/env JAVA_OPTS=\"-Xmx512m -Xms64m \
         -XX:MaxMetaspaceSize=256m -XX:CompressedClassSpaceSize=64m -XX:ReservedCodeCacheSize=64m \
         -XX:+UseSerialGC\" /usr/local/kotlin-1.3.70/bin/kotlinc %s Main.kt -include-runtime -d main.jar', \
         run_cmd = '/usr/bin/env MALLOC_ARENAS_MAX=1 /usr/local/openjdk13/bin/java -Xint -Xmx64m \
         -Xms8m -Xss512k -XX:VMThreadStackSize=512 -XX:CompilerThreadStackSize=512 \
         -XX:MaxMetaspaceSize=64m -XX:CompressedClassSpaceSize=16m -XX:ReservedCodeCacheSize=16m \
         -XX:+UseSerialGC -jar main.jar' WHERE id = 78",
    ),
];

/// What the command did.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct TuneReport {
    pub statements: usize,
    pub rows_updated: u64,
}

/// Apply the patches to the Judge0 database at `database_url`. Refuses when
/// the `languages` table is missing or the core rows (22, 60, 62) are not
/// there yet — Judge0 seeds them on its first boot.
pub async fn apply(database_url: &str) -> Result<TuneReport> {
    let pool = PgPoolOptions::new()
        .max_connections(1)
        .connect(database_url)
        .await
        .map_err(|e| Error::internal("connecting to the judge0 database", e))?;
    let present: Option<i64> =
        sqlx::query_scalar("SELECT count(*) FROM languages WHERE id IN (22, 60, 62)")
            .fetch_optional(&pool)
            .await
            .map_err(|e| Error::internal("checking judge0 languages table", e))?;
    if present.unwrap_or(0) < 3 {
        return Err(Error::config(
            "judge0 languages table is missing its core rows (ids 22, 60, 62) — has Judge0 booted against this database?",
        ));
    }
    let mut rows_updated = 0;
    for (id, statement) in PATCHES {
        // Compile-time constants above, not user input.
        let result = sqlx::query(sqlx::AssertSqlSafe(*statement))
            .execute(&pool)
            .await
            .map_err(|e| Error::internal(format!("patching judge0 language {id}"), e))?;
        rows_updated += result.rows_affected();
    }
    pool.close().await;
    Ok(TuneReport {
        statements: PATCHES.len(),
        rows_updated,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn every_patch_targets_its_own_language_id() {
        for (id, statement) in PATCHES {
            assert!(
                statement.ends_with(&format!("WHERE id = {id}")),
                "patch for {id} must be scoped to that id"
            );
            assert!(statement.starts_with("UPDATE languages SET compile_cmd"));
        }
        assert_eq!(PATCHES.len(), 7);
    }
}
