//! Platform settings singleton. Reads are public (the frontend bootstraps
//! navigation and landing content from it before any session exists);
//! writes need `platform:update:platform` (admins via wildcard).
//!
//! Branding images travel the upload pipeline: the update claims a finalized
//! `platform-logo` / `platform-thumbnail` upload and releases the replaced
//! one for reaping.

use ab_core::permission::{Action, Permission, ResourceType, Scope};
use ab_core::{Error, Result};
use sqlx::PgPool;
use uuid::Uuid;

pub use ab_db::platform::PlatformRow as Platform;

use crate::files::uploads::{UNREFERENCED_GRACE, claim_upload};
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
    /// `Some(None)` clears the label.
    pub label: Option<Option<&'a str>>,
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

    pub async fn update(
        &self,
        actor: &Actor,
        changes: PlatformChanges<'_>,
        logo_upload_id: Option<Uuid>,
        thumbnail_upload_id: Option<Uuid>,
    ) -> Result<Platform> {
        actor.require(UPDATE)?;
        // BUG-164: the name feeds the landing page and every title — never
        // blank; UX-183: nor carrying control / bidi characters.
        let name = changes
            .name
            .map(|n| ab_core::required_text("name", n))
            .transpose()?;
        // UX-135: free-text fields are stored trimmed; a blank label is no label.
        // UX-184: and without control / bidi characters, like the name.
        let description = changes
            .description
            .map(|d| ab_core::strip_controls_multiline(d).trim().to_owned());
        let about = changes
            .about
            .map(|a| ab_core::strip_controls_multiline(a).trim().to_owned());
        let label = changes.label.map(|l| {
            l.map(|l| ab_core::strip_controls(l).trim().to_owned())
                .filter(|l| !l.is_empty())
        });
        // Claim, swap and release in one transaction (UX-211's avatar rule):
        // a hang-up never leaves a claimed upload that is not the branding.
        let mut tx = self.pool.begin().await?;
        let logo_key = match logo_upload_id {
            Some(id) => {
                Some(claim_upload(&mut tx, actor, id, "platform-logo", "logo_upload_id").await?)
            }
            None => None,
        };
        let thumbnail_key = match thumbnail_upload_id {
            Some(id) => Some(
                claim_upload(
                    &mut tx,
                    actor,
                    id,
                    "platform-thumbnail",
                    "thumbnail_upload_id",
                )
                .await?,
            ),
            None => None,
        };
        let replaced = ab_db::platform::update_platform(
            &mut *tx,
            ab_db::platform::PlatformChanges {
                name: name.as_deref(),
                description: description.as_deref(),
                about: about.as_deref(),
                email: changes.email,
                label: label.as_ref().map(Option::as_deref),
                logo_key: logo_key.as_deref(),
                thumbnail_key: thumbnail_key.as_deref(),
            },
        )
        .await?
        .ok_or_else(|| Error::app(ab_core::ErrorCode::Internal, "platform row is missing"))?;
        // Release exactly the keys the UPDATE replaced, for reaping.
        let released = [
            logo_key.and(replaced.logo_key),
            thumbnail_key.and(replaced.thumbnail_key),
        ];
        for old in released.iter().flatten() {
            ab_db::uploads::release_reference_by_key(
                &mut *tx,
                old,
                UNREFERENCED_GRACE.as_secs_f64(),
            )
            .await?;
        }
        tx.commit().await?;

        self.get().await
    }
}
