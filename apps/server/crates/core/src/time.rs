//! Time. `jiff::Timestamp` is the workspace-wide instant type; Postgres columns
//! are `timestamptz`. Code that *decides* based on the current time takes a
//! [`Clock`] so tests never sleep.
//!
//! Calendar days are the platform zone's ([`Day`]).

use std::sync::OnceLock;

pub use jiff::Timestamp;
use jiff::Unit;
use jiff::civil::Date;
use jiff::tz::TimeZone;
use sqlx::encode::IsNull;
use sqlx::error::BoxDynError;
use sqlx::postgres::{PgArgumentBuffer, PgTypeInfo, Postgres};

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

/// The platform zone unless `AB__SERVER__TIME_ZONE` says otherwise.
pub const DEFAULT_TIME_ZONE: &str = "Asia/Almaty";

static ZONE: OnceLock<TimeZone> = OnceLock::new();

/// Fix the platform zone from config at boot; the first call wins.
pub fn init_time_zone(zone: TimeZone) {
    // A second call (tests that build the app twice) keeps the first value.
    let _ = ZONE.set(zone);
}

/// The platform zone ([`DEFAULT_TIME_ZONE`] until [`init_time_zone`]).
pub fn time_zone() -> &'static TimeZone {
    ZONE.get_or_init(|| {
        // The tz database is bundled (jiff `tzdb-bundle-always`); the fixed
        // offset is Kazakhstan's single zone since 2024 should it ever miss.
        TimeZone::get(DEFAULT_TIME_ZONE).unwrap_or_else(|_| TimeZone::fixed(jiff::tz::offset(5)))
    })
}

/// A calendar day of the platform zone (REWRITE 5.7): the XP daily cap,
/// streaks and analytics rollup dates all turn over at its midnight. Binds
/// as Postgres `date` (pass it as `day as _` to `query!`).
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub struct Day(pub Date);

impl Day {
    /// The platform day containing `ts`.
    #[must_use]
    pub fn of(ts: Timestamp) -> Self {
        Self(ts.to_zoned(time_zone().clone()).date())
    }

    /// The platform day containing epoch second `unix` (clamped to the
    /// representable range).
    #[must_use]
    pub fn of_unix(unix: i64) -> Self {
        Self::of(Timestamp::from_second(unix).unwrap_or(if unix < 0 {
            Timestamp::MIN
        } else {
            Timestamp::MAX
        }))
    }

    #[must_use]
    pub fn today() -> Self {
        Self::of(Timestamp::now())
    }

    /// Epoch second of this day's local midnight.
    #[must_use]
    pub fn start(self) -> Option<i64> {
        self.0
            .to_zoned(time_zone().clone())
            .ok()
            .map(|z| z.timestamp().as_second())
    }

    /// The day after.
    #[must_use]
    pub fn next(self) -> Option<Self> {
        self.0.tomorrow().ok().map(Self)
    }

    /// Whole days from `earlier` to `self` (negative if `earlier` is later).
    #[must_use]
    pub fn days_since(self, earlier: Self) -> i64 {
        earlier
            .0
            .until((Unit::Day, self.0))
            .map_or(0, |span| i64::from(span.get_days()))
    }
}

impl std::fmt::Display for Day {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        self.0.fmt(f)
    }
}

impl std::str::FromStr for Day {
    type Err = jiff::Error;

    /// `YYYY-MM-DD`.
    fn from_str(s: &str) -> Result<Self, Self::Err> {
        s.parse().map(Self)
    }
}

impl sqlx::Type<Postgres> for Day {
    fn type_info() -> PgTypeInfo {
        PgTypeInfo::with_name("date")
    }
}

impl sqlx::Encode<'_, Postgres> for Day {
    fn encode_by_ref(&self, buf: &mut PgArgumentBuffer) -> Result<IsNull, BoxDynError> {
        // Postgres `date` is days since 2000-01-01 as i32.
        let days = jiff::civil::date(2000, 1, 1)
            .until((Unit::Day, self.0))?
            .get_days();
        <i32 as sqlx::Encode<Postgres>>::encode_by_ref(&days, buf)
    }
}

#[cfg(test)]
#[allow(clippy::unwrap_used)]
mod tests {
    use super::*;

    #[test]
    fn the_platform_day_turns_over_at_almaty_midnight() {
        // 2026-11-01 18:59:59Z is 23:59:59 in Almaty (UTC+5); a second later it is the 2nd.
        let before: Timestamp = "2026-11-01T18:59:59Z".parse().unwrap();
        assert_eq!(Day::of(before).to_string(), "2026-11-01");
        assert_eq!(
            Day::of_unix(before.as_second() + 1).to_string(),
            "2026-11-02"
        );
        let day: Day = "2026-11-02".parse().unwrap();
        assert_eq!(day.start(), Some(before.as_second() + 1));
        assert_eq!(day.days_since("2026-10-30".parse().unwrap()), 3);
        assert_eq!(
            day.next().map(|d| d.to_string()).as_deref(),
            Some("2026-11-03")
        );
    }
}
