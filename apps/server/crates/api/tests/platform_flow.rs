//! Platform singleton: public bootstrap read, gated update, branding via
//! the upload pipeline.
#![allow(clippy::unwrap_used, clippy::expect_used, clippy::panic)]

use ab_testkit::{MintedSession, TestApp};
use axum::http::StatusCode;
use sqlx::PgPool;

/// Upload + finalize a `platform-logo` image; returns (upload id, key).
async fn upload_logo(app: &TestApp, session: &MintedSession) -> (String, String) {
    let payload = b"logo bytes".to_vec();
    let created = app
        .post_as(
            session,
            "/api/v2/uploads",
            &serde_json::json!({ "purpose": "platform-logo", "mime": "image/png",
                                  "size_bytes": payload.len() }),
        )
        .await;
    assert_eq!(created.status, StatusCode::OK);
    let id = created.json()["id"].as_str().unwrap().to_owned();
    let put_url = created.json()["put_url"].as_str().unwrap().to_owned();
    let put = reqwest::Client::new()
        .put(&put_url)
        .header("content-type", "image/png")
        .body(payload)
        .send()
        .await
        .unwrap();
    assert!(put.status().is_success());
    let finalized = app
        .post_as(
            session,
            &format!("/api/v2/uploads/{id}/finalize"),
            &serde_json::json!({}),
        )
        .await;
    assert_eq!(finalized.status, StatusCode::OK);
    (id, finalized.json()["key"].as_str().unwrap().to_owned())
}

#[sqlx::test(migrations = "../../migrations")]
async fn read_is_public_and_update_is_gated(pool: PgPool) {
    let app = TestApp::spawn(pool).await;

    // No session at all: the frontend bootstraps from this.
    let public = app.get("/api/v2/platform").await;
    assert_eq!(public.status, StatusCode::OK);
    assert_eq!(public.json()["name"], "Ashyq Bilim");

    // A session without the grant is refused; a platform admin passes.
    let pleb = app.mint_session(&["course:read:all"]).await;
    let denied = app
        .patch_as(
            &pleb,
            "/api/v2/platform",
            &serde_json::json!({ "name": "Taken over" }),
        )
        .await;
    assert_eq!(denied.status, StatusCode::FORBIDDEN);

    let admin = app.mint_session(&["platform:update:platform"]).await;
    let updated = app
        .patch_as(
            &admin,
            "/api/v2/platform",
            &serde_json::json!({ "name": "Ashyq Bilim 2", "label": "beta" }),
        )
        .await;
    assert_eq!(updated.status, StatusCode::OK);
    assert_eq!(updated.json()["name"], "Ashyq Bilim 2");
    assert_eq!(updated.json()["label"], "beta");

    // The public read reflects it.
    let after = app.get("/api/v2/platform").await;
    assert_eq!(after.json()["name"], "Ashyq Bilim 2");

    // BUG-164: the name is trimmed and never blank; the email is an email.
    for empty in ["", "   "] {
        let blank = app
            .patch_as(
                &admin,
                "/api/v2/platform",
                &serde_json::json!({ "name": empty }),
            )
            .await;
        assert_eq!(
            blank.status,
            StatusCode::UNPROCESSABLE_ENTITY,
            "{}",
            blank.text()
        );
        assert_eq!(blank.json()["field_errors"][0]["field"], "name");
        assert_eq!(blank.json()["field_errors"][0]["code"], "required");
    }
    let bad_email = app
        .patch_as(
            &admin,
            "/api/v2/platform",
            &serde_json::json!({ "email": "not-an-email" }),
        )
        .await;
    assert_eq!(bad_email.status, StatusCode::UNPROCESSABLE_ENTITY);
    assert_eq!(bad_email.json()["field_errors"][0]["field"], "email");
    assert_eq!(bad_email.json()["field_errors"][0]["code"], "invalid");
    let trimmed = app
        .patch_as(
            &admin,
            "/api/v2/platform",
            &serde_json::json!({ "name": "  Ash\u{202E}yq\u{7}  ", "email": "hello@ashyq.local" }),
        )
        .await;
    assert_eq!(trimmed.status, StatusCode::OK, "{}", trimmed.text());
    // UX-183: control / bidi characters are stripped like display names.
    assert_eq!(trimmed.json()["name"], "Ashyq");
    assert_eq!(app.get("/api/v2/platform").await.json()["name"], "Ashyq");

    // UX-135: label / description are trimmed, an omitted label is kept,
    // `null` (or blank) clears it.
    let padded = app
        .patch_as(
            &admin,
            "/api/v2/platform",
            &serde_json::json!({ "label": "  beta  ", "description": "  hi  " }),
        )
        .await;
    assert_eq!(padded.status, StatusCode::OK, "{}", padded.text());
    assert_eq!(padded.json()["label"], "beta");
    assert_eq!(padded.json()["description"], "hi");
    let kept = app
        .patch_as(
            &admin,
            "/api/v2/platform",
            &serde_json::json!({ "about": "x" }),
        )
        .await;
    assert_eq!(kept.json()["label"], "beta", "{}", kept.text());
    let cleared = app
        .patch_as(
            &admin,
            "/api/v2/platform",
            &serde_json::json!({ "label": null }),
        )
        .await;
    assert_eq!(cleared.status, StatusCode::OK, "{}", cleared.text());
    assert!(cleared.json()["label"].is_null(), "{}", cleared.text());
    let blank = app
        .patch_as(
            &admin,
            "/api/v2/platform",
            &serde_json::json!({ "label": "beta" }),
        )
        .await;
    assert_eq!(blank.json()["label"], "beta");
    let blank = app
        .patch_as(
            &admin,
            "/api/v2/platform",
            &serde_json::json!({ "label": "   " }),
        )
        .await;
    assert!(blank.json()["label"].is_null(), "{}", blank.text());

    // UX-184: control / bidi characters are stripped from the free text too;
    // line breaks in the multi-line fields survive.
    let stripped = app
        .patch_as(
            &admin,
            "/api/v2/platform",
            &serde_json::json!({
                "label": " be\u{202E}ta\u{7} ",
                "description": "a\u{1B}\nb\u{202E}",
                "about": "\u{7}x\ty",
            }),
        )
        .await;
    assert_eq!(stripped.status, StatusCode::OK, "{}", stripped.text());
    assert_eq!(stripped.json()["label"], "beta");
    assert_eq!(stripped.json()["description"], "a\nb");
    assert_eq!(stripped.json()["about"], "x\ty");
}

#[sqlx::test(migrations = "../../migrations")]
async fn branding_claims_uploads_and_releases_replaced(pool: PgPool) {
    let app = TestApp::spawn(pool).await;
    let admin_user = app
        .create_user("padmin", "padmin@example.com", &["admin"])
        .await;
    let admin = app
        .mint_session_for(admin_user, &["platform:update:platform", "file:create:own"])
        .await;

    let (first_id, first_key) = upload_logo(&app, &admin).await;
    let set = app
        .patch_as(
            &admin,
            "/api/v2/platform",
            &serde_json::json!({ "logo_upload_id": first_id }),
        )
        .await;
    assert_eq!(set.status, StatusCode::OK);
    assert_eq!(set.json()["logo_key"], first_key.as_str());

    // Replacing the logo releases the first upload back to the reaper.
    let (second_id, second_key) = upload_logo(&app, &admin).await;
    let replaced = app
        .patch_as(
            &admin,
            "/api/v2/platform",
            &serde_json::json!({ "logo_upload_id": second_id }),
        )
        .await;
    assert_eq!(replaced.json()["logo_key"], second_key.as_str());

    let expiring: bool =
        sqlx::query_scalar("SELECT expires_at IS NOT NULL FROM uploads WHERE id = $1")
            .bind(uuid::Uuid::parse_str(&first_id).unwrap())
            .fetch_one(&app.pool)
            .await
            .unwrap();
    assert!(expiring, "replaced branding must re-enter the reaper queue");

    // Wrong-purpose claims are refused.
    let avatar = {
        let created = app
            .post_as(
                &admin,
                "/api/v2/uploads",
                &serde_json::json!({ "purpose": "avatar", "mime": "image/png",
                                      "size_bytes": 4 }),
            )
            .await;
        created.json()["id"].as_str().unwrap().to_owned()
    };
    let refused = app
        .patch_as(
            &admin,
            "/api/v2/platform",
            &serde_json::json!({ "logo_upload_id": avatar }),
        )
        .await;
    assert_eq!(refused.status, StatusCode::UNPROCESSABLE_ENTITY);
}
