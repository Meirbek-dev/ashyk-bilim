//! Export-time pass over the OpenAPI document (S-01, DECISIONS 2026-10-03):
//! the rules that make it generator-friendly and that utoipa cannot express
//! per type. It only rewrites the description - never the wire.
//!
//! - every `*_unix` property / parameter is the named `UnixTime` schema, and
//!   no integer carries `format: int64` (generators turn it into `bigint`);
//! - CSV / PDF downloads are `format: binary`;
//! - a response field is never optional+nullable: a nullable field is always
//!   serialized, so it is `required`. Fields serde omits are declared
//!   `#[schema(nullable = false)]` in Rust (absent by design);
//! - a request field is optional+nullable only where `null` means "clear"
//!   ([`NULL_CLEARS`], marked `x-null-clears: true`); everywhere else `null`
//!   is the same as absent, so the field is optional and non-nullable.

use std::collections::BTreeSet;

use serde_json::{Map, Value, json};

const UNIX_TIME: &str = "#/components/schemas/UnixTime";

/// Request properties whose explicit `null` clears the value (three-state
/// patch fields deserialized with `dto::double_option`), as (schema, property).
const NULL_CLEARS: &[(&str, &str)] = &[
    ("UpdateCourseRequest", "thumbnail_upload_id"),
    ("ConfigPatch", "max_file_size_mb"),
    ("ConfigPatch", "due_at_unix"),
    ("ConfigPatch", "max_attempts"),
    ("PreferencesPatch", "privacy"),
    ("PreferencesPatch", "notifications"),
    ("PreferencesPatch", "display"),
    ("GradeRequest", "final_score"),
    ("UpdatePlatformRequest", "label"),
    ("UpdateProfileRequest", "avatar_upload_id"),
    ("UpdateProfileRequest", "theme"),
];

/// The finished document: what `ashyq openapi` exports and the API serves.
pub fn finalize(doc: &utoipa::openapi::OpenApi) -> Value {
    // An `OpenApi` has string keys only: serializing it cannot fail.
    let mut doc = serde_json::to_value(doc).unwrap_or_default();
    integers(&mut doc);
    binary_downloads(&mut doc);
    nullability(&mut doc);
    if let Some(schemas) = doc
        .pointer_mut("/components/schemas")
        .and_then(Value::as_object_mut)
    {
        schemas.insert(
            "UnixTime".into(),
            json!({
                "type": "integer",
                "description": "Unix time: whole seconds since 1970-01-01T00:00:00Z."
            }),
        );
    }
    doc
}

/// `*_unix` → `UnixTime`; then drop `format: int64` everywhere. Every
/// integer on the wire is within ±2^53 (DECISIONS 2026-10-03).
fn integers(node: &mut Value) {
    match node {
        Value::Object(map) => {
            if let Some(Value::Object(props)) = map.get_mut("properties") {
                for (name, prop) in props.iter_mut() {
                    if name.ends_with("_unix") {
                        unix_time(prop);
                    }
                }
            }
            if map.get("in").is_some()
                && map
                    .get("name")
                    .and_then(Value::as_str)
                    .is_some_and(|n| n.ends_with("_unix"))
                && let Some(schema) = map.get_mut("schema")
            {
                unix_time(schema);
            }
            if map.get("format").and_then(Value::as_str) == Some("int64") {
                map.remove("format");
            }
            map.values_mut().for_each(integers);
        }
        Value::Array(items) => items.iter_mut().for_each(integers),
        _ => {}
    }
}

fn unix_time(schema: &mut Value) {
    let Value::Object(map) = schema else { return };
    let nullable = match map.get("type") {
        Some(Value::String(t)) if t == "integer" => false,
        Some(Value::Array(types))
            if types.len() == 2
                && types.contains(&json!("integer"))
                && types.contains(&json!("null")) =>
        {
            true
        }
        _ => return,
    };
    map.remove("type");
    map.remove("format");
    if nullable {
        map.insert(
            "oneOf".into(),
            json!([{ "$ref": UNIX_TIME }, { "type": "null" }]),
        );
    } else {
        map.insert("$ref".into(), json!(UNIX_TIME));
    }
}

fn binary_downloads(doc: &mut Value) {
    let Some(paths) = doc.get_mut("paths").and_then(Value::as_object_mut) else {
        return;
    };
    for operation in paths.values_mut().filter_map(Value::as_object_mut) {
        for op in operation.values_mut() {
            let Some(responses) = op.get_mut("responses").and_then(Value::as_object_mut) else {
                continue;
            };
            for content in responses
                .values_mut()
                .filter_map(|r| r.get_mut("content").and_then(Value::as_object_mut))
            {
                for (media, body) in content.iter_mut() {
                    if !media.contains("json") && media != "text/event-stream" {
                        body["schema"] = json!({ "type": "string", "format": "binary" });
                    }
                }
            }
        }
    }
}

#[derive(Clone, Copy)]
enum Side {
    Request,
    Response,
}

fn nullability(doc: &mut Value) {
    let schemas = doc
        .pointer("/components/schemas")
        .cloned()
        .unwrap_or_default();
    let (mut requests, mut responses) = (BTreeSet::new(), BTreeSet::new());
    if let Some(paths) = doc.get("paths").and_then(Value::as_object) {
        for op in paths
            .values()
            .filter_map(Value::as_object)
            .flat_map(Map::values)
        {
            if let Some(body) = op.get("requestBody") {
                collect_refs(body, &schemas, &mut requests);
            }
            if let Some(res) = op.get("responses") {
                collect_refs(res, &schemas, &mut responses);
            }
        }
    }
    if let Some(paths) = doc.get_mut("paths").and_then(Value::as_object_mut) {
        for op in paths
            .values_mut()
            .filter_map(Value::as_object_mut)
            .flat_map(|ops| ops.values_mut())
        {
            if let Some(body) = op.get_mut("requestBody") {
                fix(body, Side::Request, "");
            }
            if let Some(res) = op.get_mut("responses") {
                fix(res, Side::Response, "");
            }
        }
    }
    if let Some(schemas) = doc
        .pointer_mut("/components/schemas")
        .and_then(Value::as_object_mut)
    {
        for (name, schema) in schemas.iter_mut() {
            // Shared shapes are described as responses see them: a request
            // may still omit a nullable field (serde defaults it).
            let side = if requests.contains(name) && !responses.contains(name) {
                Side::Request
            } else {
                Side::Response
            };
            fix(schema, side, name);
        }
    }
}

fn collect_refs(node: &Value, schemas: &Value, seen: &mut BTreeSet<String>) {
    match node {
        Value::Object(map) => {
            if let Some(name) = map
                .get("$ref")
                .and_then(Value::as_str)
                .and_then(|r| r.strip_prefix("#/components/schemas/"))
                && seen.insert(name.to_owned())
                && let Some(target) = schemas.get(name)
            {
                collect_refs(target, schemas, seen);
            }
            map.values().for_each(|v| collect_refs(v, schemas, seen));
        }
        Value::Array(items) => items.iter().for_each(|v| collect_refs(v, schemas, seen)),
        _ => {}
    }
}

fn fix(node: &mut Value, side: Side, schema: &str) {
    match node {
        Value::Object(map) => {
            if map.get("properties").is_some_and(Value::is_object) {
                let required: Vec<Value> = map
                    .get("required")
                    .and_then(Value::as_array)
                    .cloned()
                    .unwrap_or_default();
                let mut newly_required = Vec::new();
                if let Some(Value::Object(props)) = map.get_mut("properties") {
                    for (name, prop) in props.iter_mut() {
                        if required.contains(&json!(name)) || !is_nullable(prop) {
                            continue;
                        }
                        match side {
                            Side::Response => newly_required.push(json!(name)),
                            Side::Request if NULL_CLEARS.contains(&(schema, name.as_str())) => {
                                prop["x-null-clears"] = json!(true);
                            }
                            Side::Request => strip_null(prop),
                        }
                    }
                }
                if !newly_required.is_empty() {
                    let mut all = required;
                    all.extend(newly_required);
                    map.insert("required".into(), Value::Array(all));
                }
            }
            map.values_mut().for_each(|v| fix(v, side, schema));
        }
        Value::Array(items) => items.iter_mut().for_each(|v| fix(v, side, schema)),
        _ => {}
    }
}

fn is_nullable(schema: &Value) -> bool {
    match schema.get("type") {
        Some(Value::String(t)) if t == "null" => return true,
        Some(Value::Array(types)) if types.contains(&json!("null")) => return true,
        _ => {}
    }
    ["oneOf", "anyOf"].iter().any(|key| {
        schema
            .get(key)
            .and_then(Value::as_array)
            .is_some_and(|variants| variants.iter().any(is_nullable))
    })
}

fn strip_null(schema: &mut Value) {
    let Value::Object(map) = schema else { return };
    if let Some(Value::Array(types)) = map.get_mut("type") {
        types.retain(|t| t != "null");
        if types.len() == 1 {
            let only = types.remove(0);
            map.insert("type".into(), only);
        }
        return;
    }
    for key in ["oneOf", "anyOf"] {
        let Some(Value::Array(variants)) = map.get_mut(key) else {
            continue;
        };
        variants.retain(|v| !is_nullable(v));
        if variants.len() == 1 {
            let only = variants.remove(0);
            map.remove(key);
            if let Value::Object(inner) = only {
                for (k, v) in inner {
                    map.entry(k).or_insert(v);
                }
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Every three-state field the pass knows about exists and stays
    /// optional+nullable - a rename would silently make it non-clearable.
    #[test]
    fn null_clears_fields_exist() {
        let doc = crate::openapi_doc();
        for (schema, prop) in NULL_CLEARS {
            let node = &doc["components"]["schemas"][schema];
            let field = &node["properties"][prop];
            assert_eq!(field["x-null-clears"], json!(true), "{schema}.{prop}");
            assert!(is_nullable(field), "{schema}.{prop}");
        }
    }
}
