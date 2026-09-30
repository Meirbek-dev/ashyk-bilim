//! Secret redaction for model output before it is stored or streamed
//! (legacy `SECRET_PATTERNS` in `operations.py`): provider-style API keys
//! and bearer tokens become `[REDACTED_SECRET]`.

use std::sync::LazyLock;

use regex::Regex;

const REPLACEMENT: &str = "[REDACTED_SECRET]";

static PATTERNS: LazyLock<Vec<Regex>> = LazyLock::new(|| {
    [
        r"\bsk-(?:proj-|or-v1-)?[A-Za-z0-9_-]{16,}\b",
        r"(?i)\bBearer\s+[A-Za-z0-9._~+/=-]{16,}\b",
    ]
    .into_iter()
    .filter_map(|p| Regex::new(p).ok())
    .collect()
});

#[must_use]
pub fn redact_text(value: &str) -> String {
    let mut out = value.to_owned();
    for pattern in PATTERNS.iter() {
        if pattern.is_match(&out) {
            out = pattern.replace_all(&out, REPLACEMENT).into_owned();
        }
    }
    out
}

/// Redact every string inside a JSON value, in place.
pub fn redact_json(value: &mut serde_json::Value) {
    match value {
        serde_json::Value::String(s) => {
            let redacted = redact_text(s);
            if redacted != *s {
                *s = redacted;
            }
        }
        serde_json::Value::Array(items) => items.iter_mut().for_each(redact_json),
        serde_json::Value::Object(map) => map.values_mut().for_each(redact_json),
        _ => {}
    }
}

#[must_use]
pub fn redacted(mut value: serde_json::Value) -> serde_json::Value {
    redact_json(&mut value);
    value
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn keys_and_bearer_tokens_are_masked() {
        let text = "use sk-proj-abcdefghijklmnopqrstuvwxyz0123 or Bearer aGVsbG8gd29ybGQhIQ== ok";
        let out = redact_text(text);
        assert!(!out.contains("sk-proj-"));
        assert!(!out.contains("aGVsbG8"));
        assert_eq!(out.matches(REPLACEMENT).count(), 2);
        assert_eq!(redact_text("plain sk-short text"), "plain sk-short text");
    }

    #[test]
    fn json_is_redacted_recursively() {
        let value = serde_json::json!({
            "a": ["sk-or-v1-0123456789abcdef0123456789abcdef", { "b": "fine" }],
            "n": 3
        });
        let out = redacted(value);
        assert_eq!(out["a"][0], REPLACEMENT);
        assert_eq!(out["a"][1]["b"], "fine");
        assert_eq!(out["n"], 3);
    }
}
