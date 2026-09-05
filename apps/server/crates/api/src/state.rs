//! Shared application state, cloned per request (all fields are cheap clones).

use std::sync::Arc;

use ab_clients::storage::StorageClient;
use ab_core::config::Config;
use ab_domain::assessments::AssessmentsService;
use ab_domain::catalog::{
    CollectionsService, CoursesService, CurriculumService, PlatformService, SearchService,
};
use ab_domain::files::UploadsService;
use ab_domain::grading::SubmissionsService;
use ab_domain::identity::rate_limit::RateLimiter;
use ab_domain::identity::{
    GoogleAuthService, IdentityService, RbacAdminService, SessionStore, UsergroupsService,
    UsersService,
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
    pub courses: CoursesService,
    pub curriculum: CurriculumService,
    pub collections: CollectionsService,
    pub platform: PlatformService,
    pub search: SearchService,
    pub usergroups: UsergroupsService,
    pub assessments: AssessmentsService,
    pub submissions: SubmissionsService,
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
        let courses = CoursesService::new(pool.clone());
        let assessments = AssessmentsService::new(pool.clone(), courses.clone());
        Self {
            submissions: SubmissionsService::new(
                pool.clone(),
                assessments.clone(),
                RateLimiter::new(sessions.redis()),
            ),
            users: UsersService::new(pool.clone()),
            rbac: RbacAdminService::new(pool.clone(), sessions.clone()),
            uploads: UploadsService::new(pool.clone(), Arc::clone(&storage)),
            curriculum: CurriculumService::new(pool.clone(), courses.clone()),
            collections: CollectionsService::new(pool.clone(), courses.clone()),
            platform: PlatformService::new(pool.clone()),
            search: SearchService::new(pool.clone()),
            usergroups: UsergroupsService::new(pool.clone()),
            assessments,
            courses,
            pool,
            config: Arc::new(config),
            sessions,
            identity,
            google,
            storage,
        }
    }
}
