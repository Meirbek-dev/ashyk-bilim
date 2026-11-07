//! The schema as text, read from the catalog and sorted.
//!
//! Tables, columns, constraints, indexes, triggers, views and functions; partitions and extension objects aside,
//! they are not the migrations' doing. Column order stays out: a restored dump renumbers columns, and no query
//! depends on it.
//!
//! `crates/db/schema.snapshot.sql` is this text for the migrations of the checkout (`just schema-docs`), so a schema
//! change shows up in review as a diff. `ashyq admin schema-verify` compares it with a live database: the migration
//! ledger cannot tell a hand-made change or a skipped CHECK from what the migrations say.

use ab_core::Result;
use sqlx::PgPool;

/// The committed text this binary was built with.
pub const EXPECTED: &str = include_str!("../schema.snapshot.sql");

const OBJECTS: &str = "
    WITH app AS (SELECT oid FROM pg_namespace
                 WHERE nspname = 'public' OR nspname = ANY (app_schemas())),
    rels AS (SELECT c.oid, c.relname, c.relkind, c.relnamespace::regnamespace::text AS schema
             FROM pg_class c
             WHERE c.relnamespace IN (SELECT oid FROM app) AND NOT c.relispartition
               AND c.relname <> '_sqlx_migrations'
               AND NOT EXISTS (SELECT FROM pg_depend d WHERE d.classid = 'pg_class'::regclass
                               AND d.objid = c.oid AND d.deptype = 'e'))
    SELECT line FROM (
        SELECT 'table ' || r.schema || '.' || r.relname || ' ' ||
               a.attname || ' ' || format_type(a.atttypid, a.atttypmod) ||
               CASE WHEN a.attnotnull THEN ' NOT NULL' ELSE '' END ||
               CASE WHEN a.attgenerated <> '' THEN ' GENERATED ' ELSE ' DEFAULT ' END ||
               COALESCE(pg_get_expr(d.adbin, d.adrelid), '-') AS line
        FROM rels r JOIN pg_attribute a ON a.attrelid = r.oid AND a.attnum > 0 AND NOT a.attisdropped
        LEFT JOIN pg_attrdef d ON d.adrelid = a.attrelid AND d.adnum = a.attnum
        WHERE r.relkind IN ('r', 'p')
        UNION ALL
        SELECT 'constraint ' || r.relname || ' ' || c.conname || ' ' || pg_get_constraintdef(c.oid)
        FROM rels r JOIN pg_constraint c ON c.conrelid = r.oid
        WHERE c.conparentid = 0
        UNION ALL
        SELECT 'index ' || pg_get_indexdef(i.indexrelid)
        FROM pg_index i JOIN rels r ON r.oid = i.indrelid
        JOIN pg_class ic ON ic.oid = i.indexrelid
        WHERE NOT ic.relispartition
        UNION ALL
        SELECT 'trigger ' || pg_get_triggerdef(t.oid)
        FROM pg_trigger t JOIN rels r ON r.oid = t.tgrelid
        WHERE NOT t.tgisinternal AND t.tgparentid = 0
        UNION ALL
        SELECT 'view ' || r.schema || '.' || r.relname || ' ' || pg_get_viewdef(r.oid, true)
        FROM rels r WHERE r.relkind IN ('v', 'm')
        UNION ALL
        SELECT 'function ' || pg_get_functiondef(p.oid)
        FROM pg_proc p
        WHERE p.pronamespace IN (SELECT oid FROM app) AND p.prokind IN ('f', 'p')
          AND NOT EXISTS (SELECT FROM pg_depend d WHERE d.classid = 'pg_proc'::regclass
                          AND d.objid = p.oid AND d.deptype = 'e')
    ) o ORDER BY line COLLATE \"C\"";

/// The live schema as text, one object per entry, ending in a newline.
pub async fn render(pool: &PgPool) -> Result<String> {
    let lines: Vec<String> = sqlx::query_scalar(OBJECTS).fetch_all(pool).await?;
    let mut out = String::new();
    for line in lines {
        // Windows checkouts and pg_get_functiondef agree on newlines only after this.
        out.push_str(line.replace("\r\n", "\n").trim_end());
        out.push('\n');
    }
    Ok(out)
}

/// The lines of `live` that differ from `expected`, each side marked, at most `limit` of them; empty when equal.
#[must_use]
pub fn differences(expected: &str, live: &str, limit: usize) -> Vec<String> {
    // A dump and restore rewrites redundant parentheses in a CHECK: same rule, so no difference.
    let key = |line: &str| line.replace(['(', ')'], "");
    let keys =
        |text: &str| -> std::collections::BTreeSet<String> { text.lines().map(key).collect() };
    let (want, have) = (keys(expected), keys(live));
    let only =
        |text: &str, other: &std::collections::BTreeSet<String>, mark: &str| -> Vec<String> {
            text.lines()
                .filter(|l| !other.contains(&key(l)))
                .map(|l| format!("{mark} {l}"))
                .collect()
        };
    let mut out = only(expected, &have, "-");
    out.extend(only(live, &want, "+"));
    out.truncate(limit);
    out
}

#[cfg(test)]
mod tests {
    use super::differences;

    #[test]
    fn differences_mark_each_side() {
        assert!(differences("a\nb\n", "b\na\n", 10).is_empty());
        assert_eq!(differences("a\nb\n", "b\nc\n", 10), ["- a", "+ c"]);
        assert_eq!(differences("a\nb\n", "c\n", 1).len(), 1);
        assert!(differences("CHECK ((a) AND (b))\n", "CHECK (a AND b)\n", 10).is_empty());
    }
}
