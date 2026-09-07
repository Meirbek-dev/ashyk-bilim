//! Pure legacy-content path transforms.

use std::path::{Component, Path};

use ab_clients::storage::Bucket;

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
}
