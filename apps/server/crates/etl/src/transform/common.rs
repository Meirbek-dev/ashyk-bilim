//! Shared helpers: legacy enum spellings → v2 snake_case wire strings, JSON
//! coercions, ordering.

use serde_json::{Map, Value};

/// `AUTO_THEN_MANUAL` → `auto_then_manual`; already-lowercase input passes
/// through. Optional prefix (`TYPE_`, `SUBTYPE_`, `STATUS_`, `BLOCK_`) is
/// stripped first.
#[must_use]
pub fn snake(value: &str, strip_prefix: Option<&str>) -> String {
    let v = strip_prefix
        .and_then(|p| value.strip_prefix(p))
        .unwrap_or(value);
    v.trim().to_ascii_lowercase()
}

/// A JSON object or an empty one (legacy columns held `null`, `{}` and
/// occasionally arrays where objects were expected).
#[must_use]
pub fn object(value: Option<&Value>) -> Map<String, Value> {
    match value {
        Some(Value::Object(m)) => m.clone(),
        _ => Map::new(),
    }
}

/// A JSON array or an empty one.
#[must_use]
pub fn array(value: Option<&Value>) -> Vec<Value> {
    match value {
        Some(Value::Array(a)) => a.clone(),
        _ => Vec::new(),
    }
}

/// Legacy `_bool_setting`: true only when one of the keys is JSON `true`.
#[must_use]
pub fn bool_setting(map: &Map<String, Value>, keys: &[&str]) -> bool {
    keys.iter()
        .any(|k| matches!(map.get(*k), Some(Value::Bool(true))))
}

/// Legacy `_int_setting`: integer-valued numbers only (bools excluded).
#[must_use]
#[allow(clippy::cast_possible_truncation)]
pub fn int_setting(map: &Map<String, Value>, key: &str) -> Option<i64> {
    match map.get(key) {
        Some(Value::Number(n)) => n
            .as_i64()
            .or_else(|| n.as_f64().filter(|f| f.fract() == 0.0).map(|f| f as i64)),
        _ => None,
    }
}

/// Legacy `_float_setting`.
#[must_use]
pub fn float_setting(map: &Map<String, Value>, key: &str) -> Option<f64> {
    match map.get(key) {
        Some(Value::Number(n)) => n.as_f64(),
        _ => None,
    }
}

#[must_use]
pub fn str_setting<'a>(map: &'a Map<String, Value>, key: &str) -> Option<&'a str> {
    map.get(key).and_then(Value::as_str)
}

/// Renumber siblings 1..=n in `(order, id)` order — the legacy wrote
/// client-supplied integers verbatim, duplicates included.
#[must_use]
pub fn renumber<K: Ord + Clone>(mut items: Vec<(K, i32, i32)>) -> Vec<(i32, i32)> {
    // (parent, order, id) → (id, position)
    items.sort_by(|a, b| a.0.cmp(&b.0).then(a.1.cmp(&b.1)).then(a.2.cmp(&b.2)));
    let mut out = Vec::with_capacity(items.len());
    let mut current: Option<K> = None;
    let mut position = 0;
    for (parent, _, id) in items {
        if current.as_ref() != Some(&parent) {
            current = Some(parent);
            position = 0;
        }
        position += 1;
        out.push((id, position));
    }
    out
}

/// Empty string → None.
#[must_use]
pub fn non_empty(value: Option<&str>) -> Option<String> {
    value
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .map(str::to_owned)
}

/// Collapse whitespace runs, trim.
#[must_use]
pub fn tidy(value: &str) -> String {
    value.split_whitespace().collect::<Vec<_>>().join(" ")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn snake_strips_prefix_and_lowercases() {
        assert_eq!(snake("TYPE_VIDEO", Some("TYPE_")), "video");
        assert_eq!(snake("AUTO_THEN_MANUAL", None), "auto_then_manual");
        assert_eq!(snake("published", None), "published");
        assert_eq!(snake("STATUS_IN_PROGRESS", Some("STATUS_")), "in_progress");
        assert_eq!(snake("in_progress", Some("STATUS_")), "in_progress");
    }

    #[test]
    fn settings_helpers_follow_legacy_semantics() {
        let m: Map<String, Value> = serde_json::from_str(
            r#"{"a": true, "b": false, "c": 3, "d": 2.0, "e": 2.5, "f": true, "g": "x"}"#,
        )
        .unwrap();
        assert!(bool_setting(&m, &["missing", "a"]));
        assert!(!bool_setting(&m, &["b", "c"]));
        assert_eq!(int_setting(&m, "c"), Some(3));
        assert_eq!(int_setting(&m, "d"), Some(2));
        assert_eq!(int_setting(&m, "e"), None);
        assert_eq!(int_setting(&m, "f"), None);
        assert_eq!(float_setting(&m, "e"), Some(2.5));
        assert_eq!(str_setting(&m, "g"), Some("x"));
        assert!(object(m.get("g")).is_empty());
        assert!(array(Some(&Value::Null)).is_empty());
    }

    #[test]
    fn renumber_is_contiguous_per_parent_and_stable() {
        // chapter 19 has two activities at order 1 and two at order 3
        let out = renumber(vec![
            (19, 3, 50),
            (19, 1, 41),
            (19, 1, 40),
            (19, 3, 49),
            (20, 7, 60),
        ]);
        assert_eq!(out, vec![(40, 1), (41, 2), (49, 3), (50, 4), (60, 1)]);
    }

    #[test]
    fn tidy_and_non_empty() {
        assert_eq!(tidy("  Иван   Петров "), "Иван Петров");
        assert_eq!(non_empty(Some("  ")), None);
        assert_eq!(non_empty(Some(" x ")), Some("x".into()));
    }
}
