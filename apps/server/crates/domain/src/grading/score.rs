//! The grade's units (REWRITE 5.8 item 10, review note n16): points, the percentage derived.
//!
//! A grade is points of the attempt's version (each item's `max_score`, the version's `max_points`); its
//! percentage is derived, never stored as the source.
//!
//! One rule, the database's `percent_of_points` / `points_of_percent`: two decimals, half away from zero (numeric
//! rounding), a percentage of nothing to earn is 0. The arithmetic runs on whole hundredths, so the Rust value is
//! the one Postgres stores and derives (a binary `f64` such as `0.125 × 100` would round either way).

/// Hundredths of a value written with at most two decimals (points, percentages); a longer fraction is rounded
/// half away from zero first, as a `numeric(…, 2)` column stores it.
fn cents(x: f64) -> i128 {
    let scaled = x * 100.0;
    let floor = scaled.floor();
    // Within 1e-9 of the half: the decimal it was written as is the half (0.125 × 100 = 12.499999…).
    let rounded = if ((scaled - floor) - 0.5).abs() < 1e-9 {
        if scaled >= 0.0 { floor + 1.0 } else { floor }
    } else {
        scaled.round()
    };
    // Grades are far inside i128; NaN / infinity are refused at the boundaries (`score_points`).
    #[allow(
        clippy::cast_possible_truncation,
        reason = "a grade's hundredths fit an i128"
    )]
    let whole = rounded as i128;
    whole
}

#[allow(
    clippy::cast_precision_loss,
    reason = "a grade's hundredths are exact in an f64"
)]
fn of_cents(c: i128) -> f64 {
    c as f64 / 100.0 + 0.0
}

/// `num / den` rounded half away from zero (`den > 0`).
const fn div_half_away(num: i128, den: i128) -> i128 {
    let q = (num.abs() * 2 + den) / (den * 2);
    if num < 0 { -q } else { q }
}

/// Points rounded to two decimals, half away from zero (what `score_points` stores).
#[must_use]
pub fn round_points(x: f64) -> f64 {
    of_cents(cents(x))
}

/// The percentage `points` are of `max`: two decimals, half away from zero; 0 when `max` is 0.
#[must_use]
pub fn percent_of_points(points: f64, max: f64) -> f64 {
    let (p, m) = (cents(points), cents(max));
    if m <= 0 {
        return 0.0;
    }
    of_cents(div_half_away(p * 10_000, m))
}

/// `pct` percent of `max` points: two decimals, half away from zero.
#[must_use]
pub fn points_of_percent(pct: f64, max: f64) -> f64 {
    of_cents(div_half_away(cents(pct) * cents(max), 10_000))
}

#[cfg(test)]
#[allow(clippy::float_cmp)]
mod tests {
    use super::*;

    #[test]
    fn percent_is_two_decimals_half_away_from_zero() {
        // 1 / 8 = 12.5 %; 1 / 3 = 33.333…; 2 / 3 = 66.666…
        assert_eq!(percent_of_points(1.0, 8.0), 12.5);
        assert_eq!(percent_of_points(1.0, 3.0), 33.33);
        assert_eq!(percent_of_points(2.0, 3.0), 66.67);
        // x.xx5 exactly: 1 / 16 = 6.25 %, 1 / 32 = 3.125 % → 3.13, 1 / 80 = 1.25, 1 / 400 = 0.25,
        // 0.01 / 8 = 0.125 % → 0.13 (half-even would give 3.12 and 0.12).
        assert_eq!(percent_of_points(1.0, 32.0), 3.13);
        assert_eq!(percent_of_points(0.01, 8.0), 0.13);
        assert_eq!(percent_of_points(0.27, 8.0), 3.38);
        assert_eq!(percent_of_points(7.0, 32.0), 21.88);
        // A teacher's 73.5 % of 3 points is 2.21 points, 73.67 % again (REWRITE 5.8 item 8).
        assert_eq!(points_of_percent(73.5, 3.0), 2.21);
        assert_eq!(percent_of_points(2.21, 3.0), 73.67);
        assert_eq!(percent_of_points(3.0, 3.0), 100.0);
        assert_eq!(percent_of_points(0.0, 3.0), 0.0);
        assert_eq!(percent_of_points(5.0, 0.0), 0.0);
    }

    #[test]
    fn points_round_like_numeric() {
        assert_eq!(round_points(0.125), 0.13);
        assert_eq!(round_points(0.335), 0.34);
        assert_eq!(round_points(2.675), 2.68);
        assert_eq!(round_points(1.0 / 3.0), 0.33);
        assert_eq!(round_points(-0.125), -0.13);
        assert!(round_points(-0.0).is_sign_positive());
        assert_eq!(points_of_percent(12.5, 1.0), 0.13);
        assert_eq!(points_of_percent(50.0, 0.01), 0.01);
        assert_eq!(points_of_percent(100.0, 150.0), 150.0);
    }
}
