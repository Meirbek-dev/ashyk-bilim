//! User self-service: profile read/update, avatar via the upload pipeline.

use ab_core::permission::{Action, Permission, ResourceType, Scope};
use ab_core::{Error, Result};
use sqlx::PgPool;
use uuid::Uuid;

use crate::files::uploads::{UNREFERENCED_GRACE, claim_upload};
use crate::identity::Actor;

pub use ab_db::identity::ProfileRow as Profile;

#[derive(Debug, Default)]
pub struct ProfileChanges {
    pub display_name: Option<String>,
    pub bio: Option<String>,
    pub locale: Option<String>,
    /// Finalized `avatar` upload to claim as the new avatar; `Some(None)`
    /// removes the current one (UX-163).
    pub avatar_upload_id: Option<Option<Uuid>>,
}

#[derive(Clone)]
pub struct UsersService {
    pool: PgPool,
}

impl UsersService {
    #[must_use]
    pub const fn new(pool: PgPool) -> Self {
        Self { pool }
    }

    pub async fn my_profile(&self, actor: &Actor) -> Result<Profile> {
        ab_db::identity::get_profile(&self.pool, actor.user_id)
            .await?
            .ok_or_else(|| Error::not_found("user"))
    }

    pub async fn update_my_profile(
        &self,
        actor: &Actor,
        changes: ProfileChanges,
    ) -> Result<Profile> {
        actor.require(Permission {
            resource: ResourceType::User,
            action: Action::Update,
            scope: Some(Scope::Own),
        })?;
        let display_name = changes
            .display_name
            .as_deref()
            .map(|name| ab_core::required_text("display_name", name))
            .transpose()?;
        // UX-183: the bio keeps its line breaks, not control / bidi characters.
        let bio = changes
            .bio
            .as_deref()
            .map(ab_core::strip_controls_multiline);
        if let Some(upload_id) = changes.avatar_upload_id {
            self.replace_avatar(actor, upload_id).await?;
        }
        ab_db::identity::update_profile(
            &self.pool,
            actor.user_id,
            display_name.as_deref(),
            bio.as_deref().map(str::trim),
            changes.locale.as_deref(),
        )
        .await?
        .ok_or_else(|| Error::not_found("user"))
    }

    /// Claim the new avatar upload (if any), swap the key and release
    /// exactly the key the UPDATE replaced (equal to the new one only after a
    /// re-claim, which counted it once more) — one transaction, so a hang-up
    /// never leaves a claimed reference without the swap (BUG-255, UX-211).
    async fn replace_avatar(&self, actor: &Actor, upload_id: Option<Uuid>) -> Result<()> {
        let mut tx = self.pool.begin().await?;
        let key = match upload_id {
            Some(id) => Some(claim_upload(&mut tx, actor, id, "avatar", "avatar_upload_id").await?),
            None => None,
        };
        if let Some(old) =
            ab_db::identity::set_avatar_key(&mut *tx, actor.user_id, key.as_deref()).await?
        {
            ab_db::uploads::release_reference_by_key(
                &mut *tx,
                &old,
                UNREFERENCED_GRACE.as_secs_f64(),
            )
            .await?;
        }
        tx.commit().await?;
        Ok(())
    }
}
