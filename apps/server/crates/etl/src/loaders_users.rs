use std::collections::{BTreeMap, HashMap, HashSet};

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
        let (mut row, dropped) = transform::users::user(user)?;
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
        // Google profile pictures stay remote URLs (the web renders an
        // `https://` avatar value as is); local files become object keys.
        let avatar_key = user
            .avatar_image
            .as_deref()
            .map(str::trim)
            .and_then(|name| {
                if name.starts_with("https://") {
                    Some(name.to_owned())
                } else {
                    transform::files::under(&format!("users/{}/avatars", user.user_uuid), name)
                }
            });
        sqlx::query(
            "INSERT INTO users (id, zitadel_user_id, username, email, display_name, bio, avatar_key, locale, status, created_at, updated_at, profile, theme) \
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,COALESCE(to_timestamp($10),now()),COALESCE(to_timestamp($11),now()),$12,$13) \
             ON CONFLICT (id) DO UPDATE SET username=EXCLUDED.username,email=EXCLUDED.email,display_name=EXCLUDED.display_name,bio=EXCLUDED.bio,avatar_key=EXCLUDED.avatar_key,locale=EXCLUDED.locale,status=EXCLUDED.status,updated_at=EXCLUDED.updated_at,profile=EXCLUDED.profile,theme=EXCLUDED.theme",
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
        .bind(&row.profile)
        .bind(&row.theme)
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
        if let Some(reason) = dropped.details {
            ctx.drop_row("user_field", format!("{}:details", user.id), reason);
        }
        if dropped.google_avatar_url {
            ctx.drop_row(
                "user_field",
                format!("{}:insecure http avatar URL", user.id),
                "legacy-only profile field",
            );
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
    carry_role_grants(ctx).await?;
    load_auth_audit(ctx).await
}

/// BUG-378: production edited system-role grants (legacy `routers/roles.py`
/// allowed it); v2 system roles are seed-immutable. Every legacy grant equal
/// to the seed is carried by it; an extra one that maps to a v2 permission is
/// carried by a custom `<slug>-legacy-grants` role assigned to every holder
/// of the system role; anything else, and every seeded grant legacy had
/// revoked, is logged row by row.
async fn carry_role_grants(ctx: &mut Ctx) -> Result<()> {
    let legacy_grants = legacy::role_grants(&ctx.source).await?;
    ctx.source("role_permissions", legacy_grants.len());
    let system = sqlx::query(
        "SELECT r.slug, r.priority, array_remove(array_agg(rp.permission), NULL) AS seed, \
         (SELECT count(*) FROM user_roles ur WHERE ur.role_id = r.id) AS holders \
         FROM roles r LEFT JOIN role_permissions rp ON rp.role_id = r.id WHERE r.is_system GROUP BY r.id",
    )
    .fetch_all(&mut *ctx.tx)
    .await?;
    let mut written = 0usize;
    let mut by_slug: BTreeMap<&str, Vec<String>> = BTreeMap::new();
    for grant in &legacy_grants {
        by_slug
            .entry(&grant.slug)
            .or_default()
            .push(grant.permission.clone());
    }
    for (slug, grants) in by_slug {
        let Some(row) = system
            .iter()
            .find(|row| row.get::<String, _>("slug") == slug)
        else {
            for grant in grants {
                ctx.drop_row(
                    "role_permissions",
                    format!("{slug}:{grant}"),
                    format!("legacy role `{slug}` has no v2 system role"),
                );
            }
            continue;
        };
        let seed: Vec<String> = row.get("seed");
        let plan = plan_role_grants(slug, &grants, &seed, row.get::<i64, _>("holders") > 0);
        written += grants.len() - plan.drops.len();
        for (grant, reason) in plan.drops {
            ctx.drop_row("role_permissions", format!("{slug}:{grant}"), reason);
        }
        for grant in plan.revoked {
            ctx.drop_row(
                "role_permission_revoked",
                format!("{slug}:{grant}"),
                format!("legacy `{slug}` lacked this seeded grant; v2 system roles are immutable, so every {slug} holds it - review"),
            );
        }
        if plan.carry.is_empty() {
            continue;
        }
        let custom = format!("{slug}-legacy-grants");
        // UX-314: no display text - the web catalogs own the name and
        // description under the role's keys (`roles.<custom>.name`, as for
        // the seeded roles), so they read in the viewer's language; the
        // carried grants show in the role's permission list.
        let role_id: uuid::Uuid = sqlx::query_scalar(
            "INSERT INTO roles (slug, display_name_key, description_key, display_name, description, priority, is_system) \
             VALUES ($1, 'roles.' || $1 || '.name', 'roles.' || $1 || '.description', NULL, NULL, $2, false) \
             ON CONFLICT (slug) DO UPDATE SET display_name = NULL, description = NULL \
             RETURNING id",
        )
        .bind(&custom)
        .bind(row.get::<i32, _>("priority") - 1)
        .fetch_one(&mut *ctx.tx)
        .await?;
        sqlx::query("INSERT INTO role_permissions (role_id, permission) SELECT $1, unnest($2::text[]) ON CONFLICT DO NOTHING")
            .bind(role_id)
            .bind(&plan.carry)
            .execute(&mut *ctx.tx)
            .await?;
        let assigned = sqlx::query(
            "INSERT INTO user_roles (user_id, role_id, created_at) \
             SELECT ur.user_id, $1, ur.created_at FROM user_roles ur JOIN roles r ON r.id = ur.role_id \
             WHERE r.slug = $2 ON CONFLICT DO NOTHING",
        )
        .bind(role_id)
        .bind(slug)
        .execute(&mut *ctx.tx)
        .await?
        .rows_affected();
        ctx.note(format!(
            "role `{custom}` carries {} to {assigned} `{slug}` holder(s) (BUG-378)",
            plan.carry.join(", ")
        ));
    }
    ctx.wrote("role_permissions", written);
    Ok(())
}

#[derive(Debug, Default, PartialEq, Eq)]
struct GrantPlan {
    /// Extra v2 permissions the custom role carries.
    carry: Vec<String>,
    /// Extra legacy grants not carried, with the reason.
    drops: Vec<(String, String)>,
    /// Seeded grants legacy had revoked.
    revoked: Vec<String>,
}

fn plan_role_grants(
    slug: &str,
    legacy: &[String],
    seed: &[String],
    has_holders: bool,
) -> GrantPlan {
    use ab_core::permission::{Grant, Permission, PermissionSet, Scope};
    let seeded = PermissionSet::parse(seed.iter().map(String::as_str)).unwrap_or_default();
    // Legacy scope hierarchy: all > platform > assigned > own.
    let covered = |grant: &Grant| {
        let (Some(resource), Some(action), Some(scope)) =
            (grant.resource, grant.action, grant.scope)
        else {
            return false;
        };
        [Scope::Own, Scope::Assigned, Scope::Platform, Scope::All]
            .iter()
            .skip_while(|s| **s != scope)
            .any(|s| {
                seeded.grants(&Permission {
                    resource,
                    action,
                    scope: Some(*s),
                })
            })
    };
    let mut plan = GrantPlan::default();
    for grant in legacy.iter().filter(|g| !seed.contains(g)) {
        let reason = match Grant::parse(grant) {
            Ok(parsed) if covered(&parsed) => {
                format!("covered by a broader-scope `{slug}` v2 system grant")
            }
            Ok(_) if !has_holders => format!(
                "no user holds `{slug}` (v2 anonymous visitors carry no role; self-registration is not RBAC-gated)"
            ),
            Ok(_) => {
                plan.carry.push(grant.clone());
                continue;
            }
            Err(_) if grant.starts_with("assignment:") => {
                let equivalent = grant.replacen("assignment", "assessment", 1);
                if seed.contains(&equivalent) {
                    format!(
                        "no v2 resource `assignment` (legacy code never checks it either; assignments are assessments) - `{slug}` holds {equivalent}"
                    )
                } else {
                    format!(
                        "no v2 resource `assignment` (legacy code never checks it either); `{slug}` lacks {equivalent}"
                    )
                }
            }
            Err(error) => format!("no v2 permission: {error}"),
        };
        plan.drops.push((grant.clone(), reason));
    }
    plan.revoked = seed
        .iter()
        .filter(|g| !legacy.contains(g))
        .cloned()
        .collect();
    plan
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

    /// UX-314: a `<slug>-legacy-grants` role has no display text of its
    /// own - every catalog names and describes it for each system role that
    /// can carry extra grants (admin's `*:*:*` covers everything).
    #[test]
    fn legacy_grant_roles_have_catalog_text() {
        let messages =
            std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("../../../web/src/messages");
        for locale in ["ru-RU", "kk-KZ", "en-US"] {
            let raw = std::fs::read_to_string(messages.join(format!("{locale}.json"))).unwrap();
            let catalog: serde_json::Value = serde_json::from_str(&raw).unwrap();
            for slug in ["maintainer", "instructor", "moderator", "user", "guest"] {
                let role = &catalog["roles"][format!("{slug}-legacy-grants")];
                for key in ["name", "description"] {
                    assert!(
                        role[key].as_str().is_some_and(|t| !t.is_empty()),
                        "{locale}: roles.{slug}-legacy-grants.{key}"
                    );
                }
            }
        }
    }

    /// BUG-378: the production instructor diff against the v2 seed.
    #[test]
    fn edited_system_grants_are_carried_or_logged() {
        let s = |v: &[&str]| v.iter().map(|g| (*g).to_owned()).collect::<Vec<_>>();
        let seed = s(&[
            "assessment:*:own",
            "user:read:platform",
            "usergroup:manage:own",
        ]);
        let legacy = s(&[
            "assessment:*:own",
            "user:read:platform",
            "assignment:*:own",
            "user:read:assigned",
            "usergroup:manage:platform",
        ]);
        let plan = plan_role_grants("instructor", &legacy, &seed, true);
        assert_eq!(plan.carry, ["usergroup:manage:platform"]);
        let dropped: Vec<&str> = plan.drops.iter().map(|(g, _)| g.as_str()).collect();
        assert_eq!(dropped, ["assignment:*:own", "user:read:assigned"]);
        assert!(plan.drops[0].1.contains("holds assessment:*:own"));
        assert!(plan.drops[1].1.contains("covered"));
        assert_eq!(plan.revoked, ["usergroup:manage:own"]);
        // Nobody holds the role (guest): nothing to carry to.
        let guest = plan_role_grants("guest", &s(&["user:create:all"]), &[], false);
        assert!(guest.carry.is_empty() && guest.drops.len() == 1);
    }
}
