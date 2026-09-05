//! Grading context: learner submissions (start / draft / submit), the
//! auto-grading pipeline, penalties, the teacher surface, bulk actions.

pub mod answers;
pub mod breakdown;
pub mod grader;
pub mod penalties;
pub mod submissions;

pub use submissions::SubmissionsService;
