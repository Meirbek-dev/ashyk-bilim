//! Pure legacy-content path transforms.

use std::path::{Component, Path};

use ab_clients::storage::Bucket;
use serde_json::Value;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ObjectTarget {
    pub bucket: Bucket,
    pub key: String,
}

#[must_use]
pub fn normalize(raw: &str) -> Option<String> {
    let raw = raw.trim().replace('\\', "/");
    let raw = raw
        .strip_prefix("/content/")
        .or_else(|| raw.strip_prefix("content/"))
        .unwrap_or(&raw)
        .trim_start_matches('/');
    let path = Path::new(raw);
    if raw.is_empty()
        || path.components().any(|part| {
            matches!(
                part,
                Component::ParentDir | Component::RootDir | Component::Prefix(_)
            )
        })
    {
        return None;
    }
    Some(raw.to_owned())
}

/// Full object key for a legacy file column that stores a bare file name
/// under a known directory (`course.thumbnail_image` →
/// `platform/courses/<uuid>/thumbnails/<name>`). Values that already carry a
/// path are only normalized; remote URLs are not object keys.
#[must_use]
pub fn under(dir: &str, raw: &str) -> Option<String> {
    let raw = raw.trim();
    if raw.is_empty() || raw.starts_with("http://") || raw.starts_with("https://") {
        return None;
    }
    if raw.contains('/') || raw.contains('\\') {
        return normalize(raw);
    }
    normalize(&format!("{dir}/{raw}"))
}

/// Legacy block directory for a tiptap node or block row type
/// (`services/blocks/utils/upload_files.py`).
#[must_use]
pub fn block_dir(block_type: &str) -> Option<&'static str> {
    match block_type {
        "blockImage" | "BLOCK_IMAGE" => Some("imageBlock"),
        "blockPDF" | "BLOCK_DOCUMENT_PDF" => Some("pdfBlock"),
        "blockVideo" | "BLOCK_VIDEO" => Some("videoBlock"),
        _ => None,
    }
}

/// Add `file_key` to a legacy block file object (`{file_id, file_format, …}`)
/// so the v2 renderer resolves `/content/<file_key>`.
pub fn set_block_file_key(
    content: &mut Value,
    course_uuid: &str,
    activity_uuid: &str,
    dir: &str,
    block_uuid: &str,
) {
    let Some(obj) = content.as_object_mut() else {
        return;
    };
    let (Some(file_id), Some(format)) = (
        obj.get("file_id").and_then(Value::as_str),
        obj.get("file_format").and_then(Value::as_str),
    ) else {
        return;
    };
    let dir = format!(
        "platform/courses/{course_uuid}/activities/{activity_uuid}/dynamic/blocks/{dir}/{block_uuid}"
    );
    if let Some(key) = under(&dir, &format!("{file_id}.{format}")) {
        obj.insert("file_key".into(), Value::String(key));
    }
}

/// Rewrite the file references inside legacy activity `content`/`details`
/// to full object keys: PDF/hosted-video `filename`, video subtitles, and the
/// `blockObject` of every tiptap file block.
pub fn rewrite_activity_files(
    content: &mut Value,
    details: &mut Value,
    sub_type: &str,
    course_uuid: &str,
    activity_uuid: &str,
) {
    let base = format!("platform/courses/{course_uuid}/activities/{activity_uuid}");
    let dir = match sub_type {
        "SUBTYPE_DOCUMENT_PDF" => Some("documentpdf"),
        "SUBTYPE_VIDEO_HOSTED" => Some("video"),
        _ => None,
    };
    if let Some(dir) = dir {
        rewrite_name(content.get_mut("filename"), &format!("{base}/{dir}"));
    }
    if let Some(subs) = details.get_mut("subtitles").and_then(Value::as_array_mut) {
        for sub in subs {
            rewrite_name(sub.get_mut("filename"), &format!("{base}/video"));
        }
    }
    rewrite_tiptap_blocks(content, course_uuid, activity_uuid);
}

fn rewrite_name(value: Option<&mut Value>, dir: &str) {
    if let Some(value) = value {
        if let Some(key) = value.as_str().and_then(|name| under(dir, name)) {
            *value = Value::String(key);
        }
    }
}

fn rewrite_tiptap_blocks(node: &mut Value, course_uuid: &str, activity_uuid: &str) {
    match node {
        Value::Array(items) => {
            for item in items {
                rewrite_tiptap_blocks(item, course_uuid, activity_uuid);
            }
        }
        Value::Object(obj) => {
            let dir = obj.get("type").and_then(Value::as_str).and_then(block_dir);
            let block = obj
                .get_mut("attrs")
                .and_then(|attrs| attrs.get_mut("blockObject"))
                .and_then(Value::as_object_mut);
            if let (Some(dir), Some(block)) = (dir, block) {
                let block_uuid = block
                    .get("block_uuid")
                    .and_then(Value::as_str)
                    .map(str::to_owned);
                if let (Some(block_uuid), Some(content)) = (block_uuid, block.get_mut("content")) {
                    set_block_file_key(content, course_uuid, activity_uuid, dir, &block_uuid);
                }
            }
            for value in obj.values_mut() {
                rewrite_tiptap_blocks(value, course_uuid, activity_uuid);
            }
        }
        _ => {}
    }
}

#[must_use]
pub fn classify(raw: &str) -> Option<ObjectTarget> {
    let key = normalize(raw)?;
    let bucket = if key.starts_with("platform/")
        || (key.starts_with("users/") && key.contains("/avatars/"))
    {
        Bucket::Public
    } else {
        Bucket::Private
    };
    Some(ObjectTarget { bucket, key })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn paths_are_safe_and_bucketed() {
        assert_eq!(
            classify("/content/platform/courses/a/thumb.jpg"),
            Some(ObjectTarget {
                bucket: Bucket::Public,
                key: "platform/courses/a/thumb.jpg".into(),
            })
        );
        assert_eq!(
            classify("users/u/avatars/a.png").map(|v| v.bucket),
            Some(Bucket::Public)
        );
        assert_eq!(
            classify("users/u/submissions/a.pdf").map(|v| v.bucket),
            Some(Bucket::Private)
        );
        assert!(classify("../secret").is_none());
    }

    #[test]
    fn bare_legacy_names_become_full_keys() {
        assert_eq!(
            under("platform/courses/course_A/thumbnails", "t.jpg").as_deref(),
            Some("platform/courses/course_A/thumbnails/t.jpg")
        );
        assert_eq!(
            under("x", "content/platform/a.png").as_deref(),
            Some("platform/a.png")
        );
        assert_eq!(under("x", "https://lh3.googleusercontent.com/a"), None);
        assert_eq!(under("x", " "), None);
        assert_eq!(under("x", ".."), None);
    }

    #[test]
    fn activity_files_are_rewritten() {
        let mut details = serde_json::json!({"subtitles": [{"filename": "ru.vtt"}]});
        let mut content = serde_json::json!({"filename": "video.mp4"});
        rewrite_activity_files(
            &mut content,
            &mut details,
            "SUBTYPE_VIDEO_HOSTED",
            "course_C",
            "activity_A",
        );
        assert_eq!(
            content["filename"],
            "platform/courses/course_C/activities/activity_A/video/video.mp4"
        );
        assert_eq!(
            details["subtitles"][0]["filename"],
            "platform/courses/course_C/activities/activity_A/video/ru.vtt"
        );

        let mut content = serde_json::json!({"type": "doc", "content": [{
            "type": "blockImage",
            "attrs": {"blockObject": {"block_uuid": "block_B", "content": {"file_id": "F", "file_format": "png"}}}
        }]});
        rewrite_activity_files(
            &mut content,
            &mut details,
            "SUBTYPE_DYNAMIC_PAGE",
            "course_C",
            "activity_A",
        );
        assert_eq!(
            content["content"][0]["attrs"]["blockObject"]["content"]["file_key"],
            "platform/courses/course_C/activities/activity_A/dynamic/blocks/imageBlock/block_B/F.png"
        );
    }
}
