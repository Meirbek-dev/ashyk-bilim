//! Self-service account changes (OPEN-G-1): an e-mail change confirmed with a
//! code sent to the new address, and account deletion.
//!
//! - The new address is held in Redis until its code is typed back; nothing
//!   changes (here or in Zitadel) before that, so a typo costs nothing.
//! - Deletion keeps the `users` row - submissions, grades, posts and
//!   certificates point at it - and clears every personal field
//!   ([`ab_db::identity::anonymise_user`]); the Zitadel user is deleted, so
//!   the login and the address are free again. Staff accounts are closed by
//!   an admin (courses and roles hang on them).

use std::time::Duration;

use ab_clients::zitadel::{PasswordSessionOutcome, SessionUser};
use ab_core::{Error, ErrorCode, FieldError, Result};
use redis::AsyncCommands;
use secrecy::SecretString;

use super::{CODE_MAIL_WINDOW, IdentityService, PASSWORD_CHECK_WINDOW, html_escape};
use crate::identity::Actor;

/// How long an emailed change code stays valid.
const EMAIL_CHANGE_TTL: Duration = Duration::from_hours(1);
/// Wrong codes per hour before the change has to be asked for again.
const EMAIL_CHANGE_ATTEMPTS: u32 = 5;
/// The default role every account has; any other one is staff.
const BASE_ROLE: &str = "user";

#[derive(serde::Serialize, serde::Deserialize)]
struct PendingEmail {
    email: String,
    code: String,
}

fn pending_key(actor: &Actor) -> String {
    format!("email_change:{}", actor.user_id)
}

fn code_invalid() -> Error {
    Error::validation(vec![FieldError {
        field: "code".into(),
        code: "invalid".into(),
        message: "confirmation code is invalid or expired".into(),
    }])
}

/// Six digits from a v4 UUID's random bits (122 of them; the modulo bias is
/// below 10^-30).
fn new_code() -> String {
    format!("{:06}", uuid::Uuid::new_v4().as_u128() % 1_000_000)
}

/// Login placeholder of a deleted account (unique, fits the username rules).
fn deleted_placeholder(actor: &Actor) -> String {
    format!("deleted-{}", actor.user_id.0.simple())
}

impl IdentityService {
    /// Confirm it is the account holder: the password, checked by Zitadel
    /// with the change-password throttle. A Google-only account has none and
    /// passes on its session alone.
    async fn confirm_password(&self, actor: &Actor, password: Option<&SecretString>) -> Result<()> {
        if !actor.has_password {
            return Ok(());
        }
        let invalid = || Error::app(ErrorCode::InvalidCredentials, "invalid credentials");
        let Some(password) = password else {
            return Err(invalid());
        };
        let key = format!("rl:password:user:{}", actor.user_id);
        self.enforce(
            &key,
            (self.limits.password_check, PASSWORD_CHECK_WINDOW),
            "password",
        )
        .await?;
        let checked = self
            .zitadel
            .create_password_session(&SessionUser::Id(&actor.zitadel_user_id), password, None)
            .await;
        match checked {
            Ok(PasswordSessionOutcome::Ok(session)) => {
                self.limiter.clear(&key).await?;
                // Only a check: the Zitadel session is not kept.
                if let Err(err) = self
                    .zitadel
                    .delete_session(&session.session_id, &session.session_token)
                    .await
                {
                    tracing::warn!(%err, "password check session not deleted");
                }
                Ok(())
            }
            Ok(_) => Err(invalid()),
            Err(err) => {
                self.limiter.release(&key).await?;
                Err(err)
            }
        }
    }

    /// `POST /auth/email`: mail a code to the new address. Throttled with
    /// the other code mails of the account.
    pub async fn request_email_change(
        &self,
        actor: &Actor,
        email: &str,
        password: Option<&SecretString>,
    ) -> Result<()> {
        let email = email.trim().to_lowercase();
        let current = ab_db::identity::find_auth_user(&self.pool, actor.user_id)
            .await?
            .ok_or_else(|| Error::not_found("user"))?;
        if current.email.eq_ignore_ascii_case(&email) {
            return Err(Error::validation(vec![FieldError {
                field: "email".into(),
                code: "unchanged".into(),
                message: "this is already the account's address".into(),
            }]));
        }
        self.confirm_password(actor, password).await?;
        if ab_db::identity::find_user_id_by_email(&self.pool, &email)
            .await?
            .is_some()
        {
            return Err(Error::app(
                ErrorCode::EmailTaken,
                "email is already registered",
            ));
        }
        self.enforce(
            &format!("rl:code-mail:user:{}", actor.user_id),
            (self.limits.email_per_account, CODE_MAIL_WINDOW),
            "code mail",
        )
        .await?;
        let pending = PendingEmail {
            email,
            code: new_code(),
        };
        let value = serde_json::to_string(&pending)
            .map_err(|e| Error::internal("encoding a pending email change", e))?;
        let mut redis = self.sessions.redis();
        let _: () = redis
            .set_ex(pending_key(actor), value, EMAIL_CHANGE_TTL.as_secs())
            .await
            .map_err(|e| Error::internal("storing a pending email change", e))?;
        self.limiter
            .clear(&format!("rl:email-change:code:{}", actor.user_id))
            .await?;
        ab_db::identity::insert_auth_audit(
            &self.pool,
            Some(actor.user_id),
            "email-change-requested",
            None,
            None,
            serde_json::json!({}),
        )
        .await?;
        self.mail(
            &pending.email,
            "Подтвердите новый адрес почты - Ashyq Bilim",
            &format!(
                "<p>Здравствуйте, {name}!</p>\
                 <p>Код для смены адреса почты: <strong>{code}</strong></p>\
                 <p>Введите его в настройках профиля. Код действует один час.</p>\
                 <p>Если вы не меняли адрес, просто проигнорируйте это письмо.</p>",
                name = html_escape(&current.display_name),
                code = pending.code,
            ),
            &pending.code,
        )
        .await;
        Ok(())
    }

    /// `POST /auth/email/confirm`: the emailed code switches the account to
    /// the new address (verified) here and in Zitadel; the old address is
    /// told about it.
    pub async fn confirm_email_change(&self, actor: &Actor, code: &str) -> Result<()> {
        self.enforce(
            &format!("rl:email-change:code:{}", actor.user_id),
            (EMAIL_CHANGE_ATTEMPTS, EMAIL_CHANGE_TTL),
            "email change",
        )
        .await?;
        let mut redis = self.sessions.redis();
        let stored: Option<String> = redis
            .get(pending_key(actor))
            .await
            .map_err(|e| Error::internal("reading a pending email change", e))?;
        let Some(pending) = stored.and_then(|s| serde_json::from_str::<PendingEmail>(&s).ok())
        else {
            return Err(code_invalid());
        };
        if code.trim() != pending.code {
            return Err(code_invalid());
        }
        let lock = format!("lock:email:user:{}", actor.user_id);
        if !self.try_lock(&lock).await? {
            return Err(Error::app(
                ErrorCode::IdempotencyInProgress,
                "an email change is already in progress",
            ));
        }
        let changed = self.switch_email(actor, &pending.email).await;
        self.unlock(&lock).await?;
        let old = changed?;
        let _: i64 = redis
            .del(pending_key(actor))
            .await
            .map_err(|e| Error::internal("dropping a pending email change", e))?;
        self.mail(
            &old,
            "Адрес почты изменён - Ashyq Bilim",
            &format!(
                "<p>Адрес почты вашей учётной записи Ashyq Bilim изменён на {new}.</p>\
                 <p>Если это были не вы, восстановите доступ через «Забыли пароль?» и напишите администратору платформы.</p>",
                new = html_escape(&pending.email),
            ),
            "",
        )
        .await;
        Ok(())
    }

    /// Zitadel, then our row (the login reads ours). Returns the old address.
    async fn switch_email(&self, actor: &Actor, email: &str) -> Result<String> {
        let current = ab_db::identity::find_auth_user(&self.pool, actor.user_id)
            .await?
            .ok_or_else(|| Error::not_found("user"))?;
        let taken = || Error::app(ErrorCode::EmailTaken, "email is already registered");
        if ab_db::identity::find_user_id_by_email(&self.pool, email)
            .await?
            .is_some_and(|id| id != actor.user_id)
        {
            return Err(taken());
        }
        self.zitadel
            .set_verified_email(&actor.zitadel_user_id, email)
            .await?;
        if !ab_db::identity::set_user_email(&self.pool, actor.user_id, email).await? {
            return Err(taken());
        }
        ab_db::identity::insert_auth_audit(
            &self.pool,
            Some(actor.user_id),
            "email-changed",
            None,
            None,
            serde_json::json!({}),
        )
        .await?;
        Ok(current.email)
    }

    /// `POST /users/me/deletion`: delete the caller's own account. Staff
    /// (any role besides `user`) answer `account-has-roles`: an admin closes
    /// those. Every session ends; the Zitadel user goes (a failure there is
    /// logged - our row is disabled, nobody signs in with it).
    pub async fn delete_own_account(
        &self,
        actor: &Actor,
        password: Option<&SecretString>,
    ) -> Result<()> {
        // The stored roles, not the session's copy (granted a minute ago counts).
        let (roles, _) = ab_db::identity::load_user_grants(&self.pool, actor.user_id).await?;
        if roles.iter().any(|role| role != BASE_ROLE) {
            return Err(Error::app(
                ErrorCode::AccountHasRoles,
                "accounts with staff roles are closed by an admin",
            ));
        }
        self.confirm_password(actor, password).await?;
        let mut tx = self.pool.begin().await?;
        let deleted =
            ab_db::identity::anonymise_user(&mut tx, actor.user_id, &deleted_placeholder(actor))
                .await?;
        tx.commit().await?;
        if !deleted {
            return Ok(());
        }
        self.sessions.revoke_all(actor.user_id).await?;
        if let Err(err) = self.zitadel.delete_user(&actor.zitadel_user_id).await {
            tracing::warn!(%err, user_id = %actor.user_id, "zitadel user of a deleted account not removed");
        }
        ab_db::identity::insert_auth_audit(
            &self.pool,
            Some(actor.user_id),
            "account-deleted",
            None,
            None,
            serde_json::json!({}),
        )
        .await?;
        crate::events::user::admin_list(&self.pool, crate::events::user::AdminList::Users).await;
        Ok(())
    }

    /// One account mail; without a mailer the code is logged (dev, e2e).
    async fn mail(&self, to: &str, subject: &str, html: &str, code: &str) {
        let Some(mailer) = &self.mailer else {
            tracing::warn!(email = %to, code, "resend not configured: \"{subject}\" not delivered");
            return;
        };
        if let Err(err) = mailer.send(to, subject, html).await {
            tracing::warn!(%err, "\"{subject}\" email not sent");
        }
    }
}

#[cfg(test)]
mod tests {
    #[test]
    fn codes_are_six_digits() {
        for _ in 0..200 {
            let code = super::new_code();
            assert_eq!(code.len(), 6);
            assert!(code.bytes().all(|b| b.is_ascii_digit()));
        }
    }
}
