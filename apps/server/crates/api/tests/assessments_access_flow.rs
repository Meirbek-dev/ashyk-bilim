//! Assessment access: cohort-only courses, restricted allowlists (users +
//! groups) with eligibility validation, per-student overrides, and the
//! student-facing attempt state.
#![allow(clippy::unwrap_used, clippy::expect_used, clippy::panic)]

use ab_core::id::UserId;
use ab_testkit::{MintedSession, TestApp, drop_request_when, wait_until};
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

/// A trail run — course membership, what overrides target (BUG-247).
async fn enrol(pool: &PgPool, course_id: &str, user_id: UserId) {
    let trail_id: uuid::Uuid = sqlx::query_scalar(
        "INSERT INTO trails (user_id) VALUES ($1) ON CONFLICT (user_id) DO UPDATE SET user_id = EXCLUDED.user_id RETURNING id",
    )
    .bind(user_id.0)
    .fetch_one(pool)
    .await
    .unwrap();
    sqlx::query("INSERT INTO trail_runs (trail_id, course_id, user_id) VALUES ($1, $2::uuid, $3)")
        .bind(trail_id)
        .bind(course_id)
        .bind(user_id.0)
        .execute(pool)
        .await
        .unwrap();
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

    // UX-159: course-wide reach is the enrolled learners — Alice is in the
    // cohort but not yet enrolled.
    let view = app
        .get_as(&teacher, &format!("/api/v2/assessments/{id}/access"))
        .await;
    assert_eq!(view.json()["mode"], "all_course_learners");
    assert_eq!(view.json()["effective_user_count"], 0);

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

    // UX-180: an allowlist names course members (enrolled learners), never
    // the course's own teacher, who merely has access.
    let staff = app
        .send(
            axum::http::Request::builder()
                .method("PUT")
                .uri(format!("/api/v2/assessments/{id}/access"))
                .header(axum::http::header::CONTENT_TYPE, "application/json")
                .header(axum::http::header::COOKIE, &teacher.cookie)
                .body(axum::body::Body::from(
                    serde_json::json!({ "mode": "restricted",
                                        "user_ids": [teacher.user_id, alice] })
                    .to_string(),
                ))
                .unwrap(),
        )
        .await;
    assert_eq!(
        staff.status,
        StatusCode::UNPROCESSABLE_ENTITY,
        "{}",
        staff.text()
    );
    let offenders: Vec<_> = staff.json()["field_errors"]
        .as_array()
        .unwrap()
        .iter()
        .map(|e| (e["field"].as_str().unwrap().to_owned(), e["code"].clone()))
        .collect();
    assert_eq!(
        offenders,
        [
            (format!("user_ids.{}", teacher.user_id), "staff".into()),
            (format!("user_ids.{alice}"), "not-in-course".into()),
        ]
    );
    enrol(&app.pool, &course_id, alice).await;

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
    assert_eq!(view.json()["effective_user_count"], 1);

    // UX-154: the view carries an ETag; a save that echoes it lands and
    // bumps it, a save with the old one is 412 — tab B never silently
    // overwrites tab A.
    let etag = |r: &ab_testkit::TestResponse| {
        r.headers[axum::http::header::ETAG]
            .to_str()
            .unwrap()
            .to_owned()
    };
    let put_access = |if_match: String| {
        axum::http::Request::builder()
            .method("PUT")
            .uri(format!("/api/v2/assessments/{id}/access"))
            .header(axum::http::header::CONTENT_TYPE, "application/json")
            .header(axum::http::header::COOKIE, &teacher.cookie)
            .header(axum::http::header::IF_MATCH, if_match)
            .body(axum::body::Body::from(
                serde_json::json!({ "mode": "restricted", "user_ids": [alice] }).to_string(),
            ))
            .unwrap()
    };
    let loaded = etag(&view);
    let tab_a = app.send(put_access(loaded.clone())).await;
    assert_eq!(tab_a.status, StatusCode::OK, "{}", tab_a.text());
    assert_ne!(etag(&tab_a), loaded);
    let tab_b = app.send(put_access(loaded)).await;
    assert_eq!(
        tab_b.status,
        StatusCode::PRECONDITION_FAILED,
        "{}",
        tab_b.text()
    );
    assert_eq!(tab_b.json()["code"], "precondition-failed");
}

#[sqlx::test(migrations = "../../migrations")]
async fn overrides_shape_the_effective_policy(pool: PgPool) {
    let app = TestApp::spawn(pool).await;
    let teacher = instructor(&app, "teacher").await;
    let (course_id, id) = private_course_with_quiz(&app, &teacher).await;
    // Make the course public so learners reach it without a cohort.
    app.publish_course(&course_id).await;
    let (alice, alice_session) = learner(&app, "alice").await;
    enrol(&app.pool, &course_id, alice).await;

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

/// The DB half of `DELETE /trail/courses/{id}`, held open: the leaver's
/// trail lock (`try_lock_trail_run`'s key) and the run deleted, uncommitted.
async fn held_leave(
    pool: &PgPool,
    course_id: &str,
    user_id: UserId,
) -> sqlx::Transaction<'static, sqlx::Postgres> {
    let mut leave = pool.begin().await.unwrap();
    sqlx::query(
        "SELECT pg_advisory_xact_lock(hashtextextended($1::uuid::text || $2::uuid::text, 0))",
    )
    .bind(user_id.0)
    .bind(course_id)
    .execute(&mut *leave)
    .await
    .unwrap();
    sqlx::query("DELETE FROM trail_runs WHERE user_id = $1 AND course_id = $2::uuid")
        .bind(user_id.0)
        .bind(course_id)
        .execute(&mut *leave)
        .await
        .unwrap();
    leave
}

/// BUG-273: override create / update check membership under the learner's
/// trail lock — a leave committing mid-request is a 422 `not-in-course`,
/// never an override written for a non-member.
#[sqlx::test(migrations = "../../migrations")]
async fn overrides_racing_a_leave_are_not_in_course(pool: PgPool) {
    let app = TestApp::spawn(pool.clone()).await;
    let teacher = instructor(&app, "teacher").await;
    let (course_id, id) = private_course_with_quiz(&app, &teacher).await;
    let (alice, _) = learner(&app, "alice").await;
    let (bob, _) = learner(&app, "bob").await;
    enrol(&pool, &course_id, alice).await;
    enrol(&pool, &course_id, bob).await;
    let granted = app
        .post_as(
            &teacher,
            &format!("/api/v2/assessments/{id}/overrides/{bob}"),
            &serde_json::json!({ "max_attempts_override": 2 }),
        )
        .await;
    assert_eq!(granted.status, StatusCode::CREATED, "{}", granted.text());

    let commit_after = async |leave: sqlx::Transaction<'static, sqlx::Postgres>| {
        tokio::time::sleep(std::time::Duration::from_millis(300)).await;
        leave.commit().await.unwrap();
    };
    let leave = held_leave(&pool, &course_id, alice).await;
    let body = serde_json::json!({ "max_attempts_override": 3 });
    let create_path = format!("/api/v2/assessments/{id}/overrides/{alice}");
    let (created, ()) = tokio::join!(
        app.post_as(&teacher, &create_path, &body),
        commit_after(leave)
    );
    assert_eq!(
        created.status,
        StatusCode::UNPROCESSABLE_ENTITY,
        "{}",
        created.text()
    );
    assert_eq!(created.json()["field_errors"][0]["code"], "not-in-course");

    let leave = held_leave(&pool, &course_id, bob).await;
    let update = app.send(
        axum::http::Request::builder()
            .method("PUT")
            .uri(format!("/api/v2/assessments/{id}/overrides/{bob}"))
            .header(axum::http::header::CONTENT_TYPE, "application/json")
            .header(axum::http::header::COOKIE, &teacher.cookie)
            .body(axum::body::Body::from(body.to_string()))
            .unwrap(),
    );
    let (updated, ()) = tokio::join!(update, commit_after(leave));
    assert_eq!(
        updated.status,
        StatusCode::UNPROCESSABLE_ENTITY,
        "{}",
        updated.text()
    );
    assert_eq!(updated.json()["field_errors"][0]["code"], "not-in-course");

    let written: Vec<(uuid::Uuid, Option<i32>)> = sqlx::query_as(
        "SELECT user_id, max_attempts_override FROM assessment_overrides WHERE assessment_id = $1::uuid",
    )
    .bind(&id)
    .fetch_all(&pool)
    .await
    .unwrap();
    assert_eq!(
        written,
        [(bob.0, Some(2))],
        "no override written for a leaver"
    );
}

/// UX-196: the leave lands after the create's write commits but before its
/// read-back (the audit insert in between is held) — still 422
/// `not-in-course`, never 404 «override not found».
#[sqlx::test(migrations = "../../migrations")]
async fn override_read_back_after_a_leave_is_not_in_course(pool: PgPool) {
    let app = TestApp::spawn(pool.clone()).await;
    let teacher = instructor(&app, "teacher").await;
    let (course_id, id) = private_course_with_quiz(&app, &teacher).await;
    let (alice, _) = learner(&app, "alice").await;
    enrol(&pool, &course_id, alice).await;

    let mut audit = pool.begin().await.unwrap();
    sqlx::query("LOCK TABLE assessment_audit_events IN EXCLUSIVE MODE")
        .execute(&mut *audit)
        .await
        .unwrap();
    let leave_after_write = async {
        for _ in 0..250 {
            let written: i64 = sqlx::query_scalar(
                "SELECT count(*) FROM assessment_overrides WHERE assessment_id = $1::uuid AND user_id = $2",
            )
            .bind(&id)
            .bind(alice.0)
            .fetch_one(&pool)
            .await
            .unwrap();
            if written > 0 {
                break;
            }
            tokio::time::sleep(std::time::Duration::from_millis(20)).await;
        }
        let mut leave = held_leave(&pool, &course_id, alice).await;
        sqlx::query(
            "DELETE FROM assessment_overrides WHERE assessment_id = $1::uuid AND user_id = $2",
        )
        .bind(&id)
        .bind(alice.0)
        .execute(&mut *leave)
        .await
        .unwrap();
        leave.commit().await.unwrap();
        audit.rollback().await.unwrap();
    };
    let path = format!("/api/v2/assessments/{id}/overrides/{alice}");
    let body = serde_json::json!({ "max_attempts_override": 3 });
    let (created, ()) = tokio::join!(app.post_as(&teacher, &path, &body), leave_after_write);
    assert_eq!(
        created.status,
        StatusCode::UNPROCESSABLE_ENTITY,
        "{}",
        created.text()
    );
    assert_eq!(created.json()["field_errors"][0]["code"], "not-in-course");
}

/// BUG-281: a leave takes the leaver off the allowlist and drops their
/// overrides; the restricted reach counts course members only (a group
/// member who never joined is not reached), like the course-wide mode.
#[sqlx::test(migrations = "../../migrations")]
async fn a_leave_drops_allowlist_and_overrides(pool: PgPool) {
    let app = TestApp::spawn(pool.clone()).await;
    let teacher = instructor(&app, "teacher").await;
    let (course_id, id) = private_course_with_quiz(&app, &teacher).await;
    let alice = app
        .create_user("alice", "alice@example.com", &["user"])
        .await;
    let alice_session = app
        .mint_session_for(alice, &["trail:read:all", "trail:submit:assigned"])
        .await;
    let (bob, _) = learner(&app, "bob").await;
    let (carol, _) = learner(&app, "carol").await;
    enrol(&pool, &course_id, alice).await;
    enrol(&pool, &course_id, bob).await;
    let group = app
        .post_as(
            &teacher,
            "/api/v2/usergroups",
            &serde_json::json!({ "name": "Cohort" }),
        )
        .await;
    let group_id = group.json()["id"].as_str().unwrap().to_owned();
    app.post_as(
        &teacher,
        &format!("/api/v2/usergroups/{group_id}/members"),
        &serde_json::json!({ "user_ids": [bob, carol] }),
    )
    .await;
    app.post_as(
        &teacher,
        &format!("/api/v2/usergroups/{group_id}/courses"),
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
                    serde_json::json!({ "mode": "restricted", "user_ids": [alice],
                                        "usergroup_ids": [group_id] })
                    .to_string(),
                ))
                .unwrap(),
        )
        .await;
    assert_eq!(restricted.status, StatusCode::OK, "{}", restricted.text());
    assert_eq!(restricted.json()["effective_user_count"], 2, "alice + bob");
    let granted = app
        .post_as(
            &teacher,
            &format!("/api/v2/assessments/{id}/overrides/{alice}"),
            &serde_json::json!({ "max_attempts_override": 2 }),
        )
        .await;
    assert_eq!(granted.status, StatusCode::CREATED, "{}", granted.text());

    let left = app
        .delete_as(
            &alice_session,
            &format!("/api/v2/trail/courses/{course_id}"),
        )
        .await;
    assert_eq!(left.status, StatusCode::OK, "{}", left.text());
    let view = app
        .get_as(&teacher, &format!("/api/v2/assessments/{id}/access"))
        .await;
    assert!(
        view.json()["users"].as_array().unwrap().is_empty(),
        "{}",
        view.text()
    );
    assert_eq!(view.json()["effective_user_count"], 1, "bob only");
    let overrides = app
        .get_as(&teacher, &format!("/api/v2/assessments/{id}/overrides"))
        .await;
    assert_eq!(
        overrides.json().as_array().unwrap().len(),
        0,
        "{}",
        overrides.text()
    );
}

/// BUG-303: joining the staff (roster add, RBAC role) drops the member's
/// allowlist and override rows like a leave (BUG-281) — the unchanged list
/// saves again. A staffer never edits or deletes their own override (403).
#[sqlx::test(migrations = "../../migrations")]
async fn joining_the_staff_drops_allowlist_and_overrides(pool: PgPool) {
    let app = TestApp::spawn(pool.clone()).await;
    let teacher = instructor(&app, "teacher").await;
    let admin = app.mint_session(&["*:*:*"]).await;
    let (course_id, id) = private_course_with_quiz(&app, &teacher).await;
    let (l1, _) = learner(&app, "l1").await;
    let (l2, _) = learner(&app, "l2").await;
    let (carol, _) = learner(&app, "carol").await;
    for who in [l1, l2, carol] {
        enrol(&pool, &course_id, who).await;
    }
    let put = |uri: String, body: serde_json::Value, cookie: String| {
        axum::http::Request::builder()
            .method("PUT")
            .uri(uri)
            .header(axum::http::header::CONTENT_TYPE, "application/json")
            .header(axum::http::header::COOKIE, cookie)
            .body(axum::body::Body::from(body.to_string()))
            .unwrap()
    };
    let access = format!("/api/v2/assessments/{id}/access");
    let saved = app
        .send(put(
            access.clone(),
            serde_json::json!({ "mode": "restricted", "user_ids": [l1, l2, carol] }),
            teacher.cookie.clone(),
        ))
        .await;
    assert_eq!(saved.status, StatusCode::OK, "{}", saved.text());
    for who in [l1, l2] {
        let granted = app
            .post_as(
                &teacher,
                &format!("/api/v2/assessments/{id}/overrides/{who}"),
                &serde_json::json!({ "max_attempts_override": 2 }),
            )
            .await;
        assert_eq!(granted.status, StatusCode::CREATED, "{}", granted.text());
    }

    let rostered = app
        .post_as(
            &teacher,
            &format!("/api/v2/courses/{course_id}/contributors"),
            &serde_json::json!({ "user_id": l1, "role": "contributor" }),
        )
        .await;
    assert_eq!(rostered.status, StatusCode::CREATED, "{}", rostered.text());
    let granted = app
        .post_as(
            &admin,
            &format!("/api/v2/users/{l2}/roles"),
            &serde_json::json!({ "role": "maintainer" }),
        )
        .await;
    assert!(granted.status.is_success(), "{}", granted.text());

    let view = app.get_as(&teacher, &access).await;
    let users: Vec<String> = view.json()["users"]
        .as_array()
        .unwrap()
        .iter()
        .map(|u| u["id"].as_str().unwrap().to_owned())
        .collect();
    assert_eq!(users, [carol.to_string()], "{}", view.text());
    let overrides = app
        .get_as(&teacher, &format!("/api/v2/assessments/{id}/overrides"))
        .await;
    assert_eq!(
        overrides.json().as_array().unwrap().len(),
        0,
        "{}",
        overrides.text()
    );
    let resaved = app
        .send(put(
            access,
            serde_json::json!({ "mode": "restricted", "user_ids": users }),
            teacher.cookie.clone(),
        ))
        .await;
    assert_eq!(resaved.status, StatusCode::OK, "{}", resaved.text());

    // The staffer's own override: PUT and DELETE refuse like POST (BUG-288).
    let l1_session = app
        .mint_session_for(l1, &["course:read:all", "assessment:*:own"])
        .await;
    let own = format!("/api/v2/assessments/{id}/overrides/{l1}");
    let edited = app
        .send(put(
            own.clone(),
            serde_json::json!({ "max_attempts_override": 5 }),
            l1_session.cookie.clone(),
        ))
        .await;
    assert_eq!(edited.status, StatusCode::FORBIDDEN, "{}", edited.text());
    assert_eq!(edited.json()["code"], "grade-own-attempt");
    let deleted = app.delete_as(&l1_session, &own).await;
    assert_eq!(deleted.status, StatusCode::FORBIDDEN, "{}", deleted.text());
    assert_eq!(deleted.json()["code"], "grade-own-attempt");
}

/// BUG-305: a roster add outlives a client that hangs up while the member
/// lock is busy — the access sweep still runs once it frees — and a failing
/// sweep never turns the committed add into an error: it is queued instead.
#[sqlx::test(migrations = "../../migrations")]
async fn roster_add_sweep_survives_hang_up_and_failure(pool: PgPool) {
    let app = TestApp::spawn(pool.clone()).await;
    let teacher = instructor(&app, "teacher").await;
    let (course_id, id) = private_course_with_quiz(&app, &teacher).await;
    let (l1, _) = learner(&app, "l1").await;
    let (l2, _) = learner(&app, "l2").await;
    for who in [l1, l2] {
        enrol(&pool, &course_id, who).await;
        let granted = app
            .post_as(
                &teacher,
                &format!("/api/v2/assessments/{id}/overrides/{who}"),
                &serde_json::json!({ "max_attempts_override": 2 }),
            )
            .await;
        assert_eq!(granted.status, StatusCode::CREATED, "{}", granted.text());
    }
    let count = async |sql: &'static str, who: UserId| -> i64 {
        sqlx::query_scalar(sql)
            .bind(who.0)
            .fetch_one(&pool)
            .await
            .unwrap()
    };
    let overrides = "SELECT count(*) FROM assessment_overrides WHERE user_id = $1";
    let rostered = "SELECT count(*) FROM resource_authors WHERE user_id = $1";
    let path = format!("/api/v2/courses/{course_id}/contributors");

    // Hang up between the roster insert and the sweep (member lock held).
    let mut held = pool.begin().await.unwrap();
    sqlx::query(
        "SELECT pg_advisory_xact_lock(hashtextextended($1::uuid::text || $2::uuid::text, 0))",
    )
    .bind(l1.0)
    .bind(&course_id)
    .execute(&mut *held)
    .await
    .unwrap();
    drop_request_when(
        app.post_as(
            &teacher,
            &path,
            &serde_json::json!({ "user_id": l1, "role": "contributor" }),
        ),
        async || count(rostered, l1).await == 1,
        |response| panic!("finished under the lock: {}", response.text()),
    )
    .await;
    held.commit().await.unwrap();
    wait_until("the dropped add never swept the override", async || {
        count(overrides, l1).await == 0
    })
    .await;

    // The sweep fails: the add still answers 201 and the sweep is queued.
    sqlx::query(
        "CREATE FUNCTION refuse() RETURNS trigger LANGUAGE plpgsql
         AS $$ BEGIN RAISE EXCEPTION 'refused'; END $$",
    )
    .execute(&pool)
    .await
    .unwrap();
    sqlx::query(
        "CREATE TRIGGER refuse BEFORE DELETE ON assessment_overrides
         FOR EACH ROW EXECUTE FUNCTION refuse()",
    )
    .execute(&pool)
    .await
    .unwrap();
    let added = app
        .post_as(
            &teacher,
            &path,
            &serde_json::json!({ "user_id": l2, "role": "contributor" }),
        )
        .await;
    assert_eq!(added.status, StatusCode::CREATED, "{}", added.text());
    let queued = "SELECT count(*) FROM jobs
                  WHERE kind = 'progress:staff-change' AND payload->>'user_id' = $1::text";
    assert_eq!(count(queued, l2).await, 1);
}

/// BUG-303 doors not covered above: a reporter (no staff) keeps their rows
/// until promoted to contributor; a custom role keeps them until its grant
/// set gains `assessment:author`. UX-206: a stale save naming a staffer
/// answers `staff`, not `not-in-course`.
#[sqlx::test(migrations = "../../migrations")]
async fn staff_sweep_via_reporter_promotion_and_grant_set(pool: PgPool) {
    let app = TestApp::spawn(pool.clone()).await;
    let teacher = instructor(&app, "teacher").await;
    let admin = app.mint_session(&["*:*:*"]).await;
    let (course_id, id) = private_course_with_quiz(&app, &teacher).await;
    let (l1, _) = learner(&app, "l1").await;
    let (l2, _) = learner(&app, "l2").await;
    let (carol, _) = learner(&app, "carol").await;
    for who in [l1, l2, carol] {
        enrol(&pool, &course_id, who).await;
    }
    let put = |uri: String, body: serde_json::Value, cookie: String| {
        axum::http::Request::builder()
            .method("PUT")
            .uri(uri)
            .header(axum::http::header::CONTENT_TYPE, "application/json")
            .header(axum::http::header::COOKIE, cookie)
            .body(axum::body::Body::from(body.to_string()))
            .unwrap()
    };
    let access = format!("/api/v2/assessments/{id}/access");
    let stale = serde_json::json!({ "mode": "restricted", "user_ids": [l1, l2, carol] });
    let saved = app
        .send(put(access.clone(), stale.clone(), teacher.cookie.clone()))
        .await;
    assert_eq!(saved.status, StatusCode::OK, "{}", saved.text());
    for who in [l1, l2] {
        let granted = app
            .post_as(
                &teacher,
                &format!("/api/v2/assessments/{id}/overrides/{who}"),
                &serde_json::json!({ "max_attempts_override": 2 }),
            )
            .await;
        assert_eq!(granted.status, StatusCode::CREATED, "{}", granted.text());
    }
    let snapshot = async || {
        let view = app.get_as(&teacher, &access).await;
        let mut users: Vec<String> = view.json()["users"]
            .as_array()
            .unwrap()
            .iter()
            .map(|u| u["id"].as_str().unwrap().to_owned())
            .collect();
        users.sort();
        let overrides = app
            .get_as(&teacher, &format!("/api/v2/assessments/{id}/overrides"))
            .await;
        let mut overridden: Vec<String> = overrides
            .json()
            .as_array()
            .unwrap()
            .iter()
            .map(|o| o["user_id"].as_str().unwrap().to_owned())
            .collect();
        overridden.sort();
        (users, overridden)
    };
    let sorted = |ids: &[UserId]| {
        let mut ids: Vec<String> = ids.iter().map(ToString::to_string).collect();
        ids.sort();
        ids
    };

    // Door 1: roster reporter (no staff) → contributor (staff).
    let contributors = format!("/api/v2/courses/{course_id}/contributors");
    let reporter = app
        .post_as(
            &teacher,
            &contributors,
            &serde_json::json!({ "user_id": l1, "role": "reporter" }),
        )
        .await;
    assert_eq!(reporter.status, StatusCode::CREATED, "{}", reporter.text());
    assert_eq!(
        snapshot().await,
        (sorted(&[l1, l2, carol]), sorted(&[l1, l2])),
        "a reporter is no staff"
    );
    let promoted = app
        .patch_as(
            &teacher,
            &format!("{contributors}/{l1}"),
            &serde_json::json!({ "role": "contributor" }),
        )
        .await;
    assert!(promoted.status.is_success(), "{}", promoted.text());
    assert_eq!(snapshot().await, (sorted(&[l2, carol]), sorted(&[l2])));

    // Door 2: a custom role whose grant set gains `assessment:author`.
    let role = app
        .post_as(
            &admin,
            "/api/v2/rbac/roles",
            &serde_json::json!({ "slug": "g-author", "display_name": "G", "priority": 5 }),
        )
        .await;
    assert_eq!(role.status, StatusCode::NO_CONTENT, "{}", role.text());
    let assigned = app
        .post_as(
            &admin,
            &format!("/api/v2/users/{l2}/roles"),
            &serde_json::json!({ "role": "g-author" }),
        )
        .await;
    assert!(assigned.status.is_success(), "{}", assigned.text());
    assert_eq!(snapshot().await, (sorted(&[l2, carol]), sorted(&[l2])));
    let granted = app
        .send(put(
            "/api/v2/rbac/roles/g-author/permissions".into(),
            serde_json::json!({ "permissions": ["assessment:author:platform"] }),
            admin.cookie.clone(),
        ))
        .await;
    assert!(granted.status.is_success(), "{}", granted.text());
    assert_eq!(snapshot().await, (sorted(&[carol]), Vec::<String>::new()));

    // UX-206: the stale tab's save names both staffers as staff.
    let refused = app.send(put(access, stale, teacher.cookie.clone())).await;
    assert_eq!(
        refused.status,
        StatusCode::UNPROCESSABLE_ENTITY,
        "{}",
        refused.text()
    );
    let mut offenders: Vec<(String, String)> = refused.json()["field_errors"]
        .as_array()
        .unwrap()
        .iter()
        .map(|e| {
            (
                e["field"].as_str().unwrap().to_owned(),
                e["code"].as_str().unwrap().to_owned(),
            )
        })
        .collect();
    offenders.sort();
    let mut expected = vec![
        (format!("user_ids.{l1}"), "staff".to_owned()),
        (format!("user_ids.{l2}"), "staff".to_owned()),
    ];
    expected.sort();
    assert_eq!(offenders, expected);
}
