//! Catalog context: courses (+ updates feed), curriculum (chapters/
//! activities/blocks), collections, and the platform singleton.

pub mod collections;
pub mod courses;
pub mod curriculum;
pub mod platform;
pub mod search;

pub use collections::CollectionsService;
pub use courses::CoursesService;
pub use curriculum::CurriculumService;
pub use platform::PlatformService;
pub use search::SearchService;

use ab_core::permission::{Action, Permission, ResourceType, Scope};

use crate::identity::Actor;

/// Whether the actor sees private catalog entries they neither created nor
/// were cohort-linked to.
///
/// The legacy access filter ignored `course:read:all` (every role holds it —
/// it means "browse the public catalogue"), so the bypass is reserved for
/// staff who manage the resource platform-wide.
#[must_use]
pub fn sees_private(actor: &Actor, resource: ResourceType) -> bool {
    [Action::Manage, Action::Update].into_iter().any(|action| {
        actor.has(Permission {
            resource,
            action,
            scope: Some(Scope::Platform),
        })
    })
}
