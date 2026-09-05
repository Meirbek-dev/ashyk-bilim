//! File submissions end to end: authoring + publish gate, a learner's
//! attempt built from real uploads (presigned PUT, finalize, attach),
//! mime/size/count policy, submit under `If-Match`, the grader's queue and
//! grade (redacted for the learner until published), signed downloads,
//! CSV export, the attempt cap, and late handling.
#![allow(clippy::unwrap_used, clippy::expect_used, clippy::panic)]

use ab_testkit::{MintedSession, TestApp};
use axum::body::Body;
use axum::http::{Request, StatusCode, header};
use sqlx::PgPool;

async fn instructor(app: &TestApp, name: &str) -> MintedSession {
    let user = app
        .create_user(name, &format!("{name}@example.com"), &["instructor"])
        .await;
    app.mint_session_for(
        user,
        &[
            "course:create:platform",
            "course:read:all",
            "course:update:own",
            "assessment:*:own",
        ],
    )
    .await
}

async fn learner(app: &TestApp, name: &str) -> MintedSession {
    let user = app
        .create_user(name, &format!("{name}@example.com"), &["user"])
        .await;
    app.mint_session_for(
        user,
        &[
            "assessment:submit:assigned",
            "assessment:read:assigned",
            "file:create:own",
        ],
    )
    .await
}

fn now_unix() -> i64 {
    i64::try_from(
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_secs(),
    )
    .unwrap()
}

/// Public course + chapter; returns (course_id, chapter_id).
async fn public_course(app: &TestApp, teacher: &MintedSession) -> (String, String) {
    let course = app
        .post_as(
            teacher,
            "/api/v2/courses",
            &serde_json::json!({ "name": "Files 101" }),
        )
        .await;
    let course_id = course.json()["id"].as_str().unwrap().to_owned();
    app.post_as(
        teacher,
        &format!("/api/v2/courses/{course_id}/lifecycle"),
        &serde_json::json!({ "action": "publish" }),
    )
    .await;
    let chapter = app
        .post_as(
            teacher,
            &format!("/api/v2/courses/{course_id}/chapters"),
            &serde_json::json!({ "name": "Week 1" }),
        )
        .await;
    (course_id, chapter.json()["id"].as_str().unwrap().to_owned())
}

/// Create + publish a file submission with the given extra config.
async fn published_activity(
    app: &TestApp,
    teacher: &MintedSession,
    chapter_id: &str,
    extra: serde_json::Value,
) -> String {
    let mut body = serde_json::json!({
        "chapter_id": chapter_id, "title": "Essay PDF",
        "instructions": "Upload your essay as a PDF.",
    });
    for (k, v) in extra.as_object().unwrap() {
        body[k] = v.clone();
    }
    let created = app
        .post_as(teacher, "/api/v2/file-submissions", &body)
        .await;
    assert_eq!(created.status, StatusCode::CREATED, "{}", created.text());
    let id = created.json()["id"].as_str().unwrap().to_owned();
    let published = app
        .post_as(
            teacher,
            &format!("/api/v2/file-submissions/{id}/publish"),
            &serde_json::json!({}),
        )
        .await;
    assert_eq!(published.status, StatusCode::OK, "{}", published.text());
    assert_eq!(published.json()["lifecycle"], "published");
    assert_eq!(published.json()["published"], true);
    id
}

/// The browser's part of an upload: create, PUT to storage, finalize.
async fn finalized_upload(
    app: &TestApp,
    session: &MintedSession,
    mime: &str,
    payload: &[u8],
) -> String {
    let created = app
        .post_as(
            session,
            "/api/v2/uploads",
            &serde_json::json!({ "purpose": "file-submission", "mime": mime,
                                  "size_bytes": payload.len() }),
        )
        .await;
    assert_eq!(created.status, StatusCode::OK, "{}", created.text());
    let id = created.json()["id"].as_str().unwrap().to_owned();
    let put_url = created.json()["put_url"].as_str().unwrap().to_owned();
    let put = reqwest::Client::new()
        .put(&put_url)
        .body(payload.to_vec())
        .send()
        .await
        .unwrap();
    assert!(put.status().is_success(), "presigned PUT: {}", put.status());
    let finalized = app
        .post_as(
            session,
            &format!("/api/v2/uploads/{id}/finalize"),
            &serde_json::json!({}),
        )
        .await;
    assert_eq!(finalized.status, StatusCode::OK, "{}", finalized.text());
    id
}

fn with_if_match(
    session: &MintedSession,
    method: &str,
    uri: String,
    if_match: Option<&str>,
    body: &serde_json::Value,
) -> Request<Body> {
    let mut builder = Request::builder()
        .method(method)
        .uri(uri)
        .header(header::CONTENT_TYPE, "application/json")
        .header(header::COOKIE, &session.cookie);
    if let Some(version) = if_match {
        builder = builder.header(header::IF_MATCH, version);
    }
    builder.body(Body::from(body.to_string())).unwrap()
}

async fn referenced_count(app: &TestApp, upload_id: &str) -> i32 {
    sqlx::query_scalar("SELECT referenced_count FROM uploads WHERE id = $1")
        .bind(uuid::Uuid::parse_str(upload_id).unwrap())
        .fetch_one(&app.pool)
        .await
        .unwrap()
}

#[sqlx::test(migrations = "../../migrations")]
async fn author_attempt_grade_and_download(pool: PgPool) {
    let app = TestApp::spawn(pool).await;
    let teacher = instructor(&app, "teacher").await;
    let (_course_id, chapter_id) = public_course(&app, &teacher).await;
    let alice = learner(&app, "alice").await;
    let mallory = learner(&app, "mallory").await;

    // A draft activity is invisible to learners until published.
    let created = app
        .post_as(
            &teacher,
            "/api/v2/file-submissions",
            &serde_json::json!({ "chapter_id": chapter_id, "title": "Essay PDF" }),
        )
        .await;
    assert_eq!(created.status, StatusCode::CREATED, "{}", created.text());
    let id = created.json()["id"].as_str().unwrap().to_owned();
    assert_eq!(created.json()["lifecycle"], "draft");
    assert_eq!(created.json()["max_files"], 1);
    assert_eq!(
        app.get_as(&alice, &format!("/api/v2/file-submissions/{id}"))
            .await
            .status,
        StatusCode::NOT_FOUND
    );
    // Publishing needs instructions.
    let refused = app
        .post_as(
            &teacher,
            &format!("/api/v2/file-submissions/{id}/publish"),
            &serde_json::json!({}),
        )
        .await;
    assert_eq!(refused.status, StatusCode::UNPROCESSABLE_ENTITY);
    assert_eq!(refused.json()["field_errors"][0]["field"], "instructions");
    let patched = app
        .patch_as(
            &teacher,
            &format!("/api/v2/file-submissions/{id}"),
            &serde_json::json!({
                "instructions": "Upload your essay as a PDF.",
                "allowed_mime_types": ["Application/PDF"], "max_files": 2,
                "max_file_size_mb": 1, "max_attempts": 1,
                "due_at_unix": now_unix() + 3600,
            }),
        )
        .await;
    assert_eq!(patched.status, StatusCode::OK, "{}", patched.text());
    assert_eq!(patched.json()["allowed_mime_types"][0], "application/pdf");
    let out_of_range = app
        .patch_as(
            &teacher,
            &format!("/api/v2/file-submissions/{id}"),
            &serde_json::json!({ "max_files": 99 }),
        )
        .await;
    assert_eq!(out_of_range.status, StatusCode::UNPROCESSABLE_ENTITY);
    let published = app
        .post_as(
            &teacher,
            &format!("/api/v2/file-submissions/{id}/publish"),
            &serde_json::json!({}),
        )
        .await;
    assert_eq!(published.status, StatusCode::OK, "{}", published.text());
    let seen = app
        .get_as(&alice, &format!("/api/v2/file-submissions/{id}"))
        .await;
    assert_eq!(seen.status, StatusCode::OK, "{}", seen.text());
    assert!(seen.json()["current_attempt"].is_null());
    let activity_id = seen.json()["activity_id"].as_str().unwrap().to_owned();
    assert_eq!(
        app.get_as(
            &alice,
            &format!("/api/v2/activities/{activity_id}/file-submission")
        )
        .await
        .json()["id"],
        id.as_str()
    );

    // No draft yet → 404; opening one → 201, again → 200 (same attempt).
    assert_eq!(
        app.get_as(&alice, &format!("/api/v2/file-submissions/{id}/draft"))
            .await
            .status,
        StatusCode::NOT_FOUND
    );
    let opened = app
        .post_as(
            &alice,
            &format!("/api/v2/file-submissions/{id}/draft"),
            &serde_json::json!({}),
        )
        .await;
    assert_eq!(opened.status, StatusCode::CREATED, "{}", opened.text());
    let attempt_id = opened.json()["id"].as_str().unwrap().to_owned();
    assert_eq!(opened.json()["version"], 1);
    let reopened = app
        .post_as(
            &alice,
            &format!("/api/v2/file-submissions/{id}/draft"),
            &serde_json::json!({}),
        )
        .await;
    assert_eq!(reopened.status, StatusCode::OK);
    assert_eq!(reopened.json()["id"], attempt_id.as_str());

    // Policy: wrong mime, oversize, too many, someone else's upload.
    let pdf = b"%PDF-1.4 fake essay".to_vec();
    let pdf_upload = finalized_upload(&app, &alice, "application/pdf", &pdf).await;
    let png_upload = finalized_upload(&app, &alice, "image/png", b"png").await;
    let wrong_mime = app
        .patch_as(
            &alice,
            &format!("/api/v2/file-submissions/{id}/draft"),
            &serde_json::json!({ "files": [{ "upload_id": png_upload }] }),
        )
        .await;
    assert_eq!(wrong_mime.status, StatusCode::UNPROCESSABLE_ENTITY);
    assert_eq!(wrong_mime.json()["details"]["content_type"], "image/png");
    let big = vec![b'x'; 1024 * 1024 + 1];
    let big_upload = finalized_upload(&app, &alice, "application/pdf", &big).await;
    let oversize = app
        .patch_as(
            &alice,
            &format!("/api/v2/file-submissions/{id}/draft"),
            &serde_json::json!({ "files": [{ "upload_id": big_upload }] }),
        )
        .await;
    assert_eq!(oversize.status, StatusCode::PAYLOAD_TOO_LARGE);
    let too_many = app
        .patch_as(
            &alice,
            &format!("/api/v2/file-submissions/{id}/draft"),
            &serde_json::json!({ "files": [
                { "upload_id": pdf_upload }, { "upload_id": png_upload },
                { "upload_id": big_upload }
            ] }),
        )
        .await;
    assert_eq!(too_many.status, StatusCode::UNPROCESSABLE_ENTITY);
    let foreign = app
        .patch_as(
            &mallory,
            &format!("/api/v2/file-submissions/{id}/draft"),
            &serde_json::json!({ "files": [{ "upload_id": pdf_upload }] }),
        )
        .await;
    assert_eq!(foreign.status, StatusCode::UNPROCESSABLE_ENTITY);
    assert_eq!(
        foreign.json()["field_errors"][0]["code"],
        "upload-not-ready"
    );

    // Attach the PDF: the version moves, the upload is now referenced.
    let saved = app
        .patch_as(
            &alice,
            &format!("/api/v2/file-submissions/{id}/draft"),
            &serde_json::json!({ "files": [
                { "upload_id": pdf_upload, "display_name": "essay.pdf" }
            ] }),
        )
        .await;
    assert_eq!(saved.status, StatusCode::OK, "{}", saved.text());
    assert_eq!(saved.json()["version"], 2);
    assert_eq!(saved.json()["files"][0]["filename"], "essay.pdf");
    let file_id = saved.json()["files"][0]["id"].as_str().unwrap().to_owned();
    assert_eq!(referenced_count(&app, &pdf_upload).await, 1);

    // Submit: stale If-Match → 412; then it lands on time.
    let stale = app
        .send(with_if_match(
            &alice,
            "POST",
            format!("/api/v2/file-submissions/{id}/submit"),
            Some("1"),
            &serde_json::json!({}),
        ))
        .await;
    assert_eq!(
        stale.status,
        StatusCode::PRECONDITION_FAILED,
        "{}",
        stale.text()
    );
    assert_eq!(stale.json()["details"]["actual"], 2);
    let submitted = app
        .send(with_if_match(
            &alice,
            "POST",
            format!("/api/v2/file-submissions/{id}/submit"),
            Some("2"),
            &serde_json::json!({}),
        ))
        .await;
    assert_eq!(submitted.status, StatusCode::OK, "{}", submitted.text());
    assert_eq!(submitted.json()["status"], "submitted");
    assert_eq!(submitted.json()["is_late"], false);
    assert_eq!(submitted.json()["version"], 3);
    // Only one attempt allowed: no new draft.
    let capped = app
        .post_as(
            &alice,
            &format!("/api/v2/file-submissions/{id}/draft"),
            &serde_json::json!({}),
        )
        .await;
    assert_eq!(capped.status, StatusCode::CONFLICT, "{}", capped.text());
    assert_eq!(capped.json()["details"]["max_attempts"], 1);

    // Teacher surface: queue, attempt view, grade under the lock.
    assert_eq!(
        app.get_as(
            &alice,
            &format!("/api/v2/file-submissions/{id}/submissions")
        )
        .await
        .status,
        StatusCode::FORBIDDEN
    );
    let queue = app
        .get_as(
            &teacher,
            &format!("/api/v2/file-submissions/{id}/submissions?status=submitted"),
        )
        .await;
    assert_eq!(queue.status, StatusCode::OK, "{}", queue.text());
    assert_eq!(queue.json()["items"].as_array().unwrap().len(), 1);
    assert_eq!(queue.json()["items"][0]["user"]["username"], "alice");
    assert_eq!(queue.json()["items"][0]["file_count"], 1);
    let none = app
        .get_as(
            &teacher,
            &format!("/api/v2/file-submissions/{id}/submissions?search=zzz"),
        )
        .await;
    assert_eq!(none.json()["items"].as_array().unwrap().len(), 0);
    let grader_view = app
        .get_as(
            &teacher,
            &format!("/api/v2/file-submission-attempts/{attempt_id}"),
        )
        .await;
    assert_eq!(grader_view.status, StatusCode::OK, "{}", grader_view.text());
    assert_eq!(grader_view.json()["user"]["username"], "alice");
    assert_eq!(
        app.get_as(
            &mallory,
            &format!("/api/v2/file-submission-attempts/{attempt_id}")
        )
        .await
        .status,
        StatusCode::NOT_FOUND
    );
    let no_score = app
        .send(with_if_match(
            &teacher,
            "PATCH",
            format!("/api/v2/file-submission-attempts/{attempt_id}/grade"),
            Some("3"),
            &serde_json::json!({ "action": "save" }),
        ))
        .await;
    assert_eq!(no_score.status, StatusCode::UNPROCESSABLE_ENTITY);
    let no_lock = app
        .patch_as(
            &teacher,
            &format!("/api/v2/file-submission-attempts/{attempt_id}/grade"),
            &serde_json::json!({ "action": "save", "final_score": 90 }),
        )
        .await;
    assert_eq!(no_lock.status, StatusCode::UNPROCESSABLE_ENTITY);
    let saved_grade = app
        .send(with_if_match(
            &teacher,
            "PATCH",
            format!("/api/v2/file-submission-attempts/{attempt_id}/grade"),
            Some("3"),
            &serde_json::json!({ "action": "save", "final_score": 90,
                                  "feedback": "Solid.", "rubric_scores": { "clarity": 9 } }),
        ))
        .await;
    assert_eq!(saved_grade.status, StatusCode::OK, "{}", saved_grade.text());
    assert_eq!(saved_grade.json()["status"], "graded");
    assert_eq!(saved_grade.json()["final_score"], 90.0);
    // The learner sees nothing until publication.
    let hidden = app
        .get_as(
            &alice,
            &format!("/api/v2/file-submission-attempts/{attempt_id}"),
        )
        .await;
    assert_eq!(hidden.json()["status"], "graded");
    assert!(hidden.json()["final_score"].is_null());
    assert!(hidden.json()["feedback"].is_null());
    let stale_grade = app
        .send(with_if_match(
            &teacher,
            "PATCH",
            format!("/api/v2/file-submission-attempts/{attempt_id}/grade"),
            Some("3"),
            &serde_json::json!({ "action": "publish", "final_score": 90 }),
        ))
        .await;
    assert_eq!(stale_grade.status, StatusCode::PRECONDITION_FAILED);
    let published_grade = app
        .send(with_if_match(
            &teacher,
            "PATCH",
            format!("/api/v2/file-submission-attempts/{attempt_id}/grade"),
            Some("4"),
            &serde_json::json!({ "action": "publish", "final_score": 90,
                                  "feedback": "Solid." }),
        ))
        .await;
    assert_eq!(
        published_grade.status,
        StatusCode::OK,
        "{}",
        published_grade.text()
    );
    let visible = app
        .get_as(&alice, &format!("/api/v2/file-submissions/{id}/me"))
        .await;
    assert_eq!(visible.json()[0]["status"], "published");
    assert_eq!(visible.json()[0]["final_score"], 90.0);
    assert_eq!(visible.json()[0]["feedback"], "Solid.");
    assert_eq!(visible.json()[0]["rubric_scores"]["clarity"], 9);

    // Downloads: owner and grader get a working signed URL; others 404.
    for session in [&alice, &teacher] {
        let signed = app
            .get_as(
                session,
                &format!("/api/v2/file-submission-files/{file_id}/url"),
            )
            .await;
        assert_eq!(signed.status, StatusCode::OK, "{}", signed.text());
        assert_eq!(signed.json()["filename"], "essay.pdf");
        let url = signed.json()["url"].as_str().unwrap().to_owned();
        let fetched = reqwest::get(url).await.unwrap();
        assert_eq!(fetched.bytes().await.unwrap().to_vec(), pdf);
    }
    assert_eq!(
        app.get_as(
            &mallory,
            &format!("/api/v2/file-submission-files/{file_id}/url")
        )
        .await
        .status,
        StatusCode::NOT_FOUND
    );

    // CSV export.
    let csv = app
        .get_as(
            &teacher,
            &format!("/api/v2/file-submissions/{id}/submissions/export"),
        )
        .await;
    assert_eq!(csv.status, StatusCode::OK);
    assert!(csv.content_type().starts_with("text/csv"));
    let text = csv.text();
    assert!(
        text.starts_with("attempt_id,student,email,status"),
        "{text}"
    );
    assert!(text.contains("alice@example.com,published,1,"), "{text}");
}

#[sqlx::test(migrations = "../../migrations")]
async fn late_work_is_refused_or_penalised_by_policy(pool: PgPool) {
    let app = TestApp::spawn(pool).await;
    let teacher = instructor(&app, "teacher").await;
    let (_course_id, chapter_id) = public_course(&app, &teacher).await;
    let alice = learner(&app, "alice").await;
    let pdf_upload = finalized_upload(&app, &alice, "application/pdf", b"%PDF late").await;

    // Closed: past due, no late work.
    let closed = published_activity(
        &app,
        &teacher,
        &chapter_id,
        serde_json::json!({ "due_at_unix": now_unix() - 60, "allow_late": false }),
    )
    .await;
    let refused = app
        .post_as(
            &alice,
            &format!("/api/v2/file-submissions/{closed}/submit"),
            &serde_json::json!({ "files": [{ "upload_id": pdf_upload }] }),
        )
        .await;
    assert_eq!(refused.status, StatusCode::CONFLICT, "{}", refused.text());
    // Nothing attached is a validation error even when open.
    let empty_target = published_activity(&app, &teacher, &chapter_id, serde_json::json!({})).await;
    let empty = app
        .post_as(
            &alice,
            &format!("/api/v2/file-submissions/{empty_target}/submit"),
            &serde_json::json!({}),
        )
        .await;
    assert_eq!(
        empty.status,
        StatusCode::UNPROCESSABLE_ENTITY,
        "{}",
        empty.text()
    );
    assert_eq!(empty.json()["field_errors"][0]["field"], "files");

    // Penalised: 10%/day, two days late (capped at 5 days).
    let penalised = published_activity(
        &app,
        &teacher,
        &chapter_id,
        serde_json::json!({
            "due_at_unix": now_unix() - 2 * 86_400 - 60, "allow_late": true,
            "late_policy": { "kind": "penalty", "percent_per_day": 10, "max_days": 5 },
        }),
    )
    .await;
    let submitted = app
        .post_as(
            &alice,
            &format!("/api/v2/file-submissions/{penalised}/submit"),
            &serde_json::json!({ "files": [{ "upload_id": pdf_upload }] }),
        )
        .await;
    assert_eq!(submitted.status, StatusCode::OK, "{}", submitted.text());
    assert_eq!(submitted.json()["status"], "submitted");
    assert_eq!(submitted.json()["is_late"], true);
    assert_eq!(submitted.json()["late_penalty_pct"], 30.0);
    // The same upload is now referenced by two attempts.
    assert_eq!(referenced_count(&app, &pdf_upload).await, 2);
}
