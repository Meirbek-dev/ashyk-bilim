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
           WHERE lower(username) = lower($1) OR lower(email) = lower($1)"#,
        login
    )
    .fetch_optional(pool)
    .await?;
    Ok(row)
}

/// The same row by id — for flows that already resolved the account
/// (Google by `sub`: the email Google reports may have moved, BUG-253).
pub async fn find_auth_user(pool: &PgPool, user_id: UserId) -> Result<Option<AuthUserRow>> {
    let row = sqlx::query_as!(
        AuthUserRow,
        r#"SELECT id AS "id: UserId", zitadel_user_id, username, email,
                  display_name, locale, status, rbac_version
           FROM users
           WHERE id = $1"#,
        user_id.0
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
    /// Raw text, custom roles only (seeded roles resolve the keys).
    pub display_name: Option<String>,
    pub description: Option<String>,
    pub priority: i32,
    pub is_system: bool,
}

pub async fn list_roles(pool: &PgPool) -> Result<Vec<RoleRow>> {
    let rows = sqlx::query_as!(
        RoleRow,
        r#"SELECT id, slug, display_name_key, description_key, display_name, description,
                  priority, is_system
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
        r#"SELECT id, slug, display_name_key, description_key, display_name, description,
                  priority, is_system
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
    // Bump first: an unknown user is `None` here, before the FK could fire.
    let Some(version) = sqlx::query_scalar!(
        "UPDATE users SET rbac_version = rbac_version + 1 WHERE id = $1 RETURNING rbac_version",
        user_id.0
    )
    .fetch_optional(&mut *tx)
    .await?
    else {
        return Ok(None);
    };
    sqlx::query!(
        "INSERT INTO user_roles (user_id, role_id) VALUES ($1, $2) ON CONFLICT DO NOTHING",
        user_id.0,
        role_id
    )
    .execute(&mut *tx)
    .await?;
    tx.commit().await?;
    Ok(Some(version))
}

/// Remove a role and bump rbac_version. Returns the new version (`None` if
/// the user does not exist).
///
/// Runs in the caller's transaction — after the last-admin guard
/// ([`count_other_active_role_holders`]) when the role is `admin` (UX-135).
pub async fn unassign_role(
    conn: &mut sqlx::PgConnection,
    user_id: UserId,
    role_id: uuid::Uuid,
) -> Result<Option<i64>> {
    sqlx::query!(
        "DELETE FROM user_roles WHERE user_id = $1 AND role_id = $2",
        user_id.0,
        role_id
    )
    .execute(&mut *conn)
    .await?;
    let version = sqlx::query_scalar!(
        "UPDATE users SET rbac_version = rbac_version + 1 WHERE id = $1 RETURNING rbac_version",
        user_id.0
    )
    .fetch_optional(&mut *conn)
    .await?;
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
    let id = sqlx::query_scalar!("SELECT id FROM users WHERE lower(email) = lower($1)", email)
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

/// Create a user with the default `user` role, atomically.
///
/// Returns `None` on username/email collision (caller retries with a
/// different username). Emails are stored lower-cased (case-insensitive
/// identity; unique on `lower(email)`).
pub async fn create_user_with_default_role(
    pool: &PgPool,
    zitadel_user_id: &str,
    username: &str,
    email: &str,
    display_name: &str,
    locale: Option<&str>,
) -> Result<Option<UserId>> {
    let mut tx = pool.begin().await?;
    let inserted = sqlx::query_scalar!(
        r#"INSERT INTO users (zitadel_user_id, username, email, display_name, locale)
           VALUES ($1, $2, $3, $4, COALESCE($5, 'ru-RU'))
           ON CONFLICT DO NOTHING
           RETURNING id"#,
        zitadel_user_id,
        username,
        email.to_lowercase(),
        display_name,
        locale
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

/// Set or clear (`None`) the avatar; returns the key it replaced.
///
/// The caller releases it in the same transaction (the
/// `set_course_thumbnail` mechanics). BUG-255: the old key is read under the row lock — a
/// `RETURNING (SELECT …)` reads the statement snapshot, so the second of two
/// concurrent swaps got the key the first had already released.
pub async fn set_avatar_key<'e>(
    db: impl sqlx::PgExecutor<'e>,
    user_id: UserId,
    key: Option<&str>,
) -> Result<Option<String>> {
    let row = sqlx::query!(
        r#"UPDATE users u SET avatar_key = $2
           FROM (SELECT id, avatar_key FROM users WHERE id = $1 FOR UPDATE) old
           WHERE u.id = old.id
           RETURNING old.avatar_key AS "previous?""#,
        user_id.0,
        key
    )
    .fetch_optional(db)
    .await?;
    Ok(row.and_then(|r| r.previous))
}

// ── Custom-role CRUD (system roles are seed-managed) ────────────────────────

/// Returns `None` when the slug is taken. The key columns get the
/// conventional `roles.<slug>.*` keys so the row shape matches seeded roles;
/// the display text lives in `display_name`/`description`.
pub async fn insert_role(
    pool: &PgPool,
    slug: &str,
    display_name: &str,
    description: Option<&str>,
    priority: i32,
) -> Result<Option<uuid::Uuid>> {
    let id = sqlx::query_scalar!(
        r#"INSERT INTO roles (slug, display_name_key, description_key, display_name, description,
                              priority, is_system)
           VALUES ($1, 'roles.' || $1 || '.name', 'roles.' || $1 || '.description', $2, $3, $4, false)
           ON CONFLICT (slug) DO NOTHING
           RETURNING id"#,
        slug,
        display_name,
        description,
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
    display_name: Option<&str>,
    description: Option<&str>,
    priority: Option<i32>,
) -> Result<bool> {
    let updated = sqlx::query!(
        r#"UPDATE roles SET
               display_name = COALESCE($2, display_name),
               description = COALESCE($3, description),
               priority = COALESCE($4, priority)
           WHERE slug = $1 AND NOT is_system"#,
        slug,
        display_name,
        description,
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

// ── Admin user management ───────────────────────────────────────────────────

pub struct AdminUserRow {
    pub id: UserId,
    pub username: String,
    pub email: String,
    pub display_name: String,
    pub status: String,
    pub roles: Vec<String>,
    pub created_at: i64,
}

/// Keyset page of all users, newest first, with aggregated role slugs.
/// `q` narrows by username/display name/email substring.
pub async fn list_users(
    pool: &PgPool,
    q: Option<&str>,
    cursor: Option<UserId>,
    limit: i64,
) -> Result<Vec<AdminUserRow>> {
    let pattern = q.map(|q| format!("%{}%", crate::like_escape(q)));
    let rows = sqlx::query_as!(
        AdminUserRow,
        r#"SELECT u.id AS "id: UserId", u.username, u.email, u.display_name, u.status,
                  COALESCE(array_agg(r.slug ORDER BY r.priority DESC)
                           FILTER (WHERE r.slug IS NOT NULL), '{}') AS "roles!",
                  (extract(epoch FROM u.created_at))::bigint AS "created_at!"
           FROM users u
           LEFT JOIN user_roles ur ON ur.user_id = u.id
           LEFT JOIN roles r ON r.id = ur.role_id
           WHERE ($1::text IS NULL OR u.username ILIKE $1 ESCAPE '\'
                  OR u.display_name ILIKE $1 ESCAPE '\' OR u.email ILIKE $1 ESCAPE '\')
             AND ($2::uuid IS NULL OR u.id < $2)
           GROUP BY u.id
           ORDER BY u.id DESC
           LIMIT $3"#,
        pattern.as_deref(),
        cursor.map(|c| c.0),
        limit
    )
    .fetch_all(pool)
    .await?;
    Ok(rows)
}

/// One admin listing row (after creation).
pub async fn get_admin_user(pool: &PgPool, user_id: UserId) -> Result<Option<AdminUserRow>> {
    let row = sqlx::query_as!(
        AdminUserRow,
        r#"SELECT u.id AS "id: UserId", u.username, u.email, u.display_name, u.status,
                  COALESCE(array_agg(r.slug ORDER BY r.priority DESC)
                           FILTER (WHERE r.slug IS NOT NULL), '{}') AS "roles!",
                  (extract(epoch FROM u.created_at))::bigint AS "created_at!"
           FROM users u
           LEFT JOIN user_roles ur ON ur.user_id = u.id
           LEFT JOIN roles r ON r.id = ur.role_id
           WHERE u.id = $1
           GROUP BY u.id"#,
        user_id.0
    )
    .fetch_optional(pool)
    .await?;
    Ok(row)
}

/// Flip active/disabled; bumps `rbac_version` so stale state cannot linger.
/// Runs in the caller's transaction (see [`unassign_role`]).
pub async fn set_user_status(
    conn: &mut sqlx::PgConnection,
    user_id: UserId,
    status: &str,
) -> Result<bool> {
    let updated = sqlx::query!(
        "UPDATE users SET status = $2, rbac_version = rbac_version + 1 WHERE id = $1",
        user_id.0,
        status
    )
    .execute(conn)
    .await?;
    Ok(updated.rows_affected() == 1)
}

pub async fn user_status(pool: &PgPool, user_id: UserId) -> Result<Option<String>> {
    let status = sqlx::query_scalar!("SELECT status FROM users WHERE id = $1", user_id.0)
        .fetch_optional(pool)
        .await?;
    Ok(status)
}

/// Active holders of `slug` other than `except` (the last-admin guard's
/// "would anyone be left" count — the target's own status is irrelevant,
/// BUG-144).
///
/// Locks the role row for the rest of the caller's transaction (UX-135):
/// two admins stripping / disabling each other serialise on it, so the
/// second one counts after the first one's write.
pub async fn count_other_active_role_holders(
    conn: &mut sqlx::PgConnection,
    slug: &str,
    except: UserId,
) -> Result<i64> {
    sqlx::query!("SELECT id FROM roles WHERE slug = $1 FOR UPDATE", slug)
        .fetch_optional(&mut *conn)
        .await?;
    let count = sqlx::query_scalar!(
        r#"SELECT count(*) AS "count!" FROM user_roles ur
           JOIN roles r ON r.id = ur.role_id
           JOIN users u ON u.id = ur.user_id
           WHERE r.slug = $1 AND u.status = 'active' AND u.id <> $2"#,
        slug,
        except.0
    )
    .fetch_one(conn)
    .await?;
    Ok(count)
}

// ── Summaries (grading surfaces) ────────────────────────────────────────────

#[derive(Debug, Clone)]
pub struct UserSummaryRow {
    pub id: UserId,
    pub username: String,
    pub display_name: String,
    pub email: String,
}

/// Name/email for a set of ids (any order; unknown ids are simply absent).
pub async fn list_user_summaries(pool: &PgPool, ids: &[UserId]) -> Result<Vec<UserSummaryRow>> {
    let ids: Vec<uuid::Uuid> = ids.iter().map(|u| u.0).collect();
    let rows = sqlx::query_as!(
        UserSummaryRow,
        r#"SELECT id AS "id: UserId", username, display_name, email
           FROM users WHERE id = ANY($1)"#,
        &ids
    )
    .fetch_all(pool)
    .await?;
    Ok(rows)
}

/// Id of the user with this username (case-insensitive), if any.
pub async fn find_user_id_by_username(pool: &PgPool, username: &str) -> Result<Option<UserId>> {
    let id = sqlx::query_scalar!(
        r#"SELECT id AS "id: UserId" FROM users WHERE lower(username) = lower($1)"#,
        username
    )
    .fetch_optional(pool)
    .await?;
    Ok(id)
}
