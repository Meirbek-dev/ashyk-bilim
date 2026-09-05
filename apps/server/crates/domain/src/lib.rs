//! `ab-domain` — all business logic, one module per bounded context.
//!
//! Contexts (populated by phases P1–P8, see EXECUTION-PLAN.md):
//! `identity` (this phase) · `org` · `catalog` · `progress` · `assessment` ·
//! `grading` · `files` · `code` · `community` · `certs` · `gamification` ·
//! `analytics` · `ai` · `search` · `work` · `events`
//!
//! Rules (ARCHITECTURE §7):
//! - Every service method takes an [`identity::Actor`] and performs its own
//!   permission checks — enforcement lives here, never only in handlers.
//! - Services own transaction boundaries; handlers never see transactions.
//! - Jobs are enqueued inside the transaction of the fact that caused them.

pub mod assessments;
pub mod catalog;
pub mod files;
pub mod grading;
pub mod identity;
