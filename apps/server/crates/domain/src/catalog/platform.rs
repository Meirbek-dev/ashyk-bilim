//! Platform settings singleton. Reads are public (the frontend bootstraps
//! navigation and landing content from it before any session exists);
//! writes need `platform:update:platform` (admins via wildcard).
//!
//! Branding images travel the upload pipeline: the update claims a finalized
//! `platform-logo` / `platform-thumbnail` upload and releases the replaced
//! one for reaping.

use ab_core::permission::{Action, Permission, ResourceType, Scope};
use ab_core::{Error, FieldError, Result};
use sqlx::PgPool;
use uuid::Uuid;

pub use ab_db::platform::PlatformRow as Platform;

use crate::files::uploads::UNREFERENCED_GRACE;
use crate::identity::Actor;

const UPDATE: Permission = Permission {
    resource: ResourceType::Platform,
    action: Action::Update,
    scope: Some(Scope::Platform),
};

/// Text fields of a platform update (branding claims travel separately).
#[derive(Debug, Default)]
pub struct PlatformChanges<'a> {
    pub name: Option<&'a str>,
    pub description: Option<&'a str>,
    pub about: Option<&'a str>,
    pub email: Option<&'a str>,
    pub label: Option<&'a str>,
}

#[derive(Clone)]
pub struct PlatformService {
    pool: PgPool,
}

impl PlatformService {
    #[must_use]
    pub const fn new(pool: PgPool) -> Self {
        Self { pool }
    }

    /// The singleton row (seeded by migration — absence is a deploy bug).
    pub async fn get(&self) -> Result<Platform> {
        ab_db::platform::get_platform(&self.pool)
            .await?
            .ok_or_else(|| {
                // Migration 0008 seeds the row; absence is a deploy bug.
                Error::app(ab_core::ErrorCode::Internal, "platform row is missing")
            })
    }

    /// Claim a finalized branding upload and return its storage key.
    async fn claim_branding(
        &self,
        actor: &Actor,
        upload_id: Uuid,
        required_purpose: &str,
    ) -> Result<String> {
        let upload = ab_db::uploads::get_upload(&self.pool, upload_id)
            .await?
            .ok_or_else(|| Error::not_found("upload"))?;
        if upload.created_by != actor.user_id {
            return Err(Error::forbidden("not your upload"));
        }
        if upload.purpose != required_purpose {
            return Err(Error::validation(vec![FieldError {
                field: "upload_id".into(),
                code: "wrong-purpose".into(),
                message: format!(
                    "expected a '{required_purpose}' upload, got '{}'",
                    upload.purpose
                ),
            }]));
        }
        if !ab_db::uploads::add_reference(&self.pool, upload_id).await? {
            return Err(Error::conflict("upload is not finalized"));
        }
        Ok(upload.key)
    }

    pub async fn update(
        &self,
        actor: &Actor,
        changes: PlatformChanges<'_>,
        logo_upload_id: Option<Uuid>,
        thumbnail_upload_id: Option<Uuid>,
    ) -> Result<Platform> {
        actor.require(UPDATE)?;
        let previous = self.get().await?;

        let logo_key = match logo_upload_id {
            Some(id) => Some(self.claim_branding(actor, id, "platform-logo").await?),
            None => None,
        };
        let thumbnail_key = match thumbnail_upload_id {
            Some(id) => Some(self.claim_branding(actor, id, "platform-thumbnail").await?),
            None => None,
        };

        ab_db::platform::update_platform(
            &self.pool,
            ab_db::platform::PlatformChanges {
                name: changes.name,
                description: changes.description,
                about: changes.about,
                email: changes.email,
                label: changes.label,
                logo_key: logo_key.as_deref(),
                thumbnail_key: thumbnail_key.as_deref(),
            },
        )
        .await?;

        // Release replaced branding for reaping (best-effort by key).
        if logo_key.is_some()
            && let Some(old) = previous.logo_key.as_deref()
        {
            ab_db::uploads::release_reference_by_key(
                &self.pool,
                old,
                UNREFERENCED_GRACE.as_secs_f64(),
            )
            .await?;
        }
        if thumbnail_key.is_some()
            && let Some(old) = previous.thumbnail_key.as_deref()
        {
            ab_db::uploads::release_reference_by_key(
                &self.pool,
                old,
                UNREFERENCED_GRACE.as_secs_f64(),
            )
            .await?;
        }

        self.get().await
    }
}
