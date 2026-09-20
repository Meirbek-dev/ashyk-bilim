//! Assessment access: cohort-only courses, restricted allowlists (users +
//! groups) with eligibility validation, per-student overrides, and the
//! student-facing attempt state.
#![allow(clippy::unwrap_used, clippy::expect_used, clippy::panic)]

use ab_core::id::UserId;
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
            "assessment:*:own",
            "usergroup:create:platform",
            "usergroup:read:platform",
        ],
    )
    .await
}

async fn learner(app: &TestApp, name: &str) -> (UserId, MintedSession) {
    let user = app
        .create_user(name, &format!("{name}@example.com"), &["user"])
        .await;
    let session = app
        .mint_session_for(
            user,
            &["assessment:submit:assigned", "assessment:read:assigned"],
        )
        .await;
    (user, session)
}

/// A PRIVATE course with one published quiz; returns (course, assessment).
async fn private_course_with_quiz(app: &TestApp, teacher: &MintedSession) -> (String, String) {
    let course = app
        .post_as(
            teacher,
            "/api/v2/courses",
            &serde_json::json!({ "name": "Cohort-only" }),
        )
        .await;
    let course_id = course.json()["id"].as_str().unwrap().to_owned();
    let chapter = app
        .post_as(
            teacher,
            &format!("/api/v2/courses/{course_id}/chapters"),
            &serde_json::json!({ "name": "Week 1" }),
        )
        .await;
    let chapter_id = chapter.json()["id"].as_str().unwrap().to_owned();
    let created = app
        .post_as(
            teacher,
            "/api/v2/assessments",
            &serde_json::json!({ "chapter_id": chapter_id, "kind": "quiz", "title": "Q" }),
        )
        .await;
    let id = created.json()["id"].as_str().unwrap().to_owned();
    app.post_as(
        teacher,
        &format!("/api/v2/assessments/{id}/items"),
        &serde_json::json!({
            "title": "1+1?", "max_score": 5,
            "body": { "kind": "choice", "prompt": "1+1?",
                      "options": [{ "id": "a", "text": "2", "is_correct": true },
                                  { "id": "b", "text": "3", "is_correct": false }] }
        }),
    )
    .await;
    let published = app
        .post_as(
            teacher,
            &format!("/api/v2/assessments/{id}/lifecycle"),
            &serde_json::json!({ "to": "published" }),
        )
        .await;
    assert_eq!(published.status, StatusCode::OK, "{}", published.text());
    (course_id, id)
}

#[sqlx::test(migrations = "../../migrations")]
async fn cohorts_allowlists_and_attempt_state(pool: PgPool) {
    let app = TestApp::spawn(pool).await;
    let teacher = instructor(&app, "teacher").await;
    let (course_id, id) = private_course_with_quiz(&app, &teacher).await;
    let (alice, alice_session) = learner(&app, "alice").await;
    let (bob, bob_session) = learner(&app, "bob").await;

    // Cohort: a usergroup linked to the course, with Alice in it.
    let group = app
        .post_as(
            &teacher,
            "/api/v2/usergroups",
            &serde_json::json!({ "name": "Cohort A" }),
        )
        .await;
    let group_id = group.json()["id"].as_str().unwrap().to_owned();
    app.post_as(
        &teacher,
        &format!("/api/v2/usergroups/{group_id}/members"),
        &serde_json::json!({ "user_ids": [alice] }),
    )
    .await;
    app.post_as(
        &teacher,
        &format!("/api/v2/usergroups/{group_id}/courses"),
        &serde_json::json!({ "course_ids": [course_id] }),
    )
    .await;

    // Cohort membership makes the private course (and its quiz) visible to
    // Alice; Bob sees nothing.
    let listing = app.get_as(&alice_session, "/api/v2/courses").await;
    assert_eq!(listing.json()["items"].as_array().unwrap().len(), 1);
    let state = app
        .get_as(
            &alice_session,
            &format!("/api/v2/assessments/{id}/attempt-state"),
        )
        .await;
    assert_eq!(state.status, StatusCode::OK, "{}", state.text());
    assert_eq!(state.json()["can_start"], true);
    assert_eq!(state.json()["is_teacher_preview"], false);
    assert_eq!(state.json()["effective"]["override_applied"], false);
    let hidden = app
        .get_as(
            &bob_session,
            &format!("/api/v2/assessments/{id}/attempt-state"),
        )
        .await;
    assert_eq!(hidden.status, StatusCode::NOT_FOUND);

    // The teacher previews without an attempt cap.
    let preview = app
        .get_as(&teacher, &format!("/api/v2/assessments/{id}/attempt-state"))
        .await;
    assert_eq!(preview.json()["is_teacher_preview"], true);
    assert!(preview.json()["effective"]["max_attempts"].is_null());

    // Restricting to Bob is refused — he has no course access — and to an
    // unlinked group likewise.
    let other_group = app
        .post_as(
            &teacher,
            "/api/v2/usergroups",
            &serde_json::json!({ "name": "Elsewhere" }),
        )
        .await;
    let refused = app
        .send(
            axum::http::Request::builder()
                .method("PUT")
                .uri(format!("/api/v2/assessments/{id}/access"))
                .header(axum::http::header::CONTENT_TYPE, "application/json")
                .header(axum::http::header::COOKIE, &teacher.cookie)
                .body(axum::body::Body::from(
                    serde_json::json!({ "mode": "restricted", "user_ids": [bob],
                                        "usergroup_ids": [other_group.json()["id"]] })
                    .to_string(),
                ))
                .unwrap(),
        )
        .await;
    assert_eq!(refused.status, StatusCode::UNPROCESSABLE_ENTITY);
    let fields: Vec<_> = refused.json()["field_errors"]
        .as_array()
        .unwrap()
        .iter()
        .map(|e| e["field"].as_str().unwrap().to_owned())
        .collect();
    assert_eq!(
        fields,
        [
            format!("user_ids.{bob}"),
            format!(
                "usergroup_ids.{}",
                other_group.json()["id"].as_str().unwrap()
            )
        ]
    );

    // Restrict to nobody-but-a-second-cohort: Alice loses access.
    let cohort_b = app
        .post_as(
            &teacher,
            "/api/v2/usergroups",
            &serde_json::json!({ "name": "Cohort B" }),
        )
        .await;
    let cohort_b_id = cohort_b.json()["id"].as_str().unwrap().to_owned();
    app.post_as(
        &teacher,
        &format!("/api/v2/usergroups/{cohort_b_id}/courses"),
        &serde_json::json!({ "course_ids": [course_id] }),
    )
    .await;
    let restricted = app
        .send(
            axum::http::Request::builder()
                .method("PUT")
                .uri(format!("/api/v2/assessments/{id}/access"))
                .header(axum::http::header::CONTENT_TYPE, "application/json")
                .header(axum::http::header::COOKIE, &teacher.cookie)
                .body(axum::body::Body::from(
                    serde_json::json!({ "mode": "restricted", "usergroup_ids": [cohort_b_id] })
                        .to_string(),
                ))
                .unwrap(),
        )
        .await;
    assert_eq!(restricted.status, StatusCode::OK, "{}", restricted.text());
    assert_eq!(restricted.json()["effective_user_count"], 0);
    let blocked = app
        .get_as(
            &alice_session,
            &format!("/api/v2/assessments/{id}/attempt-state"),
        )
        .await;
    assert_eq!(blocked.status, StatusCode::FORBIDDEN);

    // Direct allowlisting of Alice restores it; the view reflects both lists.
    let direct = app
        .send(
            axum::http::Request::builder()
                .method("PUT")
                .uri(format!("/api/v2/assessments/{id}/access"))
                .header(axum::http::header::CONTENT_TYPE, "application/json")
                .header(axum::http::header::COOKIE, &teacher.cookie)
                .body(axum::body::Body::from(
                    serde_json::json!({ "mode": "restricted", "user_ids": [alice],
                                        "usergroup_ids": [cohort_b_id] })
                    .to_string(),
                ))
                .unwrap(),
        )
        .await;
    assert_eq!(direct.json()["users"][0]["username"], "alice");
    assert_eq!(direct.json()["usergroups"][0]["name"], "Cohort B");
    assert_eq!(direct.json()["effective_user_count"], 1);
    let restored = app
        .get_as(
            &alice_session,
            &format!("/api/v2/assessments/{id}/attempt-state"),
        )
        .await;
    assert_eq!(restored.status, StatusCode::OK);

    // Back to all-course-learners wipes the lists.
    let opened = app
        .send(
            axum::http::Request::builder()
                .method("PUT")
                .uri(format!("/api/v2/assessments/{id}/access"))
                .header(axum::http::header::CONTENT_TYPE, "application/json")
                .header(axum::http::header::COOKIE, &teacher.cookie)
                .body(axum::body::Body::from(
                    serde_json::json!({ "mode": "all_course_learners", "user_ids": [alice] })
                        .to_string(),
                ))
                .unwrap(),
        )
        .await;
    assert!(opened.json()["users"].as_array().unwrap().is_empty());
    let view = app
        .get_as(&teacher, &format!("/api/v2/assessments/{id}/access"))
        .await;
    assert_eq!(view.json()["mode"], "all_course_learners");
}

#[sqlx::test(migrations = "../../migrations")]
async fn overrides_shape_the_effective_policy(pool: PgPool) {
    let app = TestApp::spawn(pool).await;
    let teacher = instructor(&app, "teacher").await;
    let (course_id, id) = private_course_with_quiz(&app, &teacher).await;
    // Make the course public so learners reach it without a cohort.
    app.publish_course(&course_id).await;
    let (alice, alice_session) = learner(&app, "alice").await;

    // Policy: 2 attempts, a due date in the past, no late work → blocked.
    let mut policy = app
        .get_as(&teacher, &format!("/api/v2/assessments/{id}"))
        .await
        .json()["policy"]
        .clone();
    policy["max_attempts"] = serde_json::json!(2);
    policy["due_at_unix"] = serde_json::json!(1_000);
    policy["allow_late"] = serde_json::json!(false);
    // Editing a published assessment is allowed while it has no submissions.
    let set = app
        .send(
            axum::http::Request::builder()
                .method("PUT")
                .uri(format!("/api/v2/assessments/{id}/policy"))
                .header(axum::http::header::CONTENT_TYPE, "application/json")
                .header(axum::http::header::COOKIE, &teacher.cookie)
                .body(axum::body::Body::from(policy.to_string()))
                .unwrap(),
        )
        .await;
    assert_eq!(set.status, StatusCode::OK, "{}", set.text());
    let blocked = app
        .get_as(
            &alice_session,
            &format!("/api/v2/assessments/{id}/attempt-state"),
        )
        .await;
    assert_eq!(blocked.json()["can_start"], false);
    assert_eq!(
        blocked.json()["disabled_reasons"],
        serde_json::json!(["PAST_DUE"])
    );
    assert_eq!(blocked.json()["effective"]["max_attempts"], 2);

    // An override with a later due date and more attempts unblocks Alice.
    let too_many = app
        .post_as(
            &teacher,
            &format!("/api/v2/assessments/{id}/overrides/{alice}"),
            &serde_json::json!({ "max_attempts_override": 11 }),
        )
        .await;
    assert_eq!(too_many.status, StatusCode::UNPROCESSABLE_ENTITY);
    // 2033 — comfortably in the future, comfortably inside timestamptz.
    let far = 2_000_000_000_i64;
    let granted = app
        .post_as(
            &teacher,
            &format!("/api/v2/assessments/{id}/overrides/{alice}"),
            &serde_json::json!({ "max_attempts_override": 5, "due_at_override_unix": far,
                                  "waive_late_penalty": true, "note": "illness" }),
        )
        .await;
    assert_eq!(granted.status, StatusCode::CREATED, "{}", granted.text());
    assert_eq!(granted.json()["note"], "illness");
    let duplicate = app
        .post_as(
            &teacher,
            &format!("/api/v2/assessments/{id}/overrides/{alice}"),
            &serde_json::json!({ "max_attempts_override": 3 }),
        )
        .await;
    assert_eq!(duplicate.status, StatusCode::CONFLICT);

    let state = app
        .get_as(
            &alice_session,
            &format!("/api/v2/assessments/{id}/attempt-state"),
        )
        .await;
    let body = state.json();
    assert_eq!(body["can_start"], true);
    assert_eq!(body["effective"]["override_applied"], true);
    assert_eq!(body["effective"]["max_attempts"], 5);
    assert_eq!(body["effective"]["due_at_unix"], far);
    assert_eq!(body["effective"]["waive_late_penalty"], true);

    // An expired override is ignored; deleting it restores the policy.
    let expired = app
        .send(
            axum::http::Request::builder()
                .method("PUT")
                .uri(format!("/api/v2/assessments/{id}/overrides/{alice}"))
                .header(axum::http::header::CONTENT_TYPE, "application/json")
                .header(axum::http::header::COOKIE, &teacher.cookie)
                .body(axum::body::Body::from(
                    serde_json::json!({ "max_attempts_override": 5, "due_at_override_unix": far,
                                        "expires_at_unix": 1_000 })
                    .to_string(),
                ))
                .unwrap(),
        )
        .await;
    assert_eq!(expired.status, StatusCode::OK, "{}", expired.text());
    let state = app
        .get_as(
            &alice_session,
            &format!("/api/v2/assessments/{id}/attempt-state"),
        )
        .await;
    assert_eq!(state.json()["effective"]["override_applied"], false);
    assert_eq!(state.json()["can_start"], false);

    let listed = app
        .get_as(&teacher, &format!("/api/v2/assessments/{id}/overrides"))
        .await;
    assert_eq!(listed.json().as_array().unwrap().len(), 1);
    let deleted = app
        .delete_as(
            &teacher,
            &format!("/api/v2/assessments/{id}/overrides/{alice}"),
        )
        .await;
    assert_eq!(deleted.status, StatusCode::NO_CONTENT);
    let audit = app
        .get_as(&teacher, &format!("/api/v2/assessments/{id}/audit"))
        .await;
    let events: Vec<_> = audit
        .json()
        .as_array()
        .unwrap()
        .iter()
        .map(|e| e["event"].as_str().unwrap().to_owned())
        .collect();
    assert_eq!(
        events,
        [
            "override-deleted",
            "override-updated",
            "override-created",
            "lifecycle-transition"
        ]
    );
}

/// Unknown user ids in access lists and overrides are 422s, not FK 500s
/// (BUG-106); an unpublished assessment has no attempt state for learners,
/// just as it has no detail (BUG-108).
#[sqlx::test(migrations = "../../migrations")]
async fn unknown_users_and_drafts_are_client_errors(pool: PgPool) {
    let app = TestApp::spawn(pool).await;
    let teacher = instructor(&app, "teacher").await;
    let (course_id, id) = private_course_with_quiz(&app, &teacher).await;
    // UX-147: an override for a real user outside the private course is
    // `not-in-course`, like an access-list entry.
    let (outsider, _) = learner(&app, "outsider").await;
    let outside = app
        .post_as(
            &teacher,
            &format!("/api/v2/assessments/{id}/overrides/{outsider}"),
            &serde_json::json!({ "max_attempts_override": 3 }),
        )
        .await;
    assert_eq!(
        outside.status,
        StatusCode::UNPROCESSABLE_ENTITY,
        "{}",
        outside.text()
    );
    assert_eq!(outside.json()["field_errors"][0]["field"], "user_id");
    assert_eq!(outside.json()["field_errors"][0]["code"], "not-in-course");
    // Public: `user_has_course_access` short-circuits, so the existence
    // check has to stand on its own.
    app.publish_course(&course_id).await;
    let ghost = uuid::Uuid::now_v7();

    let restricted = app
        .send(
            axum::http::Request::builder()
                .method("PUT")
                .uri(format!("/api/v2/assessments/{id}/access"))
                .header(axum::http::header::CONTENT_TYPE, "application/json")
                .header(axum::http::header::COOKIE, &teacher.cookie)
                .body(axum::body::Body::from(
                    serde_json::json!({ "mode": "restricted", "user_ids": [ghost] }).to_string(),
                ))
                .unwrap(),
        )
        .await;
    assert_eq!(
        restricted.status,
        StatusCode::UNPROCESSABLE_ENTITY,
        "{}",
        restricted.text()
    );
    assert_eq!(
        restricted.json()["field_errors"][0]["field"],
        format!("user_ids.{ghost}")
    );
    assert_eq!(restricted.json()["field_errors"][0]["code"], "unknown");

    let overridden = app
        .post_as(
            &teacher,
            &format!("/api/v2/assessments/{id}/overrides/{ghost}"),
            &serde_json::json!({ "max_attempts_override": 3 }),
        )
        .await;
    assert_eq!(
        overridden.status,
        StatusCode::UNPROCESSABLE_ENTITY,
        "{}",
        overridden.text()
    );
    assert_eq!(overridden.json()["field_errors"][0]["field"], "user_id");

    // A draft quiz in the same course: 404 for the learner on both routes,
    // teacher preview still sees it.
    let chapter = app
        .get_as(&teacher, &format!("/api/v2/courses/{course_id}/curriculum"))
        .await
        .json()["chapters"][0]["id"]
        .as_str()
        .unwrap()
        .to_owned();
    let draft = app
        .post_as(
            &teacher,
            "/api/v2/assessments",
            &serde_json::json!({ "chapter_id": chapter, "kind": "quiz", "title": "Draft" }),
        )
        .await
        .json()["id"]
        .as_str()
        .unwrap()
        .to_owned();
    let (_, alice_session) = learner(&app, "alice").await;
    let detail = app
        .get_as(&alice_session, &format!("/api/v2/assessments/{draft}"))
        .await;
    assert_eq!(detail.status, StatusCode::NOT_FOUND);
    let state = app
        .get_as(
            &alice_session,
            &format!("/api/v2/assessments/{draft}/attempt-state"),
        )
        .await;
    assert_eq!(state.status, StatusCode::NOT_FOUND, "{}", state.text());
    let preview = app
        .get_as(
            &teacher,
            &format!("/api/v2/assessments/{draft}/attempt-state"),
        )
        .await;
    assert_eq!(preview.status, StatusCode::OK, "{}", preview.text());
    assert_eq!(preview.json()["is_teacher_preview"], true);
}

/// BUG-212: every `*_unix` request field is bounded by the `timestamptz`
/// range — a huge epoch is a 422 with the field named, not a Postgres
/// «timestamp out of range» 500 (BUG-206 bounded only `new_due_at_unix`).
#[sqlx::test(migrations = "../../migrations")]
async fn out_of_range_epochs_are_client_errors(pool: PgPool) {
    let app = TestApp::spawn(pool).await;
    let teacher = instructor(&app, "teacher").await;
    let (course_id, id) = private_course_with_quiz(&app, &teacher).await;
    let (alice, _) = learner(&app, "alice").await;
    let huge = 4_611_686_018_427_387_904_i64;
    let chapter_id = app
        .post_as(
            &teacher,
            &format!("/api/v2/courses/{course_id}/chapters"),
            &serde_json::json!({ "name": "Week 2" }),
        )
        .await
        .json()["id"]
        .clone();
    let mut policy = app
        .get_as(&teacher, &format!("/api/v2/assessments/{id}"))
        .await
        .json()["policy"]
        .clone();
    policy["due_at_unix"] = serde_json::json!(huge);
    policy["late_policy"] = serde_json::json!({ "kind": "cutoff", "cutoff_at_unix": huge });
    let put_policy = app
        .send(
            axum::http::Request::builder()
                .method("PUT")
                .uri(format!("/api/v2/assessments/{id}/policy"))
                .header(axum::http::header::CONTENT_TYPE, "application/json")
                .header(axum::http::header::COOKIE, &teacher.cookie)
                .body(axum::body::Body::from(policy.to_string()))
                .unwrap(),
        )
        .await;
    assert_eq!(
        put_policy.status,
        StatusCode::UNPROCESSABLE_ENTITY,
        "{}",
        put_policy.text()
    );
    let fields: Vec<String> = put_policy.json()["field_errors"]
        .as_array()
        .unwrap()
        .iter()
        .map(|e| e["field"].as_str().unwrap().to_owned())
        .collect();
    assert!(fields.contains(&"due_at_unix".into()), "{fields:?}");
    assert!(
        fields.contains(&"late_policy.cutoff_at_unix".into()),
        "{fields:?}"
    );

    let fs = app
        .post_as(
            &teacher,
            "/api/v2/file-submissions",
            &serde_json::json!({ "chapter_id": chapter_id, "title": "Essay", "instructions": "Upload it." }),
        )
        .await;
    assert_eq!(fs.status, StatusCode::CREATED, "{}", fs.text());
    let fs_id = fs.json()["id"].as_str().unwrap().to_owned();

    let doors = [
        (
            "POST",
            "/api/v2/assessments".to_owned(),
            serde_json::json!({ "chapter_id": chapter_id, "kind": "quiz", "title": "Q2",
                                "policy": policy }),
        ),
        (
            "POST",
            format!("/api/v2/assessments/{id}/lifecycle"),
            serde_json::json!({ "to": "scheduled", "scheduled_at_unix": huge }),
        ),
        (
            "POST",
            format!("/api/v2/assessments/{id}/overrides/{alice}"),
            serde_json::json!({ "due_at_override_unix": huge }),
        ),
        (
            "POST",
            format!("/api/v2/assessments/{id}/overrides/{alice}"),
            serde_json::json!({ "expires_at_unix": huge }),
        ),
        (
            "PATCH",
            format!("/api/v2/file-submissions/{fs_id}"),
            serde_json::json!({ "due_at_unix": huge }),
        ),
        (
            "PATCH",
            format!("/api/v2/file-submissions/{fs_id}"),
            serde_json::json!({ "late_policy": { "kind": "cutoff", "cutoff_at_unix": huge } }),
        ),
    ];
    for (method, path, body) in doors {
        let response = app
            .send(
                axum::http::Request::builder()
                    .method(method)
                    .uri(&path)
                    .header(axum::http::header::CONTENT_TYPE, "application/json")
                    .header(axum::http::header::COOKIE, &teacher.cookie)
                    .body(axum::body::Body::from(body.to_string()))
                    .unwrap(),
            )
            .await;
        assert_eq!(
            response.status,
            StatusCode::UNPROCESSABLE_ENTITY,
            "{method} {path}: {}",
            response.text()
        );
        assert!(
            response.json()["field_errors"][0]["field"]
                .as_str()
                .unwrap()
                .ends_with("_unix"),
            "{method} {path}: {}",
            response.text()
        );
    }
}
