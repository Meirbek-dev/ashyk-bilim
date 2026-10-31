//! The AI-first surfaces over the foundation (docs/AI-FIRST.md).
//!
//! The course concept graph and the mastery views (`concepts`), material search (`search`) and AI
//! pre-grading (`grading`). Each method checks access itself; the handlers stay thin.

pub mod concepts;
pub mod grading;
pub mod search;

pub use concepts::*;
pub use grading::*;
pub use search::*;
