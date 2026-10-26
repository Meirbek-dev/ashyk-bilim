//! Write-time checks of stored editor documents (REVIEW-1 C1): the URLs a
//! reader's browser loads or frames from a document's node attributes.
//!
//! The node tree stays the editor's business (`wire::EditorDocument`); only
//! URL-bearing attributes are checked, on both the new web's and the old
//! web's node names:
//!
//! - embeds (`embedBlock.url`, legacy `blockEmbed.embedUrl` / the `src` of
//!   its `embedCode`): a bare provider id (`dQw4w9WgXcQ`) or an absolute
//!   `https:` URL on another host than the platform's own (web, storage,
//!   CORS origins) - an embed is an iframe;
//! - links (`link` mark `href`, `button.link`, `blockWebPreview.url` /
//!   `og_url`): absolute `https:`, `http:` (production lessons carry one) or
//!   `mailto:`, or an in-page `#anchor`;
//! - images (`image.src`, `blockWebPreview.og_image` / `favicon`):
//!   a plain key, `/content/<key>` or absolute `https:`;
//! - file blocks (`blockImage` / `blockPDF` / `blockVideo`
//!   `blockObject.content.file_key`, `file_id`, `file_format`): a plain
//!   storage key - `[A-Za-z0-9._-]` segments joined by `/`, no `.`/`..`.
//!
//! Anything that is not a `{"type": "doc"}` root (HTML discussion posts of
//! the old web, media activity content) passes untouched.

use std::sync::OnceLock;

use ab_core::{Error, FieldError, Result};
use regex::Regex;
use serde_json::Value;

static OWN_HOSTS: OnceLock<Vec<String>> = OnceLock::new();

/// Fix the platform's own origins (`AB__SERVER__WEB_URL`, the storage
/// endpoint, the CORS origins) at boot; the first call wins (like
/// `ab_core::links::init`).
pub fn init(config: &ab_core::config::Config) {
    let hosts = config
        .server
        .web_url
        .iter()
        .chain(config.storage.iter().map(|s| &s.endpoint))
        .chain(&config.server.cors_origins)
        .filter_map(|origin| url::Url::parse(origin).ok()?.host_str().map(normal_host))
        .collect();
    let _ = OWN_HOSTS.set(hosts);
}

fn normal_host(host: &str) -> String {
    host.trim_end_matches('.').to_ascii_lowercase()
}

/// 422 with one field error per offending attribute (`<field>.content.2.attrs.url`).
pub fn validate(field: &str, doc: &Value) -> Result<()> {
    let errors = violations(field, doc, OWN_HOSTS.get().map_or(&[], Vec::as_slice));
    if errors.is_empty() {
        Ok(())
    } else {
        Err(Error::validation(errors))
    }
}

/// [`validate`] against explicit own hosts (tests, the corpus check).
#[must_use]
pub fn violations(field: &str, doc: &Value, own_hosts: &[String]) -> Vec<FieldError> {
    let mut errors = Vec::new();
    if doc.get("type").and_then(Value::as_str) == Some("doc") {
        walk(doc, field, own_hosts, &mut errors);
    }
    errors
}

#[derive(Clone, Copy)]
enum Kind {
    Embed,
    Link,
    Image,
    Key,
}

impl Kind {
    const fn rule(self) -> &'static str {
        match self {
            Self::Embed => "an embed must be an https URL on another host, or a provider id",
            Self::Link => "a link must be an absolute https, http or mailto URL, or #anchor",
            Self::Image => "an image must be a storage key, /content/<key> or an https URL",
            Self::Key => "a storage key must be plain (no scheme, leading slash, '..', query)",
        }
    }
}

fn walk(node: &Value, path: &str, own: &[String], errors: &mut Vec<FieldError>) {
    let mut check = |at: &str, value: Option<&Value>, kind: Kind| {
        let Some(value) = value.and_then(Value::as_str) else {
            return;
        };
        if !value.trim().is_empty() && !allowed(value.trim(), kind, own) {
            errors.push(FieldError {
                field: format!("{path}.{at}"),
                code: "unsafe-url".into(),
                message: kind.rule().into(),
            });
        }
    };
    let attr = |name: &str| node.get("attrs").and_then(|a| a.get(name));
    match node.get("type").and_then(Value::as_str).unwrap_or_default() {
        "embedBlock" => check("attrs.url", attr("url"), Kind::Embed),
        "blockEmbed" => {
            check("attrs.embedUrl", attr("embedUrl"), Kind::Embed);
            // The old web renders this HTML (DOMPurify, iframes allowed):
            // every `src` in it is an embed, and there must be one.
            if let Some(code) = attr("embedCode").and_then(Value::as_str)
                && !code.trim().is_empty()
            {
                let sources = code_sources(code);
                if sources.is_empty() {
                    check(
                        "attrs.embedCode",
                        Some(&Value::from("no-src:")),
                        Kind::Embed,
                    );
                }
                for src in sources {
                    check("attrs.embedCode", Some(&Value::from(src)), Kind::Embed);
                }
            }
        }
        "image" => check("attrs.src", attr("src"), Kind::Image),
        "button" => check("attrs.link", attr("link"), Kind::Link),
        "blockWebPreview" => {
            check("attrs.url", attr("url"), Kind::Link);
            check("attrs.og_url", attr("og_url"), Kind::Link);
            check("attrs.og_image", attr("og_image"), Kind::Image);
            check("attrs.favicon", attr("favicon"), Kind::Image);
        }
        "blockImage" | "blockPDF" | "blockVideo" => {
            let file = attr("blockObject").and_then(|o| o.get("content"));
            for key in ["file_key", "file_id", "file_format"] {
                check(
                    &format!("attrs.blockObject.content.{key}"),
                    file.and_then(|f| f.get(key)),
                    Kind::Key,
                );
            }
        }
        _ => {}
    }
    for (i, mark) in node
        .get("marks")
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
        .enumerate()
    {
        if mark.get("type").and_then(Value::as_str) == Some("link") {
            check(
                &format!("marks.{i}.attrs.href"),
                mark.get("attrs").and_then(|a| a.get("href")),
                Kind::Link,
            );
        }
    }
    for (i, child) in node
        .get("content")
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
        .enumerate()
    {
        walk(child, &format!("{path}.content.{i}"), own, errors);
    }
}

/// Every `src` / `srcdoc` value in embed HTML (`srcdoc` never passes).
fn code_sources(code: &str) -> Vec<String> {
    static SRC: OnceLock<Option<Regex>> = OnceLock::new();
    let Some(re) = SRC
        .get_or_init(|| Regex::new(r#"(?i)\bsrc(doc)?\s*=\s*["']?([^"'\s>]*)"#).ok())
        .as_ref()
    else {
        return vec!["invalid:".into()];
    };
    re.captures_iter(code)
        .map(|c| {
            if c.get(1).is_some() {
                "srcdoc:".to_owned()
            } else {
                c[2].to_owned()
            }
        })
        .collect()
}

fn allowed(value: &str, kind: Kind, own: &[String]) -> bool {
    let https = || {
        url::Url::parse(value)
            .ok()
            .filter(|u| u.scheme() == "https")
            .and_then(|u| u.host_str().map(normal_host))
    };
    match kind {
        Kind::Key => plain_key(value),
        Kind::Image => {
            plain_key(value)
                || value.strip_prefix("/content/").is_some_and(plain_key)
                || https().is_some()
        }
        Kind::Link => {
            value.starts_with('#')
                || url::Url::parse(value).is_ok_and(|u| {
                    matches!(u.scheme(), "https" | "http" | "mailto")
                        && (u.scheme() == "mailto" || u.host_str().is_some())
                })
        }
        Kind::Embed => {
            let bare_id = value.len() <= 128
                && value
                    .chars()
                    .all(|c| c.is_ascii_alphanumeric() || c == '_' || c == '-');
            bare_id || https().is_some_and(|host| !own.contains(&host))
        }
    }
}

fn plain_key(key: &str) -> bool {
    key.len() <= 1024
        && key.split('/').all(|segment| {
            !segment.is_empty()
                && segment != "."
                && segment != ".."
                && segment
                    .chars()
                    .all(|c| c.is_ascii_alphanumeric() || matches!(c, '.' | '_' | '-'))
        })
}

/// A notification's excerpt of a post (CONTRACT-REQ-E-1).
///
/// The readable text of an editor document, or of the old web's HTML or
/// plain text, whitespace collapsed and cut to `limit` characters with an
/// ellipsis, as web-2's `extractPlainText` reads it.
#[must_use]
pub fn plain_excerpt(content: &str, limit: usize) -> String {
    fn collect(node: &Value, out: &mut String) {
        if let Some(text) = node.get("text").and_then(Value::as_str) {
            out.push_str(text);
        }
        if let Some(children) = node.get("content").and_then(Value::as_array) {
            for child in children {
                collect(child, out);
            }
        }
        if node.get("type").and_then(Value::as_str) != Some("text") {
            out.push(' ');
        }
    }
    let mut text = String::new();
    match serde_json::from_str::<Value>(content) {
        Ok(doc) if doc.get("type").and_then(Value::as_str) == Some("doc") => {
            collect(&doc, &mut text);
        }
        _ => {
            let mut in_tag = false;
            for c in content.chars() {
                match c {
                    '<' => in_tag = true,
                    '>' if in_tag => {
                        in_tag = false;
                        text.push(' ');
                    }
                    _ if !in_tag => text.push(c),
                    _ => {}
                }
            }
        }
    }
    let words: Vec<&str> = text.split_whitespace().collect();
    let flat = words.join(" ");
    if flat.chars().count() <= limit {
        return flat;
    }
    let cut: String = flat.chars().take(limit).collect();
    format!("{}…", cut.trim_end())
}

/// A notification's excerpt of a teacher's feedback: typed as Markdown and
/// shown rendered on the result, so the excerpt drops the marks
/// (`**слово**`, `[текст](url)`, `# `, `- `) and keeps the words.
#[must_use]
pub fn markdown_excerpt(content: &str, limit: usize) -> String {
    let mut text = String::with_capacity(content.len());
    for line in content.lines() {
        let mut line = line.trim_start();
        line = line.trim_start_matches(['#', '>']).trim_start();
        for marker in ["- ", "* ", "+ "] {
            line = line.strip_prefix(marker).unwrap_or(line);
        }
        if let Some((number, rest)) = line.split_once(". ")
            && !number.is_empty()
            && number.chars().all(|c| c.is_ascii_digit())
        {
            line = rest;
        }
        text.push_str(line);
        text.push('\n');
    }
    let chars: Vec<char> = text.chars().collect();
    let mut plain = String::with_capacity(text.len());
    let mut i = 0;
    while i < chars.len() {
        let c = chars[i];
        let prev = i.checked_sub(1).map(|j| chars[j]);
        let next = chars.get(i + 1).copied();
        match c {
            // `[text](url)` and `![alt](url)` read as their text.
            '!' if next == Some('[') => {}
            ']' if next == Some('(') => {
                let close = chars[i..].iter().position(|&c| c == ')');
                if let Some(close) = close {
                    i += close;
                }
            }
            '[' | '`' | '~' => {}
            // Emphasis marks go; one inside a word (`snake_case`, `2*3`) stays.
            '*' | '_'
                if !(prev.is_some_and(char::is_alphanumeric)
                    && next.is_some_and(char::is_alphanumeric)) => {}
            _ => plain.push(c),
        }
        i += 1;
    }
    plain_excerpt(&plain, limit)
}

#[cfg(test)]
mod tests {
    use serde_json::json;

    use super::*;

    #[test]
    fn excerpts_read_documents_html_and_plain_text() {
        let doc = json!({"type": "doc", "content": [
            {"type": "paragraph", "content": [{"type": "text", "text": "Как сдать"}, {"type": "text", "text": " задание?"}]},
            {"type": "paragraph", "content": [{"type": "text", "text": "Срок завтра."}]}
        ]})
        .to_string();
        assert_eq!(plain_excerpt(&doc, 140), "Как сдать задание? Срок завтра.");
        assert_eq!(
            plain_excerpt("<p>Привет,</p><p>мир</p>", 140),
            "Привет, мир"
        );
        assert_eq!(plain_excerpt("  просто   текст ", 140), "просто текст");
        assert_eq!(plain_excerpt("абвгд ежз", 6), "абвгд…");
    }

    fn fields(doc: &Value) -> Vec<String> {
        violations("content", doc, &["ashyq.test".to_owned()])
            .into_iter()
            .map(|e| e.field)
            .collect()
    }

    fn doc(nodes: &Value) -> Value {
        json!({ "type": "doc", "content": nodes })
    }

    #[test]
    fn embeds_must_be_https_on_another_host() {
        for url in [
            "https://ashyq.test/ab-private/k.html?X-Amz-Signature=s",
            "https://ASHYQ.test./content/x",
            "https://x@ashyq.test/",
            "/content/x.html",
            "../ab-private/x",
            "http://example.com/",
            "javascript:alert(1)",
            "data:text/html,<script>1</script>",
        ] {
            let d = doc(&json!([{ "type": "embedBlock", "attrs": { "type": "url", "url": url } }]));
            assert_eq!(fields(&d), ["content.content.0.attrs.url"], "{url}");
        }
        for url in [
            "https://docs.google.com/document/d/1/edit",
            "dQw4w9WgXcQ",
            "",
        ] {
            let d =
                doc(&json!([{ "type": "embedBlock", "attrs": { "type": "youtube", "url": url } }]));
            assert!(fields(&d).is_empty(), "{url}");
        }
    }

    #[test]
    fn legacy_embed_code_sources_are_embeds() {
        let ok = r#"<iframe width=1 src="https://ppt-online.org/1"></iframe>"#;
        let own = r"<iframe src='https://ashyq.test/x'></iframe>";
        let srcdoc = r#"<iframe src="https://a.example" srcdoc="<script>1</script>"></iframe>"#;
        let none = "<b>hi</b>";
        for (code, bad) in [
            (ok, false),
            ("", false),
            (own, true),
            (srcdoc, true),
            (none, true),
        ] {
            let d = doc(
                &json!([{ "type": "blockEmbed", "attrs": { "embedUrl": null, "embedCode": code } }]),
            );
            assert_eq!(!fields(&d).is_empty(), bad, "{code}");
        }
    }

    #[test]
    fn links_images_and_keys() {
        let d = doc(&json!([
            { "type": "paragraph", "content": [
                { "type": "text", "text": "a", "marks": [{ "type": "link", "attrs": { "href": "javascript:alert(1)" } }] },
                { "type": "text", "text": "b", "marks": [{ "type": "link", "attrs": { "href": "http://developer.android.com/x" } }] },
                { "type": "text", "text": "c", "marks": [{ "type": "link", "attrs": { "href": "mailto:a@b.kz" } }] },
                { "type": "text", "text": "d", "marks": [{ "type": "link", "attrs": { "href": "#intro" } }] },
            ]},
            { "type": "image", "attrs": { "src": "/content/discussion-image/0193" } },
            { "type": "image", "attrs": { "src": "/content/../ab-private/k.html?X-Amz-Signature=s" } },
            { "type": "button", "attrs": { "link": "https://ashyq.test/courses" } },
            { "type": "blockImage", "attrs": { "blockObject": { "content": {
                "file_key": "platform/courses/c_1/activities/a_1/dynamic/blocks/imageBlock/b_1/x.png" } } } },
            { "type": "blockPDF", "attrs": { "blockObject": { "content": {
                "file_key": "../ab-private/x.html", "file_id": "a?b", "file_format": "pdf" } } } },
            { "type": "blockVideo", "attrs": { "blockObject": { "content": { "file_key": "https://evil.example/x.mp4" } } } },
            { "type": "blockVideo", "attrs": { "blockObject": null } },
        ]));
        assert_eq!(
            fields(&d),
            [
                "content.content.0.content.0.marks.0.attrs.href",
                "content.content.2.attrs.src",
                "content.content.5.attrs.blockObject.content.file_key",
                "content.content.5.attrs.blockObject.content.file_id",
                "content.content.6.attrs.blockObject.content.file_key",
            ]
        );
    }

    #[test]
    fn only_documents_are_checked() {
        assert!(fields(&json!({ "type": "youtube", "uri": "javascript:x" })).is_empty());
        assert!(fields(&json!({ "filename": "../x" })).is_empty());
    }

    #[test]
    fn feedback_excerpts_drop_markdown_marks() {
        assert_eq!(
            markdown_excerpt(
                "# Итог\n**Хорошо**, но _проверьте_ `snake_case`:\n- пункт [ссылка](https://x.kz/a_b)\n2. 2*3",
                140
            ),
            "Итог Хорошо, но проверьте snake_case: пункт ссылка 2*3"
        );
    }
}
