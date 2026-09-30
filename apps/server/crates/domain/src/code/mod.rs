//! Code context: Judge0-backed execution of code items — learner runs on
//! visible tests / custom input, submit-time final runs, the author's
//! reference check, and the language list.

pub mod compare;
mod runner;
pub mod sandbox;
mod service;
pub mod tune;

pub use runner::{CaseResult, CodeRun, CodeRunner, FinalRun, FinalTarget, RunSpec};
pub use service::{CodeRunsService, LanguageInfo, ReferenceCheck, RunInput};
