//! Assessment versions (REWRITE 5.6 n7, 5.8 item 10 *Policy in versions*).
//!
//! A version is an assessment's items and policy as saved (every save writes
//! one: `assessments.current_version_id` names the one in force, and readers
//! take the policy from it through `assessment_policy_v`) or as handed in
//! (the questions an attempt drew). Content-addressed and numbered per
//! assessment; Postgres builds the canonical documents
//! (`assessment_items_doc`, `assessment_policy_doc`), so the server never has
//! to reproduce their text. `items_sha256` hashes the items alone: a draft
//! whose base version has other items than the current one is stale.

use ab_core::Result;
use ab_core::id::{AssessmentId, AssessmentVersionId};
use sqlx::PgPool;

/// A save: the assessment's items and policy become its current version.
///
/// `patch` holds keys of the policy document over the current one (`None`
/// keeps it); on the caller's transaction (`assessment_version_save`).
///
/// `cosmetic` (a wording edit, a reorder: the same answer key) moves the
/// drafts that were on the current items to the new version, so they stay
/// current. Returns the version, an earlier one when the content is equal.
pub async fn save(
    conn: &mut sqlx::PgConnection,
    assessment_id: AssessmentId,
    patch: Option<&serde_json::Value>,
    cosmetic: bool,
) -> Result<AssessmentVersionId> {
    let id = sqlx::query_scalar!(
        r#"SELECT assessment_version_save($1, $2, $3) AS "id!: AssessmentVersionId""#,
        assessment_id.0,
        patch,
        cosmetic
    )
    .fetch_one(conn)
    .await?;
    Ok(id)
}

/// The version an attempt is handed in against.
///
/// Exactly `items` (the questions it drew, as graded) under the assessment's
/// current policy, with `extra` beside it (a file task's caps and rubric; `{}`
/// for none). The current version when it holds the same, else an equal
/// earlier one, else a new one.
///
/// Its own short transaction on the pool, run before the hand-in's (BUG-377:
/// a hand-in never waits for a second connection while holding one). The
/// per-assessment advisory lock serialises numbering; a version nobody ends
/// up linking (the hand-in lost its race) is harmless and reused next time.
pub async fn ensure(
    pool: &PgPool,
    assessment_id: AssessmentId,
    items: &serde_json::Value,
    extra: &serde_json::Value,
) -> Result<AssessmentVersionId> {
    let mut tx = pool.begin().await?;
    let id = sqlx::query_scalar!(
        r#"SELECT assessment_version_for(
                      $1, $2,
                      coalesce((SELECT v.policy FROM assessments a
                                JOIN assessment_versions v ON v.id = a.current_version_id
                                WHERE a.id = $1), assessment_policy_default()) || $3)
                  AS "id!: AssessmentVersionId""#,
        assessment_id.0,
        items,
        extra
    )
    .fetch_one(&mut *tx)
    .await?;
    tx.commit().await?;
    Ok(id)
}
