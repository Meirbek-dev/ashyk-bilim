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

/// A calendar date bound as Postgres `date` (no time zone).
///
/// The platform day of an instant is decided in SQL (`platform_date(ts)`,
/// Asia/Almaty, REWRITE 5.7 n2); Rust only carries the result. In `query!`
/// bind it as `day as _` (sqlx has no built-in mapping for `date` without a
/// date crate feature) and read it as `col AS "col: Date"`.
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub struct Date(pub jiff::civil::Date);

impl Date {
    /// Postgres counts `date` in days from 2000-01-01.
    const PG_EPOCH: jiff::civil::Date = jiff::civil::date(2000, 1, 1);

    /// `YYYY-MM-DD`; `None` for anything else.
    #[must_use]
    pub fn parse(text: &str) -> Option<Self> {
        if text.len() != 10 {
            return None;
        }
        text.parse().ok().map(Self)
    }

    /// The next calendar day (saturates at the end of jiff's range).
    #[must_use]
    pub fn tomorrow(self) -> Self {
        Self(self.0.tomorrow().unwrap_or(self.0))
    }
}

impl std::fmt::Display for Date {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        self.0.fmt(f)
    }
}

impl sqlx::Type<sqlx::Postgres> for Date {
    fn type_info() -> sqlx::postgres::PgTypeInfo {
        sqlx::postgres::PgTypeInfo::with_name("date")
    }
}

impl sqlx::Encode<'_, sqlx::Postgres> for Date {
    fn encode_by_ref(
        &self,
        buf: &mut sqlx::postgres::PgArgumentBuffer,
    ) -> Result<sqlx::encode::IsNull, sqlx::error::BoxDynError> {
        let days = self.0.since((jiff::Unit::Day, Self::PG_EPOCH))?.get_days();
        <i32 as sqlx::Encode<sqlx::Postgres>>::encode_by_ref(&days, buf)
    }
}

impl<'r> sqlx::Decode<'r, sqlx::Postgres> for Date {
    fn decode(value: sqlx::postgres::PgValueRef<'r>) -> Result<Self, sqlx::error::BoxDynError> {
        match value.format() {
            sqlx::postgres::PgValueFormat::Binary => {
                let days = <i32 as sqlx::Decode<sqlx::Postgres>>::decode(value)?;
                Ok(Self(
                    Self::PG_EPOCH.checked_add(jiff::Span::new().try_days(days)?)?,
                ))
            }
            sqlx::postgres::PgValueFormat::Text => Ok(Self(value.as_str()?.parse()?)),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::Date;

    #[test]
    fn dates_parse_only_the_iso_form() {
        assert_eq!(
            Date::parse("2026-11-02").map(|d| d.to_string()).as_deref(),
            Some("2026-11-02")
        );
        assert!(Date::parse("2026-11-2").is_none());
        assert!(Date::parse("2026-02-30").is_none());
        assert_eq!(
            Date::parse("2026-12-31")
                .map(|d| d.tomorrow().to_string())
                .as_deref(),
            Some("2027-01-01")
        );
    }
}
