//! Stage-2 data migrations (spec 10.2) behind `ashyq admin migrate-*`.
//!
//! Each is idempotent, reports what it would change with `dry_run`, and is
//! safe while the old web is live (it reads both shapes), except where noted.
//!
//! - D-01 `migrate-editor-docs`: editor documents keep one embed node -
//!   `blockEmbed` becomes `embedBlock` exactly like the new web's
//!   `normalizeDocument` (`apps/web/src/features/editor/model/normalize.ts`),
//!   and plain-paragraph HTML discussion posts become JSON documents (the old
//!   web parses both). An embed whose provider the old web does not know
//!   (type `url`) cannot render there: such a run needs `after_cutover`.
//! - D-02 `migrate-themes`: a theme outside the registry becomes `NULL`.
//! - D-03 `migrate-locales`: `ru-RU|kk-KZ|en-US` become `ru|kk|en` (needs
//!   migration `20261003000020`; responses keep answering the legacy form).

use ab_core::{Error, Result};
use regex::Regex;
use serde_json::{Value, json};
use sqlx::PgPool;

/// What a run found (and, without `dry_run`, changed).
#[derive(Debug, Default, serde::Serialize)]
pub struct Report {
    pub dry_run: bool,
    pub counts: std::collections::BTreeMap<&'static str, i64>,
}

impl Report {
    fn add(&mut self, key: &'static str, n: i64) {
        *self.counts.entry(key).or_default() += n;
    }
}

// ── D-01: embeds ────────────────────────────────────────────────────────────

fn parse_url(value: &str) -> Option<url::Url> {
    url::Url::parse(value.trim()).ok()
}

fn host_is(url: &url::Url, host: &str) -> bool {
    url.host_str()
        .is_some_and(|h| h == host || h.ends_with(&format!(".{host}")))
}

/// `youTubeId` of the new web: a youtube.com/watch, youtu.be, /embed/ or
/// /shorts/ URL, or a bare id.
fn youtube_id(value: &str) -> Option<String> {
    let Some(url) = parse_url(value) else {
        let bare = value.trim();
        let ok = bare.len() >= 6
            && bare
                .chars()
                .all(|c| c.is_ascii_alphanumeric() || c == '_' || c == '-');
        return ok.then(|| bare.to_owned());
    };
    if url.scheme() != "https" {
        return None;
    }
    let path = url.path();
    if url.host_str() == Some("youtu.be") {
        return path
            .trim_start_matches('/')
            .split('/')
            .next()
            .filter(|s| !s.is_empty())
            .map(str::to_owned);
    }
    if !host_is(&url, "youtube.com") {
        return None;
    }
    if path == "/watch" {
        return url
            .query_pairs()
            .find(|(k, _)| k == "v")
            .map(|(_, v)| v.into_owned())
            .filter(|v| !v.is_empty());
    }
    ["/embed/", "/shorts/"].iter().find_map(|prefix| {
        path.strip_prefix(prefix)
            .and_then(|rest| rest.split('/').next())
            .filter(|s| !s.is_empty())
            .map(str::to_owned)
    })
}

/// `embedTypeForUrl` of the new web: the provider id, `url` for any other page.
#[must_use]
pub fn embed_type_for_url(value: &str) -> &'static str {
    let Some(url) = parse_url(value) else {
        return if youtube_id(value).is_some() {
            "youtube"
        } else {
            "url"
        };
    };
    let host = url.host_str().unwrap_or_default();
    let docs = host_is(&url, "docs.google.com");
    let path = url.path();
    if youtube_id(url.as_str()).is_some() {
        "youtube"
    } else if docs && path.starts_with("/document/") {
        "google-docs"
    } else if docs && path.starts_with("/presentation/") {
        "google-slides"
    } else if docs && path.starts_with("/spreadsheets/") {
        "google-sheets"
    } else if (docs && path.starts_with("/forms/")) || host_is(&url, "forms.gle") {
        "google-forms"
    } else if host_is(&url, "vimeo.com") {
        "vimeo"
    } else if host == "excalidraw.com" {
        "excalidraw"
    } else if host == "tldraw.com" {
        "tldraw"
    } else if host_is(&url, "figma.com") {
        "figma"
    } else if host_is(&url, "codepen.io") {
        "codepen"
    } else if host == "gist.github.com" {
        "github-gist"
    } else if host == "open.spotify.com" {
        "spotify"
    } else {
        "url"
    }
}

/// `textAttr`: a non-blank string.
fn text_attr(value: Option<&Value>) -> Option<&str> {
    value
        .and_then(Value::as_str)
        .filter(|s| !s.trim().is_empty())
}

/// `numberAttr`: a finite number, numeric strings too.
fn number_attr(value: Option<&Value>) -> Option<Value> {
    match value? {
        Value::Number(n) => Some(Value::Number(n.clone())),
        // A whole number stays an integer (JS `Number("667")` is 667).
        Value::String(s) if !s.trim().is_empty() => s.trim().parse::<i64>().map_or_else(
            |_| {
                s.trim()
                    .parse::<f64>()
                    .ok()
                    .and_then(serde_json::Number::from_f64)
                    .map(Value::Number)
            },
            |n| Some(Value::from(n)),
        ),
        _ => None,
    }
}

fn iframe_src(code: &str) -> Option<String> {
    static IFRAME: std::sync::OnceLock<Option<Regex>> = std::sync::OnceLock::new();
    IFRAME
        .get_or_init(|| Regex::new(r#"(?i)<iframe[^>]*\ssrc=["']([^"']+)["']"#).ok())
        .as_ref()?
        .captures(code)
        .map(|c| c[1].to_owned())
}

/// One `blockEmbed` node's `embedBlock` replacement.
fn embed_block(attrs: Option<&Value>) -> Value {
    let attr = |k: &str| attrs.and_then(|a| a.get(k));
    let url = text_attr(attr("embedUrl"))
        .map(|u| u.trim().to_owned())
        .or_else(|| text_attr(attr("embedCode")).and_then(iframe_src));
    json!({
        "type": "embedBlock",
        "attrs": {
            "type": url.as_deref().map(embed_type_for_url),
            "url": url,
            "width": text_attr(attr("embedWidth")).unwrap_or("100%"),
            "height": number_attr(attr("embedHeight")).unwrap_or_else(|| Value::from(300)),
        },
    })
}

/// Rewrite every `blockEmbed` in an editor document (a `doc` root,
/// recursing through `content`); returns `(converted, of type url)`.
#[must_use]
pub fn convert_embeds(doc: &mut Value) -> (i64, i64) {
    fn walk(node: &mut Value, counts: &mut (i64, i64)) {
        if node.get("type").and_then(Value::as_str) == Some("blockEmbed") {
            *node = embed_block(node.get("attrs"));
            counts.0 += 1;
            if node.pointer("/attrs/type").and_then(Value::as_str) == Some("url") {
                counts.1 += 1;
            }
            return;
        }
        if let Some(children) = node.get_mut("content").and_then(Value::as_array_mut) {
            for child in children {
                walk(child, counts);
            }
        }
    }
    let mut counts = (0, 0);
    if doc.get("type").and_then(Value::as_str) == Some("doc") {
        walk(doc, &mut counts);
    }
    counts
}

/// A post stored as plain `<p>…</p>` paragraphs, as a JSON document string;
/// `None` for any other markup (left as is and counted).
#[must_use]
pub fn paragraphs_html_to_doc(html: &str) -> Option<String> {
    static PARA: std::sync::OnceLock<Option<Regex>> = std::sync::OnceLock::new();
    let para = PARA
        .get_or_init(|| Regex::new(r"(?s)^\s*<p>([^<]*)</p>").ok())
        .as_ref()?;
    let mut rest = html;
    let mut paragraphs = Vec::new();
    while !rest.trim().is_empty() {
        let caps = para.captures(rest)?;
        let text = caps[1]
            .replace("&nbsp;", "\u{a0}")
            .replace("&lt;", "<")
            .replace("&gt;", ">")
            .replace("&quot;", "\"")
            .replace("&#39;", "'")
            .replace("&amp;", "&");
        paragraphs.push(if text.is_empty() {
            json!({ "type": "paragraph" })
        } else {
            json!({ "type": "paragraph", "content": [{ "type": "text", "text": text }] })
        });
        rest = &rest[caps[0].len()..];
    }
    (!paragraphs.is_empty()).then(|| json!({ "type": "doc", "content": paragraphs }).to_string())
}

/// D-01. Refuses (before writing anything) when a converted embed would be
/// of type `url` - the old web cannot render it - unless `after_cutover`.
pub async fn migrate_editor_docs(
    pool: &PgPool,
    dry_run: bool,
    after_cutover: bool,
) -> Result<Report> {
    let mut report = Report {
        dry_run,
        ..Report::default()
    };
    let mut activities = Vec::new();
    for mut row in ab_db::maintenance::activities_with_block_embed(pool).await? {
        let (converted, generic) = convert_embeds(&mut row.content);
        if converted > 0 {
            report.add("activities", 1);
            report.add("embeds_converted", converted);
            report.add("embeds_of_type_url", generic);
            activities.push(row);
        }
    }
    let mut discussions = Vec::new();
    for row in ab_db::maintenance::discussions_not_json(pool).await? {
        if let Some(doc) = paragraphs_html_to_doc(&row.content) {
            report.add("discussions_converted", 1);
            discussions.push((row.id, doc));
        } else {
            report.add("discussions_left_as_html", 1);
        }
    }
    let generic = report
        .counts
        .get("embeds_of_type_url")
        .copied()
        .unwrap_or(0);
    if dry_run {
        return Ok(report);
    }
    if generic > 0 && !after_cutover {
        return Err(Error::conflict(format!(
            "{generic} embed(s) would become type `url`, which the old web cannot render; \
             run with --after-cutover once the new web is live"
        )));
    }
    let mut tx = pool.begin().await?;
    for row in &activities {
        ab_db::maintenance::set_activity_content(&mut *tx, row.id, &row.content).await?;
    }
    for (id, doc) in &discussions {
        ab_db::maintenance::set_discussion_content(&mut *tx, *id, doc).await?;
    }
    tx.commit().await?;
    Ok(report)
}

// ── D-02 / D-03 ─────────────────────────────────────────────────────────────

/// D-02: themes outside [`crate::identity::profile::THEME_SLUGS`] → `NULL`.
pub async fn migrate_themes(pool: &PgPool, dry_run: bool) -> Result<Report> {
    let slugs: Vec<String> = crate::identity::profile::THEME_SLUGS
        .iter()
        .map(|s| (*s).to_owned())
        .collect();
    let mut report = Report {
        dry_run,
        ..Report::default()
    };
    let n = if dry_run {
        ab_db::maintenance::count_unknown_themes(pool, &slugs).await?
    } else {
        i64::try_from(ab_db::maintenance::clear_unknown_themes(pool, &slugs).await?)
            .unwrap_or(i64::MAX)
    };
    report.add("themes_reset", n);
    Ok(report)
}

/// D-03: legacy locale tags → `ru|kk|en`.
pub async fn migrate_locales(pool: &PgPool, dry_run: bool) -> Result<Report> {
    let mut report = Report {
        dry_run,
        ..Report::default()
    };
    let legacy: i64 = ab_db::maintenance::locale_counts(pool)
        .await?
        .into_iter()
        .filter(|(tag, _)| tag.contains('-'))
        .map(|(_, n)| n)
        .sum();
    let n = if dry_run {
        legacy
    } else {
        i64::try_from(ab_db::maintenance::shorten_locales(pool).await?).unwrap_or(i64::MAX)
    };
    report.add("locales_shortened", n);
    Ok(report)
}

#[cfg(test)]
#[allow(clippy::unwrap_used)]
mod tests {
    use super::*;

    #[test]
    fn embed_types_follow_the_new_web() {
        let cases = [
            ("https://www.youtube.com/watch?v=abc123", "youtube"),
            ("https://youtu.be/abc123?list=x", "youtube"),
            ("dQw4w9WgXcQ", "youtube"),
            ("https://docs.google.com/document/d/1/edit", "google-docs"),
            (
                "https://docs.google.com/presentation/d/1/edit",
                "google-slides",
            ),
            ("https://docs.google.com/spreadsheets/d/1", "google-sheets"),
            ("https://forms.gle/x", "google-forms"),
            ("https://excalidraw.com/#json=1", "excalidraw"),
            ("https://ppt-online.org/123", "url"),
            ("http://www.youtube.com/watch?v=abc", "url"),
            ("not a url", "url"),
        ];
        for (input, expected) in cases {
            assert_eq!(embed_type_for_url(input), expected, "{input}");
        }
    }

    #[test]
    fn block_embed_becomes_embed_block_once() {
        let mut doc = json!({"type": "doc", "content": [
            {"type": "paragraph", "content": [{"type": "text", "text": "hi"}]},
            {"type": "blockEmbed", "attrs": {
                "embedUrl": " https://docs.google.com/document/d/1/edit ",
                "embedCode": null, "embedType": "url", "embedWidth": "100%",
                "embedHeight": "667", "alignment": "left"}},
            {"type": "blockEmbed", "attrs": {
                "embedUrl": null, "embedType": "code", "embedWidth": null,
                "embedCode": "<iframe width=1 src=\"https://ppt-online.org/1\"></iframe>"}},
        ]});
        assert_eq!(convert_embeds(&mut doc), (2, 1));
        assert_eq!(
            doc["content"][1],
            json!({"type": "embedBlock", "attrs": {"type": "google-docs",
                "url": "https://docs.google.com/document/d/1/edit", "width": "100%", "height": 667}})
        );
        assert_eq!(
            doc["content"][2]["attrs"],
            json!({"type": "url", "url": "https://ppt-online.org/1", "width": "100%", "height": 300})
        );
        let again = doc.clone();
        assert_eq!(convert_embeds(&mut doc), (0, 0));
        assert_eq!(doc, again);
        // A video activity's `{type: youtube, uri}` is not an editor document.
        let mut video = json!({"type": "youtube", "uri": "https://youtu.be/x"});
        assert_eq!(convert_embeds(&mut video), (0, 0));
    }

    #[test]
    fn plain_paragraph_posts_become_documents() {
        let doc: Value =
            serde_json::from_str(&paragraphs_html_to_doc("<p>21</p>").unwrap()).unwrap();
        assert_eq!(
            doc,
            json!({"type": "doc", "content": [
                {"type": "paragraph", "content": [{"type": "text", "text": "21"}]}]})
        );
        assert!(
            paragraphs_html_to_doc("<p>a &amp; b</p><p></p>")
                .unwrap()
                .contains("a & b")
        );
        assert_eq!(paragraphs_html_to_doc("<p><b>x</b></p>"), None);
        assert_eq!(paragraphs_html_to_doc("plain"), None);
    }

    /// D-02's registry is the new web's theme manifest too.
    #[test]
    fn theme_slugs_match_the_new_web_manifest() {
        let path = concat!(
            env!("CARGO_MANIFEST_DIR"),
            "/../../../web/public/themes/manifest.json"
        );
        let manifest: Value =
            serde_json::from_str(&std::fs::read_to_string(path).unwrap()).unwrap();
        let slugs: Vec<&str> = manifest
            .as_array()
            .unwrap()
            .iter()
            .map(|t| t["slug"].as_str().unwrap())
            .collect();
        assert_eq!(slugs, crate::identity::profile::THEME_SLUGS);
    }
}
