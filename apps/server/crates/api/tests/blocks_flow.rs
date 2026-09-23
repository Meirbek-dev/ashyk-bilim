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
            "course:delete:own",
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
        .header("content-type", mime)
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

    // Content/details/settings persist through PATCH → GET. A content write
    // carries the loaded version as `If-Match` (UX-027; a fresh activity is 1).
    let editor_json = serde_json::json!({ "blocks": [{ "type": "paragraph", "text": "hi" }] });
    let content_patch = |body: serde_json::Value| {
        axum::http::Request::builder()
            .method("PATCH")
            .uri(format!("/api/v2/activities/{activity}"))
            .header(axum::http::header::CONTENT_TYPE, "application/json")
            .header(axum::http::header::COOKIE, &teacher.cookie)
            .header(axum::http::header::IF_MATCH, "\"1\"")
            .body(axum::body::Body::from(body.to_string()))
            .unwrap()
    };
    let updated = app
        .send(content_patch(serde_json::json!({
            "content": editor_json,
            "settings": { "show_toc": true },
        })))
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
        .send(content_patch(
            serde_json::json!({ "content": "just a string" }),
        ))
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

/// BUG-234: the upload claim commits with the block that references it.
/// An activity DELETE that wins the race turns the insert into a 404 and
/// the claim rolls back — the upload re-enters the reaper's queue instead
/// of sitting at `referenced_count 1, expires_at null` forever.
#[sqlx::test(migrations = "../../migrations")]
async fn block_claim_rolls_back_when_the_activity_vanishes(pool: PgPool) {
    let app = TestApp::spawn(pool).await;
    let teacher = author(&app, "teacher").await;
    let (_, activity) = scaffold_activity(&app, &teacher).await;
    let upload = finalized_upload(&app, &teacher, "block-image", "image/png").await;

    let mut tx = app.pool.begin().await.unwrap();
    sqlx::query("DELETE FROM activities WHERE id = $1")
        .bind(uuid::Uuid::parse_str(&activity).unwrap())
        .execute(&mut *tx)
        .await
        .unwrap();
    let path = format!("/api/v2/activities/{activity}/blocks");
    let body = serde_json::json!({ "block_type": "image", "upload_id": upload });
    let create = app.post_as(&teacher, &path, &body);
    let commit = async {
        tokio::time::sleep(std::time::Duration::from_millis(500)).await;
        tx.commit().await.unwrap();
    };
    let (created, ()) = tokio::join!(create, commit);
    assert_eq!(created.status, StatusCode::NOT_FOUND, "{}", created.text());

    let (referenced, expiring): (i32, bool) = sqlx::query_as(
        "SELECT referenced_count, expires_at IS NOT NULL FROM uploads WHERE id = $1",
    )
    .bind(uuid::Uuid::parse_str(&upload).unwrap())
    .fetch_one(&app.pool)
    .await
    .unwrap();
    assert_eq!((referenced, expiring), (0, true), "claim must roll back");
}

/// `(referenced_count, live blocks holding it)` for one upload.
async fn refs_and_blocks(app: &TestApp, upload: &str) -> (i32, i64) {
    sqlx::query_as(
        "SELECT u.referenced_count,
                (SELECT count(*) FROM blocks b WHERE b.content->>'file_key' = u.key)
         FROM uploads u WHERE u.id = $1",
    )
    .bind(uuid::Uuid::parse_str(upload).unwrap())
    .fetch_one(&app.pool)
    .await
    .unwrap()
}

async fn activity_in(app: &TestApp, session: &MintedSession, chapter: uuid::Uuid) -> String {
    let created = app
        .post_as(
            session,
            &format!("/api/v2/chapters/{chapter}/activities"),
            &serde_json::json!({ "name": "Page", "activity_type": "dynamic",
                                  "activity_sub_type": "dynamic_page" }),
        )
        .await;
    created.json()["id"].as_str().unwrap().to_owned()
}

async fn block(app: &TestApp, session: &MintedSession, activity: &str, upload: &str) -> String {
    let created = app
        .post_as(
            session,
            &format!("/api/v2/activities/{activity}/blocks"),
            &serde_json::json!({ "block_type": "image", "upload_id": upload }),
        )
        .await;
    assert_eq!(created.status, StatusCode::CREATED, "{}", created.text());
    created.json()["id"].as_str().unwrap().to_owned()
}

/// BUG-242: a block that commits while a chapter/course DELETE waits on its
/// activity is released by that DELETE — the cascade used to drop it after
/// the release had read its snapshot, pinning the upload forever.
#[sqlx::test(migrations = "../../migrations")]
async fn cascade_delete_releases_a_block_committed_under_it(pool: PgPool) {
    let app = TestApp::spawn(pool).await;
    let teacher = author(&app, "teacher").await;
    for target in ["chapters", "courses"] {
        let (course, activity) = scaffold_activity(&app, &teacher).await;
        let activity_id = uuid::Uuid::parse_str(&activity).unwrap();
        let chapter: uuid::Uuid =
            sqlx::query_scalar("SELECT chapter_id FROM activities WHERE id = $1")
                .bind(activity_id)
                .fetch_one(&app.pool)
                .await
                .unwrap();
        let upload = finalized_upload(&app, &teacher, "block-image", "image/png").await;

        // A block create in flight: row inserted + claim taken, not committed.
        let mut tx = app.pool.begin().await.unwrap();
        sqlx::query(
            "INSERT INTO blocks (activity_id, block_type, content)
             SELECT $1, 'image', jsonb_build_object('upload_id', id::text, 'file_key', key)
             FROM uploads WHERE id = $2",
        )
        .bind(activity_id)
        .bind(uuid::Uuid::parse_str(&upload).unwrap())
        .execute(&mut *tx)
        .await
        .unwrap();
        sqlx::query("UPDATE uploads SET referenced_count = 1, expires_at = NULL WHERE id = $1")
            .bind(uuid::Uuid::parse_str(&upload).unwrap())
            .execute(&mut *tx)
            .await
            .unwrap();
        let path = if target == "chapters" {
            format!("/api/v2/chapters/{chapter}")
        } else {
            format!("/api/v2/courses/{course}")
        };
        let delete = app.delete_as(&teacher, &path);
        let commit = async {
            tokio::time::sleep(std::time::Duration::from_millis(500)).await;
            tx.commit().await.unwrap();
        };
        let (deleted, ()) = tokio::join!(delete, commit);
        assert_eq!(deleted.status, StatusCode::NO_CONTENT, "{target}");
        assert_eq!(refs_and_blocks(&app, &upload).await, (0, 0), "{target}");
    }
}

/// BUG-243/244: an upload shared by two blocks. A block POST reusing it ∥
/// the activity DELETE never deadlocks (one lock order: activity, then
/// upload); a block DELETE ×2 or ∥ the activity DELETE releases only the
/// block rows actually deleted — the count always equals the live blocks.
#[sqlx::test(migrations = "../../migrations")]
async fn concurrent_block_writes_keep_the_reference_count(pool: PgPool) {
    let app = TestApp::spawn(pool).await;
    let teacher = author(&app, "teacher").await;
    let (_, first) = scaffold_activity(&app, &teacher).await;
    let chapter: uuid::Uuid = sqlx::query_scalar("SELECT chapter_id FROM activities WHERE id = $1")
        .bind(uuid::Uuid::parse_str(&first).unwrap())
        .fetch_one(&app.pool)
        .await
        .unwrap();
    for round in 0..6 {
        let a1 = activity_in(&app, &teacher, chapter).await;
        let a2 = activity_in(&app, &teacher, chapter).await;
        let upload = finalized_upload(&app, &teacher, "block-image", "image/png").await;
        let b1 = block(&app, &teacher, &a1, &upload).await;
        block(&app, &teacher, &a2, &upload).await;

        let blocks_path = format!("/api/v2/activities/{a1}/blocks");
        let activity_path = format!("/api/v2/activities/{a1}");
        let block_path = format!("/api/v2/blocks/{b1}");
        let body = serde_json::json!({ "block_type": "image", "upload_id": upload });
        let (x, y) = match round % 3 {
            0 => {
                let (x, y) = tokio::join!(
                    app.post_as(&teacher, &blocks_path, &body),
                    app.delete_as(&teacher, &activity_path)
                );
                (x.status, y.status)
            }
            1 => {
                let (x, y) = tokio::join!(
                    app.delete_as(&teacher, &block_path),
                    app.delete_as(&teacher, &block_path)
                );
                (x.status, y.status)
            }
            _ => {
                let (x, y) = tokio::join!(
                    app.delete_as(&teacher, &block_path),
                    app.delete_as(&teacher, &activity_path)
                );
                (x.status, y.status)
            }
        };
        assert!(
            !x.is_server_error() && !y.is_server_error(),
            "round {round}: {x} {y}"
        );
        let (referenced, live) = refs_and_blocks(&app, &upload).await;
        assert_eq!(i64::from(referenced), live, "round {round}");
        assert_eq!(live, 1, "round {round}: B2 survives");
    }
}
