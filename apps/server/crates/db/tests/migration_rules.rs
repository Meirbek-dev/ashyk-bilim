//! Rules every migration from 2026-11-02 on follows (apps/server/AGENTS.md
//! "Invariants"), so a deploy never stalls writes and the previous binary
//! keeps working on the new schema (rollback without a restore):
//!
//! - a transactional migration sets `lock_timeout` first: a lock it cannot
//!   get fails the migrate step (deploy stops, nothing changed) instead of
//!   queueing every write behind it;
//! - an index on a table the file did not create is built CONCURRENTLY, in
//!   a `-- no-transaction` file holding that one statement (Postgres runs a
//!   multi-statement string as one transaction block);
//! - expand/contract: DROP COLUMN / DROP TABLE / RENAME only in a file that
//!   says `-- contract: <why>`, a release after the code stopped using the
//!   object.
//!
//! The rules read the embedded migrations; no database is needed.
#![allow(clippy::panic)]

const FIRST: i64 = 20_261_102_000_000;

/// SQL with `--` comments removed, lowercased, whitespace collapsed.
fn code(sql: &str) -> String {
    sql.lines()
        .map(|l| l.split_once("--").map_or(l, |(c, _)| c))
        .collect::<Vec<_>>()
        .join(" ")
        .to_lowercase()
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
}

/// Tables named by `create table <name>` in the file.
fn created(code: &str) -> Vec<String> {
    code.split("create table ")
        .skip(1)
        .filter_map(|rest| {
            let rest = rest.strip_prefix("if not exists ").unwrap_or(rest);
            rest.split([' ', '(']).next().map(str::to_owned)
        })
        .collect()
}

#[test]
fn new_migrations_lock_briefly_and_expand_before_they_contract() {
    let mut broken = Vec::new();
    for m in ab_db::MIGRATOR.iter().filter(|m| m.version >= FIRST) {
        let sql = m.sql.as_str();
        let c = code(sql);
        let name = format!("{}_{}", m.version, m.description);
        if m.no_tx {
            let statements = c.split(';').filter(|s| !s.trim().is_empty()).count();
            let concurrent = c.starts_with("create index concurrently")
                || c.starts_with("create unique index concurrently")
                || c.starts_with("drop index concurrently");
            if statements != 1 || !concurrent {
                broken.push(format!(
                    "{name}: a -- no-transaction file holds one CONCURRENTLY index statement"
                ));
            }
        } else {
            if !c.contains("lock_timeout") {
                broken.push(format!("{name}: start with SET LOCAL lock_timeout = '5s';"));
            }
            let fresh = created(&c);
            for stmt in c.split(';').map(str::trim) {
                let Some(rest) = stmt
                    .strip_prefix("create index ")
                    .or_else(|| stmt.strip_prefix("create unique index "))
                else {
                    continue;
                };
                let table = rest
                    .split(" on ")
                    .nth(1)
                    .and_then(|t| t.strip_prefix("only ").or(Some(t)))
                    .and_then(|t| t.split([' ', '(']).next())
                    .unwrap_or_default();
                if !fresh.iter().any(|t| t == table) {
                    broken.push(format!(
                        "{name}: index on existing table {table} blocks its writes; build it CONCURRENTLY in its own -- no-transaction file"
                    ));
                }
            }
        }
        let contracts =
            c.contains("drop column") || c.contains("drop table") || c.contains(" rename ");
        if contracts && !sql.contains("-- contract:") {
            broken.push(format!(
                "{name}: DROP/RENAME breaks the previous release; drop a release later and say `-- contract: <why>`"
            ));
        }
    }
    assert!(broken.is_empty(), "{}", broken.join("\n"));
}

#[test]
fn the_rules_see_what_they_check() {
    let c =
        code("-- drop table x\nCREATE TABLE  t (id int);\nCREATE INDEX t_idx ON t (id); -- note\n");
    assert!(!c.contains("drop table"));
    assert_eq!(created(&c), vec!["t".to_owned()]);
    assert!(c.contains("create index t_idx on t (id)"));
}
