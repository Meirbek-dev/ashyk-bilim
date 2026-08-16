//! Identity queries (compile-checked; `.sqlx` cache committed via `just prepare`).

use ab_core::Result;
use ab_core::id::UserId;
use sqlx::PgPool;

/// User row as needed by the auth flows.
pub struct AuthUserRow {
    pub id: UserId,
    pub zitadel_user_id: String,
    pub username: String,
    pub email: String,
    pub display_name: String,
    pub locale: String,
    pub status: String,
    pub rbac_version: i64,
}

/// Login accepts username or email (mirrors legacy behavior).
pub async fn find_user_for_login(pool: &PgPool, login: &str) -> Result<Option<AuthUserRow>> {
    let row = sqlx::query_as!(
        AuthUserRow,
        r#"SELECT id AS "id: UserId", zitadel_user_id, username, email,
                  display_name, locale, status, rbac_version
           FROM users
           WHERE username = $1 OR email = $1"#,
        login
    )
    .fetch_optional(pool)
    .await?;
    Ok(row)
}

/// Roles (by priority, highest first) and the distinct union of grants.
pub async fn load_user_grants(
    pool: &PgPool,
    user_id: UserId,
) -> Result<(Vec<String>, Vec<String>)> {
    let rows = sqlx::query!(
        r#"SELECT r.slug, r.priority, rp.permission AS "permission?"
           FROM user_roles ur
           JOIN roles r ON r.id = ur.role_id
           LEFT JOIN role_permissions rp ON rp.role_id = r.id
           WHERE ur.user_id = $1
           ORDER BY r.priority DESC, rp.permission"#,
        user_id.0
    )
    .fetch_all(pool)
    .await?;

    let mut roles: Vec<String> = Vec::new();
    let mut permissions: Vec<String> = Vec::new();
    for row in rows {
        if !roles.contains(&row.slug) {
            roles.push(row.slug);
        }
        if let Some(permission) = row.permission
            && !permissions.contains(&permission)
        {
            permissions.push(permission);
        }
    }
    Ok((roles, permissions))
}

pub struct ProfileRow {
    pub id: UserId,
    pub username: String,
    pub email: String,
    pub display_name: String,
    pub bio: String,
    pub avatar_key: Option<String>,
    pub locale: String,
}

pub async fn get_profile(pool: &PgPool, user_id: UserId) -> Result<Option<ProfileRow>> {
    let row = sqlx::query_as!(
        ProfileRow,
        r#"SELECT id AS "id: UserId", username, email, display_name, bio, avatar_key, locale
           FROM users WHERE id = $1"#,
        user_id.0
    )
    .fetch_optional(pool)
    .await?;
    Ok(row)
}

/// Partial profile update; `None` fields keep their value. Returns the
/// updated row (`None` if the user vanished).
pub async fn update_profile(
    pool: &PgPool,
    user_id: UserId,
    display_name: Option<&str>,
    bio: Option<&str>,
    locale: Option<&str>,
) -> Result<Option<ProfileRow>> {
    let row = sqlx::query_as!(
        ProfileRow,
        r#"UPDATE users SET
               display_name = COALESCE($2, display_name),
               bio = COALESCE($3, bio),
               locale = COALESCE($4, locale)
           WHERE id = $1
           RETURNING id AS "id: UserId", username, email, display_name, bio, avatar_key, locale"#,
        user_id.0,
        display_name,
        bio,
        locale
    )
    .fetch_optional(pool)
    .await?;
    Ok(row)
}

pub async fn insert_auth_audit(
    pool: &PgPool,
    user_id: Option<UserId>,
    event: &str,
    ip: Option<&str>,
    user_agent: Option<&str>,
    metadata: serde_json::Value,
) -> Result<()> {
    sqlx::query!(
        r#"INSERT INTO auth_audit_log (user_id, event, ip, user_agent, metadata)
           VALUES ($1, $2, $3, $4, $5)"#,
        user_id.map(|u| u.0),
        event,
        ip,
        user_agent,
        metadata
    )
    .execute(pool)
    .await?;
    Ok(())
}
