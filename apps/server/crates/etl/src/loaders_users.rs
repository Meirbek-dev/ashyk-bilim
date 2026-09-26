use std::collections::{HashMap, HashSet};

use ab_core::Result;
use sqlx::Row;

use crate::ctx::Ctx;
use crate::{legacy, transform};

#[allow(clippy::too_many_lines)]
pub async fn run(ctx: &mut Ctx) -> Result<()> {
    let users = legacy::users(&ctx.source, ctx.limit).await?;
    ctx.source("user", users.len());
    let mut emails = HashSet::new();
    for user in &users {
        let id = ctx.idmap.mint(
            "user",
            user.id,
            Some(&user.user_uuid),
            legacy::micros(user.created_at),
        );
        let (mut row, dropped) = transform::users::user(user);
        if !emails.insert(row.email.to_ascii_lowercase()) {
            let original = row.email.clone();
            row.email = collision_email(&original, user.id);
            ctx.drop_row(
                "user_field",
                format!("{}:email", user.id),
                format!("duplicate email {original}; migrated as {}", row.email),
            );
            emails.insert(row.email.to_ascii_lowercase());
        }
        let avatar_key = user.avatar_image.as_deref().and_then(|name| {
            transform::files::under(&format!("users/{}/avatars", user.user_uuid), name)
        });
        sqlx::query(
            "INSERT INTO users (id, zitadel_user_id, username, email, display_name, bio, avatar_key, locale, status, created_at, updated_at) \
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,COALESCE(to_timestamp($10),now()),COALESCE(to_timestamp($11),now())) \
             ON CONFLICT (id) DO UPDATE SET username=EXCLUDED.username,email=EXCLUDED.email,display_name=EXCLUDED.display_name,bio=EXCLUDED.bio,avatar_key=EXCLUDED.avatar_key,locale=EXCLUDED.locale,status=EXCLUDED.status,updated_at=EXCLUDED.updated_at",
        )
        .bind(id)
        .bind(&row.zitadel_placeholder)
        .bind(&row.username)
        .bind(&row.email)
        .bind(&row.display_name)
        .bind(&row.bio)
        .bind(avatar_key)
        .bind(&row.locale)
        .bind(&row.status)
        .bind(user.created_at)
        .bind(user.updated_at)
        .execute(&mut *ctx.tx)
        .await?;
        if let Some(google_sub) = row.google_sub {
            sqlx::query(
                "INSERT INTO google_accounts (google_sub,user_id,email,created_at) VALUES ($1,$2,$3,COALESCE(to_timestamp($4),now())) \
                 ON CONFLICT (google_sub) DO UPDATE SET user_id=EXCLUDED.user_id,email=EXCLUDED.email",
            )
            .bind(google_sub)
            .bind(id)
            .bind(&row.email)
            .bind(user.created_at)
            .execute(&mut *ctx.tx)
            .await?;
        }
        for (name, present) in [
            ("theme", dropped.theme),
            ("details", dropped.details),
            ("profile", dropped.profile),
            ("remote avatar URL", dropped.google_avatar_url),
        ] {
            if present {
                ctx.drop_row(
                    "user_field",
                    format!("{}:{name}", user.id),
                    "legacy-only profile field",
                );
            }
        }
    }
    ctx.wrote("user", users.len());

    let legacy_roles = legacy::roles(&ctx.source).await?;
    let mut legacy_slugs = HashMap::new();
    for role in legacy_roles {
        legacy_slugs.insert(role.id, role.slug);
    }
    let target_roles = sqlx::query("SELECT id, slug FROM roles")
        .fetch_all(&mut *ctx.tx)
        .await?;
    let target_roles: HashMap<String, uuid::Uuid> = target_roles
        .into_iter()
        .map(|row| (row.get("slug"), row.get("id")))
        .collect();
    let user_roles = legacy::user_roles(&ctx.source, ctx.limit).await?;
    ctx.source("user_roles", user_roles.len());
    let mut written = 0usize;
    for role in user_roles {
        let Some(user_id) = ctx.idmap.get("user", role.user_id) else {
            ctx.drop_row("user_role", role.id, "orphan user");
            continue;
        };
        let Some(role_id) = legacy_slugs
            .get(&role.role_id)
            .and_then(|slug| target_roles.get(slug))
            .copied()
        else {
            ctx.drop_row("user_role", role.id, "unknown role");
            continue;
        };
        sqlx::query(
            "INSERT INTO user_roles (user_id,role_id,created_at) VALUES ($1,$2,COALESCE(to_timestamp($3),now())) ON CONFLICT DO NOTHING",
        )
        .bind(user_id)
        .bind(role_id)
        .bind(role.assigned_at)
        .execute(&mut *ctx.tx)
        .await?;
        written += 1;
    }
    ctx.wrote("user_roles", written);
    load_auth_audit(ctx).await
}

async fn load_auth_audit(ctx: &mut Ctx) -> Result<()> {
    let rows = legacy::auth_audit(&ctx.source, ctx.limit).await?;
    ctx.source("auth_audit_log", rows.len());
    for row in &rows {
        let user_id = transform::users::audit_user_uuid(row.user_id.as_deref())
            .and_then(|value| ctx.idmap.get_by_uuid("user", value));
        let mut metadata = row
            .metadata
            .clone()
            .unwrap_or_else(|| serde_json::json!({}));
        if let Some(object) = metadata.as_object_mut() {
            object.insert(
                "legacy_severity".into(),
                serde_json::Value::String(row.severity.clone()),
            );
            if let Some(session_id) = &row.session_id {
                object.insert(
                    "legacy_session_id".into(),
                    serde_json::Value::String(session_id.clone()),
                );
            }
        }
        let id = ctx.idmap.mint(
            "auth_audit_log",
            row.id,
            None,
            legacy::micros(row.created_at),
        );
        sqlx::query("INSERT INTO auth_audit_log (id,user_id,event,ip,user_agent,metadata,created_at) VALUES ($1,$2,$3,$4::inet,$5,$6,COALESCE(to_timestamp($7),now())) ON CONFLICT (id) DO NOTHING")
            .bind(id).bind(user_id).bind(&row.event_type).bind(&row.ip_address)
            .bind(&row.user_agent).bind(metadata).bind(row.created_at)
            .execute(&mut *ctx.tx).await?;
    }
    ctx.wrote("auth_audit_log", rows.len());
    Ok(())
}

fn collision_email(email: &str, legacy_id: i32) -> String {
    email.rsplit_once('@').map_or_else(
        || format!("{email}+legacy-{legacy_id}"),
        |(local, domain)| format!("{local}+legacy-{legacy_id}@{domain}"),
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn duplicate_email_alias_is_deterministic() {
        assert_eq!(
            collision_email("a@example.com", 17),
            "a+legacy-17@example.com"
        );
    }
}
