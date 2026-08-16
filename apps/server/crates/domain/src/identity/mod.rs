//! Identity context: sessions (BFF, Redis-backed), the [`Actor`] every domain
//! service method takes, and (slices 1.4+) auth flows, users, RBAC admin.

pub mod actor;
pub mod auth;
pub mod google;
pub mod rate_limit;
pub mod rbac_admin;
pub mod sessions;
pub mod users;

pub use actor::Actor;
pub use auth::{IdentityService, LoginInput, LoginOk};
pub use google::GoogleAuthService;
pub use rbac_admin::RbacAdminService;
pub use sessions::{NewSession, SessionRecord, SessionStore};
pub use users::UsersService;
