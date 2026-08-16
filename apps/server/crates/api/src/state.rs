//! Shared application state, cloned per request (all fields are cheap clones).

use std::sync::Arc;

use ab_clients::storage::StorageClient;
use ab_core::config::Config;
use ab_domain::files::UploadsService;
use ab_domain::identity::{
    GoogleAuthService, IdentityService, RbacAdminService, SessionStore, UsersService,
};
use sqlx::PgPool;

#[derive(Clone)]
pub struct AppState {
    pub pool: PgPool,
    pub config: Arc<Config>,
    pub sessions: SessionStore,
    pub identity: IdentityService,
    pub users: UsersService,
    pub rbac: RbacAdminService,
    /// `None` when Google login is not configured (password login only).
    pub google: Option<GoogleAuthService>,
    pub storage: Arc<StorageClient>,
    pub uploads: UploadsService,
}

impl AppState {
    #[must_use]
    pub fn new(
        pool: PgPool,
        config: Config,
        identity: IdentityService,
        google: Option<GoogleAuthService>,
        storage: Arc<StorageClient>,
    ) -> Self {
        let sessions = identity.sessions().clone();
        Self {
            users: UsersService::new(pool.clone()),
            rbac: RbacAdminService::new(pool.clone(), sessions.clone()),
            uploads: UploadsService::new(pool.clone(), Arc::clone(&storage)),
            pool,
            config: Arc::new(config),
            sessions,
            identity,
            google,
            storage,
        }
    }
}
