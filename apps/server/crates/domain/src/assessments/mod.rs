//! Assessment context: authoring (assessment + items + policy), lifecycle,
//! readiness, access lists, per-student overrides. Submissions and grading
//! live in `grading` (P4).

pub mod access;
pub mod items;
pub mod service;

pub use service::AssessmentsService;
