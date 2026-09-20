//! `GET /utils/link-preview`: OpenGraph + `<title>` from a wiremock page,
//! the 24 h cache (a second call does not hit the page), relative image
//! resolution, the SSRF guard (private and link-local addresses, bad
//! schemes, credentials — loopback passes only because the test config is
//! `development`), non-HTML answers, 5 s timeout, and the session gate.
#![allow(clippy::unwrap_used, clippy::expect_used, clippy::panic)]

use std::time::Duration;

use ab_testkit::TestApp;
use axum::http::StatusCode;
use sqlx::PgPool;
use wiremock::matchers::{method, path};
use wiremock::{Mock, MockServer, ResponseTemplate};

fn encoded(url: &str) -> String {
    url.replace(':', "%3A")
        .replace('/', "%2F")
        .replace('?', "%3F")
}

#[sqlx::test(migrations = "../../migrations")]
async fn open_graph_preview_cache_guard_and_timeout(pool: PgPool) {
    let app = TestApp::spawn(pool).await;
    let user = app.mint_session(&[]).await;
    let site = MockServer::start().await;
    Mock::given(method("GET"))
        .and(path("/post"))
        .respond_with(ResponseTemplate::new(200).set_body_raw(
            r#"<html><head><title>Fallback</title>
                    <meta property="og:title" content="Rust &amp; friends">
                    <meta name="description" content="A   post about   things.">
                    <meta property="og:image" content="/cover.png">
                    <meta property="og:site_name" content="Example Blog">
                    </head><body>hi</body></html>"#,
            "text/html; charset=utf-8",
        ))
        // Once for the direct fetch (the repeat is served from the cache),
        // once more through the redirect (cached under the redirecting URL).
        .expect(2)
        .mount(&site)
        .await;
    Mock::given(method("GET"))
        .and(path("/pdf"))
        .respond_with(
            ResponseTemplate::new(200).set_body_raw(b"%PDF-1.4".to_vec(), "application/pdf"),
        )
        .mount(&site)
        .await;
    Mock::given(method("GET"))
        .and(path("/slow"))
        .respond_with(
            ResponseTemplate::new(200)
                .set_body_raw("<title>late</title>", "text/html")
                .set_delay(Duration::from_secs(7)),
        )
        .mount(&site)
        .await;
    Mock::given(method("GET"))
        .and(path("/moved"))
        .respond_with(ResponseTemplate::new(302).insert_header("location", "/post"))
        .mount(&site)
        .await;

    // No session → 401.
    let anonymous = app
        .get(&format!(
            "/api/v2/utils/link-preview?url={}",
            encoded(&format!("{}/post", site.uri()))
        ))
        .await;
    assert_eq!(anonymous.status, StatusCode::UNAUTHORIZED);

    // OpenGraph wins over <title>; description collapses whitespace; the
    // image resolves against the page; site_name is carried.
    let page_url = format!("{}/post", site.uri());
    let preview = app
        .get_as(
            &user,
            &format!("/api/v2/utils/link-preview?url={}", encoded(&page_url)),
        )
        .await;
    assert_eq!(preview.status, StatusCode::OK, "{}", preview.text());
    let body = preview.json();
    assert_eq!(body["url"], page_url.as_str());
    assert_eq!(body["title"], "Rust & friends");
    assert_eq!(body["description"], "A post about things.");
    assert_eq!(body["image_url"], format!("{}/cover.png", site.uri()));
    assert_eq!(body["site_name"], "Example Blog");

    // Cached: the second call does not reach the page (`expect(2)` below
    // counts the direct fetch and the redirect, nothing else).
    let again = app
        .get_as(
            &user,
            &format!("/api/v2/utils/link-preview?url={}", encoded(&page_url)),
        )
        .await;
    assert_eq!(again.status, StatusCode::OK);
    assert_eq!(again.json()["title"], "Rust & friends");

    // A redirect is followed (and lands on the cached page's URL).
    let moved = app
        .get_as(
            &user,
            &format!(
                "/api/v2/utils/link-preview?url={}",
                encoded(&format!("{}/moved", site.uri()))
            ),
        )
        .await;
    assert_eq!(moved.status, StatusCode::OK, "{}", moved.text());
    assert_eq!(moved.json()["url"], page_url.as_str());

    // Non-HTML and slow pages fail with the dedicated code.
    let pdf = app
        .get_as(
            &user,
            &format!(
                "/api/v2/utils/link-preview?url={}",
                encoded(&format!("{}/pdf", site.uri()))
            ),
        )
        .await;
    assert_eq!(pdf.status, StatusCode::BAD_GATEWAY, "{}", pdf.text());
    assert_eq!(pdf.json()["code"], "link-preview-failed");
    let started = std::time::Instant::now();
    let slow = app
        .get_as(
            &user,
            &format!(
                "/api/v2/utils/link-preview?url={}",
                encoded(&format!("{}/slow", site.uri()))
            ),
        )
        .await;
    assert_eq!(slow.status, StatusCode::BAD_GATEWAY, "{}", slow.text());
    assert_eq!(slow.json()["code"], "link-preview-failed");
    assert!(
        started.elapsed() < Duration::from_secs(7),
        "no 5 s deadline"
    );

    // The SSRF guard: private / link-local / metadata addresses, other
    // schemes and embedded credentials are 422 on `url`.
    for bad in [
        "http://10.0.0.1/",
        "http://192.168.1.1/admin",
        "http://169.254.169.254/latest/meta-data",
        "http://[fd00::1]/",
        "ftp://example.com/",
        "http://user:pw@example.com/",
        "javascript:alert(1)",
        "",
    ] {
        let rejected = app
            .get_as(
                &user,
                &format!("/api/v2/utils/link-preview?url={}", encoded(bad)),
            )
            .await;
        assert_eq!(
            rejected.status,
            StatusCode::UNPROCESSABLE_ENTITY,
            "{bad}: {}",
            rejected.text()
        );
        assert_eq!(rejected.json()["field_errors"][0]["field"], "url", "{bad}");
    }
}

/// Malformed query strings and path parameters answer in the problem+json
/// envelope (422 `validation-failed` with a `query` / `path` field error),
/// never axum's plain-text 400 (BUG-101).
#[sqlx::test(migrations = "../../migrations")]
async fn malformed_query_and_path_are_problem_json(pool: PgPool) {
    let app = TestApp::spawn(pool).await;
    for (path, field) in [
        ("/api/v2/courses?limit=abc", "query"),
        ("/api/v2/courses?cursor=xyz", "query"),
        ("/api/v2/courses/not-a-uuid", "path"),
    ] {
        let res = app.get(path).await;
        assert_eq!(
            res.status,
            StatusCode::UNPROCESSABLE_ENTITY,
            "{path}: {}",
            res.text()
        );
        assert_eq!(
            res.headers["content-type"], "application/problem+json",
            "{path}"
        );
        assert_eq!(res.json()["code"], "validation-failed", "{path}");
        assert_eq!(res.json()["field_errors"][0]["field"], field, "{path}");
    }
}

/// U+0000 in a query string, a path parameter or any JSON string is a 422
/// `validation-failed` (`query` / `path` / `body` field error) — never a
/// Postgres 22021 turned 500 (BUG-211).
#[sqlx::test(migrations = "../../migrations")]
async fn nul_in_any_string_is_validation_failed(pool: PgPool) {
    let app = TestApp::spawn(pool).await;
    let user = app.mint_session(&["user:update:own"]).await;
    let body = app
        .patch_as(
            &user,
            "/api/v2/users/me",
            &serde_json::json!({ "display_name": "a\u{0}b" }),
        )
        .await;
    for (name, res, field) in [
        ("query", app.get("/api/v2/courses?q=%00").await, "query"),
        ("path", app.get("/api/v2/users/lea%00rner").await, "path"),
        ("body", body, "body"),
    ] {
        assert_eq!(
            res.status,
            StatusCode::UNPROCESSABLE_ENTITY,
            "{name}: {}",
            res.text()
        );
        assert_eq!(res.json()["code"], "validation-failed", "{name}");
        assert_eq!(res.json()["field_errors"][0]["field"], field, "{name}");
        assert_eq!(res.json()["field_errors"][0]["code"], "invalid", "{name}");
    }
}
