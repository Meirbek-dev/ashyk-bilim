//! Certifications end to end: template authoring gates, automatic issuance
//! when the canonical progress completes, the learner's certificate lists,
//! the learner-state certificate block, public verification, and cascade on
//! template deletion.
#![allow(clippy::unwrap_used, clippy::expect_used, clippy::panic)]

use ab_testkit::{MintedSession, TestApp};
use axum::http::StatusCode;
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
            "certificate:create:platform",
            "certificate:read:own",
            "certificate:update:own",
            "certificate:delete:own",
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
            "certificate:read:own",
            "trail:read:all",
            "trail:submit:assigned",
        ],
    )
    .await
}

/// Public course with one published lesson; returns (course_id, activity_id).
async fn course_with_lesson(app: &TestApp, teacher: &MintedSession) -> (String, String) {
    let course = app
        .post_as(
            teacher,
            "/api/v2/courses",
            &serde_json::json!({ "name": "Certified 101" }),
        )
        .await;
    let course_id = course.json()["id"].as_str().unwrap().to_owned();
    app.publish_course(&course_id).await;
    let chapter = app
        .post_as(
            teacher,
            &format!("/api/v2/courses/{course_id}/chapters"),
            &serde_json::json!({ "name": "Week 1" }),
        )
        .await;
    let chapter_id = chapter.json()["id"].as_str().unwrap().to_owned();
    let activity = app
        .post_as(
            teacher,
            &format!("/api/v2/chapters/{chapter_id}/activities"),
            &serde_json::json!({ "name": "Intro", "activity_type": "dynamic",
                                  "activity_sub_type": "dynamic_page" }),
        )
        .await;
    let activity_id = activity.json()["id"].as_str().unwrap().to_owned();
    app.patch_as(
        teacher,
        &format!("/api/v2/activities/{activity_id}"),
        &serde_json::json!({ "published": true }),
    )
    .await;
    (course_id, activity_id)
}

#[sqlx::test(migrations = "../../migrations")]
async fn template_issuance_verification_and_cascade(pool: PgPool) {
    let app = TestApp::spawn(pool).await;
    let teacher = instructor(&app, "teacher").await;
    let (course_id, activity_id) = course_with_lesson(&app, &teacher).await;
    let alice = learner(&app, "alice").await;

    // Authoring: a learner cannot create; the creator can; config must be an object.
    assert_eq!(
        app.post_as(
            &alice,
            "/api/v2/certifications",
            &serde_json::json!({ "course_id": course_id, "config": {} })
        )
        .await
        .status,
        StatusCode::FORBIDDEN
    );
    // …with no NUL in a key (BUG-223), and at most 16 KiB (BUG-224 nit).
    for bad in [
        serde_json::json!([1, 2]),
        serde_json::json!({ "a\u{0}b": 1 }),
        serde_json::json!({ "name": "x".repeat(20_000) }),
    ] {
        let res = app
            .post_as(
                &teacher,
                "/api/v2/certifications",
                &serde_json::json!({ "course_id": course_id, "config": bad }),
            )
            .await;
        assert_eq!(
            res.status,
            StatusCode::UNPROCESSABLE_ENTITY,
            "{}",
            res.text()
        );
    }
    let created = app
        .post_as(
            &teacher,
            "/api/v2/certifications",
            &serde_json::json!({ "course_id": course_id,
                                  "config": { "template": "classic", "title": "Certified" } }),
        )
        .await;
    assert_eq!(created.status, StatusCode::CREATED, "{}", created.text());
    let certification_id = created.json()["id"].as_str().unwrap().to_owned();
    assert_eq!(created.json()["config"]["template"], "classic");
    // Templates are for authors, not learners.
    assert_eq!(
        app.get_as(
            &alice,
            &format!("/api/v2/certifications/{certification_id}")
        )
        .await
        .status,
        StatusCode::FORBIDDEN
    );
    let listed = app
        .get_as(
            &teacher,
            &format!("/api/v2/courses/{course_id}/certifications"),
        )
        .await;
    assert_eq!(listed.json().as_array().unwrap().len(), 1);

    // Nothing issued yet; the learner state knows the course certifies.
    let none = app
        .get_as(
            &alice,
            &format!("/api/v2/courses/{course_id}/certificates/me"),
        )
        .await;
    assert_eq!(none.status, StatusCode::OK, "{}", none.text());
    assert!(none.json().as_array().unwrap().is_empty());
    let state = app
        .get_as(
            &alice,
            &format!("/api/v2/courses/{course_id}/learner-state"),
        )
        .await;
    assert_eq!(state.json()["certificate"]["configured"], true);
    assert_eq!(state.json()["certificate"]["issued"], false);

    // Completing the only lesson issues the certificate automatically.
    let done = app
        .post_as(
            &alice,
            &format!("/api/v2/trail/activities/{activity_id}"),
            &serde_json::json!({}),
        )
        .await;
    assert_eq!(done.status, StatusCode::OK, "{}", done.text());
    let mine = app
        .get_as(
            &alice,
            &format!("/api/v2/courses/{course_id}/certificates/me"),
        )
        .await;
    assert_eq!(mine.status, StatusCode::OK, "{}", mine.text());
    let items = mine.json().as_array().unwrap().clone();
    assert_eq!(items.len(), 1);
    let code = items[0]["certificate"]["verify_code"]
        .as_str()
        .unwrap()
        .to_owned();
    assert_eq!(code.len(), 19);
    assert_eq!(items[0]["certification"]["id"], certification_id.as_str());
    assert_eq!(items[0]["course"]["name"], "Certified 101");
    // UX-131: no `certificate_instructor` in the config -> the creator's
    // display name, as the PDF prints it.
    assert_eq!(items[0]["instructor_name"], "teacher");
    let all = app.get_as(&alice, "/api/v2/me/certificates").await;
    assert_eq!(all.json().as_array().unwrap().len(), 1);
    let state = app
        .get_as(
            &alice,
            &format!("/api/v2/courses/{course_id}/learner-state"),
        )
        .await;
    assert_eq!(state.json()["certificate"]["issued"], true);
    assert_eq!(state.json()["certificate"]["verify_code"], code.as_str());
    assert_eq!(
        state.json()["certificate"]["href"],
        format!("/certificates/{code}/verify")
    );
    assert_eq!(state.json()["next_action"]["id"], "view_certificate");
    // Idempotent: a second look does not issue twice.
    let again = app
        .get_as(
            &alice,
            &format!("/api/v2/courses/{course_id}/certificates/me"),
        )
        .await;
    assert_eq!(again.json().as_array().unwrap().len(), 1);

    // Public verification, no session.
    let verified = app.get(&format!("/api/v2/certificates/{code}")).await;
    assert_eq!(verified.status, StatusCode::OK, "{}", verified.text());
    assert_eq!(verified.json()["course"]["name"], "Certified 101");
    assert_eq!(verified.json()["holder"]["display_name"], "alice");
    assert_eq!(verified.json()["instructor_name"], "teacher");
    assert_eq!(verified.json()["certificate"]["verify_code"], code.as_str());
    // BUG-116: the holder's identity stays private.
    assert!(verified.json()["holder"].get("username").is_none());
    assert!(verified.json()["holder"].get("email").is_none());
    assert!(verified.json()["certificate"].get("user_id").is_none());
    // BUG-137: nor the course's author ids.
    assert!(verified.json()["course"]["creator_id"].is_null());
    assert_eq!(
        verified.json()["course"]["contributor_ids"],
        serde_json::json!([])
    );
    // BUG-116: codes are case-insensitive and the dashes are optional.
    let sloppy = code.to_lowercase().replace('-', "");
    let relaxed = app.get(&format!("/api/v2/certificates/{sloppy}")).await;
    assert_eq!(relaxed.status, StatusCode::OK, "{}", relaxed.text());
    assert_eq!(relaxed.json()["certificate"]["verify_code"], code.as_str());
    // ETL-migrated legacy codes keep their own dash layout and still verify,
    // typed as printed or compacted.
    sqlx::query("UPDATE certificate_users SET verify_code = 'F2-20260110-D4HG-027532' WHERE verify_code = $1")
        .bind(&code)
        .execute(&app.pool)
        .await
        .unwrap();
    for typed in ["F2-20260110-D4HG-027532", "f220260110d4hg027532"] {
        let legacy = app.get(&format!("/api/v2/certificates/{typed}")).await;
        assert_eq!(legacy.status, StatusCode::OK, "{typed}: {}", legacy.text());
    }
    sqlx::query("UPDATE certificate_users SET verify_code = $1 WHERE verify_code = 'F2-20260110-D4HG-027532'")
        .bind(&code)
        .execute(&app.pool)
        .await
        .unwrap();
    assert_eq!(
        app.get("/api/v2/certificates/NOPE-NOPE-NOPE-NOPE")
            .await
            .status,
        StatusCode::NOT_FOUND
    );

    // The PDF, public by code: a real PDF with an embedded font, in the
    // language of `Accept-Language`.
    let pdf = app
        .send(
            axum::http::Request::builder()
                .uri(format!("/api/v2/certificates/{code}/pdf"))
                .header(axum::http::header::ACCEPT_LANGUAGE, "kk-KZ, ru;q=0.8")
                .body(axum::body::Body::empty())
                .unwrap(),
        )
        .await;
    assert_eq!(pdf.status, StatusCode::OK, "{}", pdf.text());
    assert_eq!(pdf.content_type(), "application/pdf");
    assert_eq!(
        pdf.headers[axum::http::header::CONTENT_DISPOSITION],
        format!("attachment; filename=\"certificate-{code}.pdf\"")
    );
    let bytes = pdf.bytes();
    assert!(bytes.starts_with(b"%PDF-"), "not a PDF");
    assert!(bytes.len() > 4_000);
    let text = String::from_utf8_lossy(bytes);
    assert!(text.contains("/FontFile2"), "font not embedded");
    // UX-039: the verify link carries the PDF's locale prefix.
    assert!(
        text.contains(&format!("/kz/certificates/{code}/verify")),
        "verify link is locale-prefixed"
    );
    assert_eq!(
        app.get("/api/v2/certificates/NOPE-NOPE-NOPE-NOPE/pdf")
            .await
            .status,
        StatusCode::NOT_FOUND
    );

    // Template edits and deletion (cascades to issued certificates).
    let updated = app
        .patch_as(
            &teacher,
            &format!("/api/v2/certifications/{certification_id}"),
            &serde_json::json!({ "config": { "template": "modern",
                                  "certificate_instructor": " Dr. Who " } }),
        )
        .await;
    assert_eq!(updated.status, StatusCode::OK, "{}", updated.text());
    assert_eq!(updated.json()["config"]["template"], "modern");
    // The config's instructor wins, trimmed.
    assert_eq!(
        app.get(&format!("/api/v2/certificates/{code}"))
            .await
            .json()["instructor_name"],
        "Dr. Who"
    );
    assert_eq!(
        app.delete_as(
            &alice,
            &format!("/api/v2/certifications/{certification_id}")
        )
        .await
        .status,
        StatusCode::FORBIDDEN
    );
    assert_eq!(
        app.delete_as(
            &teacher,
            &format!("/api/v2/certifications/{certification_id}")
        )
        .await
        .status,
        StatusCode::NO_CONTENT
    );
    assert_eq!(
        app.get(&format!("/api/v2/certificates/{code}"))
            .await
            .status,
        StatusCode::NOT_FOUND
    );
    let state = app
        .get_as(
            &alice,
            &format!("/api/v2/courses/{course_id}/learner-state"),
        )
        .await;
    assert_eq!(state.json()["certificate"]["configured"], false);
}
