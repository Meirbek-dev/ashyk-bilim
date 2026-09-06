//! `ab-etl` — the one-shot legacy → v2 migration behind `ashyq admin etl`.
//!
//! Pipeline shape (docs/rewrite/MIGRATION.md §2): ordered domain runners,
//! each `extract` (plain `sqlx::query` against the legacy `openu` schema —
//! never compile-checked, the legacy DB is not ours) → `transform` (pure
//! functions in [`transform`], unit-tested on hand-written rows) → `load`
//! (compile-checked upserts into the v2 schema keyed by the persistent id
//! map). Every skipped legacy row lands in the drop log with a reason; the
//! [`verify`] engine re-checks counts, references and invariants and turns
//! the outcome into the exit code.
//!
//! The whole load runs inside ONE target transaction: `--dry-run` is a
//! rollback, and a failure leaves the target exactly as it was.

pub mod ctx;
pub mod domains;
pub mod files;
pub mod idmap;
pub mod legacy;
pub mod pipeline;
pub mod report;
pub mod smoke;
pub mod transform;
pub mod verify;
pub mod zitadel;

pub use ctx::Domain;
pub use pipeline::{EtlOptions, run};
pub use report::{DomainReport, Report};
