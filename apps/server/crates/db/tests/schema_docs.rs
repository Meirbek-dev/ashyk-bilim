//! `docs/agents/SCHEMA.md` is generated from the migrated schema (schema review item 49).
//!
//! The document lists every table with its comment (`COMMENT ON` in the
//! migrations), columns, keys and foreign keys, so agents and people read the
//! schema without a database. It is rendered here from the test template (all
//! migrations of this checkout) and must match the committed file:
//! `just schema-docs` rewrites it (`UPDATE_SCHEMA_DOCS=1`), and a migration
//! without the regenerated file fails this test. Every table has a comment.
#![allow(clippy::unwrap_used, clippy::expect_used, clippy::panic)]

use std::fmt::Write as _;
use std::path::PathBuf;

use sqlx::{PgPool, Row};

fn doc_path() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../../../docs/agents/SCHEMA.md")
}

struct Table {
    oid: u32,
    schema: String,
    name: String,
    kind: String,
    comment: Option<String>,
}

async fn tables(pool: &PgPool) -> Vec<Table> {
    sqlx::query(
        "SELECT c.oid, c.relnamespace::regnamespace::text AS schema, c.relname, c.relkind::text AS kind,
                obj_description(c.oid, 'pg_class') AS comment
         FROM pg_class c
         WHERE (c.relnamespace = 'public'::regnamespace OR c.relnamespace::regnamespace::name = ANY (app_schemas()))
           AND c.relkind IN ('r', 'p', 'v', 'm')
           AND NOT c.relispartition AND c.relname <> '_sqlx_migrations'
         ORDER BY c.relname",
    )
    .fetch_all(pool)
    .await
    .unwrap()
    .into_iter()
    .map(|r| Table {
        oid: r.get::<sqlx::postgres::types::Oid, _>("oid").0,
        schema: r.get("schema"),
        name: r.get("relname"),
        kind: r.get("kind"),
        comment: r.get("comment"),
    })
    .collect()
}

/// A cell: one line, pipes escaped.
fn cell(text: &str) -> String {
    text.split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
        .replace('|', "\\|")
}

/// One table's section: comment, columns, keys.
async fn render_table(pool: &PgPool, t: &Table, out: &mut String) {
    let kind = match t.kind.as_str() {
        "v" => " (view)",
        "m" => " (materialized view)",
        "p" => " (partitioned)",
        _ => "",
    };
    writeln!(out, "\n## {}{kind}\n", t.name).unwrap();
    if let Some(comment) = &t.comment {
        writeln!(out, "{}\n", cell(comment)).unwrap();
    }
    let columns = sqlx::query(
        "SELECT a.attname, format_type(a.atttypid, a.atttypmod) AS type, a.attnotnull,
                a.attgenerated::text AS generated, pg_get_expr(d.adbin, d.adrelid) AS expr,
                col_description(a.attrelid, a.attnum) AS comment
         FROM pg_attribute a
         LEFT JOIN pg_attrdef d ON d.adrelid = a.attrelid AND d.adnum = a.attnum
         WHERE a.attrelid = $1 AND a.attnum > 0 AND NOT a.attisdropped
         ORDER BY a.attnum",
    )
    .bind(sqlx::postgres::types::Oid(t.oid))
    .fetch_all(pool)
    .await
    .unwrap();
    let commented = columns
        .iter()
        .any(|c| c.get::<Option<String>, _>("comment").is_some());
    out.push_str(if commented {
        "| Column | Type | Null | Default | Comment |\n| --- | --- | --- | --- | --- |\n"
    } else {
        "| Column | Type | Null | Default |\n| --- | --- | --- | --- |\n"
    });
    for c in &columns {
        let expr: Option<String> = c.get("expr");
        let generated: String = c.get("generated");
        let default = match (expr, generated.as_str()) {
            (Some(e), "s") => format!("generated: `{}`", cell(&e)),
            (Some(e), _) => format!("`{}`", cell(&e)),
            (None, _) => String::new(),
        };
        let null = if c.get::<bool, _>("attnotnull") {
            ""
        } else {
            "null"
        };
        write!(
            out,
            "| {} | {} | {null} | {default} |",
            c.get::<String, _>("attname"),
            c.get::<String, _>("type")
        )
        .unwrap();
        if commented {
            write!(
                out,
                " {} |",
                cell(&c.get::<Option<String>, _>("comment").unwrap_or_default())
            )
            .unwrap();
        }
        out.push('\n');
    }
    let keys = sqlx::query(
        "SELECT contype::text AS kind, conname, pg_get_constraintdef(oid) AS def
         FROM pg_constraint WHERE conrelid = $1 AND contype IN ('p', 'u', 'f')
         ORDER BY array_position(ARRAY['p', 'u', 'f'], contype::text), conname",
    )
    .bind(sqlx::postgres::types::Oid(t.oid))
    .fetch_all(pool)
    .await
    .unwrap();
    if !keys.is_empty() {
        out.push('\n');
    }
    for k in &keys {
        let label = match k.get::<String, _>("kind").as_str() {
            "p" => "Primary key",
            "u" => "Unique",
            _ => "Foreign key",
        };
        writeln!(
            out,
            "- {label} `{}`: `{}`",
            k.get::<String, _>("conname"),
            cell(&k.get::<String, _>("def"))
        )
        .unwrap();
    }
}

async fn render(pool: &PgPool) -> String {
    let tables = tables(pool).await;
    let mut out = String::from(
        "# Database schema (generated)\n\n\
         Generated by `just schema-docs` from the migrations (`crates/db/tests/schema_docs.rs` checks it is fresh);\n\
         do not edit. Table comments are `COMMENT ON` statements in `apps/server/migrations`. Where to find things by\n\
         UI word and ready queries: `DATA.md`. Rules behind the shapes: `docs/ARCHITECTURE.md` §8. Each table is\n\
         listed as `schema.table`; SQL names it unqualified (the search_path covers every schema, §8 rule 8).\n\n",
    );
    for t in &tables {
        let first = t
            .comment
            .as_deref()
            .unwrap_or("")
            .split(". ")
            .next()
            .unwrap_or("");
        let first = first.trim_end_matches('.');
        writeln!(
            out,
            "- [`{}.{}`](#{}){}",
            t.schema,
            t.name,
            t.name,
            if first.is_empty() {
                String::new()
            } else {
                format!(": {}", cell(first))
            }
        )
        .unwrap();
    }
    for t in &tables {
        render_table(pool, t, &mut out).await;
    }
    out
}

#[ab_testdb::test]
async fn schema_docs_match_the_migrations(pool: PgPool) {
    let rendered = render(&pool).await;
    let path = doc_path();
    if std::env::var_os("UPDATE_SCHEMA_DOCS").is_some() {
        std::fs::write(&path, &rendered).unwrap();
        return;
    }
    let committed = std::fs::read_to_string(&path)
        .unwrap_or_default()
        .replace("\r\n", "\n");
    if committed != rendered {
        let line = committed
            .lines()
            .zip(rendered.lines())
            .position(|(a, b)| a != b)
            .unwrap_or_else(|| committed.lines().count().min(rendered.lines().count()))
            + 1;
        panic!(
            "docs/agents/SCHEMA.md is stale from line {line}: run `just schema-docs` and commit it"
        );
    }
}

#[ab_testdb::test]
async fn every_table_has_a_comment(pool: PgPool) {
    let missing: Vec<String> = tables(&pool)
        .await
        .into_iter()
        .filter(|t| t.comment.is_none())
        .map(|t| t.name)
        .collect();
    assert!(
        missing.is_empty(),
        "tables without COMMENT ON TABLE (add it in the migration that creates them): {missing:?}"
    );
}
