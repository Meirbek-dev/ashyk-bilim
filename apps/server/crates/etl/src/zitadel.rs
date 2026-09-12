//! Idempotent legacy credential import into Zitadel.

use std::collections::HashMap;

use ab_clients::zitadel::{NewHumanUser, PasswordSessionOutcome, PasswordSpec, ZitadelClient};
use ab_core::{Error, Result};
use secrecy::{ExposeSecret, SecretString};
use serde::Serialize;
use sqlx::postgres::PgPoolOptions;
use sqlx::{PgPool, Row};

use crate::legacy;
use crate::transform::users::{hash_is_importable, zitadel_names};

/// Optional known credential used to prove the imported hash through the same
/// Session API path as production login. Rehearsals should always supply it.
pub struct LoginProbe {
    pub login_name: String,
    pub password: SecretString,
}

#[derive(Debug, Default, Serialize)]
pub struct ImportReport {
    pub source_users: usize,
    pub created: usize,
    pub already_present: usize,
    pub passwordless: usize,
    pub unsupported_hashes: usize,
    pub login_probe_passed: bool,
}

impl ImportReport {
    #[must_use]
    pub fn render(&self) -> String {
        format!(
            "zitadel import GREEN — source {}, created {}, existing {}, passwordless {}, unsupported hashes {}, login probe {}",
            self.source_users,
            self.created,
            self.already_present,
            self.passwordless,
            self.unsupported_hashes,
            if self.login_probe_passed {
                "passed"
            } else {
                "not requested"
            }
        )
    }
}

struct TargetUser {
    id: uuid::Uuid,
    username: String,
    email: String,
}

/// Import every ETL-mapped user, reuse exact login-name matches on reruns, and
/// replace the temporary `legacy:*` identity link in the v2 database.
pub async fn run_import(
    source_url: &SecretString,
    target: &PgPool,
    client: &ZitadelClient,
    probe: Option<LoginProbe>,
) -> Result<ImportReport> {
    let source = PgPoolOptions::new()
        .max_connections(2)
        .connect(source_url.expose_secret())
        .await?;
    let users = legacy::users(&source, None).await?;
    let targets = target_users(target).await?;
    let mut report = ImportReport {
        source_users: users.len(),
        ..ImportReport::default()
    };

    for user in &users {
        let target_user = targets.get(&user.id).ok_or_else(|| {
            Error::config(format!(
                "legacy user {} has not been loaded into the target database",
                user.id
            ))
        })?;
        let mut request = import_request(user);
        request.username.clone_from(&target_user.username);
        request.email.clone_from(&target_user.email);
        match &request.password {
            PasswordSpec::None => {
                report.passwordless += 1;
                if user.hashed_password.is_some() {
                    report.unsupported_hashes += 1;
                }
            }
            PasswordSpec::Plain(_) | PasswordSpec::Hash(_) => {}
        }

        let zitadel_user_id =
            if let Some(id) = client.user_id_by_login_name(&target_user.username).await? {
                report.already_present += 1;
                id
            } else {
                report.created += 1;
                client.create_human_user(&request).await?
            };
        sqlx::query("UPDATE users SET zitadel_user_id = $2 WHERE id = $1")
            .bind(target_user.id)
            .bind(zitadel_user_id)
            .execute(target)
            .await?;
    }

    let unresolved: i64 =
        sqlx::query_scalar("SELECT count(*) FROM users WHERE zitadel_user_id LIKE 'legacy:%'")
            .fetch_one(target)
            .await?;
    if unresolved != 0 {
        return Err(Error::config(format!(
            "zitadel import left {unresolved} unresolved user link(s)"
        )));
    }

    if let Some(probe) = probe {
        match client
            .create_password_session(
                &ab_clients::zitadel::SessionUser::LoginName(&probe.login_name),
                &probe.password,
                None,
            )
            .await?
        {
            PasswordSessionOutcome::Ok(session) => {
                client
                    .delete_session(&session.session_id, &session.session_token)
                    .await?;
                report.login_probe_passed = true;
            }
            outcome => {
                return Err(Error::config(format!(
                    "imported-password login probe failed: {outcome:?}"
                )));
            }
        }
    }
    Ok(report)
}

async fn target_users(target: &PgPool) -> Result<HashMap<i32, TargetUser>> {
    let rows = sqlx::query(
        "SELECT m.legacy_id, u.id, u.username, u.email FROM etl_id_map m JOIN users u ON u.id=m.new_id WHERE m.entity='user'",
    )
    .fetch_all(target)
    .await?;
    rows.into_iter()
        .map(|row| {
            let legacy_id = row
                .get::<String, _>("legacy_id")
                .parse::<i32>()
                .map_err(|error| Error::internal("parsing legacy user id map", error))?;
            Ok((
                legacy_id,
                TargetUser {
                    id: row.get("id"),
                    username: row.get("username"),
                    email: row.get("email"),
                },
            ))
        })
        .collect()
}

/// Convert one legacy account into Zitadel's create-human-user request.
/// Unsupported password hashes deliberately become passwordless and are
/// reported by the caller; this never sends plaintext credentials.
#[must_use]
pub fn import_request(user: &legacy::User) -> NewHumanUser {
    let (given_name, family_name) =
        zitadel_names(&user.first_name, &user.last_name, &user.username);
    let password = user
        .hashed_password
        .as_deref()
        .filter(|hash| hash_is_importable(hash))
        .map_or(PasswordSpec::None, |hash| {
            PasswordSpec::Hash(hash.to_owned())
        });
    NewHumanUser {
        username: user.username.trim().to_owned(),
        email: user.email.trim().to_owned(),
        // Legacy never operated an email-verification flow (the production
        // restore has the flag false for every account), so cutover
        // grandfathers existing addresses instead of forcing 117 resets.
        email_verified: true,
        given_name,
        family_name,
        password,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn unsupported_hash_becomes_passwordless() {
        let user = legacy::User {
            id: 1,
            user_uuid: "user_x".into(),
            username: "u".into(),
            first_name: "".into(),
            last_name: "".into(),
            middle_name: None,
            email: "u@example.com".into(),
            avatar_image: None,
            bio: None,
            locale: None,
            theme: None,
            hashed_password: Some("sha1$bad".into()),
            auth_provider: "local".into(),
            google_sub: None,
            is_active: true,
            is_superuser: false,
            is_verified: false,
            has_details: false,
            has_profile: false,
            created_at: None,
            updated_at: None,
        };
        let request = import_request(&user);
        assert!(matches!(request.password, PasswordSpec::None));
        assert!(request.email_verified);
    }
}
