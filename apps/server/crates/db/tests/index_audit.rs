//! No index repeats another (schema review 3, item 34).
//!
//! An index whose key columns (same operator classes and order) are a prefix
//! of another index on the same table, with the same predicate and
//! expressions, serves no query the longer one cannot, and every write pays
//! for it. A unique index has a reason of its own (the constraint), unless
//! another unique index has exactly its columns. Such an index fails this
//! test until it is dropped (`DROP INDEX CONCURRENTLY` in a
//! `-- no-transaction` file) or listed in [`ALLOWED`] with the reason.
#![allow(clippy::unwrap_used, clippy::expect_used, clippy::panic)]

use sqlx::PgPool;

/// `(redundant index, covering index)` → reason it stays.
const ALLOWED: &[(&str, &str, &str)] = &[];

/// `(redundant, covering)` index pairs in the app's schemas.
async fn duplicates(pool: &PgPool) -> Vec<(String, String)> {
    sqlx::query_as(
        "WITH idx AS (
           SELECT i.indexrelid, i.indrelid, i.indisunique, i.indisprimary, c.relam,
                  (string_to_array(i.indkey::text, ' ')::int2[])[1:i.indnkeyatts] AS keys,
                  (string_to_array(i.indclass::text, ' ')::oid[])[1:i.indnkeyatts] AS classes,
                  (string_to_array(i.indoption::text, ' ')::int2[])[1:i.indnkeyatts] AS opts,
                  (string_to_array(i.indcollation::text, ' ')::oid[])[1:i.indnkeyatts] AS colls,
                  pg_get_expr(i.indexprs, i.indrelid) AS exprs,
                  pg_get_expr(i.indpred, i.indrelid) AS pred
             FROM pg_index i
             JOIN pg_class c ON c.oid = i.indexrelid
             JOIN pg_namespace n ON n.oid = c.relnamespace
            WHERE n.nspname = 'public' OR n.nspname = ANY (app_schemas())
         )
         SELECT a.indexrelid::regclass::text, b.indexrelid::regclass::text
           FROM idx a
           JOIN idx b ON b.indrelid = a.indrelid AND b.indexrelid <> a.indexrelid
          WHERE a.relam = b.relam
            AND cardinality(a.keys) <= cardinality(b.keys)
            AND a.keys = b.keys[1:cardinality(a.keys)]
            AND a.classes = b.classes[1:cardinality(a.keys)]
            AND a.opts = b.opts[1:cardinality(a.keys)]
            AND a.colls = b.colls[1:cardinality(a.keys)]
            AND a.exprs IS NOT DISTINCT FROM b.exprs
            AND a.pred IS NOT DISTINCT FROM b.pred
            AND (NOT a.indisunique
                 OR (b.indisunique AND NOT a.indisprimary
                     AND cardinality(a.keys) = cardinality(b.keys)
                     AND (b.indisprimary OR a.indexrelid > b.indexrelid)))
          ORDER BY 1, 2",
    )
    .fetch_all(pool)
    .await
    .unwrap()
}

#[ab_testdb::test]
async fn no_index_is_a_prefix_of_another(pool: PgPool) {
    let duplicates = duplicates(&pool).await;
    let found: Vec<String> = duplicates
        .iter()
        .filter(|(a, b)| {
            !ALLOWED
                .iter()
                .any(|(x, y, _)| (*x, *y) == (a.as_str(), b.as_str()))
        })
        .map(|(a, b)| format!("{a} (covered by {b})"))
        .collect();
    assert!(
        found.is_empty(),
        "indexes that repeat another (drop CONCURRENTLY, or list in ALLOWED with the reason):\n{}",
        found.join("\n")
    );
    let stale: Vec<String> = ALLOWED
        .iter()
        .filter(|(x, y, _)| {
            !duplicates
                .iter()
                .any(|(a, b)| (a.as_str(), b.as_str()) == (*x, *y))
        })
        .map(|(x, y, _)| format!("{x} / {y}"))
        .collect();
    assert!(
        stale.is_empty(),
        "ALLOWED lists pairs that are gone:\n{}",
        stale.join("\n")
    );
}

/// The audit sees what it checks: a plain index that prefixes another, and an
/// exact unique twin, are reported; a unique prefix and a partial index are not.
#[ab_testdb::test]
async fn the_index_audit_sees_duplicates(pool: PgPool) {
    for sql in [
        "CREATE TABLE index_probe (a int, b int, c int)",
        "CREATE INDEX index_probe_a ON index_probe (a)",
        "CREATE INDEX index_probe_ab ON index_probe (a, b)",
        "CREATE UNIQUE INDEX index_probe_bc ON index_probe (b, c)",
        "CREATE UNIQUE INDEX index_probe_bc_twin ON index_probe (b, c)",
        "CREATE UNIQUE INDEX index_probe_b ON index_probe (b)",
        "CREATE INDEX index_probe_c ON index_probe (c) WHERE c > 0",
        "CREATE INDEX index_probe_c_full ON index_probe (c, a)",
    ] {
        sqlx::query(sql).execute(&pool).await.unwrap();
    }
    let probe: Vec<String> = duplicates(&pool)
        .await
        .into_iter()
        .filter(|(a, _)| a.starts_with("index_probe"))
        .map(|(a, b)| format!("{a} (covered by {b})"))
        .collect();
    assert_eq!(
        probe,
        vec![
            "index_probe_a (covered by index_probe_ab)".to_owned(),
            "index_probe_bc_twin (covered by index_probe_bc)".to_owned(),
        ]
    );
}
