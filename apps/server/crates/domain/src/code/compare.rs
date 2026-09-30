//! Output comparison for code tests, ported from `_compare_output`.
//!
//! Both sides first lose leading/trailing CR/LF; then the item's match mode
//! decides. `CustomChecker` has no implementation in the legacy either and
//! falls back to exact.

use crate::assessments::items::MatchMode;

const NUMERIC_TOLERANCE: f64 = 1e-6;

#[must_use]
pub fn outputs_match(actual: Option<&str>, expected: Option<&str>, mode: MatchMode) -> bool {
    let act = actual.unwrap_or("").trim_matches(['\r', '\n']);
    let exp = expected.unwrap_or("").trim_matches(['\r', '\n']);
    match mode {
        MatchMode::Exact | MatchMode::CustomChecker => act == exp,
        MatchMode::Trimmed => act.trim() == exp.trim(),
        MatchMode::IgnoreWhitespace => {
            act.split_whitespace().collect::<String>() == exp.split_whitespace().collect::<String>()
        }
        MatchMode::NumericTolerance => {
            let a: Vec<&str> = act.split_whitespace().collect();
            let e: Vec<&str> = exp.split_whitespace().collect();
            a.len() == e.len() && a.iter().zip(&e).all(|(a, e)| tokens_match(a, e))
        }
    }
}

/// Numeric tokens compare within tolerance; anything else must be equal.
fn tokens_match(a: &str, e: &str) -> bool {
    match (a.parse::<f64>(), e.parse::<f64>()) {
        (Ok(af), Ok(ef)) => (af - ef).abs() <= NUMERIC_TOLERANCE,
        _ => a == e,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn modes_follow_legacy() {
        assert!(outputs_match(
            Some("hello\n"),
            Some("hello"),
            MatchMode::Exact
        ));
        assert!(outputs_match(
            Some("hello"),
            Some("hello"),
            MatchMode::Exact
        ));
        assert!(!outputs_match(
            Some("hello \n"),
            Some("hello"),
            MatchMode::Exact
        ));
        assert!(outputs_match(
            Some("  hello  \n"),
            Some("hello"),
            MatchMode::Trimmed
        ));
        assert!(outputs_match(
            Some("world"),
            Some("world  "),
            MatchMode::Trimmed
        ));
        assert!(outputs_match(
            Some("h e l l o\n"),
            Some("hello"),
            MatchMode::IgnoreWhitespace
        ));
        assert!(outputs_match(
            Some("3.14159265\n"),
            Some("3.141593"),
            MatchMode::NumericTolerance
        ));
        assert!(outputs_match(
            Some("100.0000001\n"),
            Some("100.0"),
            MatchMode::NumericTolerance
        ));
        assert!(outputs_match(
            Some("abc 123\n"),
            Some("abc 123"),
            MatchMode::NumericTolerance
        ));
        assert!(!outputs_match(
            Some("1 2 3"),
            Some("1 2"),
            MatchMode::NumericTolerance
        ));
        assert!(!outputs_match(
            Some("1.01"),
            Some("1.0"),
            MatchMode::NumericTolerance
        ));
        assert!(outputs_match(None, Some(""), MatchMode::Exact));
        assert!(outputs_match(
            Some("x"),
            Some("x"),
            MatchMode::CustomChecker
        ));
    }
}
