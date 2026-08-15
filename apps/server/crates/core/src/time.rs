//! Time. `jiff::Timestamp` is the workspace-wide instant type; Postgres columns
//! are `timestamptz`. Code that *decides* based on the current time takes a
//! [`Clock`] so tests never sleep.

pub use jiff::Timestamp;

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
