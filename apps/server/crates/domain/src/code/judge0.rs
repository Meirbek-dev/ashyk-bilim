//! Judge0's language ids on the way in (REWRITE 5.8 item 10, switch release).
//!
//! The database keeps the ids until the contract rewrites them
//! (`20261116075661_code_language_names` turns the slugs this release writes
//! back into ids, so the release before it reads its rows), and a tab of the
//! old web still sends them. Each id reads as its slug; an id the runner image
//! lacks reads as its decimal string (no language: never runnable), `0` (the
//! empty answer's) as `""`. The contract release deletes this module.

use std::collections::BTreeMap;

use serde::{Deserialize, Deserializer};

#[derive(Deserialize)]
#[serde(untagged)]
enum IdOrSlug {
    Id(i64),
    Slug(String),
}

fn slug_of(id: i64) -> String {
    if id == 0 {
        return String::new();
    }
    i32::try_from(id)
        .ok()
        .and_then(ab_clients::gojudge::languages::from_judge0)
        .map_or_else(|| id.to_string(), |l| l.slug.to_owned())
}

/// A map key: a Judge0 id spelled as a string (`"71"`) is its slug.
fn key_of(key: String) -> String {
    match key.parse::<i64>() {
        Ok(id) if id.to_string() == key => slug_of(id),
        _ => key,
    }
}

impl IdOrSlug {
    fn into_slug(self) -> String {
        match self {
            Self::Id(id) => slug_of(id),
            Self::Slug(slug) => slug,
        }
    }
}

/// One language: a slug, or a Judge0 id.
pub fn language<'de, D: Deserializer<'de>>(deserializer: D) -> Result<String, D::Error> {
    IdOrSlug::deserialize(deserializer).map(IdOrSlug::into_slug)
}

/// A list of languages: slugs, or Judge0 ids; an id the runner image lacks is left out.
pub fn languages<'de, D: Deserializer<'de>>(deserializer: D) -> Result<Vec<String>, D::Error> {
    Ok(Vec::<IdOrSlug>::deserialize(deserializer)?
        .into_iter()
        .map(IdOrSlug::into_slug)
        .filter(|slug| slug.parse::<u64>().is_err())
        .collect())
}

/// A map keyed by language: slugs, or Judge0 ids as strings.
pub fn keyed<'de, D: Deserializer<'de>>(
    deserializer: D,
) -> Result<BTreeMap<String, String>, D::Error> {
    Ok(BTreeMap::<String, String>::deserialize(deserializer)?
        .into_iter()
        .map(|(key, value)| (key_of(key), value))
        .collect())
}

/// A stored answer or breakdown answer as a JSON value: a code answer's
/// numeric `language` becomes its slug.
pub fn answer_value(answer: &mut serde_json::Value) {
    if let Some(fields) = answer.as_object_mut()
        && let Some(id) = fields.get("language").and_then(serde_json::Value::as_i64)
    {
        fields.insert("language".to_owned(), slug_of(id).into());
    }
}

#[cfg(test)]
#[allow(clippy::unwrap_used)]
mod tests {
    use super::*;

    #[derive(Deserialize)]
    struct Body {
        #[serde(deserialize_with = "language")]
        one: String,
        #[serde(deserialize_with = "languages")]
        many: Vec<String>,
        #[serde(deserialize_with = "keyed")]
        by: BTreeMap<String, String>,
    }

    #[test]
    fn judge0_ids_read_as_slugs() {
        let body: Body = serde_json::from_value(serde_json::json!({
            "one": 71, "many": [62, "cpp", 83, 0], "by": { "71": "print()", "java": "class", "083": "x" }
        }))
        .unwrap();
        assert_eq!(body.one, "python");
        assert_eq!(body.many, ["java", "cpp", ""]);
        assert_eq!(
            body.by.into_iter().collect::<Vec<_>>(),
            [
                ("083".to_owned(), "x".to_owned()),
                ("java".to_owned(), "class".to_owned()),
                ("python".to_owned(), "print()".to_owned()),
            ]
        );
        let mut answer = serde_json::json!({ "kind": "code", "language": 54, "source": "" });
        answer_value(&mut answer);
        assert_eq!(answer["language"], "cpp");
    }
}
