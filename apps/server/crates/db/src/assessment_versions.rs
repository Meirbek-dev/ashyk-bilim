//! Assessment versions (REWRITE 5.6 n7).
//!
//! Each distinct (items, policy) pair an attempt was handed in against,
//! stored once and numbered per assessment (migration `20261102020600`).
//! Content-addressed: the hash is computed by
//! Postgres from the jsonb values (`assessment_content_hash`), so the server
//! never has to reproduce jsonb's text form.

use ab_core::Result;
use ab_core::id::{AssessmentId, AssessmentVersionId};
use sqlx::PgPool;

/// The version holding exactly `items` + `policy`, created when new.
///
/// Its own short transaction on the pool, run before the hand-in's (BUG-377:
/// a hand-in never waits for a second connection while holding one). The
/// per-assessment advisory lock serialises numbering; a version nobody ends
/// up linking (the hand-in lost its race) is harmless and reused next time.
pub async fn ensure(
    pool: &PgPool,
    assessment_id: AssessmentId,
    items: &serde_json::Value,
    policy: &serde_json::Value,
) -> Result<AssessmentVersionId> {
    let mut tx = pool.begin().await?;
    // `pg_advisory_xact_lock` returns void, which the query macros cannot type.
    sqlx::query(
        "SELECT pg_advisory_xact_lock(hashtextextended('assessment-version:' || $1::text, 0))",
    )
    .bind(assessment_id.0)
    .execute(&mut *tx)
    .await?;
    let existing = sqlx::query_scalar!(
        r#"SELECT id AS "id: AssessmentVersionId" FROM assessment_versions
           WHERE assessment_id = $1 AND content_hash = assessment_content_hash($2, $3)"#,
        assessment_id.0,
        items,
        policy
    )
    .fetch_optional(&mut *tx)
    .await?;
    let id = match existing {
        Some(id) => id,
        None => sqlx::query_scalar!(
            r#"INSERT INTO assessment_versions (assessment_id, number, items, policy, content_hash)
                   SELECT $1, COALESCE(max(number), 0) + 1, $2, $3, assessment_content_hash($2, $3)
                   FROM assessment_versions WHERE assessment_id = $1
                   RETURNING id AS "id: AssessmentVersionId""#,
            assessment_id.0,
            items,
            policy
        )
        .fetch_one(&mut *tx)
        .await?,
    };
    tx.commit().await?;
    Ok(id)
}
