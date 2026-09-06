//! Dashboard query filters (legacy `services/analytics/filters.py`).
//!
//! Parsed from raw query strings by [`AnalyticsFilters::parse`] so that
//! every malformed value is a 422 with a field error rather than an axum
//! 400. Window math is in epoch seconds; calendar bucketing goes through
//! jiff in the requested IANA zone.

use ab_core::id::{CourseId, UserId, UsergroupId};
use ab_core::{Error, FieldError, Result};
use jiff::tz::TimeZone;
use jiff::{Timestamp, ToSpan, Zoned};
use serde::{Deserialize, Serialize};
use utoipa::ToSchema;

pub const DAY_SECS: i64 = 86_400;
pub const MAX_PAGE_SIZE: usize = 200;
pub const DEFAULT_PAGE_SIZE: usize = 25;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, ToSchema)]
pub enum Window {
    #[serde(rename = "7d")]
    D7,
    #[serde(rename = "28d")]
    D28,
    #[serde(rename = "90d")]
    D90,
}

impl Window {
    #[must_use]
    pub const fn days(self) -> i64 {
        match self {
            Self::D7 => 7,
            Self::D28 => 28,
            Self::D90 => 90,
        }
    }

    #[must_use]
    pub const fn as_str(self) -> &'static str {
        match self {
            Self::D7 => "7d",
            Self::D28 => "28d",
            Self::D90 => "90d",
        }
    }

    fn parse(s: &str) -> Option<Self> {
        match s {
            "7d" => Some(Self::D7),
            "28d" => Some(Self::D28),
            "90d" => Some(Self::D90),
            _ => None,
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "snake_case")]
pub enum Compare {
    PreviousPeriod,
    None,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "snake_case")]
pub enum Bucket {
    Day,
    Week,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "snake_case")]
pub enum SortOrder {
    Asc,
    Desc,
}

/// Raw query-string values before validation (every field optional).
#[derive(Debug, Clone, Default)]
pub struct RawFilters {
    pub window: Option<String>,
    pub compare: Option<String>,
    pub bucket: Option<String>,
    /// RFC 3339 timestamp or epoch seconds.
    pub bucket_start: Option<String>,
    /// Comma-separated uuids.
    pub course_ids: Option<String>,
    /// Comma-separated uuids.
    pub cohort_ids: Option<String>,
    pub teacher_user_id: Option<String>,
    pub timezone: Option<String>,
    pub page: Option<i64>,
    pub page_size: Option<i64>,
    pub sort_by: Option<String>,
    pub sort_order: Option<String>,
}

#[derive(Debug, Clone)]
pub struct AnalyticsFilters {
    pub window: Window,
    pub compare: Compare,
    pub bucket: Bucket,
    pub bucket_start: Option<i64>,
    pub course_ids: Vec<CourseId>,
    pub cohort_ids: Vec<UsergroupId>,
    pub teacher_user_id: Option<UserId>,
    pub timezone: TimeZone,
    pub timezone_name: String,
    pub page: usize,
    pub page_size: usize,
    pub sort_by: Option<String>,
    pub sort_order: SortOrder,
}

impl Default for AnalyticsFilters {
    fn default() -> Self {
        Self {
            window: Window::D28,
            compare: Compare::PreviousPeriod,
            bucket: Bucket::Day,
            bucket_start: None,
            course_ids: Vec::new(),
            cohort_ids: Vec::new(),
            teacher_user_id: None,
            timezone: TimeZone::UTC,
            timezone_name: "UTC".to_owned(),
            page: 1,
            page_size: DEFAULT_PAGE_SIZE,
            sort_by: None,
            sort_order: SortOrder::Desc,
        }
    }
}

fn invalid(field: &str, message: impl Into<String>) -> FieldError {
    FieldError {
        field: field.to_owned(),
        code: "invalid".to_owned(),
        message: message.into(),
    }
}

fn parse_id_list<T: std::str::FromStr>(
    field: &str,
    raw: Option<&str>,
    errors: &mut Vec<FieldError>,
) -> Vec<T> {
    let mut out = Vec::new();
    for chunk in raw.unwrap_or_default().split(',') {
        let chunk = chunk.trim();
        if chunk.is_empty() {
            continue;
        }
        match chunk.parse::<T>() {
            Ok(id) => out.push(id),
            Err(_) => errors.push(invalid(field, format!("not a uuid: {chunk}"))),
        }
    }
    out
}

/// RFC 3339 (`2026-09-06T00:00:00Z`) or epoch seconds.
fn parse_timestamp(raw: &str) -> Option<i64> {
    if let Ok(secs) = raw.parse::<i64>() {
        return Some(secs);
    }
    raw.parse::<Timestamp>().ok().map(Timestamp::as_second)
}

impl AnalyticsFilters {
    /// Validate every raw value; all problems are reported together.
    pub fn parse(raw: &RawFilters) -> Result<Self> {
        let mut errors = Vec::new();
        let mut filters = Self::default();

        if let Some(w) = raw.window.as_deref() {
            match Window::parse(w) {
                Some(window) => filters.window = window,
                None => errors.push(invalid("window", "expected one of 7d, 28d, 90d")),
            }
        }
        if let Some(c) = raw.compare.as_deref() {
            match c {
                "previous_period" => filters.compare = Compare::PreviousPeriod,
                "none" => filters.compare = Compare::None,
                _ => errors.push(invalid("compare", "expected previous_period or none")),
            }
        }
        if let Some(b) = raw.bucket.as_deref() {
            match b {
                "day" => filters.bucket = Bucket::Day,
                "week" => filters.bucket = Bucket::Week,
                _ => errors.push(invalid("bucket", "expected day or week")),
            }
        }
        if let Some(bs) = raw.bucket_start.as_deref().filter(|s| !s.is_empty()) {
            match parse_timestamp(bs) {
                Some(ts) => filters.bucket_start = Some(ts),
                None => errors.push(invalid(
                    "bucket_start",
                    "expected an RFC 3339 timestamp or epoch seconds",
                )),
            }
        }
        filters.course_ids = parse_id_list("course_ids", raw.course_ids.as_deref(), &mut errors);
        filters.cohort_ids = parse_id_list("cohort_ids", raw.cohort_ids.as_deref(), &mut errors);
        if let Some(t) = raw.teacher_user_id.as_deref().filter(|s| !s.is_empty()) {
            match t.parse::<UserId>() {
                Ok(id) => filters.teacher_user_id = Some(id),
                Err(_) => errors.push(invalid("teacher_user_id", "not a uuid")),
            }
        }
        if let Some(tz) = raw.timezone.as_deref().filter(|s| !s.is_empty()) {
            match TimeZone::get(tz) {
                Ok(zone) => {
                    filters.timezone = zone;
                    tz.clone_into(&mut filters.timezone_name);
                }
                Err(_) => errors.push(invalid("timezone", format!("unknown time zone: {tz}"))),
            }
        }
        // Legacy clamps rather than rejects.
        filters.page = usize::try_from(raw.page.unwrap_or(1).max(1)).unwrap_or(1);
        let default_size = i64::try_from(DEFAULT_PAGE_SIZE).unwrap_or(25);
        let max_size = i64::try_from(MAX_PAGE_SIZE).unwrap_or(200);
        filters.page_size =
            usize::try_from(raw.page_size.unwrap_or(default_size).clamp(1, max_size))
                .unwrap_or(DEFAULT_PAGE_SIZE);
        filters.sort_by = raw.sort_by.clone().filter(|s| !s.is_empty());
        if let Some(o) = raw.sort_order.as_deref() {
            match o {
                "asc" => filters.sort_order = SortOrder::Asc,
                "desc" => filters.sort_order = SortOrder::Desc,
                _ => errors.push(invalid("sort_order", "expected asc or desc")),
            }
        }

        if errors.is_empty() {
            Ok(filters)
        } else {
            Err(Error::validation(errors))
        }
    }

    #[must_use]
    pub const fn window_days(&self) -> i64 {
        self.window.days()
    }

    #[must_use]
    pub const fn window_secs(&self) -> i64 {
        self.window.days() * DAY_SECS
    }

    /// `[now - window, now]`.
    #[must_use]
    pub const fn window_bounds(&self, now: i64) -> (i64, i64) {
        (now - self.window_secs(), now)
    }

    /// The window immediately before the current one.
    #[must_use]
    pub const fn previous_window_bounds(&self, now: i64) -> (i64, i64) {
        let current_start = now - self.window_secs();
        (current_start - self.window_secs(), current_start)
    }

    #[must_use]
    pub const fn offset(&self) -> usize {
        (self.page - 1) * self.page_size
    }

    /// Legacy `supports_rollup_reads`: only the default comparison over a
    /// preset window without cohort or bucket narrowing can be answered from
    /// the daily tables.
    #[must_use]
    pub fn supports_rollup_reads(&self) -> bool {
        self.cohort_ids.is_empty()
            && self.bucket_start.is_none()
            && self.compare == Compare::PreviousPeriod
    }

    #[must_use]
    pub fn supports_teacher_rollup_reads(&self) -> bool {
        self.supports_rollup_reads() && self.course_ids.is_empty()
    }

    fn zoned(&self, ts: i64) -> Option<Zoned> {
        Timestamp::from_second(ts)
            .ok()
            .map(|t| t.to_zoned(self.timezone.clone()))
    }

    /// Local midnight of the day (or of the Monday of the week) containing
    /// `ts`, as epoch seconds. Falls back to UTC arithmetic on overflow.
    #[must_use]
    pub fn bucket_start_of(&self, ts: i64) -> i64 {
        let fallback = || match self.bucket {
            Bucket::Day => ts.div_euclid(DAY_SECS) * DAY_SECS,
            // 1970-01-01 was a Thursday; shift so weeks start on Monday.
            Bucket::Week => {
                (ts + 3 * DAY_SECS).div_euclid(7 * DAY_SECS) * 7 * DAY_SECS - 3 * DAY_SECS
            }
        };
        let Some(zoned) = self.zoned(ts) else {
            return fallback();
        };
        let start = match self.bucket {
            Bucket::Day => zoned.start_of_day(),
            Bucket::Week => {
                let offset = i64::from(zoned.weekday().to_monday_zero_offset());
                zoned
                    .start_of_day()
                    .and_then(|d| d.checked_sub(offset.days()))
                    .and_then(|d| d.start_of_day())
            }
        };
        start.map_or_else(|_| fallback(), |z| z.timestamp().as_second())
    }

    /// The start of the bucket after the one starting at `bucket_start`
    /// (calendar arithmetic, so DST days are 23/25 hours long).
    #[must_use]
    pub fn next_bucket(&self, bucket_start: i64) -> i64 {
        let span_days: i64 = match self.bucket {
            Bucket::Day => 1,
            Bucket::Week => 7,
        };
        self.zoned(bucket_start)
            .and_then(|z| z.checked_add(span_days.days()).ok())
            .and_then(|z| z.start_of_day().ok())
            .map_or(bucket_start + span_days * DAY_SECS, |z| {
                z.timestamp().as_second()
            })
    }

    /// `[start, end)` of the bucket selected with `bucket_start`, if any.
    #[must_use]
    pub fn selected_bucket_window(&self) -> Option<(i64, i64)> {
        let selected = self.bucket_start?;
        let start = self.bucket_start_of(selected);
        Some((start, self.next_bucket(start)))
    }
}

#[cfg(test)]
#[allow(clippy::unwrap_used, clippy::panic)]
mod tests {
    use super::*;

    #[test]
    fn defaults_and_clamps() {
        let f = AnalyticsFilters::parse(&RawFilters {
            page: Some(0),
            page_size: Some(9_999),
            ..RawFilters::default()
        })
        .unwrap();
        assert_eq!(f.window, Window::D28);
        assert_eq!(f.page, 1);
        assert_eq!(f.page_size, MAX_PAGE_SIZE);
        assert!(f.supports_teacher_rollup_reads());
    }

    #[test]
    fn every_bad_value_is_reported() {
        let err = AnalyticsFilters::parse(&RawFilters {
            window: Some("3d".into()),
            course_ids: Some("nope".into()),
            timezone: Some("Mars/Olympus".into()),
            ..RawFilters::default()
        })
        .unwrap_err();
        let ab_core::Error::Validation { field_errors } = err else {
            panic!("expected validation error");
        };
        let fields: Vec<_> = field_errors.iter().map(|e| e.field.as_str()).collect();
        assert_eq!(fields, ["window", "course_ids", "timezone"]);
    }

    #[test]
    fn week_buckets_start_on_monday_in_the_zone() {
        let f = AnalyticsFilters::parse(&RawFilters {
            bucket: Some("week".into()),
            timezone: Some("Asia/Almaty".into()),
            ..RawFilters::default()
        })
        .unwrap();
        // 2026-09-06 is a Sunday; Almaty is UTC+5.
        let sunday_noon: i64 = "2026-09-06T12:00:00+05:00"
            .parse::<Timestamp>()
            .unwrap()
            .as_second();
        let monday: i64 = "2026-08-31T00:00:00+05:00"
            .parse::<Timestamp>()
            .unwrap()
            .as_second();
        assert_eq!(f.bucket_start_of(sunday_noon), monday);
        assert_eq!(f.next_bucket(monday), monday + 7 * DAY_SECS);
        assert_eq!(f.selected_bucket_window(), None);
    }

    #[test]
    fn window_bounds_are_contiguous() {
        let f = AnalyticsFilters::default();
        let now = 1_000_000_000;
        let (start, end) = f.window_bounds(now);
        let (prev_start, prev_end) = f.previous_window_bounds(now);
        assert_eq!(end - start, 28 * DAY_SECS);
        assert_eq!(prev_end, start);
        assert_eq!(prev_end - prev_start, 28 * DAY_SECS);
    }
}
