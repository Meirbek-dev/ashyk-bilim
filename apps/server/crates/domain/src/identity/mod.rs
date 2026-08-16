//! Identity context: sessions (BFF, Redis-backed), the [`Actor`] every domain
//! service method takes, and (slices 1.4+) auth flows, users, RBAC admin.

pub mod actor;
pub mod sessions;

pub use actor::Actor;
pub use sessions::{NewSession, SessionRecord, SessionStore};
