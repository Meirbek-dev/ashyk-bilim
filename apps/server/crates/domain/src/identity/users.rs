//! User self-service: profile read/update, avatar via the upload pipeline.

use ab_core::permission::{Action, Permission, ResourceType, Scope};
use ab_core::{Error, FieldError, Result};
use sqlx::PgPool;
use uuid::Uuid;

use crate::files::uploads::UNREFERENCED_GRACE;
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
        match changes.avatar_upload_id {
            Some(Some(upload_id)) => self.claim_avatar(actor, upload_id).await?,
            Some(None) => self.replace_avatar(actor, None).await?,
            None => {}
        }
        ab_db::identity::update_profile(
            &self.pool,
            actor.user_id,
            display_name.as_deref(),
            changes.bio.as_deref().map(str::trim),
            changes.locale.as_deref(),
        )
        .await?
        .ok_or_else(|| Error::not_found("user"))
    }

    /// Claim a finalized `avatar` upload, releasing any replaced object for
    /// reaping (same mechanics as block media and platform branding).
    async fn claim_avatar(&self, actor: &Actor, upload_id: Uuid) -> Result<()> {
        let upload = ab_db::uploads::get_upload(&self.pool, upload_id)
            .await?
            .ok_or_else(|| Error::not_found("upload"))?;
        if upload.created_by != actor.user_id {
            return Err(Error::forbidden("not your upload"));
        }
        if upload.purpose != "avatar" {
            return Err(Error::validation(vec![FieldError {
                field: "avatar_upload_id".into(),
                code: "wrong-purpose".into(),
                message: format!("expected an 'avatar' upload, got '{}'", upload.purpose),
            }]));
        }
        if !ab_db::uploads::add_reference(&self.pool, upload_id).await? {
            return Err(Error::conflict("upload is not finalized"));
        }
        self.replace_avatar(actor, Some(&upload.key)).await
    }

    /// Swap the avatar key and release exactly the key the UPDATE replaced
    /// (equal to `key` only after a re-claim, which counted it once more),
    /// in one transaction (BUG-255).
    async fn replace_avatar(&self, actor: &Actor, key: Option<&str>) -> Result<()> {
        let mut tx = self.pool.begin().await?;
        if let Some(old) = ab_db::identity::set_avatar_key(&mut *tx, actor.user_id, key).await? {
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
