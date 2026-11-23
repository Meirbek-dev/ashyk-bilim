//! Personal access tokens of MCP clients (REWRITE 4.7). Only the sha256 of a token is stored.

use ab_core::Result;
use ab_core::id::{AccessTokenId, UserId};
use sqlx::PgPool;

#[derive(Debug, Clone)]
pub struct AccessTokenRow {
    pub id: AccessTokenId,
    pub user_id: UserId,
    pub name: String,
    pub scope: String,
    /// Unix seconds.
    pub created_at: i64,
    pub last_used_at: Option<i64>,
    pub expires_at: Option<i64>,
    pub revoked_at: Option<i64>,
}

/// Live tokens one account may hold at once (revoked and expired ones do not count).
pub const MAX_LIVE_PER_USER: i64 = 20;

/// The new token, unless the owner already holds [`MAX_LIVE_PER_USER`] live ones (`None`).
///
/// The count and the insert run under the owner's row lock, so two concurrent creates cannot both pass.
pub async fn insert(
    pool: &PgPool,
    user_id: UserId,
    name: &str,
    token_hash: &[u8],
    scope: &str,
    expires_in_days: Option<i32>,
) -> Result<Option<AccessTokenRow>> {
    let mut tx = pool.begin().await?;
    sqlx::query!("SELECT id FROM users WHERE id = $1 FOR UPDATE", user_id.0)
        .fetch_optional(&mut *tx)
        .await?;
    let live = sqlx::query_scalar!(
        r#"SELECT count(*) AS "n!" FROM personal_access_tokens
           WHERE user_id = $1 AND revoked_at IS NULL AND (expires_at IS NULL OR expires_at > now())"#,
        user_id.0
    )
    .fetch_one(&mut *tx)
    .await?;
    if live >= MAX_LIVE_PER_USER {
        return Ok(None);
    }
    let row = sqlx::query_as!(
        AccessTokenRow,
        r#"INSERT INTO personal_access_tokens (user_id, name, token_hash, scope, expires_at)
           VALUES ($1, $2, $3, $4, now() + make_interval(days => $5::int))
           RETURNING id AS "id: AccessTokenId", user_id AS "user_id: UserId", name, scope,
                     (extract(epoch FROM created_at))::bigint AS "created_at!",
                     (extract(epoch FROM last_used_at))::bigint AS "last_used_at?",
                     (extract(epoch FROM expires_at))::bigint AS "expires_at?",
                     (extract(epoch FROM revoked_at))::bigint AS "revoked_at?""#,
        user_id.0,
        name,
        token_hash,
        scope,
        expires_in_days,
    )
    .fetch_one(&mut *tx)
    .await?;
    tx.commit().await?;
    Ok(Some(row))
}

/// The owner's tokens, newest first (revoked and expired included: the listing says so).
pub async fn list_for_user(pool: &PgPool, user_id: UserId) -> Result<Vec<AccessTokenRow>> {
    Ok(sqlx::query_as!(
        AccessTokenRow,
        r#"SELECT id AS "id: AccessTokenId", user_id AS "user_id: UserId", name, scope,
                  (extract(epoch FROM created_at))::bigint AS "created_at!",
                  (extract(epoch FROM last_used_at))::bigint AS "last_used_at?",
                  (extract(epoch FROM expires_at))::bigint AS "expires_at?",
                  (extract(epoch FROM revoked_at))::bigint AS "revoked_at?"
           FROM personal_access_tokens WHERE user_id = $1
           ORDER BY created_at DESC, id DESC"#,
        user_id.0
    )
    .fetch_all(pool)
    .await?)
}

/// Revoke one of the owner's tokens; `false` when the owner has no such token. Revoking twice keeps the first time.
pub async fn revoke(pool: &PgPool, user_id: UserId, id: AccessTokenId) -> Result<bool> {
    let hit = sqlx::query!(
        "UPDATE personal_access_tokens SET revoked_at = coalesce(revoked_at, now())
         WHERE id = $1 AND user_id = $2",
        id.0,
        user_id.0
    )
    .execute(pool)
    .await?
    .rows_affected();
    Ok(hit > 0)
}

/// The live token with this hash (not revoked, not expired, its owner not disabled), touching
/// `last_used_at` at most once a minute.
pub async fn authenticate(pool: &PgPool, token_hash: &[u8]) -> Result<Option<AccessTokenRow>> {
    Ok(sqlx::query_as!(
        AccessTokenRow,
        r#"WITH hit AS (
               SELECT t.id FROM personal_access_tokens t
               JOIN users u ON u.id = t.user_id AND u.disabled_at IS NULL
               WHERE t.token_hash = $1 AND t.revoked_at IS NULL
                 AND (t.expires_at IS NULL OR t.expires_at > now())
           ), touched AS (
               UPDATE personal_access_tokens t SET last_used_at = now()
               FROM hit WHERE t.id = hit.id
                 AND (t.last_used_at IS NULL OR t.last_used_at < now() - interval '1 minute')
           )
           SELECT t.id AS "id: AccessTokenId", t.user_id AS "user_id: UserId", t.name, t.scope,
                  (extract(epoch FROM t.created_at))::bigint AS "created_at!",
                  (extract(epoch FROM t.last_used_at))::bigint AS "last_used_at?",
                  (extract(epoch FROM t.expires_at))::bigint AS "expires_at?",
                  (extract(epoch FROM t.revoked_at))::bigint AS "revoked_at?"
           FROM personal_access_tokens t JOIN hit ON hit.id = t.id"#,
        token_hash
    )
    .fetch_optional(pool)
    .await?)
}
