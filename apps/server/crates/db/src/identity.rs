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

pub struct RoleRow {
    pub id: uuid::Uuid,
    pub slug: String,
    pub display_name_key: String,
    pub description_key: String,
    pub priority: i32,
    pub is_system: bool,
}

pub async fn list_roles(pool: &PgPool) -> Result<Vec<RoleRow>> {
    let rows = sqlx::query_as!(
        RoleRow,
        r#"SELECT id, slug, display_name_key, description_key, priority, is_system
           FROM roles ORDER BY priority DESC"#
    )
    .fetch_all(pool)
    .await?;
    Ok(rows)
}

pub async fn role_grants(pool: &PgPool, role_id: uuid::Uuid) -> Result<Vec<String>> {
    let rows = sqlx::query_scalar!(
        "SELECT permission FROM role_permissions WHERE role_id = $1 ORDER BY permission",
        role_id
    )
    .fetch_all(pool)
    .await?;
    Ok(rows)
}

pub async fn find_role_by_slug(pool: &PgPool, slug: &str) -> Result<Option<RoleRow>> {
    let row = sqlx::query_as!(
        RoleRow,
        r#"SELECT id, slug, display_name_key, description_key, priority, is_system
           FROM roles WHERE slug = $1"#,
        slug
    )
    .fetch_optional(pool)
    .await?;
    Ok(row)
}

/// Assign a role and bump the user's rbac_version atomically. Returns the new
/// version, or `None` if the user does not exist. Idempotent on re-assign.
pub async fn assign_role(
    pool: &PgPool,
    user_id: UserId,
    role_id: uuid::Uuid,
) -> Result<Option<i64>> {
    let mut tx = pool.begin().await?;
    sqlx::query!(
        "INSERT INTO user_roles (user_id, role_id) VALUES ($1, $2) ON CONFLICT DO NOTHING",
        user_id.0,
        role_id
    )
    .execute(&mut *tx)
    .await?;
    let version = sqlx::query_scalar!(
        "UPDATE users SET rbac_version = rbac_version + 1 WHERE id = $1 RETURNING rbac_version",
        user_id.0
    )
    .fetch_optional(&mut *tx)
    .await?;
    tx.commit().await?;
    Ok(version)
}

/// Remove a role and bump rbac_version. Returns the new version (`None` if
/// the user does not exist).
pub async fn unassign_role(
    pool: &PgPool,
    user_id: UserId,
    role_id: uuid::Uuid,
) -> Result<Option<i64>> {
    let mut tx = pool.begin().await?;
    sqlx::query!(
        "DELETE FROM user_roles WHERE user_id = $1 AND role_id = $2",
        user_id.0,
        role_id
    )
    .execute(&mut *tx)
    .await?;
    let version = sqlx::query_scalar!(
        "UPDATE users SET rbac_version = rbac_version + 1 WHERE id = $1 RETURNING rbac_version",
        user_id.0
    )
    .fetch_optional(&mut *tx)
    .await?;
    tx.commit().await?;
    Ok(version)
}

pub async fn find_user_id_by_google_sub(pool: &PgPool, sub: &str) -> Result<Option<UserId>> {
    let id = sqlx::query_scalar!(
        r#"SELECT user_id AS "user_id: uuid::Uuid" FROM google_accounts WHERE google_sub = $1"#,
        sub
    )
    .fetch_optional(pool)
    .await?;
    Ok(id.map(UserId))
}

pub async fn find_user_id_by_email(pool: &PgPool, email: &str) -> Result<Option<UserId>> {
    let id = sqlx::query_scalar!("SELECT id FROM users WHERE email = $1", email)
        .fetch_optional(pool)
        .await?;
    Ok(id.map(UserId))
}

/// Link a Google `sub` to a user. Idempotent per sub.
pub async fn link_google_account(
    pool: &PgPool,
    user_id: UserId,
    sub: &str,
    email: &str,
) -> Result<()> {
    sqlx::query!(
        "INSERT INTO google_accounts (google_sub, user_id, email)
         VALUES ($1, $2, $3) ON CONFLICT (google_sub) DO NOTHING",
        sub,
        user_id.0,
        email
    )
    .execute(pool)
    .await?;
    Ok(())
}

/// Create a user with the default `user` role, atomically. Returns `None` on
/// username/email collision (caller retries with a different username).
pub async fn create_user_with_default_role(
    pool: &PgPool,
    zitadel_user_id: &str,
    username: &str,
    email: &str,
    display_name: &str,
) -> Result<Option<UserId>> {
    let mut tx = pool.begin().await?;
    let inserted = sqlx::query_scalar!(
        r#"INSERT INTO users (zitadel_user_id, username, email, display_name)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT DO NOTHING
           RETURNING id"#,
        zitadel_user_id,
        username,
        email,
        display_name
    )
    .fetch_optional(&mut *tx)
    .await?;
    let Some(id) = inserted else {
        tx.rollback().await?;
        return Ok(None);
    };
    sqlx::query!(
        "INSERT INTO user_roles (user_id, role_id)
         SELECT $1, id FROM roles WHERE slug = 'user'",
        id
    )
    .execute(&mut *tx)
    .await?;
    tx.commit().await?;
    Ok(Some(UserId(id)))
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

/// Point the profile at a new avatar object.
pub async fn set_avatar_key(pool: &PgPool, user_id: UserId, key: &str) -> Result<bool> {
    let updated = sqlx::query!(
        "UPDATE users SET avatar_key = $2 WHERE id = $1",
        user_id.0,
        key
    )
    .execute(pool)
    .await?;
    Ok(updated.rows_affected() == 1)
}

// ── Custom-role CRUD (system roles are seed-managed) ────────────────────────

/// Returns `None` when the slug is taken.
pub async fn insert_role(
    pool: &PgPool,
    slug: &str,
    display_name_key: &str,
    description_key: &str,
    priority: i32,
) -> Result<Option<uuid::Uuid>> {
    let id = sqlx::query_scalar!(
        r#"INSERT INTO roles (slug, display_name_key, description_key, priority, is_system)
           VALUES ($1, $2, $3, $4, false)
           ON CONFLICT (slug) DO NOTHING
           RETURNING id"#,
        slug,
        display_name_key,
        description_key,
        priority
    )
    .fetch_optional(pool)
    .await?;
    Ok(id)
}

/// Metadata update, custom roles only (`false` = missing or system).
pub async fn update_role(
    pool: &PgPool,
    slug: &str,
    display_name_key: Option<&str>,
    description_key: Option<&str>,
    priority: Option<i32>,
) -> Result<bool> {
    let updated = sqlx::query!(
        r#"UPDATE roles SET
               display_name_key = COALESCE($2, display_name_key),
               description_key = COALESCE($3, description_key),
               priority = COALESCE($4, priority)
           WHERE slug = $1 AND NOT is_system"#,
        slug,
        display_name_key,
        description_key,
        priority
    )
    .execute(pool)
    .await?;
    Ok(updated.rows_affected() == 1)
}

/// Everyone currently holding the role (for rbac propagation).
pub async fn list_role_member_ids(pool: &PgPool, role_id: uuid::Uuid) -> Result<Vec<UserId>> {
    let ids = sqlx::query_scalar!(
        r#"SELECT user_id AS "user_id: UserId" FROM user_roles WHERE role_id = $1"#,
        role_id
    )
    .fetch_all(pool)
    .await?;
    Ok(ids)
}

/// Custom roles only; membership rows cascade.
pub async fn delete_role(pool: &PgPool, role_id: uuid::Uuid) -> Result<bool> {
    let deleted = sqlx::query!("DELETE FROM roles WHERE id = $1 AND NOT is_system", role_id)
        .execute(pool)
        .await?;
    Ok(deleted.rows_affected() == 1)
}

/// Replace the role's grant set wholesale (validated by the caller).
pub async fn replace_role_permissions(
    pool: &PgPool,
    role_id: uuid::Uuid,
    permissions: &[String],
) -> Result<()> {
    let mut tx = pool.begin().await?;
    sqlx::query!("DELETE FROM role_permissions WHERE role_id = $1", role_id)
        .execute(&mut *tx)
        .await?;
    for permission in permissions {
        sqlx::query!(
            r#"INSERT INTO role_permissions (role_id, permission)
               VALUES ($1, $2) ON CONFLICT DO NOTHING"#,
            role_id,
            permission
        )
        .execute(&mut *tx)
        .await?;
    }
    tx.commit().await?;
    Ok(())
}

/// Bump without touching membership (role definition changed).
pub async fn bump_rbac_version(pool: &PgPool, user_id: UserId) -> Result<Option<i64>> {
    let version = sqlx::query_scalar!(
        "UPDATE users SET rbac_version = rbac_version + 1 WHERE id = $1 RETURNING rbac_version",
        user_id.0
    )
    .fetch_optional(pool)
    .await?;
    Ok(version)
}
