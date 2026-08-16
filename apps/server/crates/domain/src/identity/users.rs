//! User self-service: profile read/update. Admin user management arrives with
//! slice 1.8 alongside role administration.

use ab_core::permission::{Action, Permission, ResourceType, Scope};
use ab_core::{Error, Result};
use sqlx::PgPool;

use crate::identity::Actor;

pub use ab_db::identity::ProfileRow as Profile;

#[derive(Debug, Default)]
pub struct ProfileChanges {
    pub display_name: Option<String>,
    pub bio: Option<String>,
    pub locale: Option<String>,
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
        ab_db::identity::update_profile(
            &self.pool,
            actor.user_id,
            changes.display_name.as_deref(),
            changes.bio.as_deref(),
            changes.locale.as_deref(),
        )
        .await?
        .ok_or_else(|| Error::not_found("user"))
    }
}
