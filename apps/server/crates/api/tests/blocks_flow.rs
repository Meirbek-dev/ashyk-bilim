//! Activity content model + file blocks over the real upload pipeline
//! (presigned PUT to RustFS, finalize, claim as block content).
#![allow(clippy::unwrap_used, clippy::expect_used, clippy::panic)]

use ab_testkit::{MintedSession, TestApp};
use axum::http::StatusCode;
use sqlx::PgPool;

async fn author(app: &TestApp, name: &str) -> MintedSession {
    let user = app
        .create_user(name, &format!("{name}@example.com"), &["instructor"])
        .await;
    app.mint_session_for(
        user,
        &[
            "course:create:platform",
            "course:read:all",
            "course:update:own",
            "file:create:own",
        ],
    )
    .await
}

/// Course → chapter → activity, returning the activity id.
async fn scaffold_activity(app: &TestApp, session: &MintedSession) -> (String, String) {
    let course = app
        .post_as(
            session,
            "/api/v2/courses",
            &serde_json::json!({ "name": "Course" }),
        )
        .await;
    let course_id = course.json()["id"].as_str().unwrap().to_owned();
    let chapter = app
        .post_as(
            session,
            &format!("/api/v2/courses/{course_id}/chapters"),
            &serde_json::json!({ "name": "One" }),
        )
        .await;
    let chapter_id = chapter.json()["id"].as_str().unwrap().to_owned();
    let activity = app
        .post_as(
            session,
            &format!("/api/v2/chapters/{chapter_id}/activities"),
            &serde_json::json!({
                "name": "Page",
                "activity_type": "dynamic",
                "activity_sub_type": "dynamic_page",
            }),
        )
        .await;
    (
        course_id,
        activity.json()["id"].as_str().unwrap().to_owned(),
    )
}

/// Upload + finalize through the real pipeline; returns the upload id.
async fn finalized_upload(
    app: &TestApp,
    session: &MintedSession,
    purpose: &str,
    mime: &str,
) -> String {
    let payload = b"file bytes".to_vec();
    let created = app
        .post_as(
            session,
            "/api/v2/uploads",
            &serde_json::json!({ "purpose": purpose, "mime": mime,
                                  "size_bytes": payload.len() }),
        )
        .await;
    assert_eq!(created.status, StatusCode::OK);
    let id = created.json()["id"].as_str().unwrap().to_owned();
    let put_url = created.json()["put_url"].as_str().unwrap().to_owned();
    let put = reqwest::Client::new()
        .put(&put_url)
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
    id
}

#[sqlx::test(migrations = "../../migrations")]
async fn activity_content_roundtrip_and_type_changes(pool: PgPool) {
    let app = TestApp::spawn(pool).await;
    let teacher = author(&app, "teacher").await;
    let (_, activity) = scaffold_activity(&app, &teacher).await;

    // Content/details/settings persist through PATCH → GET.
    let editor_json = serde_json::json!({ "blocks": [{ "type": "paragraph", "text": "hi" }] });
    let updated = app
        .patch_as(
            &teacher,
            &format!("/api/v2/activities/{activity}"),
            &serde_json::json!({
                "content": editor_json,
                "settings": { "show_toc": true },
            }),
        )
        .await;
    assert_eq!(updated.status, StatusCode::OK);
    assert_eq!(updated.json()["content"], editor_json);

    let detail = app
        .get_as(&teacher, &format!("/api/v2/activities/{activity}"))
        .await;
    assert_eq!(detail.status, StatusCode::OK);
    assert_eq!(detail.json()["content"], editor_json);
    assert_eq!(detail.json()["settings"]["show_toc"], true);
    assert_eq!(detail.json()["details"], serde_json::json!({}));

    // Non-object content is refused at the DTO layer.
    let scalar = app
        .patch_as(
            &teacher,
            &format!("/api/v2/activities/{activity}"),
            &serde_json::json!({ "content": "just a string" }),
        )
        .await;
    assert_eq!(scalar.status, StatusCode::UNPROCESSABLE_ENTITY);

    // Type changes travel as a pair; half a pair or a bad pair is refused.
    let half = app
        .patch_as(
            &teacher,
            &format!("/api/v2/activities/{activity}"),
            &serde_json::json!({ "activity_type": "video" }),
        )
        .await;
    assert_eq!(half.status, StatusCode::UNPROCESSABLE_ENTITY);
    let bad = app
        .patch_as(
            &teacher,
            &format!("/api/v2/activities/{activity}"),
            &serde_json::json!({ "activity_type": "video",
                                  "activity_sub_type": "dynamic_page" }),
        )
        .await;
    assert_eq!(bad.status, StatusCode::UNPROCESSABLE_ENTITY);
    let changed = app
        .patch_as(
            &teacher,
            &format!("/api/v2/activities/{activity}"),
            &serde_json::json!({ "activity_type": "video",
                                  "activity_sub_type": "video_youtube" }),
        )
        .await;
    assert_eq!(changed.status, StatusCode::OK);
    assert_eq!(changed.json()["activity_type"], "video");
}

#[sqlx::test(migrations = "../../migrations")]
async fn block_lifecycle_over_the_upload_pipeline(pool: PgPool) {
    let app = TestApp::spawn(pool).await;
    let teacher = author(&app, "teacher").await;
    let (_, activity) = scaffold_activity(&app, &teacher).await;

    // Wrong-purpose upload is refused; the right one becomes a block.
    let avatar = finalized_upload(&app, &teacher, "avatar", "image/png").await;
    let refused = app
        .post_as(
            &teacher,
            &format!("/api/v2/activities/{activity}/blocks"),
            &serde_json::json!({ "block_type": "image", "upload_id": avatar }),
        )
        .await;
    assert_eq!(refused.status, StatusCode::UNPROCESSABLE_ENTITY);

    let upload = finalized_upload(&app, &teacher, "block-image", "image/png").await;
    let created = app
        .post_as(
            &teacher,
            &format!("/api/v2/activities/{activity}/blocks"),
            &serde_json::json!({ "block_type": "image", "upload_id": upload,
                                  "file_name": "diagram.png" }),
        )
        .await;
    assert_eq!(created.status, StatusCode::CREATED);
    let block = created.json();
    let block_id = block["id"].as_str().unwrap().to_owned();
    assert_eq!(block["block_type"], "image");
    assert_eq!(block["content"]["file_name"], "diagram.png");
    assert_eq!(block["content"]["file_type"], "image/png");
    assert!(
        block["content"]["file_key"]
            .as_str()
            .unwrap()
            .starts_with("block-image/")
    );

    // An unfinalized upload can't be claimed.
    let pending = app
        .post_as(
            &teacher,
            "/api/v2/uploads",
            &serde_json::json!({ "purpose": "block-image", "mime": "image/png",
                                  "size_bytes": 10 }),
        )
        .await;
    let pending_id = pending.json()["id"].as_str().unwrap().to_owned();
    let unclaimed = app
        .post_as(
            &teacher,
            &format!("/api/v2/activities/{activity}/blocks"),
            &serde_json::json!({ "block_type": "image", "upload_id": pending_id }),
        )
        .await;
    assert_eq!(unclaimed.status, StatusCode::CONFLICT);

    // Listing and single reads follow course visibility.
    let listed = app
        .get_as(&teacher, &format!("/api/v2/activities/{activity}/blocks"))
        .await;
    assert_eq!(listed.json().as_array().unwrap().len(), 1);
    let single = app
        .get_as(&teacher, &format!("/api/v2/blocks/{block_id}"))
        .await;
    assert_eq!(single.status, StatusCode::OK);

    let learner = app.mint_session(&[]).await;
    let hidden = app
        .get_as(&learner, &format!("/api/v2/blocks/{block_id}"))
        .await;
    assert_eq!(hidden.status, StatusCode::NOT_FOUND);

    // Delete releases the upload reference (grace clock restarts).
    let deleted = app
        .delete_as(&teacher, &format!("/api/v2/blocks/{block_id}"))
        .await;
    assert_eq!(deleted.status, StatusCode::NO_CONTENT);
    let empty = app
        .get_as(&teacher, &format!("/api/v2/activities/{activity}/blocks"))
        .await;
    assert!(empty.json().as_array().unwrap().is_empty());
    let expiring: bool =
        sqlx::query_scalar("SELECT expires_at IS NOT NULL FROM uploads WHERE id = $1")
            .bind(uuid::Uuid::parse_str(&upload).unwrap())
            .fetch_one(&app.pool)
            .await
            .unwrap();
    assert!(expiring, "released upload must re-enter the reaper's queue");
}
