//! Code context: execution of code items in the go-judge sandbox - learner runs on
//! visible tests / custom input, submit-time final runs, the author's
//! reference check, and the language list.

pub mod compare;
mod runner;
pub mod sandbox;
mod service;

pub use runner::{CaseResult, CodeRun, CodeRunner, FinalRun, FinalTarget, RunSpec};
pub use service::{
    CodeRunsService, LanguageInfo, ReferenceCheck, ReferenceCheckStatus, RunInput, RunListFilter,
};
