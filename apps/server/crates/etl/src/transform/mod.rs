//! Pure transforms: legacy row shapes → v2 column values. No I/O, every
//! function unit-tested on hand-written legacy rows (never real backup rows).
//! The per-domain specs these implement are tabled in
//! docs/rewrite/MIGRATION.md §2.x.

pub mod assessments;
pub mod catalog;
pub mod common;
pub mod files;
pub mod gamification;
pub mod submissions;
pub mod users;
