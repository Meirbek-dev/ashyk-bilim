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
//!   object;
//! - a migration changes schema, not data: UPDATE / DELETE / TRUNCATE of a
//!   table the file did not create needs `-- data-fix: <rule>` (the repair a
//!   new constraint needs, or the backfill of a table an earlier file of the
//!   change created). A backfill of a column the same file adds and the
//!   re-run backfill of a `-- contract:` file need no marker. Any other data
//!   fix is an `ashyq admin` command (idempotent, `--dry-run`), never a
//!   migration (ARCHITECTURE §8 "Migrations").
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

/// Migrations on main before the data-fix rule (2026-11-02) that change rows
/// without the marker, each with its rule. Never extended: a new file says
/// `-- data-fix: <rule>` instead.
const DATA_FIX_BEFORE_RULE: &[(i64, &str)] = &[(
    20_261_102_000_100,
    "users: deleted accounts disabled before users_deleted_disabled_check",
)];

/// `code` without the bodies of dollar-quoted strings (function bodies,
/// `schema_try_check` expressions), except a `DO` block's: that one runs now.
fn executed(code: &str) -> String {
    let mut out = String::with_capacity(code.len());
    let mut rest = code;
    while let Some(start) = rest.find('$') {
        let after = &rest[start + 1..];
        let tag_len = after
            .find(|ch: char| !(ch.is_ascii_alphanumeric() || ch == '_'))
            .unwrap_or(after.len());
        let tag = &after[..tag_len];
        let opens =
            after[tag_len..].starts_with('$') && !tag.starts_with(|ch: char| ch.is_ascii_digit());
        if !opens {
            out.push_str(&rest[..=start]);
            rest = after;
            continue;
        }
        let delimiter = format!("${tag}$");
        let body_start = start + delimiter.len();
        let Some(body_len) = rest[body_start..].find(&delimiter) else {
            out.push_str(rest);
            return out;
        };
        let before = &rest[..start];
        out.push_str(before);
        let body = &rest[body_start..body_start + body_len];
        if before.trim_end().ends_with(" do") || before.trim_end() == "do" {
            out.push(' ');
            out.push_str(body);
        }
        out.push(' ');
        rest = &rest[body_start + body_len + delimiter.len()..];
    }
    out.push_str(rest);
    out
}

fn tokens(code: &str) -> Vec<&str> {
    code.split(|ch: char| ch.is_whitespace() || matches!(ch, '(' | ')' | ',' | ';'))
        .filter(|t| !t.is_empty())
        .collect()
}

fn bare(table: &str) -> &str {
    table.strip_prefix("public.").unwrap_or(table)
}

/// `(statement, table)` of each UPDATE / DELETE / TRUNCATE the file runs.
fn row_writes(code: &str) -> Vec<(&'static str, String)> {
    let code = executed(code);
    let t = tokens(&code);
    let at = |i: usize| t.get(i).copied().unwrap_or_default();
    let mut found = Vec::new();
    for (i, word) in t.iter().enumerate() {
        match *word {
            "update" => {
                let j = if at(i + 1) == "only" { i + 2 } else { i + 1 };
                let table = at(j);
                let sets = at(j + 1) == "set"
                    || (at(j + 2) == "set" && at(j + 1) != "on")
                    || (at(j + 1) == "as" && at(j + 3) == "set");
                if sets && !table.is_empty() && table != "set" {
                    found.push(("UPDATE", bare(table).to_owned()));
                }
            }
            "delete" if at(i + 1) == "from" => {
                let j = if at(i + 2) == "only" { i + 3 } else { i + 2 };
                found.push(("DELETE", bare(at(j)).to_owned()));
            }
            // `grant truncate on ...` names a privilege, not a statement.
            "truncate" if at(i + 1) != "on" => {
                let mut j = i + 1;
                while matches!(at(j), "table" | "only") {
                    j += 1;
                }
                found.push(("TRUNCATE", bare(at(j)).to_owned()));
            }
            _ => {}
        }
    }
    found
}

/// Tables of `alter table <name> ... add column` statements in the file.
fn columns_added(code: &str) -> Vec<String> {
    code.split(';')
        .map(str::trim)
        .filter(|s| s.contains(" add column "))
        .filter_map(|s| {
            let t = tokens(s.strip_prefix("alter table ")?);
            t.into_iter()
                .find(|w| !matches!(*w, "if" | "exists" | "only"))
                .map(|w| bare(w).to_owned())
        })
        .collect()
}

#[test]
fn new_migrations_change_rows_only_as_a_marked_data_fix() {
    let mut broken = Vec::new();
    for m in ab_db::MIGRATOR.iter().filter(|m| m.version >= FIRST) {
        let sql = m.sql.as_str();
        if sql.contains("-- data-fix:") || DATA_FIX_BEFORE_RULE.iter().any(|(v, _)| *v == m.version)
        {
            continue;
        }
        let c = code(sql);
        let fresh = created(&c);
        let added = columns_added(&c);
        let contract = sql.contains("-- contract:");
        for (statement, table) in row_writes(&c) {
            let backfill = statement == "UPDATE" && (contract || added.contains(&table));
            if fresh.contains(&table) || backfill {
                continue;
            }
            broken.push(format!(
                "{}_{}: {statement} {table} changes existing rows; a repair a constraint needs says \
                 `-- data-fix: <rule>`, any other data fix is an `ashyq admin` command",
                m.version, m.description
            ));
        }
    }
    assert!(broken.is_empty(), "{}", broken.join("\n"));
}

#[test]
fn the_data_fix_rule_sees_what_it_checks() {
    let sql = code(
        "CREATE TABLE fresh (id int);\n\
         ALTER TABLE users ADD COLUMN email_verified_at timestamptz;\n\
         UPDATE fresh SET id = 1;\n\
         UPDATE users u SET email_verified_at = created_at WHERE u.email_verified;\n\
         UPDATE ONLY public.courses SET name = btrim(name);\n\
         DELETE FROM jobs WHERE status = 'succeeded';\n\
         TRUNCATE TABLE ai_runs;\n\
         CREATE FUNCTION f() RETURNS trigger AS $$ BEGIN UPDATE posts SET n = n + 1; RETURN NEW; END $$ LANGUAGE plpgsql;\n\
         CREATE TRIGGER t BEFORE UPDATE ON posts FOR EACH ROW EXECUTE FUNCTION f();\n\
         ALTER TABLE a ADD CONSTRAINT a_fk FOREIGN KEY (b) REFERENCES b ON DELETE CASCADE ON UPDATE SET NULL;\n\
         GRANT SELECT, UPDATE, DELETE, TRUNCATE ON users TO ashyq_app;\n\
         SELECT schema_try_check('t', 'n', $c$ x IS NULL $c$);\n\
         DO $$ BEGIN DELETE FROM sessions WHERE false; END $$;\n",
    );
    let writes = row_writes(&sql);
    let expected = [
        ("UPDATE", "fresh"),
        ("UPDATE", "users"),
        ("UPDATE", "courses"),
        ("DELETE", "jobs"),
        ("TRUNCATE", "ai_runs"),
        ("DELETE", "sessions"),
    ];
    assert_eq!(
        writes,
        expected
            .iter()
            .map(|(s, t)| (*s, (*t).to_owned()))
            .collect::<Vec<_>>()
    );
    assert_eq!(columns_added(&sql), vec!["users".to_owned()]);
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
