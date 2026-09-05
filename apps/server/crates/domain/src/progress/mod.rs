//! Learner progress: the canonical projection, the personal trail and the
//! learner-facing course state (legacy `services/progress`, `services/trail`,
//! `services/learner_course_state`).

pub mod learner_state;
pub mod projector;
pub mod trail;
pub mod work_queue;

pub use learner_state::LearnerStateService;
pub use projector::ProgressProjector;
pub use trail::TrailService;
pub use work_queue::WorkQueueService;
