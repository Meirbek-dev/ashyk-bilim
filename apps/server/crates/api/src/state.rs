//! Shared application state, cloned per request (all fields are cheap clones).

use std::sync::Arc;

use ab_core::config::Config;
use ab_domain::identity::{IdentityService, SessionStore, UsersService};
use sqlx::PgPool;

#[derive(Clone)]
pub struct AppState {
    pub pool: PgPool,
    pub config: Arc<Config>,
    pub sessions: SessionStore,
    pub identity: IdentityService,
    pub users: UsersService,
}

impl AppState {
    #[must_use]
    pub fn new(pool: PgPool, config: Config, identity: IdentityService) -> Self {
        Self {
            users: UsersService::new(pool.clone()),
            pool,
            config: Arc::new(config),
            sessions: identity.sessions().clone(),
            identity,
        }
    }
}
