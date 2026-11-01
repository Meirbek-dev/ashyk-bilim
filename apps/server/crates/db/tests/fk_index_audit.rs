//! Every foreign key has an index led by its columns (schema review item 21).
//!
//! Deleting or re-keying a parent row checks each child table through its
//! key: without an index that check scans the child table while holding the
//! parent's lock (a preview discard scanned `analytics_events`, a course
//! leave `daily_user_course_progress`). A key without such an index fails
//! this test until it gets one, or is listed in [`ALLOWED`] with the reason
//! no app path ever checks it (same style as `cascade_audit.rs`).
#![allow(clippy::unwrap_used, clippy::expect_used, clippy::panic)]

use std::collections::BTreeSet;

use sqlx::PgPool;

/// The app never deletes a `users` row (accounts are disabled or anonymised;
/// erasure is a manual, rare operation): a key from an actor/audit column
/// onto `users` is checked only then, and its index would only cost writes.
const ACTOR: &str = "actor column onto users: the app never deletes users";
/// The AI tables' structure belongs to the AI work (ai_student_memory is
/// being reshaped there); its keys are indexed when that lands.
const AI_OWNED: &str = "AI-owned table, reshaped by the AI work";
/// A lookup table's rows are added, never deleted or renamed by the app.
const LOOKUP: &str = "lookup value: the app never deletes or renames one";

/// `(child table, child columns, parent table)` → reason.
const ALLOWED: &[(&str, &str, &str, &str)] = &[
    ("activities", "creator_id", "users", ACTOR),
    ("ai_approvals", "requested_by", "users", ACTOR),
    ("ai_approvals", "resolved_by", "users", ACTOR),
    ("ai_course_analyses", "triggered_by", "users", ACTOR),
    ("ai_feature_switches", "updated_by", "users", ACTOR),
    ("ai_lecture_reviews", "triggered_by", "users", ACTOR),
    ("ai_student_memory", "course_id", "courses", AI_OWNED),
    ("ai_submission_analyses", "triggered_by", "users", ACTOR),
    ("analytics_events", "actor_id", "users", ACTOR),
    ("assessment_audit_events", "actor_id", "users", ACTOR),
    ("assessment_overrides", "granted_by", "users", ACTOR),
    ("assessments", "creator_id", "users", ACTOR),
    ("bulk_actions", "performed_by", "users", ACTOR),
    ("chapters", "creator_id", "users", ACTOR),
    ("collections", "creator_id", "users", ACTOR),
    ("course_discussions", "user_id", "users", ACTOR),
    ("course_updates", "author_id", "users", ACTOR),
    ("courses", "archived_by", "users", ACTOR),
    ("courses", "creator_id", "users", ACTOR),
    ("daily_course_metrics", "teacher_user_id", "users", ACTOR),
    ("file_grading_entries", "graded_by", "users", ACTOR),
    ("file_submission_attempts", "graded_by", "users", ACTOR),
    ("file_submission_overrides", "granted_by", "users", ACTOR),
    ("file_submissions", "creator_id", "users", ACTOR),
    ("grading_entries", "graded_by", "users", ACTOR),
    ("item_feedback", "graded_by", "users", ACTOR),
    ("learner_risk_snapshots", "teacher_user_id", "users", ACTOR),
    ("notifications", "kind", "notification_kinds", LOOKUP),
    ("uploads", "purpose", "upload_purposes", LOOKUP),
    ("usergroups", "creator_id", "users", ACTOR),
];

#[ab_testdb::test]
async fn every_foreign_key_has_a_leading_index(pool: PgPool) {
    // A key is covered when some index starts with the key's first column
    // (a composite (parent_id, course_id) key is served by the parent_id
    // index) and is either complete or partial only on `<col> IS NOT NULL`
    // (a key check never looks for NULL).
    let missing: Vec<(String, String, String)> = sqlx::query_as(
        "SELECT c.conrelid::regclass::text, \
                (SELECT string_agg(a.attname, ',' ORDER BY a.attnum) FROM pg_attribute a \
                  WHERE a.attrelid = c.conrelid AND a.attnum = ANY(c.conkey)), \
                c.confrelid::regclass::text \
           FROM pg_constraint c \
          WHERE c.contype = 'f' \
            AND NOT EXISTS ( \
                SELECT 1 FROM pg_index i \
                 WHERE i.indrelid = c.conrelid \
                   AND (i.indpred IS NULL \
                        OR pg_get_expr(i.indpred, i.indrelid) ~ '^\\(*[a-z_]+ IS NOT NULL\\)*$') \
                   AND i.indkey[0] = c.conkey[1]) \
          ORDER BY 1, 2",
    )
    .fetch_all(&pool)
    .await
    .unwrap();

    let mut unindexed = Vec::new();
    let mut seen = BTreeSet::new();
    for (child, columns, parent) in &missing {
        let key = (child.as_str(), columns.as_str(), parent.as_str());
        if ALLOWED.iter().any(|(c, k, p, _)| (*c, *k, *p) == key) {
            seen.insert(key);
        } else {
            unindexed.push(format!("{child}({columns}) -> {parent}"));
        }
    }
    assert!(
        unindexed.is_empty(),
        "foreign keys without an index led by their columns (add one in a migration, or list the \
         key in ALLOWED with the reason no app path checks it):\n{}",
        unindexed.join("\n")
    );
    let stale: Vec<String> = ALLOWED
        .iter()
        .filter(|(c, k, p, _)| !seen.contains(&(*c, *k, *p)))
        .map(|(c, k, p, _)| format!("{c}({k}) -> {p}"))
        .collect();
    assert!(
        stale.is_empty(),
        "ALLOWED lists keys that are indexed now or gone:\n{}",
        stale.join("\n")
    );
}
