//! Shared application state, cloned per request (all fields are cheap clones).

use std::sync::Arc;

use ab_clients::judge0::Judge0Client;
use ab_clients::storage::StorageClient;
use ab_core::config::Config;
use ab_domain::assessments::AssessmentsService;
use ab_domain::catalog::{
    CollectionsService, CoursesService, CurriculumService, PlatformService, SearchService,
};
use ab_domain::certifications::CertificationsService;
use ab_domain::code::{CodeRunner, CodeRunsService};
use ab_domain::community::DiscussionsService;
use ab_domain::events::GradingEvents;
use ab_domain::files::{FileSubmissionsService, UploadsService};
use ab_domain::gamification::GamificationService;
use ab_domain::grading::{GradingService, SubmissionsService};
use ab_domain::identity::rate_limit::RateLimiter;
use ab_domain::identity::{
    GoogleAuthService, IdentityService, RbacAdminService, SessionStore, UsergroupsService,
    UsersService,
};
use ab_domain::progress::{LearnerStateService, ProgressProjector, TrailService, WorkQueueService};
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
    pub code_runs: CodeRunsService,
    pub grading: GradingService,
    pub events: GradingEvents,
    pub file_submissions: FileSubmissionsService,
    pub trail: TrailService,
    pub learner_state: LearnerStateService,
    pub progress: ProgressProjector,
    pub discussions: DiscussionsService,
    pub certifications: CertificationsService,
    pub gamification: GamificationService,
    pub work_queue: WorkQueueService,
}

impl AppState {
    /// `judge0` is `None` when code execution is not configured: runs
    /// answer 503 and code challenges fall back to manual review.
    #[must_use]
    pub fn new(
        pool: PgPool,
        config: Config,
        identity: IdentityService,
        google: Option<GoogleAuthService>,
        storage: Arc<StorageClient>,
        judge0: Option<Arc<Judge0Client>>,
    ) -> Self {
        let sessions = identity.sessions().clone();
        let courses = CoursesService::new(pool.clone());
        let assessments = AssessmentsService::new(pool.clone(), courses.clone());
        let limits = config
            .judge0
            .as_ref()
            .map(|j| j.limits.clone())
            .unwrap_or_default();
        let runner = CodeRunner::new(pool.clone(), judge0, limits);
        let events = GradingEvents::new(sessions.client(), sessions.redis());
        Self {
            submissions: SubmissionsService::new(
                pool.clone(),
                assessments.clone(),
                RateLimiter::new(sessions.redis()),
                runner.clone(),
            ),
            file_submissions: FileSubmissionsService::new(
                pool.clone(),
                assessments.clone(),
                Arc::clone(&storage),
            ),
            trail: TrailService::new(pool.clone(), courses.clone(), assessments.clone()),
            learner_state: LearnerStateService::new(
                pool.clone(),
                courses.clone(),
                assessments.clone(),
            ),
            progress: ProgressProjector::new(pool.clone()),
            discussions: DiscussionsService::new(pool.clone(), courses.clone()),
            gamification: GamificationService::new(pool.clone()),
            work_queue: WorkQueueService::new(pool.clone()),
            certifications: CertificationsService::new(
                pool.clone(),
                courses.clone(),
                assessments.clone(),
            ),
            grading: GradingService::new(pool.clone(), assessments.clone(), Some(events.clone())),
            events,
            code_runs: CodeRunsService::new(
                runner,
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
