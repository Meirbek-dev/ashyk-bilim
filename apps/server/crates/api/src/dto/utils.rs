//! Utilities: link previews for the editor.

use serde::{Deserialize, Serialize};
use utoipa::ToSchema;

#[derive(Debug, Deserialize, ToSchema)]
#[serde(deny_unknown_fields)]
pub struct LinkPreviewQuery {
    /// The page to preview (`http`/`https` only).
    pub url: String,
}

/// OpenGraph / `<title>` summary of a public web page.
#[derive(Debug, Serialize, ToSchema)]
pub struct LinkPreview {
    /// The URL the page was read from (after redirects).
    pub url: String,
    pub title: Option<String>,
    pub description: Option<String>,
    /// Absolute `http(s)` image URL, when the page declares one.
    pub image_url: Option<String>,
    pub site_name: Option<String>,
}

impl From<ab_clients::link_preview::LinkPreview> for LinkPreview {
    fn from(p: ab_clients::link_preview::LinkPreview) -> Self {
        Self {
            url: p.url,
            title: p.title,
            description: p.description,
            image_url: p.image_url,
            site_name: p.site_name,
        }
    }
}
