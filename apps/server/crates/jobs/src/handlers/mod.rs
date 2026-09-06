//! Job handlers, one module per domain. Registered in `main.rs` `worker()`;
//! the registry drift test asserts every enqueue-site kind has a handler.

pub mod ai;
pub mod analytics;
pub mod assessments;
pub mod grading;
pub mod submissions;
pub mod uploads;
