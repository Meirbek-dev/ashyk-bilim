//! OpenGraph link previews for the editor's link block
//! (`GET /utils/link-preview`; legacy `services/utils/link_preview.py`).
//!
//! The fetch is the attack surface: the URL is user-supplied, so only
//! `http(s)` goes out, every hostname is resolved first and pinned to the
//! addresses that passed the public-range check (no DNS rebinding between
//! check and connect), redirects are followed by hand with the same check,
//! the whole thing has a 5 s deadline and the body is cut at 1 MiB.

use std::net::{IpAddr, Ipv4Addr, SocketAddr};
use std::sync::LazyLock;
use std::time::Duration;

use ab_core::{Error, ErrorCode, FieldError, Result};
use regex::Regex;
use reqwest::Url;
use reqwest::header::{ACCEPT, CONTENT_TYPE, LOCATION, USER_AGENT};
use serde::{Deserialize, Serialize};

const TIMEOUT: Duration = Duration::from_secs(5);
const MAX_BYTES: usize = 1024 * 1024;
const MAX_REDIRECTS: usize = 3;
const AGENT: &str = "Mozilla/5.0 (compatible; AshyqBilim-LinkPreview/1.0)";

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct LinkPreview {
    /// The URL the page was finally read from (after redirects).
    pub url: String,
    pub title: Option<String>,
    pub description: Option<String>,
    pub image_url: Option<String>,
    pub site_name: Option<String>,
}

#[derive(Debug, Clone)]
pub struct LinkPreviewClient {
    /// Development only: lets `localhost` / `127.0.0.1` through so the
    /// route can be exercised against wiremock and the local web app.
    allow_loopback: bool,
}

impl LinkPreviewClient {
    #[must_use]
    pub const fn new(allow_loopback: bool) -> Self {
        Self { allow_loopback }
    }

    /// Fetch and parse one page. 422 (`url`) for a rejected URL; 502
    /// `link-preview-failed` when the page cannot be read.
    pub async fn fetch(&self, url: &str) -> Result<LinkPreview> {
        let url = normalize(url)?;
        tokio::time::timeout(TIMEOUT, self.fetch_inner(url))
            .await
            .map_err(|_| failed("timed out"))?
    }

    async fn fetch_inner(&self, mut url: Url) -> Result<LinkPreview> {
        for _ in 0..=MAX_REDIRECTS {
            let addrs = self.resolve(&url).await?;
            let host = url
                .host_str()
                .ok_or_else(|| unsafe_url("URL must include a hostname"))?;
            let client = reqwest::Client::builder()
                .redirect(reqwest::redirect::Policy::none())
                .resolve_to_addrs(host, &addrs)
                .timeout(TIMEOUT)
                .build()
                .map_err(|e| Error::internal("link preview client", e))?;
            let mut response = client
                .get(url.clone())
                .header(ACCEPT, "text/html,application/xhtml+xml;q=0.9")
                .header(USER_AGENT, AGENT)
                .send()
                .await
                .map_err(|e| failed(format!("request failed: {e}")))?;
            if response.status().is_redirection() {
                let location = response
                    .headers()
                    .get(LOCATION)
                    .and_then(|v| v.to_str().ok())
                    .ok_or_else(|| failed("redirect without Location"))?;
                url = url
                    .join(location)
                    .map_err(|e| failed(format!("bad redirect target: {e}")))?;
                if !matches!(url.scheme(), "http" | "https") {
                    return Err(failed("redirect to a non-http URL"));
                }
                continue;
            }
            if !response.status().is_success() {
                return Err(failed(format!("page answered {}", response.status())));
            }
            let media = response
                .headers()
                .get(CONTENT_TYPE)
                .and_then(|v| v.to_str().ok())
                .and_then(|v| v.split(';').next())
                .map(|v| v.trim().to_ascii_lowercase())
                .unwrap_or_default();
            if !matches!(media.as_str(), "text/html" | "application/xhtml+xml") {
                return Err(failed("page is not HTML"));
            }
            let mut body: Vec<u8> = Vec::new();
            while let Some(chunk) = response
                .chunk()
                .await
                .map_err(|e| failed(format!("reading page: {e}")))?
            {
                if body.len() + chunk.len() > MAX_BYTES {
                    // ponytail: a page's <head> is near the top — cut and parse
                    // what we have rather than refuse the preview.
                    body.extend_from_slice(&chunk[..MAX_BYTES - body.len()]);
                    break;
                }
                body.extend_from_slice(&chunk);
            }
            let html = String::from_utf8_lossy(&body);
            return Ok(parse(&url, &html));
        }
        Err(failed("too many redirects"))
    }

    /// Every address the hostname resolves to, all of them public (or
    /// loopback in development).
    async fn resolve(&self, url: &Url) -> Result<Vec<SocketAddr>> {
        let host = url
            .host_str()
            .ok_or_else(|| unsafe_url("URL must include a hostname"))?
            .trim_end_matches('.')
            .to_ascii_lowercase();
        let port = url
            .port_or_known_default()
            .ok_or_else(|| unsafe_url("URL must include a port"))?;
        let is_local_name = host == "localhost" || host.ends_with(".localhost");
        if is_local_name && !self.allow_loopback {
            return Err(unsafe_url("localhost URLs are not allowed"));
        }
        let addrs: Vec<SocketAddr> = if let Ok(ip) = url
            .host_str()
            .unwrap_or_default()
            .trim_matches(['[', ']'])
            .parse::<IpAddr>()
        {
            vec![SocketAddr::new(ip, port)]
        } else {
            tokio::net::lookup_host((host.as_str(), port))
                .await
                .map_err(|_| unsafe_url("URL hostname could not be resolved"))?
                .collect()
        };
        if addrs.is_empty() {
            return Err(unsafe_url("URL hostname could not be resolved"));
        }
        for addr in &addrs {
            let ip = addr.ip();
            let ok = is_public(ip) || (self.allow_loopback && ip.is_loopback());
            if !ok {
                return Err(unsafe_url("URL resolves to a non-public address"));
            }
        }
        Ok(addrs)
    }
}

fn unsafe_url(message: &str) -> Error {
    Error::validation(vec![FieldError {
        field: "url".into(),
        code: "unsafe".into(),
        message: message.into(),
    }])
}

fn failed(message: impl Into<String>) -> Error {
    Error::app(ErrorCode::LinkPreviewFailed, message)
}

/// `http(s)` only, no credentials, a hostname; the fragment is dropped.
fn normalize(raw: &str) -> Result<Url> {
    let raw = raw.trim();
    if raw.is_empty() {
        return Err(unsafe_url("URL must not be empty"));
    }
    let mut url = Url::parse(raw).map_err(|_| unsafe_url("URL is not valid"))?;
    if !matches!(url.scheme(), "http" | "https") {
        return Err(unsafe_url("only http and https URLs are allowed"));
    }
    if !url.username().is_empty() || url.password().is_some() {
        return Err(unsafe_url("URLs with embedded credentials are not allowed"));
    }
    if url.host_str().is_none_or(str::is_empty) {
        return Err(unsafe_url("URL must include a hostname"));
    }
    url.set_fragment(None);
    Ok(url)
}

/// Globally routable, by the stable `std::net` predicates (the unstable
/// `is_global` spelled out).
fn is_public(ip: IpAddr) -> bool {
    match ip {
        IpAddr::V4(v4) => {
            let [a, b, ..] = v4.octets();
            !(v4.is_loopback()
                || v4.is_private()
                || v4.is_link_local()
                // "this network" 0.0.0.0/8 (also the IPv4-compatible `::`, `::1`)
                || a == 0
                || v4.is_broadcast()
                || v4.is_documentation()
                || v4.is_multicast()
                // carrier-grade NAT 100.64.0.0/10, benchmarking 198.18.0.0/15
                || (a == 100 && (64..128).contains(&b))
                || (a == 198 && (b == 18 || b == 19))
                || a >= 240)
        }
        IpAddr::V6(v6) => {
            if let Some(v4) = v6.to_ipv4_mapped() {
                return is_public(IpAddr::V4(v4));
            }
            let seg = v6.segments();
            let first = seg[0];
            let embedded = |hi: u16, lo: u16| {
                let [a, b] = hi.to_be_bytes();
                let [c, d] = lo.to_be_bytes();
                Ipv4Addr::new(a, b, c, d)
            };
            // UX-191: NAT64 64:ff9b::/96 and 6to4 2002::/16 route to the
            // IPv4 address they embed; NAT64 local-use 64:ff9b:1::/48 is
            // never global.
            if first == 0x64 && seg[1] == 0xff9b {
                return seg[2..6] == [0; 4] && is_public(IpAddr::V4(embedded(seg[6], seg[7])));
            }
            if first == 0x2002 {
                return is_public(IpAddr::V4(embedded(seg[1], seg[2])));
            }
            // UX-195: deprecated IPv4-compatible ::/96 routes to its low 32
            // bits; Teredo 2001::/32 to the server v4 (bits 32-63) and the
            // client v4 (low 32 bits, inverted) — both must be public.
            if seg[..6] == [0; 6] {
                return is_public(IpAddr::V4(embedded(seg[6], seg[7])));
            }
            if first == 0x2001 && seg[1] == 0 {
                return is_public(IpAddr::V4(embedded(seg[2], seg[3])))
                    && is_public(IpAddr::V4(embedded(!seg[6], !seg[7])));
            }
            !(v6.is_loopback()
                || v6.is_unspecified()
                || v6.is_multicast()
                // unique local fc00::/7, link-local fe80::/10, documentation 2001:db8::/32
                || (first & 0xfe00) == 0xfc00
                || (first & 0xffc0) == 0xfe80
                || (first == 0x2001 && seg[1] == 0x0db8))
        }
    }
}

/// The patterns are constants (unit-tested); a failed compile would be a
/// build defect, so it degrades to "no matches" rather than a panic path.
fn regex(pattern: &str) -> Option<Regex> {
    Regex::new(pattern).ok()
}
static META: LazyLock<Option<Regex>> = LazyLock::new(|| regex(r"(?is)<meta\b[^>]*>"));
static ATTR: LazyLock<Option<Regex>> = LazyLock::new(|| {
    regex(r#"(?is)\b(property|name|content)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))"#)
});
static TITLE: LazyLock<Option<Regex>> = LazyLock::new(|| regex(r"(?is)<title[^>]*>(.*?)</title>"));

/// `<title>` and the OpenGraph / `description` metas; the image is resolved
/// against the page and kept only when it is itself `http(s)`.
fn parse(page: &Url, html: &str) -> LinkPreview {
    let mut og_title = None;
    let mut og_description = None;
    let mut description = None;
    let mut image = None;
    let mut site_name = None;
    let (Some(meta), Some(attr)) = (META.as_ref(), ATTR.as_ref()) else {
        return LinkPreview {
            url: page.to_string(),
            title: None,
            description: None,
            image_url: None,
            site_name: None,
        };
    };
    for tag in meta.find_iter(html) {
        let mut key = None;
        let mut content = None;
        for cap in attr.captures_iter(tag.as_str()) {
            let value = cap
                .get(2)
                .or_else(|| cap.get(3))
                .or_else(|| cap.get(4))
                .map(|m| m.as_str())
                .unwrap_or_default();
            match cap
                .get(1)
                .map(|m| m.as_str().to_ascii_lowercase())
                .as_deref()
            {
                Some("property" | "name") => key = Some(value.trim().to_ascii_lowercase()),
                Some("content") => content = Some(value),
                _ => {}
            }
        }
        let (Some(key), Some(content)) = (key, content) else {
            continue;
        };
        let value = clean(content);
        if value.is_empty() {
            continue;
        }
        match key.as_str() {
            "og:title" => og_title.get_or_insert(value),
            "og:description" => og_description.get_or_insert(value),
            "description" => description.get_or_insert(value),
            "og:image" | "og:image:url" | "og:image:secure_url" => image.get_or_insert(value),
            "og:site_name" => site_name.get_or_insert(value),
            _ => continue,
        };
    }
    let title = og_title.or_else(|| {
        TITLE
            .as_ref()?
            .captures(html)
            .and_then(|c| c.get(1))
            .map(|m| clean(m.as_str()))
            .filter(|t| !t.is_empty())
    });
    let image_url = image
        .and_then(|raw| page.join(&raw).ok())
        .filter(|u| matches!(u.scheme(), "http" | "https"))
        .map(|u| u.to_string());
    LinkPreview {
        url: page.to_string(),
        title,
        description: og_description.or(description),
        image_url,
        site_name,
    }
}

/// Entity-decoded, whitespace-collapsed, capped at 500 characters.
fn clean(raw: &str) -> String {
    let decoded = decode_entities(raw);
    let mut out = String::with_capacity(decoded.len());
    for word in decoded.split_whitespace() {
        if !out.is_empty() {
            out.push(' ');
        }
        out.push_str(word);
    }
    if out.chars().count() > 500 {
        out = out.chars().take(500).collect();
    }
    out
}

fn decode_entities(raw: &str) -> String {
    let mut out = String::with_capacity(raw.len());
    let mut rest = raw;
    while let Some(start) = rest.find('&') {
        out.push_str(&rest[..start]);
        let tail = &rest[start..];
        let Some(end) = tail.find(';').filter(|e| *e <= 10) else {
            out.push('&');
            rest = &tail[1..];
            continue;
        };
        let entity = &tail[1..end];
        let decoded = match entity {
            "amp" => Some('&'),
            "lt" => Some('<'),
            "gt" => Some('>'),
            "quot" => Some('"'),
            "apos" | "#39" => Some('\''),
            "nbsp" => Some(' '),
            _ => entity
                .strip_prefix('#')
                .and_then(|n| {
                    n.strip_prefix(['x', 'X']).map_or_else(
                        || n.parse::<u32>().ok(),
                        |h| u32::from_str_radix(h, 16).ok(),
                    )
                })
                .and_then(char::from_u32),
        };
        match decoded {
            Some(ch) => out.push(ch),
            None => out.push_str(&tail[..=end]),
        }
        rest = &tail[end + 1..];
    }
    out.push_str(rest);
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn private_ranges_are_not_public() {
        for ip in [
            "127.0.0.1",
            "10.1.2.3",
            "172.16.5.5",
            "192.168.1.1",
            "169.254.169.254",
            "100.64.0.1",
            "0.0.0.0",
            "::1",
            "fd00::1",
            "fe80::1",
            "::ffff:10.0.0.1",
            "64:ff9b::a00:1",
            "64:ff9b::7f00:1",
            "64:ff9b:1::5db8:d822",
            "2002:a00:1::",
            "2002:c0a8:101::1",
            "::",
            "::a00:1",
            "::7f00:1",
            "2001:0:a00:1::",
            "2001:0:5db8:d822::f5ff:fffe",
        ] {
            let ip: IpAddr = ip.parse().unwrap_or_else(|_| unreachable!());
            assert!(!is_public(ip), "{ip}");
        }
        for ip in [
            "93.184.216.34",
            "2606:2800:220:1:248:1893:25c8:1946",
            "64:ff9b::5db8:d822",
            "2002:5db8:d822::1",
            "::5db8:d822",
            "2001:0:5db8:d822::a247:27dd",
        ] {
            let ip: IpAddr = ip.parse().unwrap_or_else(|_| unreachable!());
            assert!(is_public(ip), "{ip}");
        }
    }

    #[test]
    fn urls_are_normalized_or_rejected() {
        assert!(normalize("ftp://example.com/x").is_err());
        assert!(normalize("http://user:pw@example.com/").is_err());
        assert!(normalize("not a url").is_err());
        assert_eq!(
            normalize("https://Example.com/a?b=1#frag")
                .map(|u| u.to_string())
                .ok()
                .as_deref(),
            Some("https://example.com/a?b=1")
        );
    }

    #[test]
    fn parses_open_graph_and_falls_back_to_title() {
        let page = Url::parse("https://example.com/post/1").unwrap_or_else(|_| unreachable!());
        let html = r#"<html><head><title>Fallback &amp; title</title>
            <meta content="OG title" property="og:title">
            <meta name="description" content="Plain   description">
            <META property='og:image' content='/img/cover.png'/>
            <meta property="og:site_name" content="Example &#8212; Site" />
            </head><body></body></html>"#;
        let preview = parse(&page, html);
        assert_eq!(preview.title.as_deref(), Some("OG title"));
        assert_eq!(preview.description.as_deref(), Some("Plain description"));
        assert_eq!(
            preview.image_url.as_deref(),
            Some("https://example.com/img/cover.png")
        );
        assert_eq!(preview.site_name.as_deref(), Some("Example — Site"));
        let bare = parse(&page, "<title>Only &lt;title&gt;</title>");
        assert_eq!(bare.title.as_deref(), Some("Only <title>"));
        assert_eq!(bare.description, None);
        assert_eq!(bare.image_url, None);
    }
}
