//! Assessment authoring flows: create with backing activity, items with
//! ordering + kind rules, wholesale policy replacement, readiness-gated
//! lifecycle transitions, audit trail, access rules.
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
            "assessment:*:own",
        ],
    )
    .await
}

/// Course + chapter; returns (course_id, chapter_id).
async fn scaffold(app: &TestApp, session: &MintedSession) -> (String, String) {
    let course = app
        .post_as(
            session,
            "/api/v2/courses",
            &serde_json::json!({ "name": "Rust 101" }),
        )
        .await;
    let course_id = course.json()["id"].as_str().unwrap().to_owned();
    let chapter = app
        .post_as(
            session,
            &format!("/api/v2/courses/{course_id}/chapters"),
            &serde_json::json!({ "name": "Week 1" }),
        )
        .await;
    (course_id, chapter.json()["id"].as_str().unwrap().to_owned())
}

fn choice_item(prompt: &str) -> serde_json::Value {
    serde_json::json!({
        "title": prompt,
        "max_score": 10,
        "body": {
            "kind": "choice",
            "prompt": prompt,
            "options": [
                { "id": "a", "text": "yes", "is_correct": true },
                { "id": "b", "text": "no", "is_correct": false }
            ]
        }
    })
}

fn far_future() -> i64 {
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_secs();
    i64::try_from(now).unwrap() + 3600
}

#[sqlx::test(migrations = "../../migrations")]
async fn quiz_authoring_and_lifecycle(pool: PgPool) {
    let app = TestApp::spawn(pool).await;
    let teacher = instructor(&app, "teacher").await;
    let (course_id, chapter_id) = scaffold(&app, &teacher).await;

    // Create → draft, preset policy, backing activity in the chapter.
    let created = app
        .post_as(
            &teacher,
            "/api/v2/assessments",
            &serde_json::json!({ "chapter_id": chapter_id, "kind": "quiz", "title": "Quiz 1" }),
        )
        .await;
    assert_eq!(created.status, StatusCode::CREATED, "{}", created.text());
    let body = created.json();
    let id = body["id"].as_str().unwrap().to_owned();
    assert_eq!(body["lifecycle"], "draft");
    assert_eq!(body["policy"]["review_visibility"], "full");
    assert_eq!(body["policy"]["grade_release_mode"], "immediate");
    assert!(body["items"].as_array().unwrap().is_empty());
    let curriculum = app
        .get_as(&teacher, &format!("/api/v2/courses/{course_id}/curriculum"))
        .await;
    let activity = &curriculum.json()["chapters"][0]["activities"][0];
    assert_eq!(activity["activity_type"], "quiz");
    assert_eq!(activity["name"], "Quiz 1");
    assert_eq!(activity["published"], false);

    // Empty → not ready; publishing is refused with the issues.
    let readiness = app
        .get_as(&teacher, &format!("/api/v2/assessments/{id}/readiness"))
        .await;
    assert_eq!(readiness.json()["ok"], false);
    assert_eq!(readiness.json()["issues"][0]["code"], "assessment.empty");
    let refused = app
        .post_as(
            &teacher,
            &format!("/api/v2/assessments/{id}/lifecycle"),
            &serde_json::json!({ "to": "published" }),
        )
        .await;
    assert_eq!(refused.status, StatusCode::UNPROCESSABLE_ENTITY);
    assert_eq!(
        refused.json()["field_errors"][0]["code"],
        "assessment.empty"
    );

    // Items append 1..n; reorder renumbers; content version climbs.
    let first = app
        .post_as(
            &teacher,
            &format!("/api/v2/assessments/{id}/items"),
            &choice_item("First?"),
        )
        .await;
    assert_eq!(first.status, StatusCode::CREATED, "{}", first.text());
    let first_id = first.json()["id"].as_str().unwrap().to_owned();
    let second = app
        .post_as(
            &teacher,
            &format!("/api/v2/assessments/{id}/items"),
            &choice_item("Second?"),
        )
        .await;
    let second_id = second.json()["id"].as_str().unwrap().to_owned();
    assert_eq!(second.json()["position"], 2);
    let reordered = app
        .post_as(
            &teacher,
            &format!("/api/v2/assessments/{id}/items/reorder"),
            &serde_json::json!({ "items": [second_id] }),
        )
        .await;
    assert_eq!(reordered.status, StatusCode::OK);
    let order: Vec<_> = reordered
        .json()
        .as_array()
        .unwrap()
        .iter()
        .map(|i| {
            (
                i["title"].as_str().unwrap().to_owned(),
                i["position"].as_i64().unwrap(),
            )
        })
        .collect();
    assert_eq!(order, [("Second?".into(), 1), ("First?".into(), 2)]);
    let detail = app
        .get_as(&teacher, &format!("/api/v2/assessments/{id}"))
        .await;
    assert_eq!(detail.json()["content_version"], 4);

    // Policy is replaced wholesale and range-checked.
    let mut policy = detail.json()["policy"].clone();
    policy["max_attempts"] = serde_json::json!(0);
    let bad = app
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
    assert_eq!(bad.status, StatusCode::UNPROCESSABLE_ENTITY);
    assert_eq!(bad.json()["field_errors"][0]["field"], "max_attempts");
    policy["max_attempts"] = serde_json::json!(3);
    policy["late_policy"] =
        serde_json::json!({ "kind": "penalty", "percent_per_day": 10, "max_days": 5 });
    let good = app
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
    assert_eq!(good.status, StatusCode::OK, "{}", good.text());
    assert_eq!(good.json()["policy_version"], 2);
    assert_eq!(good.json()["policy"]["late_policy"]["kind"], "penalty");
    assert_eq!(good.json()["policy"]["max_attempts"], 3);

    // Scheduling needs a future time; then publishing flips the activity live.
    let no_time = app
        .post_as(
            &teacher,
            &format!("/api/v2/assessments/{id}/lifecycle"),
            &serde_json::json!({ "to": "scheduled" }),
        )
        .await;
    assert_eq!(no_time.status, StatusCode::UNPROCESSABLE_ENTITY);
    let past = app
        .post_as(
            &teacher,
            &format!("/api/v2/assessments/{id}/lifecycle"),
            &serde_json::json!({ "to": "scheduled", "scheduled_at_unix": 1_000 }),
        )
        .await;
    assert_eq!(past.status, StatusCode::UNPROCESSABLE_ENTITY);
    let scheduled = app
        .post_as(
            &teacher,
            &format!("/api/v2/assessments/{id}/lifecycle"),
            &serde_json::json!({ "to": "scheduled", "scheduled_at_unix": far_future(),
                                  "note": "opens next hour" }),
        )
        .await;
    assert_eq!(scheduled.status, StatusCode::OK, "{}", scheduled.text());
    assert_eq!(scheduled.json()["lifecycle"], "scheduled");
    let published = app
        .post_as(
            &teacher,
            &format!("/api/v2/assessments/{id}/lifecycle"),
            &serde_json::json!({ "to": "published" }),
        )
        .await;
    assert_eq!(published.status, StatusCode::OK);
    assert_eq!(published.json()["lifecycle"], "published");
    assert!(published.json()["published_at_unix"].is_i64());
    assert!(published.json()["scheduled_at_unix"].is_null());
    let curriculum = app
        .get_as(&teacher, &format!("/api/v2/courses/{course_id}/curriculum"))
        .await;
    assert_eq!(
        curriculum.json()["chapters"][0]["activities"][0]["published"],
        true
    );

    // Audit trail carries both transitions, newest first.
    let audit = app
        .get_as(&teacher, &format!("/api/v2/assessments/{id}/audit"))
        .await;
    let events = audit.json();
    assert_eq!(events.as_array().unwrap().len(), 2);
    assert_eq!(events[0]["payload"]["to"], "published");
    assert_eq!(events[1]["payload"]["note"], "opens next hour");

    // Archived is read-only and can only go back to draft.
    app.post_as(
        &teacher,
        &format!("/api/v2/assessments/{id}/lifecycle"),
        &serde_json::json!({ "to": "archived" }),
    )
    .await;
    let readonly = app
        .patch_as(
            &teacher,
            &format!("/api/v2/assessments/{id}"),
            &serde_json::json!({ "title": "Renamed" }),
        )
        .await;
    assert_eq!(readonly.status, StatusCode::CONFLICT);
    let illegal = app
        .post_as(
            &teacher,
            &format!("/api/v2/assessments/{id}/lifecycle"),
            &serde_json::json!({ "to": "published" }),
        )
        .await;
    assert_eq!(illegal.status, StatusCode::CONFLICT);
    let back = app
        .post_as(
            &teacher,
            &format!("/api/v2/assessments/{id}/lifecycle"),
            &serde_json::json!({ "to": "draft" }),
        )
        .await;
    assert_eq!(back.json()["lifecycle"], "draft");
    // published_at survives the round trip (legacy semantics).
    assert!(back.json()["published_at_unix"].is_i64());

    // Renaming propagates to the activity; deleting renumbers.
    let renamed = app
        .patch_as(
            &teacher,
            &format!("/api/v2/assessments/{id}"),
            &serde_json::json!({ "title": "Quiz 1b" }),
        )
        .await;
    assert_eq!(renamed.status, StatusCode::OK);
    let curriculum = app
        .get_as(&teacher, &format!("/api/v2/courses/{course_id}/curriculum"))
        .await;
    assert_eq!(
        curriculum.json()["chapters"][0]["activities"][0]["name"],
        "Quiz 1b"
    );
    let deleted = app
        .delete_as(&teacher, &format!("/api/v2/assessment-items/{second_id}"))
        .await;
    assert_eq!(deleted.status, StatusCode::NO_CONTENT);
    let detail = app
        .get_as(&teacher, &format!("/api/v2/assessments/{id}"))
        .await;
    let items = detail.json()["items"].as_array().unwrap().clone();
    assert_eq!(items.len(), 1);
    assert_eq!(items[0]["id"], first_id.as_str());
    assert_eq!(items[0]["position"], 1);
}

#[sqlx::test(migrations = "../../migrations")]
async fn code_challenge_defaults_kind_rules_and_visibility(pool: PgPool) {
    let app = TestApp::spawn(pool).await;
    let teacher = instructor(&app, "teacher").await;
    let (course_id, chapter_id) = scaffold(&app, &teacher).await;

    let created = app
        .post_as(
            &teacher,
            "/api/v2/assessments",
            &serde_json::json!({ "chapter_id": chapter_id, "kind": "code_challenge",
                                  "title": "FizzBuzz" }),
        )
        .await;
    assert_eq!(created.status, StatusCode::CREATED, "{}", created.text());
    let id = created.json()["id"].as_str().unwrap().to_owned();
    let items = created.json()["items"].as_array().unwrap().clone();
    assert_eq!(items.len(), 1, "code challenges start with one code item");
    assert_eq!(items[0]["kind"], "code");
    assert_eq!(items[0]["max_score"], 100.0);
    assert_eq!(items[0]["body"]["time_limit_seconds"], 5);
    let item_id = items[0]["id"].as_str().unwrap().to_owned();

    // Kind rules: no choice items in a code challenge.
    let wrong_kind = app
        .post_as(
            &teacher,
            &format!("/api/v2/assessments/{id}/items"),
            &choice_item("Nope"),
        )
        .await;
    assert_eq!(wrong_kind.status, StatusCode::UNPROCESSABLE_ENTITY);
    assert_eq!(wrong_kind.json()["field_errors"][0]["field"], "kind");

    // Metadata normalizes like legacy; body edits replace the whole body.
    let edited = app
        .patch_as(
            &teacher,
            &format!("/api/v2/assessment-items/{item_id}"),
            &serde_json::json!({
                "title": "FizzBuzz",
                "metadata": { "tags": [" Loops ", "loops", "Basics"], "difficulty": "easy" },
                "body": {
                    "kind": "code", "prompt": "print fizzbuzz", "languages": [71],
                    "tests": [{ "id": "t1", "input": "3", "expected_output": "Fizz" }]
                }
            }),
        )
        .await;
    assert_eq!(edited.status, StatusCode::OK, "{}", edited.text());
    assert_eq!(
        edited.json()["metadata"]["tags"],
        serde_json::json!(["Loops", "Basics"])
    );
    assert_eq!(edited.json()["body"]["tests"][0]["weight"], 1);

    // Visibility: learners can't see drafts at all; once published, only
    // holders of assessment:read:assigned can (course is public).
    app.post_as(
        &teacher,
        &format!("/api/v2/courses/{course_id}/lifecycle"),
        &serde_json::json!({ "action": "publish" }),
    )
    .await;
    let learner = app.mint_session(&["assessment:read:assigned"]).await;
    let hidden = app
        .get_as(&learner, &format!("/api/v2/assessments/{id}"))
        .await;
    assert_eq!(hidden.status, StatusCode::NOT_FOUND);
    let published = app
        .post_as(
            &teacher,
            &format!("/api/v2/assessments/{id}/lifecycle"),
            &serde_json::json!({ "to": "published" }),
        )
        .await;
    assert_eq!(published.status, StatusCode::OK, "{}", published.text());
    let visible = app
        .get_as(&learner, &format!("/api/v2/assessments/{id}"))
        .await;
    assert_eq!(visible.status, StatusCode::OK);
    let no_grant = app.mint_session(&[]).await;
    let still_hidden = app
        .get_as(&no_grant, &format!("/api/v2/assessments/{id}"))
        .await;
    assert_eq!(still_hidden.status, StatusCode::NOT_FOUND);

    // Activity lookup and course listing follow the same rules.
    let by_activity = app
        .get_as(
            &learner,
            &format!(
                "/api/v2/activities/{}/assessment",
                created.json()["activity_id"].as_str().unwrap()
            ),
        )
        .await;
    assert_eq!(by_activity.status, StatusCode::OK);
    app.post_as(
        &teacher,
        "/api/v2/assessments",
        &serde_json::json!({ "chapter_id": chapter_id, "kind": "exam", "title": "Draft exam" }),
    )
    .await;
    let teacher_list = app
        .get_as(
            &teacher,
            &format!("/api/v2/courses/{course_id}/assessments"),
        )
        .await;
    assert_eq!(teacher_list.json().as_array().unwrap().len(), 2);
    let learner_list = app
        .get_as(
            &learner,
            &format!("/api/v2/courses/{course_id}/assessments"),
        )
        .await;
    assert_eq!(learner_list.json().as_array().unwrap().len(), 1);

    // A rival instructor who can see the course still can't author on it.
    let rival = instructor(&app, "rival").await;
    let denied = app
        .patch_as(
            &rival,
            &format!("/api/v2/assessments/{id}"),
            &serde_json::json!({ "title": "Hijacked" }),
        )
        .await;
    assert_eq!(denied.status, StatusCode::FORBIDDEN);
}

#[sqlx::test(migrations = "../../migrations")]
async fn duplicate_copies_policy_and_items_as_a_fresh_draft(pool: PgPool) {
    let app = TestApp::spawn(pool).await;
    let teacher = instructor(&app, "teacher").await;
    let (course_id, chapter_id) = scaffold(&app, &teacher).await;
    let created = app
        .post_as(
            &teacher,
            "/api/v2/assessments",
            &serde_json::json!({ "chapter_id": chapter_id, "kind": "exam", "title": "Midterm" }),
        )
        .await;
    let id = created.json()["id"].as_str().unwrap().to_owned();
    app.post_as(
        &teacher,
        &format!("/api/v2/assessments/{id}/items"),
        &choice_item("Q1"),
    )
    .await;
    app.post_as(
        &teacher,
        &format!("/api/v2/assessments/{id}/items"),
        &choice_item("Q2"),
    )
    .await;
    app.post_as(
        &teacher,
        &format!("/api/v2/assessments/{id}/lifecycle"),
        &serde_json::json!({ "to": "published" }),
    )
    .await;

    let copy = app
        .post_as(
            &teacher,
            &format!("/api/v2/assessments/{id}/duplicate"),
            &serde_json::json!({}),
        )
        .await;
    assert_eq!(copy.status, StatusCode::CREATED, "{}", copy.text());
    let body = copy.json();
    assert_ne!(body["id"], id.as_str());
    assert_eq!(body["title"], "Midterm (copy)");
    assert_eq!(body["lifecycle"], "draft");
    assert!(body["published_at_unix"].is_null());
    // The exam preset travelled with the copy, and the items kept their order.
    assert_eq!(body["policy"]["time_limit_seconds"], 3600);
    assert_eq!(body["policy"]["fullscreen_required"], true);
    let titles: Vec<_> = body["items"]
        .as_array()
        .unwrap()
        .iter()
        .map(|i| i["title"].as_str().unwrap().to_owned())
        .collect();
    assert_eq!(titles, ["Q1", "Q2"]);
    assert_ne!(body["items"][0]["id"], created.json()["items"][0]["id"]);

    // Both activities now sit in the chapter; the copy is unpublished.
    let curriculum = app
        .get_as(&teacher, &format!("/api/v2/courses/{course_id}/curriculum"))
        .await;
    let activities = curriculum.json()["chapters"][0]["activities"]
        .as_array()
        .unwrap()
        .clone();
    assert_eq!(activities.len(), 2);
    assert_eq!(activities[1]["name"], "Midterm (copy)");
    assert_eq!(activities[1]["published"], false);

    // A chapter from another course is refused.
    let other = app
        .post_as(
            &teacher,
            "/api/v2/courses",
            &serde_json::json!({ "name": "Other" }),
        )
        .await;
    let other_id = other.json()["id"].as_str().unwrap().to_owned();
    let foreign = app
        .post_as(
            &teacher,
            &format!("/api/v2/courses/{other_id}/chapters"),
            &serde_json::json!({ "name": "Elsewhere" }),
        )
        .await;
    let refused = app
        .post_as(
            &teacher,
            &format!("/api/v2/assessments/{id}/duplicate"),
            &serde_json::json!({ "chapter_id": foreign.json()["id"] }),
        )
        .await;
    assert_eq!(refused.status, StatusCode::UNPROCESSABLE_ENTITY);
}
