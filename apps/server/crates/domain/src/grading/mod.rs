//! Grading context: learner submissions (start / draft / submit), the
//! auto-grading pipeline, penalties, the teacher surface, bulk actions.

pub mod answers;
pub mod breakdown;
pub mod bulk;
pub mod grader;
pub mod penalties;
pub mod submissions;
pub mod teacher;

pub use submissions::SubmissionsService;
pub use teacher::GradingService;
