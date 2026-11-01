//! SQL the compile-time cache does not check (schema review item 50).
//!
//! `query!` / `query_as!` are verified against the schema by `just sqlx-check`.
//! Two kinds of SQL escape it:
//!
//! - a literal passed to the runtime functions `sqlx::query("...")`,
//!   `query_as::<_, T>("...")`, `query_scalar("...")` (the queue's
//!   `FOR UPDATE SKIP LOCKED`, advisory locks): every such literal in the
//!   server's `src/` is prepared here against the migrated schema, so a
//!   migration that renames or drops what one reads fails this test instead of
//!   a request in production;
//! - SQL built at run time (`QueryBuilder`, `AssertSqlSafe`): its shape depends on
//!   the input, so each file that builds one is listed in [`DYNAMIC`] with the DB
//!   test that runs its shapes. A new builder fails until it is listed, and a
//!   listed test that no longer exists fails too.
#![allow(clippy::unwrap_used, clippy::expect_used, clippy::panic)]

use std::path::{Path, PathBuf};

use sqlx::postgres::PgTypeInfo;
use sqlx::{Executor, PgPool, SqlSafeStr};

/// `(source file under crates/, test file under crates/, test function)`:
/// files that build SQL at run time and the test that executes every shape.
const DYNAMIC: &[(&str, &str, &str)] = &[];

/// Literals whose parameter types Postgres cannot deduce from the text alone
/// (one parameter used as two types): prepared with the types the code binds.
const BOUND_TYPES: &[(&str, &[&str])] = &[(
    "INSERT INTO job_schedules (kind, interval_seconds",
    &["text", "int8", "jsonb"],
)];

/// Crates whose `src/` is test support, not the server: their SQL runs only in tests.
const SUPPORT: &[&str] = &["testdb", "testdb-macros", "testkit"];

fn crates_dir() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR")).join("..")
}

fn rust_files(dir: &Path, out: &mut Vec<PathBuf>) {
    for entry in std::fs::read_dir(dir).unwrap() {
        let path = entry.unwrap().path();
        if path.is_dir() {
            rust_files(&path, out);
        } else if path.extension().is_some_and(|e| e == "rs") {
            out.push(path);
        }
    }
}

/// `(path relative to crates/, contents)` of every server source file.
fn server_sources() -> Vec<(String, String)> {
    let root = crates_dir();
    let mut files = Vec::new();
    for entry in std::fs::read_dir(&root).unwrap() {
        let dir = entry.unwrap().path();
        let name = dir.file_name().unwrap().to_string_lossy().into_owned();
        if !SUPPORT.contains(&name.as_str()) && dir.join("src").is_dir() {
            rust_files(&dir.join("src"), &mut files);
        }
    }
    files.sort();
    files
        .into_iter()
        .map(|p| {
            let rel = p
                .strip_prefix(&root)
                .unwrap()
                .to_string_lossy()
                .replace('\\', "/");
            (rel, std::fs::read_to_string(&p).unwrap())
        })
        .collect()
}

/// The Rust string literal at the start of `s` (after whitespace), unescaped:
/// `"..."` (with `\` line continuations) or `r"..."` / `r#"..."#`.
fn literal(s: &str) -> Option<String> {
    let s = s.trim_start();
    if let Some(raw) = s.strip_prefix('r') {
        let hashes = raw.len() - raw.trim_start_matches('#').len();
        let body = raw[hashes..].strip_prefix('"')?;
        let close = format!("\"{}", "#".repeat(hashes));
        return body.find(&close).map(|end| body[..end].to_owned());
    }
    let mut chars = s.strip_prefix('"')?.chars().peekable();
    let mut out = String::new();
    while let Some(ch) = chars.next() {
        match ch {
            '"' => return Some(out),
            '\\' => match chars.next()? {
                'n' => out.push('\n'),
                't' => out.push('\t'),
                '\n' => while chars.next_if(|c| c.is_whitespace()).is_some() {},
                other => out.push(other),
            },
            other => out.push(other),
        }
    }
    None
}

/// Every SQL literal handed to sqlx's runtime query functions, with its place.
fn runtime_literals(file: &str, src: &str) -> Vec<(String, String)> {
    let mut found: Vec<(usize, String)> = Vec::new();
    for call in ["sqlx::query(", "sqlx::query_scalar(", "sqlx::query_as("] {
        for (at, _) in src.match_indices(call) {
            if let Some(sql) = literal(&src[at + call.len()..]) {
                found.push((at, sql));
            }
        }
    }
    for (at, _) in src.match_indices("sqlx::query_as::<") {
        let rest = &src[at..];
        let Some(open) = rest.find(">(") else {
            continue;
        };
        if let Some(sql) = literal(&rest[open + 2..]) {
            found.push((at, sql));
        }
    }
    found.sort();
    found
        .into_iter()
        .map(|(at, sql)| (place(file, src, at), sql))
        .collect()
}

fn place(file: &str, src: &str, at: usize) -> String {
    format!("{file}:{}", src[..at].matches('\n').count() + 1)
}

#[ab_testdb::test]
async fn every_runtime_sql_literal_prepares_on_the_schema(pool: PgPool) {
    let mut seen = 0;
    let mut broken = Vec::new();
    for (file, src) in server_sources() {
        for (at, sql) in runtime_literals(&file, &src) {
            seen += 1;
            let types: Vec<PgTypeInfo> = BOUND_TYPES
                .iter()
                .find(|(fragment, _)| sql.contains(fragment))
                .map(|(_, names)| names.iter().map(|n| PgTypeInfo::with_name(n)).collect())
                .unwrap_or_default();
            let prepared = (&pool)
                .prepare_with(sqlx::AssertSqlSafe(sql).into_sql_str(), &types)
                .await;
            if let Err(error) = prepared {
                broken.push(format!("{at}: {error}"));
            }
        }
    }
    assert!(
        seen >= 10,
        "the scanner found only {seen} runtime literals: is it still reading crates/*/src?"
    );
    assert!(
        broken.is_empty(),
        "runtime SQL no longer matches the schema:\n{}",
        broken.join("\n")
    );
}

#[test]
fn sql_built_at_run_time_names_the_test_that_runs_it() {
    let sources = server_sources();
    let builders: Vec<&str> = sources
        .iter()
        .filter(|(_, src)| src.contains("QueryBuilder") || src.contains("AssertSqlSafe("))
        // The crate docs name the convention without building SQL.
        .filter(|(file, src)| file != "db/src/lib.rs" || src.contains("QueryBuilder::"))
        .map(|(file, _)| file.as_str())
        .collect();
    let listed: Vec<&str> = DYNAMIC.iter().map(|(file, _, _)| *file).collect();
    let unlisted: Vec<&&str> = builders.iter().filter(|f| !listed.contains(f)).collect();
    assert!(
        unlisted.is_empty(),
        "these files build SQL at run time: list each in DYNAMIC with the DB test that runs its shapes: {unlisted:?}"
    );
    for (file, test_file, test) in DYNAMIC {
        assert!(
            builders.contains(file),
            "{file} no longer builds SQL: drop it from DYNAMIC"
        );
        let body = std::fs::read_to_string(crates_dir().join(test_file))
            .unwrap_or_else(|_| panic!("{file}: test file {test_file} is gone"));
        assert!(
            body.contains(&format!("fn {test}(")),
            "{file}: {test_file} has no fn {test}"
        );
    }
}

#[test]
fn the_scanner_reads_every_literal_form() {
    let src = concat!(
        "let a = sqlx::query(\"SELECT 1\");\n",
        "let b = sqlx::query_scalar(\n    r#\"SELECT \"x\" FROM t\"#,\n);\n",
        "let c = sqlx::query_as::<_, Row>(\"SELECT a, \\\n         b FROM t WHERE c = '\\\"'\");\n",
        "let d = sqlx::query(sql);\n",
    );
    let found: Vec<String> = runtime_literals("f.rs", src)
        .into_iter()
        .map(|(_, s)| s)
        .collect();
    assert_eq!(
        found,
        [
            "SELECT 1",
            "SELECT \"x\" FROM t",
            "SELECT a, b FROM t WHERE c = '\"'"
        ]
    );
}
