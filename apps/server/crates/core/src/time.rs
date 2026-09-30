//! Time. `jiff::Timestamp` is the workspace-wide instant type; Postgres columns
//! are `timestamptz`. Code that *decides* based on the current time takes a
//! [`Clock`] so tests never sleep.

pub use jiff::Timestamp;

/// Largest unix second a `timestamptz` holds (9999-12-31T23:59:59Z).
///
/// Every epoch-second input is bounded by `0..=EPOCH_MAX` (BUG-206/212/228):
/// past it Postgres raises 22008 and epoch arithmetic overflows.
pub const EPOCH_MAX: i64 = 253_402_300_799;

/// Injectable time source.
pub trait Clock: Send + Sync + std::fmt::Debug {
    fn now(&self) -> Timestamp;
}

#[derive(Debug, Clone, Copy, Default)]
pub struct SystemClock;

impl Clock for SystemClock {
    fn now(&self) -> Timestamp {
        Timestamp::now()
    }
}

/// Test clock frozen at a fixed instant.
#[derive(Debug, Clone, Copy)]
pub struct FixedClock(pub Timestamp);

impl Clock for FixedClock {
    fn now(&self) -> Timestamp {
        self.0
    }
}
