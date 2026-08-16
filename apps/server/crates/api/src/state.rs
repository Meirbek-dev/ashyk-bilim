//! Shared application state, cloned per request (all fields are cheap clones).

use std::sync::Arc;

use ab_core::config::Config;
use ab_domain::identity::SessionStore;
use sqlx::PgPool;

#[derive(Clone)]
pub struct AppState {
    pub pool: PgPool,
    pub config: Arc<Config>,
    pub sessions: SessionStore,
}

impl AppState {
    #[must_use]
    pub fn new(pool: PgPool, config: Config, sessions: SessionStore) -> Self {
        Self {
            pool,
            config: Arc::new(config),
            sessions,
        }
    }
}
