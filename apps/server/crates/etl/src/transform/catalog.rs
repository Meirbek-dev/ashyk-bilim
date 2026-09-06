//! Catalog transforms (MIGRATION §2.2): platform, courses, chapters,
//! activities, blocks, collections, updates, certifications, authorship,
//! usergroups, discussions.

use serde_json::{Map, Value};
use uuid::Uuid;

use crate::transform::common::{snake, str_setting};

/// Port of `Course.validate_learnings` (apps/api/src/db/courses/courses.py):
/// the column held a JSON list, a JSON string, a bare string or NULL; every
/// entry becomes `{id, text, emoji[, link]}`.
#[must_use]
pub fn learnings(raw: Option<&str>) -> Vec<Value> {
    let Some(raw) = raw.map(str::trim).filter(|s| !s.is_empty()) else {
        return Vec::new();
    };
    let parsed = serde_json::from_str::<Value>(raw).unwrap_or_else(|_| Value::String(raw.to_owned()));
    let items = match parsed {
        Value::Array(a) => a,
        other => vec![other],
    };
    let mut out = Vec::new();
    for item in items {
        match item {
            Value::String(s) => {
                let text = s.trim();
                if text.is_empty() {
                    continue;
                }
                out.push(serde_json::json!({
                    "id": Uuid::new_v4().simple().to_string(),
                    "text": text,
                    "emoji": "📝",
                }));
            }
            Value::Object(m) => {
                let text = m
                    .get("text")
                    .map(|t| match t {
                        Value::String(s) => s.clone(),
                        other => other.to_string(),
                    })
                    .unwrap_or_default();
                let text = text.trim().to_owned();
                if text.is_empty() {
                    continue;
                }
                let id = m
                    .get("id")
                    .and_then(|v| match v {
                        Value::String(s) if !s.is_empty() => Some(s.clone()),
                        Value::Number(n) => Some(n.to_string()),
                        _ => None,
                    })
                    .unwrap_or_else(|| Uuid::new_v4().simple().to_string());
                let emoji = m
                    .get("emoji")
                    .and_then(Value::as_str)
                    .filter(|e| !e.is_empty())
                    .unwrap_or("📝")
                    .to_owned();
                let mut entry = serde_json::json!({ "id": id, "text": text, "emoji": emoji });
                if let Some(link) = m.get("link").and_then(Value::as_str).map(str::trim)
                    && !link.is_empty()
                {
                    entry["link"] = Value::String(link.to_owned());
                }
                out.push(entry);
            }
            _ => {}
        }
    }
    out
}

/// Port of `Course.validate_tags`: JSON list, else comma-separated; trimmed,
/// de-duplicated, order kept.
#[must_use]
pub fn tags(raw: Option<&str>) -> Vec<String> {
    let Some(raw) = raw.map(str::trim).filter(|s| !s.is_empty()) else {
        return Vec::new();
    };
    let candidates: Vec<String> = match serde_json::from_str::<Value>(raw) {
        Ok(Value::Array(a)) => a
            .into_iter()
            .map(|v| match v {
                Value::String(s) => s,
                other => other.to_string(),
            })
            .collect(),
        Ok(other) => vec![match other {
            Value::String(s) => s,
            o => o.to_string(),
        }],
        Err(_) => raw.split(',').map(str::to_owned).collect(),
    };
    let mut out: Vec<String> = Vec::new();
    for tag in candidates {
        let tag = tag.trim().to_owned();
        if !tag.is_empty() && !out.contains(&tag) {
            out.push(tag);
        }
    }
    out
}

/// `thumbnailtype` enum → v2 (`image` when NULL, as the v2 default).
#[must_use]
pub fn thumbnail_type(raw: Option<&str>) -> &'static str {
    match raw.map(str::to_ascii_uppercase).as_deref() {
        Some("VIDEO") => "video",
        Some("BOTH") => "both",
        _ => "image",
    }
}

/// Legacy `activitytypeenum`/`activitysubtypeenum` → the v2 CHECKed pair.
/// Quizzes were parked on `TYPE_CUSTOM`/`SUBTYPE_CUSTOM` with
/// `settings.kind = "QUIZ"` (DECISIONS, P3.1); `TYPE_ASSIGNMENT` has no v2
/// equivalent (the old assignment system is gone) → None.
#[must_use]
pub fn activity_types(
    activity_type: &str,
    sub_type: &str,
    settings: &Map<String, Value>,
) -> Option<(&'static str, &'static str)> {
    let t = snake(activity_type, Some("TYPE_"));
    let s = snake(sub_type, Some("SUBTYPE_"));
    let pair = match (t.as_str(), s.as_str()) {
        ("dynamic", "dynamic_page") => ("dynamic", "dynamic_page"),
        ("video", "video_youtube") => ("video", "video_youtube"),
        ("video", "video_hosted") => ("video", "video_hosted"),
        ("document", "document_pdf") => ("document", "document_pdf"),
        ("document", "document_doc") => ("document", "document_doc"),
        ("quiz", _) => ("quiz", "quiz_standard"),
        ("exam", "exam_standard") => ("exam", "exam_standard"),
        ("code_challenge", "code_general") => ("code_challenge", "code_general"),
        ("code_challenge", "code_competitive") => ("code_challenge", "code_competitive"),
        ("file_submission", "file_submission_standard") => {
            ("file_submission", "file_submission_standard")
        }
        ("custom", "custom") => {
            if str_setting(settings, "kind").is_some_and(|k| k.eq_ignore_ascii_case("QUIZ")) {
                ("quiz", "quiz_standard")
            } else {
                ("custom", "custom")
            }
        }
        _ => return None,
    };
    Some(pair)
}

/// `blocktypeenum` → v2 `blocks.block_type`; `BLOCK_QUIZ` has no home.
#[must_use]
pub fn block_type(raw: &str) -> Option<&'static str> {
    match snake(raw, Some("BLOCK_")).as_str() {
        "image" => Some("image"),
        "document_pdf" | "pdf" => Some("pdf"),
        "video" => Some("video"),
        "custom" => Some("custom"),
        _ => None,
    }
}

/// A block's legacy file reference (`content.file_id` + `file_format`),
/// resolved to an object key by the files domain.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct LegacyBlockFile {
    pub file_id: String,
    pub file_format: String,
    pub file_name: String,
    pub file_size: i64,
    pub file_type: String,
}

#[must_use]
pub fn block_file(content: &Map<String, Value>) -> Option<LegacyBlockFile> {
    let file_id = str_setting(content, "file_id")?.to_owned();
    let file_format = str_setting(content, "file_format")?.to_owned();
    Some(LegacyBlockFile {
        file_name: str_setting(content, "file_name")
            .unwrap_or(&format!("{file_id}.{file_format}"))
            .to_owned(),
        file_size: content
            .get("file_size")
            .and_then(Value::as_i64)
            .unwrap_or(0),
        file_type: str_setting(content, "file_type")
            .unwrap_or("application/octet-stream")
            .to_owned(),
        file_id,
        file_format,
    })
}

/// Legacy on-disk directory per block type (services/blocks/block_types/*).
#[must_use]
pub const fn block_dir(v2_block_type: &str) -> Option<&'static str> {
    match v2_block_type.as_bytes() {
        b"image" => Some("imageBlock"),
        b"pdf" => Some("pdfBlock"),
        b"video" => Some("videoBlock"),
        _ => None,
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ResourceKind {
    Course,
    Collection,
}

/// `resourceauthor.resource_uuid` / `usergroupresource.resource_uuid` are
/// polymorphic public ids: the prefix says which table.
#[must_use]
pub fn resource_target(resource_uuid: &str) -> Option<ResourceKind> {
    if resource_uuid.starts_with("course_") {
        Some(ResourceKind::Course)
    } else if resource_uuid.starts_with("collection_") {
        Some(ResourceKind::Collection)
    } else {
        None
    }
}

/// `courseupdate.linked_activity_uuids`: JSON list or comma-separated.
#[must_use]
pub fn linked_activity_uuids(raw: Option<&str>) -> Vec<String> {
    tags(raw)
}

/// Legacy discussion `type` → v2 `kind`.
#[must_use]
pub fn discussion_kind(raw: &str) -> &'static str {
    if raw.eq_ignore_ascii_case("REPLY") {
        "reply"
    } else {
        "post"
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn learnings_accept_every_legacy_encoding() {
        assert!(learnings(None).is_empty());
        assert!(learnings(Some("  ")).is_empty());
        let plain = learnings(Some("Learn A, and B"));
        assert_eq!(plain.len(), 1);
        assert_eq!(plain[0]["text"], "Learn A, and B");
        assert_eq!(plain[0]["emoji"], "📝");
        let list = learnings(Some(r#"[{"id":"x","text":" T ","emoji":"","link":" http://l "},{"text":""},"raw"]"#));
        assert_eq!(list.len(), 2);
        assert_eq!(list[0]["id"], "x");
        assert_eq!(list[0]["text"], "T");
        assert_eq!(list[0]["emoji"], "📝");
        assert_eq!(list[0]["link"], "http://l");
        assert_eq!(list[1]["text"], "raw");
        assert_eq!(list[1]["id"].as_str().unwrap().len(), 32);
    }

    #[test]
    fn tags_json_or_csv_deduped() {
        assert_eq!(tags(Some(r#"["a"," b ","a"]"#)), vec!["a", "b"]);
        assert_eq!(tags(Some("x, y ,,x")), vec!["x", "y"]);
        assert!(tags(Some("[]")).is_empty());
        assert!(tags(None).is_empty());
    }

    #[test]
    fn enum_mappings() {
        assert_eq!(thumbnail_type(Some("BOTH")), "both");
        assert_eq!(thumbnail_type(None), "image");
        let empty = Map::new();
        assert_eq!(
            activity_types("TYPE_VIDEO", "SUBTYPE_VIDEO_YOUTUBE", &empty),
            Some(("video", "video_youtube"))
        );
        assert_eq!(
            activity_types("TYPE_FILE_SUBMISSION", "SUBTYPE_FILE_SUBMISSION_STANDARD", &empty),
            Some(("file_submission", "file_submission_standard"))
        );
        assert_eq!(activity_types("TYPE_ASSIGNMENT", "SUBTYPE_ASSIGNMENT_ANY", &empty), None);
        let quiz: Map<String, Value> = serde_json::from_str(r#"{"kind":"QUIZ"}"#).unwrap();
        assert_eq!(
            activity_types("TYPE_CUSTOM", "SUBTYPE_CUSTOM", &quiz),
            Some(("quiz", "quiz_standard"))
        );
        assert_eq!(activity_types("TYPE_CUSTOM", "SUBTYPE_CUSTOM", &empty), Some(("custom", "custom")));
        assert_eq!(block_type("BLOCK_DOCUMENT_PDF"), Some("pdf"));
        assert_eq!(block_type("BLOCK_QUIZ"), None);
        assert_eq!(block_dir("pdf"), Some("pdfBlock"));
        assert_eq!(resource_target("course_01K"), Some(ResourceKind::Course));
        assert_eq!(resource_target("collection_01K"), Some(ResourceKind::Collection));
        assert_eq!(resource_target("user_01K"), None);
        assert_eq!(discussion_kind("REPLY"), "reply");
        assert_eq!(discussion_kind("POST"), "post");
    }

    #[test]
    fn block_file_reads_legacy_content() {
        let c: Map<String, Value> = serde_json::from_str(
            r#"{"file_id":"01A_block_01B","file_format":"pdf","file_name":"n.pdf","file_size":219698,"file_type":"application/pdf","activity_uuid":"activity_01C"}"#,
        )
        .unwrap();
        let f = block_file(&c).unwrap();
        assert_eq!(f.file_id, "01A_block_01B");
        assert_eq!(f.file_size, 219_698);
        assert!(block_file(&Map::new()).is_none());
    }
}
