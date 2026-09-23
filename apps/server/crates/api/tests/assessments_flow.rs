//! Assessment authoring flows: create with backing activity, items with
//! ordering + kind rules, wholesale policy replacement, readiness-gated
//! lifecycle transitions, audit trail, access rules.
#![allow(clippy::unwrap_used, clippy::expect_used, clippy::panic)]

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
    // UX-156: an out-of-range page size is a 422, not a silent clamp.
    let refused = app
        .get_as(
            &teacher,
            &format!("/api/v2/assessments/{id}/audit?limit=201"),
        )
        .await;
    assert_eq!(
        refused.status,
        StatusCode::UNPROCESSABLE_ENTITY,
        "{}",
        refused.text()
    );
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
                    "reference_solutions": { "71": "print('Fizz')" },
                    "tests": [
                        { "id": "t1", "input": "3", "expected_output": "Fizz" },
                        { "id": "t2", "input": "5", "expected_output": "Buzz", "is_visible": false }
                    ]
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
    app.publish_course(&course_id).await;
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
    // The learner read is redacted: no answer key, no reference solutions,
    // no hidden tests. The author still sees everything.
    let learner_body = &visible.json()["items"][0]["body"];
    assert!(
        learner_body["reference_solutions"]
            .as_object()
            .unwrap()
            .is_empty()
    );
    assert!(
        learner_body["tests"]
            .as_array()
            .unwrap()
            .iter()
            .all(|t| t["is_visible"] == true)
    );
    let author_view = app
        .get_as(&teacher, &format!("/api/v2/assessments/{id}"))
        .await;
    assert!(
        !author_view.json()["items"][0]["body"]["reference_solutions"]
            .as_object()
            .unwrap()
            .is_empty()
    );
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

    // BUG-201: a blank title is refused (422 `title`/`required`), a padded
    // one is trimmed for the copy and its activity.
    let blank = app
        .post_as(
            &teacher,
            &format!("/api/v2/assessments/{id}/duplicate"),
            &serde_json::json!({ "title": "   " }),
        )
        .await;
    assert_eq!(
        blank.status,
        StatusCode::UNPROCESSABLE_ENTITY,
        "{}",
        blank.text()
    );
    assert_eq!(blank.json()["field_errors"][0]["field"], "title");
    let padded = app
        .post_as(
            &teacher,
            &format!("/api/v2/assessments/{id}/duplicate"),
            &serde_json::json!({ "title": "  Retake " }),
        )
        .await;
    assert_eq!(padded.status, StatusCode::CREATED, "{}", padded.text());
    assert_eq!(padded.json()["title"], "Retake");
    let activity_id = padded.json()["activity_id"].as_str().unwrap().to_owned();
    assert_eq!(
        app.get_as(&teacher, &format!("/api/v2/activities/{activity_id}"))
            .await
            .json()["name"],
        "Retake"
    );
}

/// Q-2026-09-12-1: a learner reads a matching item as `MatchingLearnerBody`
/// (two columns, right one shuffled, stable across reloads, no `pairs`);
/// the answer names the column ids and the grader scores it against the
/// author's pairs, reporting the verdict as a code (Q-2026-09-11-2).
#[sqlx::test(migrations = "../../migrations")]
async fn matching_items_have_a_learner_shape_and_grade_by_id(pool: PgPool) {
    let app = TestApp::spawn(pool).await;
    let teacher = instructor(&app, "teacher").await;
    let (course_id, chapter_id) = scaffold(&app, &teacher).await;
    app.publish_course(&course_id).await;
    let created = app
        .post_as(
            &teacher,
            "/api/v2/assessments",
            &serde_json::json!({ "chapter_id": chapter_id, "kind": "quiz", "title": "Capitals" }),
        )
        .await;
    let id = created.json()["id"].as_str().unwrap().to_owned();
    let pairs: Vec<serde_json::Value> =
        ["Kazakhstan", "France", "Japan", "Peru", "Kenya", "Norway"]
            .iter()
            .zip(["Astana", "Paris", "Tokyo", "Lima", "Nairobi", "Oslo"])
            .map(|(left, right)| serde_json::json!({ "left": left, "right": right }))
            .collect();
    let item = app
        .post_as(
            &teacher,
            &format!("/api/v2/assessments/{id}/items"),
            &serde_json::json!({
                "title": "Capitals", "max_score": 6,
                "body": { "kind": "matching", "prompt": "Match", "pairs": pairs,
                          "explanation": "Key" }
            }),
        )
        .await;
    assert_eq!(item.status, StatusCode::CREATED, "{}", item.text());
    let item_id = item.json()["id"].as_str().unwrap().to_owned();
    assert_eq!(item.json()["body"]["pairs"].as_array().unwrap().len(), 6);
    let published = app
        .post_as(
            &teacher,
            &format!("/api/v2/assessments/{id}/lifecycle"),
            &serde_json::json!({ "to": "published" }),
        )
        .await;
    assert_eq!(published.status, StatusCode::OK, "{}", published.text());

    let learner = {
        let user = app
            .create_user("alice", "alice@example.com", &["user"])
            .await;
        app.mint_session_for(
            user,
            &["assessment:read:assigned", "assessment:submit:assigned"],
        )
        .await
    };
    let read = app
        .get_as(&learner, &format!("/api/v2/assessments/{id}"))
        .await;
    assert_eq!(read.status, StatusCode::OK, "{}", read.text());
    let body = read.json()["items"][0]["body"].clone();
    assert_eq!(body["kind"], "matching");
    assert!(body.get("pairs").is_none() && body.get("explanation").is_none());
    assert_eq!(body["prompt"], "Match");
    let column = |side: &str| -> Vec<String> {
        body[side]
            .as_array()
            .unwrap()
            .iter()
            .map(|o| {
                assert_eq!(o["id"], o["text"]);
                o["id"].as_str().unwrap().to_owned()
            })
            .collect()
    };
    assert_eq!(
        column("left"),
        ["Kazakhstan", "France", "Japan", "Peru", "Kenya", "Norway"]
    );
    let right = column("right");
    let mut sorted = right.clone();
    sorted.sort();
    assert_eq!(
        sorted,
        ["Astana", "Lima", "Nairobi", "Oslo", "Paris", "Tokyo"]
    );
    assert_ne!(
        right,
        ["Astana", "Paris", "Tokyo", "Lima", "Nairobi", "Oslo"],
        "the right column is shuffled"
    );
    let again = app
        .get_as(&learner, &format!("/api/v2/assessments/{id}"))
        .await;
    assert_eq!(again.json()["items"][0]["body"]["right"], body["right"]);
    // Authors keep the pairs.
    assert_eq!(
        app.get_as(&teacher, &format!("/api/v2/assessments/{id}"))
            .await
            .json()["items"][0]["body"]["pairs"]
            .as_array()
            .unwrap()
            .len(),
        6
    );

    // Answer by column ids: 4 of 6 right → 66.67, verdict as a code.
    let draft = app
        .post_as(
            &learner,
            &format!("/api/v2/assessments/{id}/submissions"),
            &serde_json::json!({}),
        )
        .await;
    assert_eq!(draft.status, StatusCode::CREATED, "{}", draft.text());
    let sub_id = draft.json()["id"].as_str().unwrap().to_owned();
    // UX-108: a misspelled answer key (`pairs`) is 422, not stored as empty.
    let unknown_field = app
        .post_as(
            &learner,
            &format!("/api/v2/submissions/{sub_id}/submit"),
            &serde_json::json!({ "answers": { &item_id: { "kind": "matching", "pairs": [
                { "left": "Kazakhstan", "right": "Astana" },
            ] } } }),
        )
        .await;
    assert_eq!(
        unknown_field.status,
        StatusCode::UNPROCESSABLE_ENTITY,
        "{}",
        unknown_field.text()
    );
    let submitted = app
        .post_as(
            &learner,
            &format!("/api/v2/submissions/{sub_id}/submit"),
            &serde_json::json!({ "answers": { &item_id: { "kind": "matching", "matches": [
                { "left": "Kazakhstan", "right": "Astana" },
                { "left": "France", "right": "Paris" },
                { "left": "Japan", "right": "Tokyo" },
                { "left": "Peru", "right": "Lima" },
                { "left": "Kenya", "right": "Oslo" },
                { "left": "Norway", "right": "Nairobi" },
            ] } } }),
        )
        .await;
    assert_eq!(submitted.status, StatusCode::OK, "{}", submitted.text());
    let review = app
        .get_as(&teacher, &format!("/api/v2/submissions/{sub_id}/review"))
        .await;
    let graded = &review.json()["grading"]["items"][0];
    assert_eq!(graded["score"], 66.67);
    assert_eq!(graded["correct"], false);
    assert_eq!(graded["feedback_code"], "pairs-matched");
    assert_eq!(
        graded["feedback_params"],
        serde_json::json!({ "correct": 4, "total": 6 })
    );
    assert_eq!(graded["feedback"], "4/6 pairs matched");
}

/// BUG-193: duplicate picks and several rights per left count once (legacy
/// `set(selected)` / `{left: right}`); no item or attempt scores above its
/// maximum, and the stored answer is the deduped one.
#[sqlx::test(migrations = "../../migrations")]
async fn duplicate_picks_do_not_inflate_grades(pool: PgPool) {
    let app = TestApp::spawn(pool).await;
    let teacher = instructor(&app, "teacher").await;
    let (course_id, chapter_id) = scaffold(&app, &teacher).await;
    app.publish_course(&course_id).await;
    let created = app
        .post_as(
            &teacher,
            "/api/v2/assessments",
            &serde_json::json!({ "chapter_id": chapter_id, "kind": "quiz", "title": "Dups" }),
        )
        .await;
    let id = created.json()["id"].as_str().unwrap().to_owned();
    let mut item_ids = Vec::new();
    for body in [
        choice_item("single")["body"].clone(),
        serde_json::json!({
            "kind": "choice", "prompt": "multi", "multiple": true,
            "options": [
                { "id": "a", "text": "a", "is_correct": true },
                { "id": "b", "text": "b", "is_correct": false },
                { "id": "c", "text": "c", "is_correct": true }
            ]
        }),
        serde_json::json!({
            "kind": "matching", "prompt": "match",
            "pairs": [
                { "left": "1", "right": "r1" },
                { "left": "2", "right": "r2" },
                { "left": "3", "right": "r3" }
            ]
        }),
    ] {
        let item = app
            .post_as(
                &teacher,
                &format!("/api/v2/assessments/{id}/items"),
                &serde_json::json!({ "title": body["prompt"], "max_score": 10, "body": body }),
            )
            .await;
        assert_eq!(item.status, StatusCode::CREATED, "{}", item.text());
        item_ids.push(item.json()["id"].as_str().unwrap().to_owned());
    }
    let published = app
        .post_as(
            &teacher,
            &format!("/api/v2/assessments/{id}/lifecycle"),
            &serde_json::json!({ "to": "published" }),
        )
        .await;
    assert_eq!(published.status, StatusCode::OK, "{}", published.text());

    let learner = {
        let user = app
            .create_user("alice", "alice@example.com", &["user"])
            .await;
        app.mint_session_for(
            user,
            &["assessment:read:assigned", "assessment:submit:assigned"],
        )
        .await
    };
    let draft = app
        .post_as(
            &learner,
            &format!("/api/v2/assessments/{id}/submissions"),
            &serde_json::json!({}),
        )
        .await;
    assert_eq!(draft.status, StatusCode::CREATED, "{}", draft.text());
    let sub_id = draft.json()["id"].as_str().unwrap().to_owned();
    let combos: Vec<serde_json::Value> = (1..=3)
        .flat_map(|l| (1..=3).map(move |r| (l, r)))
        .map(|(l, r)| serde_json::json!({ "left": l.to_string(), "right": format!("r{r}") }))
        .collect();
    let submitted = app
        .post_as(
            &learner,
            &format!("/api/v2/submissions/{sub_id}/submit"),
            &serde_json::json!({ "answers": {
                &item_ids[0]: { "kind": "choice", "selected": ["a", "a", "a"] },
                &item_ids[1]: { "kind": "choice", "selected": ["a", "a"] },
                &item_ids[2]: { "kind": "matching", "matches": combos },
            } }),
        )
        .await;
    assert_eq!(submitted.status, StatusCode::OK, "{}", submitted.text());
    let body = submitted.json();
    assert_eq!(body["auto_score"], 61.12, "{body}");
    assert_eq!(
        body["answers"][&item_ids[0]]["selected"],
        serde_json::json!(["a"])
    );
    assert_eq!(
        body["answers"][&item_ids[2]]["matches"]
            .as_array()
            .unwrap()
            .len(),
        3
    );
    let review = app
        .get_as(&teacher, &format!("/api/v2/submissions/{sub_id}/review"))
        .await;
    let items = review.json()["grading"]["items"].clone();
    assert_eq!(items[0]["score"], 33.33);
    assert_eq!(items[0]["correct"], true);
    assert_eq!(items[1]["score"], 16.67);
    assert_eq!(items[1]["feedback_code"], "partially-correct");
    assert_eq!(items[2]["score"], 11.11);
    assert_eq!(
        items[2]["feedback_params"],
        serde_json::json!({ "correct": 1, "total": 3 })
    );
    for g in items.as_array().unwrap() {
        assert!(g["score"].as_f64() <= g["max_score"].as_f64(), "{g}");
    }
}

/// Studio guards on the money/permission/deadline paths: a schedule after
/// the due date is a readiness blocker; a published assessment with any
/// submission is read-only (`ensure_editable`), including item content
/// (`ensure_content_unlocked`), and the lock lifts on published→draft
/// (legacy parity); a learner without `assessment:submit:*` is 403; the
/// item cap is 200.
#[sqlx::test(migrations = "../../migrations")]
async fn studio_locks_schedule_bounds_and_item_cap(pool: PgPool) {
    let app = TestApp::spawn(pool).await;
    let teacher = instructor(&app, "teacher").await;
    let (course_id, chapter_id) = scaffold(&app, &teacher).await;
    app.publish_course(&course_id).await;
    let created = app
        .post_as(
            &teacher,
            "/api/v2/assessments",
            &serde_json::json!({ "chapter_id": chapter_id, "kind": "quiz", "title": "Q" }),
        )
        .await;
    let id = created.json()["id"].as_str().unwrap().to_owned();
    let item = app
        .post_as(
            &teacher,
            &format!("/api/v2/assessments/{id}/items"),
            &choice_item("1+1?"),
        )
        .await;
    let item_id = item.json()["id"].as_str().unwrap().to_owned();
    let put_policy = |policy: serde_json::Value| {
        app.send(
            axum::http::Request::builder()
                .method("PUT")
                .uri(format!("/api/v2/assessments/{id}/policy"))
                .header(axum::http::header::CONTENT_TYPE, "application/json")
                .header(axum::http::header::COOKIE, &teacher.cookie)
                .body(axum::body::Body::from(policy.to_string()))
                .unwrap(),
        )
    };
    let mut policy = created.json()["policy"].clone();
    policy["due_at_unix"] = serde_json::json!(far_future());
    let saved = put_policy(policy.clone()).await;
    assert_eq!(saved.status, StatusCode::OK, "{}", saved.text());

    // Scheduled opening after the due date → readiness blocker.
    let late = app
        .post_as(
            &teacher,
            &format!("/api/v2/assessments/{id}/lifecycle"),
            &serde_json::json!({ "to": "scheduled", "scheduled_at_unix": far_future() + 3600 }),
        )
        .await;
    assert_eq!(
        late.status,
        StatusCode::UNPROCESSABLE_ENTITY,
        "{}",
        late.text()
    );
    assert!(
        late.json()["field_errors"]
            .as_array()
            .unwrap()
            .iter()
            .any(|e| e["code"] == "schedule.after_due_at"),
        "{}",
        late.text()
    );
    let published = app
        .post_as(
            &teacher,
            &format!("/api/v2/assessments/{id}/lifecycle"),
            &serde_json::json!({ "to": "published" }),
        )
        .await;
    assert_eq!(published.status, StatusCode::OK, "{}", published.text());

    // Course access without `assessment:submit:*` → 403.
    let reader = app
        .create_user("reader", "reader@example.com", &["user"])
        .await;
    let reader = app
        .mint_session_for(reader, &["assessment:read:assigned"])
        .await;
    let denied = app
        .get_as(&reader, &format!("/api/v2/assessments/{id}/attempt-state"))
        .await;
    assert_eq!(denied.status, StatusCode::FORBIDDEN, "{}", denied.text());

    // A submitted attempt freezes the published assessment.
    let learner = app
        .create_user("alice", "alice@example.com", &["user"])
        .await;
    let alice = app
        .mint_session_for(
            learner,
            &["assessment:submit:assigned", "assessment:read:assigned"],
        )
        .await;
    let started = app
        .post_as(
            &alice,
            &format!("/api/v2/assessments/{id}/submissions"),
            &serde_json::json!({}),
        )
        .await;
    assert_eq!(started.status, StatusCode::CREATED, "{}", started.text());
    let sub_id = started.json()["id"].as_str().unwrap().to_owned();
    let submitted = app
        .post_as(
            &alice,
            &format!("/api/v2/submissions/{sub_id}/submit"),
            &serde_json::json!({ "answers": { &item_id: { "kind": "choice", "selected": ["a"] } } }),
        )
        .await;
    assert_eq!(submitted.status, StatusCode::OK, "{}", submitted.text());

    let renamed = app
        .patch_as(
            &teacher,
            &format!("/api/v2/assessments/{id}"),
            &serde_json::json!({ "title": "Q2" }),
        )
        .await;
    assert_eq!(renamed.status, StatusCode::CONFLICT, "{}", renamed.text());
    let policy_locked = put_policy(policy).await;
    assert_eq!(policy_locked.status, StatusCode::CONFLICT);
    let added = app
        .post_as(
            &teacher,
            &format!("/api/v2/assessments/{id}/items"),
            &choice_item("2+2?"),
        )
        .await;
    assert_eq!(added.status, StatusCode::CONFLICT);
    let rescored = app
        .patch_as(
            &teacher,
            &format!("/api/v2/assessment-items/{item_id}"),
            &serde_json::json!({ "max_score": 7 }),
        )
        .await;
    assert_eq!(rescored.status, StatusCode::CONFLICT, "{}", rescored.text());
    let deleted = app
        .delete_as(&teacher, &format!("/api/v2/assessment-items/{item_id}"))
        .await;
    assert_eq!(deleted.status, StatusCode::CONFLICT);

    // Published → draft lifts the lock (legacy `_is_assessment_locked` parity).
    let back = app
        .post_as(
            &teacher,
            &format!("/api/v2/assessments/{id}/lifecycle"),
            &serde_json::json!({ "to": "draft" }),
        )
        .await;
    assert_eq!(back.status, StatusCode::OK, "{}", back.text());
    let rescored = app
        .patch_as(
            &teacher,
            &format!("/api/v2/assessment-items/{item_id}"),
            &serde_json::json!({ "max_score": 7 }),
        )
        .await;
    assert_eq!(rescored.status, StatusCode::OK, "{}", rescored.text());

    // Item cap: the 201st item is refused.
    for n in 1..200 {
        let res = app
            .post_as(
                &teacher,
                &format!("/api/v2/assessments/{id}/items"),
                &choice_item(&format!("q{n}")),
            )
            .await;
        assert_eq!(res.status, StatusCode::CREATED, "{}", res.text());
    }
    let capped = app
        .post_as(
            &teacher,
            &format!("/api/v2/assessments/{id}/items"),
            &choice_item("one too many"),
        )
        .await;
    assert_eq!(
        capped.status,
        StatusCode::UNPROCESSABLE_ENTITY,
        "{}",
        capped.text()
    );
    assert_eq!(capped.json()["field_errors"][0]["code"], "limit-exceeded");
}

/// A live assessment keeps at least one item (409 on the last delete);
/// a visible non-author cannot transition it (403); the curriculum toggle
/// hides a published assessment from learners exactly like the activity
/// read (404 on get / attempt-state / start — BUG-151).
#[sqlx::test(migrations = "../../migrations")]
async fn live_assessments_keep_an_item_and_hide_with_their_activity(pool: PgPool) {
    let app = TestApp::spawn(pool).await;
    let teacher = instructor(&app, "teacher").await;
    let (course_id, chapter_id) = scaffold(&app, &teacher).await;
    app.publish_course(&course_id).await;
    let created = app
        .post_as(
            &teacher,
            "/api/v2/assessments",
            &serde_json::json!({ "chapter_id": chapter_id, "kind": "quiz", "title": "Q" }),
        )
        .await;
    let id = created.json()["id"].as_str().unwrap().to_owned();
    let activity_id = created.json()["activity_id"].as_str().unwrap().to_owned();
    let item = app
        .post_as(
            &teacher,
            &format!("/api/v2/assessments/{id}/items"),
            &choice_item("1+1?"),
        )
        .await;
    let item_id = item.json()["id"].as_str().unwrap().to_owned();
    let published = app
        .post_as(
            &teacher,
            &format!("/api/v2/assessments/{id}/lifecycle"),
            &serde_json::json!({ "to": "published" }),
        )
        .await;
    assert_eq!(published.status, StatusCode::OK, "{}", published.text());

    let last = app
        .delete_as(&teacher, &format!("/api/v2/assessment-items/{item_id}"))
        .await;
    assert_eq!(last.status, StatusCode::CONFLICT, "{}", last.text());
    assert_eq!(last.json()["code"], "conflict");

    let learner = app
        .create_user("alice", "alice@example.com", &["user"])
        .await;
    let alice = app
        .mint_session_for(
            learner,
            &["assessment:submit:assigned", "assessment:read:assigned"],
        )
        .await;
    let hijack = app
        .post_as(
            &alice,
            &format!("/api/v2/assessments/{id}/lifecycle"),
            &serde_json::json!({ "to": "draft" }),
        )
        .await;
    assert_eq!(hijack.status, StatusCode::FORBIDDEN, "{}", hijack.text());
    let state = app
        .get_as(&alice, &format!("/api/v2/assessments/{id}/attempt-state"))
        .await;
    assert_eq!(state.status, StatusCode::OK, "{}", state.text());

    // Curriculum unpublish of the activity: the assessment stays
    // `published` but no longer exists for learners.
    let hidden = app
        .patch_as(
            &teacher,
            &format!("/api/v2/activities/{activity_id}"),
            &serde_json::json!({ "published": false }),
        )
        .await;
    assert_eq!(hidden.status, StatusCode::OK, "{}", hidden.text());
    let read = app
        .get_as(&alice, &format!("/api/v2/assessments/{id}"))
        .await;
    assert_eq!(read.status, StatusCode::NOT_FOUND, "{}", read.text());
    let state = app
        .get_as(&alice, &format!("/api/v2/assessments/{id}/attempt-state"))
        .await;
    assert_eq!(state.status, StatusCode::NOT_FOUND, "{}", state.text());
    let started = app
        .post_as(
            &alice,
            &format!("/api/v2/assessments/{id}/submissions"),
            &serde_json::json!({}),
        )
        .await;
    assert_eq!(started.status, StatusCode::NOT_FOUND, "{}", started.text());
    // Authors still see it.
    let own = app
        .get_as(&teacher, &format!("/api/v2/assessments/{id}"))
        .await;
    assert_eq!(own.status, StatusCode::OK, "{}", own.text());
}

/// BUG-160: `randomize_questions` / `randomize_options` are applied on the
/// learner read — a stable order per learner (reload keeps it), a different
/// one for another learner; authors keep the authored order.
#[sqlx::test(migrations = "../../migrations")]
async fn randomize_flags_shuffle_the_learner_read_per_learner(pool: PgPool) {
    let app = TestApp::spawn(pool).await;
    let teacher = instructor(&app, "teacher").await;
    let (course_id, chapter_id) = scaffold(&app, &teacher).await;
    app.publish_course(&course_id).await;
    let created = app
        .post_as(
            &teacher,
            "/api/v2/assessments",
            &serde_json::json!({ "chapter_id": chapter_id, "kind": "quiz", "title": "Shuffled" }),
        )
        .await;
    let id = created.json()["id"].as_str().unwrap().to_owned();
    let options: Vec<serde_json::Value> = (0..8)
        .map(|n| serde_json::json!({ "id": format!("o{n}"), "text": format!("{n}"), "is_correct": n == 0 }))
        .collect();
    for n in 0..8 {
        let item = app
            .post_as(
                &teacher,
                &format!("/api/v2/assessments/{id}/items"),
                &serde_json::json!({
                    "title": format!("q{n}"), "max_score": 1,
                    "body": { "kind": "choice", "prompt": format!("q{n}"), "options": options }
                }),
            )
            .await;
        assert_eq!(item.status, StatusCode::CREATED, "{}", item.text());
    }
    let mut policy = created.json()["policy"].clone();
    policy["randomize_questions"] = serde_json::json!(true);
    policy["randomize_options"] = serde_json::json!(true);
    let saved = app
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
    assert_eq!(saved.status, StatusCode::OK, "{}", saved.text());
    let published = app
        .post_as(
            &teacher,
            &format!("/api/v2/assessments/{id}/lifecycle"),
            &serde_json::json!({ "to": "published" }),
        )
        .await;
    assert_eq!(published.status, StatusCode::OK, "{}", published.text());

    let app = &app;
    let learner = |name: &'static str| async move {
        let user = app
            .create_user(name, &format!("{name}@example.com"), &["user"])
            .await;
        app.mint_session_for(user, &["assessment:read:assigned"])
            .await
    };
    let alice = learner("alice").await;
    let bob = learner("bob").await;
    let orders = |json: &serde_json::Value| -> (Vec<String>, Vec<String>) {
        let items = json["items"].as_array().unwrap();
        (
            items
                .iter()
                .map(|i| i["title"].as_str().unwrap().to_owned())
                .collect(),
            items[0]["body"]["options"]
                .as_array()
                .unwrap()
                .iter()
                .map(|o| o["id"].as_str().unwrap().to_owned())
                .collect(),
        )
    };
    let authored: Vec<String> = (0..8).map(|n| format!("q{n}")).collect();
    let authored_options: Vec<String> = (0..8).map(|n| format!("o{n}")).collect();
    let alice_read = orders(
        &app.get_as(&alice, &format!("/api/v2/assessments/{id}"))
            .await
            .json(),
    );
    let alice_again = orders(
        &app.get_as(&alice, &format!("/api/v2/assessments/{id}"))
            .await
            .json(),
    );
    let bob_read = orders(
        &app.get_as(&bob, &format!("/api/v2/assessments/{id}"))
            .await
            .json(),
    );
    assert_eq!(alice_read, alice_again, "a reload keeps the order");
    assert_ne!(alice_read.0, authored, "questions shuffled");
    assert_ne!(alice_read.1, authored_options, "options shuffled");
    assert_ne!(alice_read, bob_read, "another learner gets another order");
    let mut sorted = alice_read.0.clone();
    sorted.sort();
    assert_eq!(sorted, authored);
    let teacher_read = orders(
        &app.get_as(&teacher, &format!("/api/v2/assessments/{id}"))
            .await
            .json(),
    );
    assert_eq!(teacher_read, (authored, authored_options));
}

/// BUG-162: a scheduled assessment is read-only (409 `conflict`, unschedule
/// first) — its readiness was gated at schedule time; and the auto-publish
/// sweep re-checks readiness, leaving a blocked schedule `scheduled` with
/// an audit row instead of going live past due.
#[sqlx::test(migrations = "../../migrations")]
async fn scheduled_assessments_are_read_only_and_publish_due_rechecks_readiness(pool: PgPool) {
    let app = TestApp::spawn(pool).await;
    let teacher = instructor(&app, "teacher").await;
    let (course_id, chapter_id) = scaffold(&app, &teacher).await;
    app.publish_course(&course_id).await;
    let created = app
        .post_as(
            &teacher,
            "/api/v2/assessments",
            &serde_json::json!({ "chapter_id": chapter_id, "kind": "quiz", "title": "Timed" }),
        )
        .await;
    let id = created.json()["id"].as_str().unwrap().to_owned();
    let item = app
        .post_as(
            &teacher,
            &format!("/api/v2/assessments/{id}/items"),
            &choice_item("Q1"),
        )
        .await;
    let item_id = item.json()["id"].as_str().unwrap().to_owned();
    let scheduled = app
        .post_as(
            &teacher,
            &format!("/api/v2/assessments/{id}/lifecycle"),
            &serde_json::json!({ "to": "scheduled", "scheduled_at_unix": far_future() }),
        )
        .await;
    assert_eq!(scheduled.status, StatusCode::OK, "{}", scheduled.text());

    // Every edit path is refused while scheduled.
    let policy = created.json()["policy"].clone();
    let edit = app
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
    assert_eq!(edit.status, StatusCode::CONFLICT, "{}", edit.text());
    assert_eq!(edit.json()["code"], "conflict");
    let item_edit = app
        .patch_as(
            &teacher,
            &format!("/api/v2/assessment-items/{item_id}"),
            &serde_json::json!({ "title": "" }),
        )
        .await;
    assert_eq!(
        item_edit.status,
        StatusCode::CONFLICT,
        "{}",
        item_edit.text()
    );
    // UX-120: the curriculum rename writes the same title — same lock.
    let activity_id = created.json()["activity_id"].as_str().unwrap().to_owned();
    let rename = app
        .patch_as(
            &teacher,
            &format!("/api/v2/activities/{activity_id}"),
            &serde_json::json!({ "name": "Renamed while scheduled" }),
        )
        .await;
    assert_eq!(rename.status, StatusCode::CONFLICT, "{}", rename.text());
    let detail = app
        .get_as(&teacher, &format!("/api/v2/assessments/{id}"))
        .await;
    assert_eq!(detail.json()["title"], "Timed", "{}", detail.text());

    // The world moves: the schedule is now due and after the due date.
    sqlx::query(
        "UPDATE assessments SET scheduled_at = now() - interval '1 minute',
                                due_at = now() - interval '1 hour' WHERE id = $1",
    )
    .bind(uuid::Uuid::parse_str(&id).unwrap())
    .execute(&app.pool)
    .await
    .unwrap();
    let published = ab_domain::assessments::AssessmentsService::publish_due(&app.pool)
        .await
        .unwrap();
    assert_eq!(published, 0);
    let detail = app
        .get_as(&teacher, &format!("/api/v2/assessments/{id}"))
        .await;
    assert_eq!(detail.json()["lifecycle"], "scheduled", "{}", detail.text());
    let audit = app
        .get_as(&teacher, &format!("/api/v2/assessments/{id}/audit"))
        .await;
    assert!(
        audit.text().contains("auto-publish-skipped")
            && audit.text().contains("schedule.after_due_at"),
        "{}",
        audit.text()
    );

    // Ready again → the sweep publishes it.
    sqlx::query("UPDATE assessments SET due_at = NULL WHERE id = $1")
        .bind(uuid::Uuid::parse_str(&id).unwrap())
        .execute(&app.pool)
        .await
        .unwrap();
    let published = ab_domain::assessments::AssessmentsService::publish_due(&app.pool)
        .await
        .unwrap();
    assert_eq!(published, 1);
    let detail = app
        .get_as(&teacher, &format!("/api/v2/assessments/{id}"))
        .await;
    assert_eq!(detail.json()["lifecycle"], "published", "{}", detail.text());
}

/// BUG-177: a whitespace-only title is 422 `title`/`required` on create and
/// update (garde's `min=1` saw the untrimmed string); stored titles are
/// trimmed on both the assessment and its activity.
#[sqlx::test(migrations = "../../migrations")]
async fn blank_titles_are_rejected_and_trimmed(pool: PgPool) {
    let app = TestApp::spawn(pool).await;
    let teacher = instructor(&app, "teacher").await;
    let (_course_id, chapter_id) = scaffold(&app, &teacher).await;
    let blank = app
        .post_as(
            &teacher,
            "/api/v2/assessments",
            &serde_json::json!({ "chapter_id": chapter_id, "kind": "quiz", "title": "   " }),
        )
        .await;
    assert_eq!(
        blank.status,
        StatusCode::UNPROCESSABLE_ENTITY,
        "{}",
        blank.text()
    );
    assert_eq!(blank.json()["field_errors"][0]["field"], "title");
    assert_eq!(blank.json()["field_errors"][0]["code"], "required");

    let created = app
        .post_as(
            &teacher,
            "/api/v2/assessments",
            &serde_json::json!({ "chapter_id": chapter_id, "kind": "quiz", "title": "  Quiz  " }),
        )
        .await;
    assert_eq!(created.status, StatusCode::CREATED, "{}", created.text());
    assert_eq!(created.json()["title"], "Quiz");
    let id = created.json()["id"].as_str().unwrap().to_owned();
    let activity_id = created.json()["activity_id"].as_str().unwrap().to_owned();

    let blank = app
        .patch_as(
            &teacher,
            &format!("/api/v2/assessments/{id}"),
            &serde_json::json!({ "title": "  " }),
        )
        .await;
    assert_eq!(
        blank.status,
        StatusCode::UNPROCESSABLE_ENTITY,
        "{}",
        blank.text()
    );
    assert_eq!(blank.json()["field_errors"][0]["field"], "title");
    let renamed = app
        .patch_as(
            &teacher,
            &format!("/api/v2/assessments/{id}"),
            &serde_json::json!({ "title": "  Quiz 2 " }),
        )
        .await;
    assert_eq!(renamed.status, StatusCode::OK, "{}", renamed.text());
    assert_eq!(renamed.json()["title"], "Quiz 2");
    let activity = app
        .get_as(&teacher, &format!("/api/v2/activities/{activity_id}"))
        .await;
    assert_eq!(activity.json()["name"], "Quiz 2", "{}", activity.text());

    // UX-139: the same rule for an item title, on add and on PATCH.
    let blank_item = app
        .post_as(
            &teacher,
            &format!("/api/v2/assessments/{id}/items"),
            &choice_item("   "),
        )
        .await;
    assert_eq!(
        blank_item.status,
        StatusCode::UNPROCESSABLE_ENTITY,
        "{}",
        blank_item.text()
    );
    assert_eq!(blank_item.json()["field_errors"][0]["field"], "title");
    let item = app
        .post_as(
            &teacher,
            &format!("/api/v2/assessments/{id}/items"),
            &choice_item(" Q1 "),
        )
        .await;
    assert_eq!(item.status, StatusCode::CREATED, "{}", item.text());
    assert_eq!(item.json()["title"], "Q1");
    let item_id = item.json()["id"].as_str().unwrap().to_owned();
    let blank_item = app
        .patch_as(
            &teacher,
            &format!("/api/v2/assessment-items/{item_id}"),
            &serde_json::json!({ "title": "   " }),
        )
        .await;
    assert_eq!(
        blank_item.status,
        StatusCode::UNPROCESSABLE_ENTITY,
        "{}",
        blank_item.text()
    );
    assert_eq!(blank_item.json()["field_errors"][0]["field"], "title");
    assert_eq!(blank_item.json()["field_errors"][0]["code"], "required");
}

/// BUG-199: the grader matches choice answers by option id, so an item whose
/// options share an id is refused at create and patch (422
/// `choice.option_id_duplicate` on `body.options`), not stored and graded
/// as «correct» for whichever text the learner picked.
#[sqlx::test(migrations = "../../migrations")]
async fn duplicate_choice_option_ids_are_refused(pool: PgPool) {
    let app = TestApp::spawn(pool).await;
    let teacher = instructor(&app, "teacher").await;
    let (_course_id, chapter_id) = scaffold(&app, &teacher).await;
    let created = app
        .post_as(
            &teacher,
            "/api/v2/assessments",
            &serde_json::json!({ "chapter_id": chapter_id, "kind": "quiz", "title": "Quiz" }),
        )
        .await;
    let id = created.json()["id"].as_str().unwrap().to_owned();
    let mut item = choice_item("1+1?");
    item["body"]["options"][1]["id"] = serde_json::json!("a");
    let refused = app
        .post_as(&teacher, &format!("/api/v2/assessments/{id}/items"), &item)
        .await;
    assert_eq!(
        refused.status,
        StatusCode::UNPROCESSABLE_ENTITY,
        "{}",
        refused.text()
    );
    assert_eq!(
        refused.json()["field_errors"][0]["code"],
        "choice.option_id_duplicate"
    );

    let ok = app
        .post_as(
            &teacher,
            &format!("/api/v2/assessments/{id}/items"),
            &choice_item("1+1?"),
        )
        .await;
    assert_eq!(ok.status, StatusCode::CREATED, "{}", ok.text());
    let item_id = ok.json()["id"].as_str().unwrap().to_owned();
    let patched = app
        .patch_as(
            &teacher,
            &format!("/api/v2/assessment-items/{item_id}"),
            &serde_json::json!({ "body": item["body"] }),
        )
        .await;
    assert_eq!(
        patched.status,
        StatusCode::UNPROCESSABLE_ENTITY,
        "{}",
        patched.text()
    );
    assert_eq!(
        patched.json()["field_errors"][0]["code"],
        "choice.option_id_duplicate"
    );
}

/// UX-137: item titles are stored trimmed; legal-but-odd policy combinations
/// (due date in the past, cutoff before due, penalty while late is off) show
/// up as readiness warnings that never block publishing.
#[sqlx::test(migrations = "../../migrations")]
async fn policy_oddities_warn_and_item_titles_are_trimmed(pool: PgPool) {
    let app = TestApp::spawn(pool).await;
    let teacher = instructor(&app, "teacher").await;
    let (_course_id, chapter_id) = scaffold(&app, &teacher).await;
    let created = app
        .post_as(
            &teacher,
            "/api/v2/assessments",
            &serde_json::json!({ "chapter_id": chapter_id, "kind": "quiz", "title": "Quiz" }),
        )
        .await;
    let id = created.json()["id"].as_str().unwrap().to_owned();
    let mut item = choice_item("Q1");
    item["title"] = serde_json::json!("  Q1 renamed ");
    let item = app
        .post_as(&teacher, &format!("/api/v2/assessments/{id}/items"), &item)
        .await;
    assert_eq!(item.status, StatusCode::CREATED, "{}", item.text());
    assert_eq!(item.json()["title"], "Q1 renamed");

    let mut policy = created.json()["policy"].clone();
    policy["due_at_unix"] = serde_json::json!(1_000_000);
    policy["allow_late"] = serde_json::json!(false);
    policy["late_policy"] =
        serde_json::json!({ "kind": "penalty", "percent_per_day": 10, "max_days": 5 });
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
    let readiness = app
        .get_as(&teacher, &format!("/api/v2/assessments/{id}/readiness"))
        .await;
    let body = readiness.json();
    assert_eq!(body["ok"], true, "{body}");
    let mut warnings: Vec<_> = body["issues"]
        .as_array()
        .unwrap()
        .iter()
        .filter(|i| i["severity"] == "warning")
        .map(|i| i["code"].as_str().unwrap().to_owned())
        .collect();
    warnings.sort();
    assert_eq!(
        warnings,
        ["policy.due_at_past", "policy.penalty_without_late"]
    );
    assert_eq!(body["warning_count"], 2);

    policy["late_policy"] = serde_json::json!({ "kind": "cutoff", "cutoff_at_unix": 999 });
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
    let readiness = app
        .get_as(&teacher, &format!("/api/v2/assessments/{id}/readiness"))
        .await;
    assert!(
        readiness.json()["issues"]
            .as_array()
            .unwrap()
            .iter()
            .any(|i| i["code"] == "policy.cutoff_before_due"),
        "{}",
        readiness.text()
    );
}

/// BUG-207: a published assessment (no submissions) stays ready — an item
/// add/patch that would fail readiness is a 409 carrying the codes, while a
/// ready edit still lands.
#[sqlx::test(migrations = "../../migrations")]
async fn live_assessment_edits_must_keep_it_ready(pool: PgPool) {
    let app = TestApp::spawn(pool).await;
    let teacher = instructor(&app, "teacher").await;
    let (course_id, chapter_id) = scaffold(&app, &teacher).await;
    app.publish_course(&course_id).await;
    let created = app
        .post_as(
            &teacher,
            "/api/v2/assessments",
            &serde_json::json!({ "chapter_id": chapter_id, "kind": "quiz", "title": "Live" }),
        )
        .await;
    let id = created.json()["id"].as_str().unwrap().to_owned();
    let item = app
        .post_as(
            &teacher,
            &format!("/api/v2/assessments/{id}/items"),
            &choice_item("1+1?"),
        )
        .await;
    let item_id = item.json()["id"].as_str().unwrap().to_owned();
    let published = app
        .post_as(
            &teacher,
            &format!("/api/v2/assessments/{id}/lifecycle"),
            &serde_json::json!({ "to": "published" }),
        )
        .await;
    assert_eq!(published.status, StatusCode::OK, "{}", published.text());

    let no_options = app
        .post_as(
            &teacher,
            &format!("/api/v2/assessments/{id}/items"),
            &serde_json::json!({ "title": "noopts", "max_score": 5,
                                  "body": { "kind": "choice", "prompt": "empty?", "options": [] } }),
        )
        .await;
    assert_eq!(
        no_options.status,
        StatusCode::CONFLICT,
        "{}",
        no_options.text()
    );
    assert_eq!(no_options.json()["code"], "conflict");
    let codes = no_options.json()["details"]["readiness"].clone();
    assert!(
        codes
            .as_array()
            .unwrap()
            .contains(&serde_json::json!("choice.options_missing")),
        "{codes}"
    );

    let mut no_correct = choice_item("1+1?")["body"].clone();
    no_correct["options"][0]["is_correct"] = serde_json::json!(false);
    let patched = app
        .patch_as(
            &teacher,
            &format!("/api/v2/assessment-items/{item_id}"),
            &serde_json::json!({ "body": no_correct }),
        )
        .await;
    assert_eq!(patched.status, StatusCode::CONFLICT, "{}", patched.text());
    assert!(
        patched.json()["details"]["readiness"]
            .as_array()
            .unwrap()
            .contains(&serde_json::json!("choice.correct_missing"))
    );

    // A ready edit still lands; readiness stays ok.
    let renamed = app
        .patch_as(
            &teacher,
            &format!("/api/v2/assessment-items/{item_id}"),
            &serde_json::json!({ "title": "2+2?" }),
        )
        .await;
    assert_eq!(renamed.status, StatusCode::OK, "{}", renamed.text());
    let readiness = app
        .get_as(&teacher, &format!("/api/v2/assessments/{id}/readiness"))
        .await;
    assert_eq!(readiness.json()["ok"], true, "{}", readiness.text());
    let items = app
        .get_as(&teacher, &format!("/api/v2/assessments/{id}"))
        .await;
    assert_eq!(items.json()["items"].as_array().unwrap().len(), 1);
}

/// BUG-208: `max_score` is capped at 10 000 and `weight` at 100 (422), so
/// the grade shares and the course average stay finite; a perfect attempt
/// on capped scores is still 100. UX-143: item body size caps.
#[sqlx::test(migrations = "../../migrations")]
async fn scores_and_weights_are_bounded(pool: PgPool) {
    let app = TestApp::spawn(pool).await;
    let teacher = instructor(&app, "teacher").await;
    let (course_id, chapter_id) = scaffold(&app, &teacher).await;
    app.publish_course(&course_id).await;
    let created = app
        .post_as(
            &teacher,
            "/api/v2/assessments",
            &serde_json::json!({ "chapter_id": chapter_id, "kind": "quiz", "title": "Bounds" }),
        )
        .await;
    let id = created.json()["id"].as_str().unwrap().to_owned();

    let mut huge = choice_item("huge");
    huge["max_score"] = serde_json::json!(1e308);
    let refused = app
        .post_as(&teacher, &format!("/api/v2/assessments/{id}/items"), &huge)
        .await;
    assert_eq!(
        refused.status,
        StatusCode::UNPROCESSABLE_ENTITY,
        "{}",
        refused.text()
    );
    let heavy = app
        .patch_as(
            &teacher,
            &format!("/api/v2/assessments/{id}"),
            &serde_json::json!({ "weight": 1e308 }),
        )
        .await;
    assert_eq!(
        heavy.status,
        StatusCode::UNPROCESSABLE_ENTITY,
        "{}",
        heavy.text()
    );
    // UX-143: 201 options / a 20 001-char prompt are refused.
    let options: Vec<serde_json::Value> = (0..201)
        .map(|i| serde_json::json!({ "id": i.to_string(), "text": i.to_string(), "is_correct": i == 0 }))
        .collect();
    let too_many = app
        .post_as(
            &teacher,
            &format!("/api/v2/assessments/{id}/items"),
            &serde_json::json!({ "title": "many", "max_score": 1,
                                  "body": { "kind": "choice", "prompt": "p", "options": options } }),
        )
        .await;
    assert_eq!(
        too_many.status,
        StatusCode::UNPROCESSABLE_ENTITY,
        "{}",
        too_many.text()
    );
    let mut long_prompt = choice_item("long");
    long_prompt["body"]["prompt"] = serde_json::json!("x".repeat(20_001));
    let too_long = app
        .post_as(
            &teacher,
            &format!("/api/v2/assessments/{id}/items"),
            &long_prompt,
        )
        .await;
    assert_eq!(
        too_long.status,
        StatusCode::UNPROCESSABLE_ENTITY,
        "{}",
        too_long.text()
    );
    // BUG-209: every free-text body field is capped like the prompt.
    let mut long_option = choice_item("long option");
    long_option["body"]["options"][1]["text"] = serde_json::json!("x".repeat(20_001));
    let too_long = app
        .post_as(
            &teacher,
            &format!("/api/v2/assessments/{id}/items"),
            &long_option,
        )
        .await;
    assert_eq!(too_long.status, StatusCode::UNPROCESSABLE_ENTITY);
    assert_eq!(
        too_long.json()["field_errors"][0]["field"],
        "body.options[1].text",
        "{}",
        too_long.text()
    );

    let mut capped = choice_item("capped");
    capped["max_score"] = serde_json::json!(10_000);
    let mut ids = Vec::new();
    for body in [capped, choice_item("small")] {
        let item = app
            .post_as(&teacher, &format!("/api/v2/assessments/{id}/items"), &body)
            .await;
        assert_eq!(item.status, StatusCode::CREATED, "{}", item.text());
        ids.push(item.json()["id"].as_str().unwrap().to_owned());
    }
    let published = app
        .post_as(
            &teacher,
            &format!("/api/v2/assessments/{id}/lifecycle"),
            &serde_json::json!({ "to": "published" }),
        )
        .await;
    assert_eq!(published.status, StatusCode::OK, "{}", published.text());

    let user = app
        .create_user("alice", "alice@example.com", &["user"])
        .await;
    let learner = app
        .mint_session_for(
            user,
            &["assessment:read:assigned", "assessment:submit:assigned"],
        )
        .await;
    let draft = app
        .post_as(
            &learner,
            &format!("/api/v2/assessments/{id}/submissions"),
            &serde_json::json!({}),
        )
        .await;
    let sub_id = draft.json()["id"].as_str().unwrap().to_owned();
    let submitted = app
        .post_as(
            &learner,
            &format!("/api/v2/submissions/{sub_id}/submit"),
            &serde_json::json!({ "answers": {
                &ids[0]: { "kind": "choice", "selected": ["a"] },
                &ids[1]: { "kind": "choice", "selected": ["a"] },
            } }),
        )
        .await;
    assert_eq!(submitted.status, StatusCode::OK, "{}", submitted.text());
    assert_eq!(
        submitted.json()["auto_score"],
        100.0,
        "{}",
        submitted.text()
    );
}

/// BUG-218: publish racing an item edit (or the delete of the only item)
/// must never leave a published assessment unready — `transition` and the
/// item writes serialize on the assessment row.
#[sqlx::test(migrations = "../../migrations")]
async fn publish_and_item_writes_serialize(pool: PgPool) {
    let app = TestApp::spawn(pool).await;
    let teacher = instructor(&app, "teacher").await;
    let (course_id, chapter_id) = scaffold(&app, &teacher).await;
    app.publish_course(&course_id).await;

    for round in 0..20 {
        let created = app
            .post_as(
                &teacher,
                "/api/v2/assessments",
                &serde_json::json!({ "chapter_id": chapter_id, "kind": "quiz",
                                      "title": format!("Race {round}") }),
            )
            .await;
        let id = created.json()["id"].as_str().unwrap().to_owned();
        let item = app
            .post_as(
                &teacher,
                &format!("/api/v2/assessments/{id}/items"),
                &choice_item("1+1?"),
            )
            .await;
        let item_id = item.json()["id"].as_str().unwrap().to_owned();

        let lifecycle_path = format!("/api/v2/assessments/{id}/lifecycle");
        let to_published = serde_json::json!({ "to": "published" });
        let publish = app.post_as(&teacher, &lifecycle_path, &to_published);
        let path = format!("/api/v2/assessment-items/{item_id}");
        let empty = serde_json::json!({ "body": { "kind": "choice", "prompt": "empty?",
                                                  "options": [] } });
        let edit = async {
            if round % 2 == 0 {
                app.patch_as(&teacher, &path, &empty).await
            } else {
                app.delete_as(&teacher, &path).await
            }
        };
        let (published, edited) = tokio::join!(publish, edit);

        let detail = app
            .get_as(&teacher, &format!("/api/v2/assessments/{id}"))
            .await;
        let lifecycle = detail.json()["lifecycle"].clone();
        let readiness = app
            .get_as(&teacher, &format!("/api/v2/assessments/{id}/readiness"))
            .await;
        if lifecycle == "published" {
            assert_eq!(edited.status, StatusCode::CONFLICT, "{}", edited.text());
            assert_eq!(
                readiness.json()["ok"],
                true,
                "round {round}: {}",
                readiness.text()
            );
        } else {
            // The edit won: the publish must have refused an unready draft.
            assert_eq!(
                published.status,
                StatusCode::UNPROCESSABLE_ENTITY,
                "round {round}: {}",
                published.text()
            );
            assert_eq!(readiness.json()["ok"], false, "round {round}");
        }
    }
}

/// BUG-231: a schedule racing an unready item add must never leave a
/// scheduled assessment the scheduler will refuse to open — every item
/// write re-reads the lifecycle under the row lock.
#[sqlx::test(migrations = "../../migrations")]
async fn schedule_and_item_add_serialize(pool: PgPool) {
    let app = TestApp::spawn(pool).await;
    let teacher = instructor(&app, "teacher").await;
    let (course_id, chapter_id) = scaffold(&app, &teacher).await;
    app.publish_course(&course_id).await;

    for round in 0..20 {
        let created = app
            .post_as(
                &teacher,
                "/api/v2/assessments",
                &serde_json::json!({ "chapter_id": chapter_id, "kind": "quiz",
                                      "title": format!("Race {round}") }),
            )
            .await;
        let id = created.json()["id"].as_str().unwrap().to_owned();
        let items_path = format!("/api/v2/assessments/{id}/items");
        app.post_as(&teacher, &items_path, &choice_item("1+1?"))
            .await;

        let to_scheduled =
            serde_json::json!({ "to": "scheduled", "scheduled_at_unix": far_future() });
        let lifecycle_path = format!("/api/v2/assessments/{id}/lifecycle");
        let schedule = app.post_as(&teacher, &lifecycle_path, &to_scheduled);
        let empty = serde_json::json!({ "title": "empty?", "max_score": 1,
            "body": { "kind": "choice", "prompt": "empty?", "options": [] } });
        let add = app.post_as(&teacher, &items_path, &empty);
        let (scheduled, added) = if round % 2 == 0 {
            tokio::join!(schedule, add)
        } else {
            let (added, scheduled) = tokio::join!(add, schedule);
            (scheduled, added)
        };

        let detail = app
            .get_as(&teacher, &format!("/api/v2/assessments/{id}"))
            .await;
        let readiness = app
            .get_as(&teacher, &format!("/api/v2/assessments/{id}/readiness"))
            .await;
        if detail.json()["lifecycle"] == "scheduled" {
            assert_eq!(
                added.status,
                StatusCode::CONFLICT,
                "round {round}: {}",
                added.text()
            );
            assert_eq!(
                readiness.json()["ok"],
                true,
                "round {round}: {}",
                readiness.text()
            );
        } else {
            assert_eq!(
                added.status,
                StatusCode::CREATED,
                "round {round}: {}",
                added.text()
            );
            assert_eq!(
                scheduled.status,
                StatusCode::UNPROCESSABLE_ENTITY,
                "round {round}: {}",
                scheduled.text()
            );
        }
    }
}

/// BUG-232: the assessment lifecycle and `activities.published` change in
/// one transaction — an unpublish racing the curriculum publish toggle, or
/// a client that hangs up mid-transition, never leaves a torn pair (a
/// listed quiz that answers 404).
#[sqlx::test(migrations = "../../migrations")]
async fn lifecycle_and_activity_flag_never_disagree(pool: PgPool) {
    let app = TestApp::spawn(pool).await;
    let teacher = instructor(&app, "teacher").await;
    let (course_id, chapter_id) = scaffold(&app, &teacher).await;
    app.publish_course(&course_id).await;
    let created = app
        .post_as(
            &teacher,
            "/api/v2/assessments",
            &serde_json::json!({ "chapter_id": chapter_id, "kind": "quiz", "title": "Q" }),
        )
        .await;
    let id = created.json()["id"].as_str().unwrap().to_owned();
    let activity_id = created.json()["activity_id"].as_str().unwrap().to_owned();
    app.post_as(
        &teacher,
        &format!("/api/v2/assessments/{id}/items"),
        &choice_item("1+1?"),
    )
    .await;
    let detail_path = format!("/api/v2/assessments/{id}");
    let lifecycle_path = format!("{detail_path}/lifecycle");
    let activity_path = format!("/api/v2/activities/{activity_id}");
    let lifecycle = async || app.get_as(&teacher, &detail_path).await.json()["lifecycle"].clone();
    let agree = async || {
        let activity = app.get_as(&teacher, &activity_path).await;
        (lifecycle().await == "published") == (activity.json()["published"] == true)
    };

    for round in 0..10 {
        let published = app
            .post_as(
                &teacher,
                &lifecycle_path,
                &serde_json::json!({ "to": "published" }),
            )
            .await;
        assert_eq!(published.status, StatusCode::OK, "{}", published.text());
        let to_draft = serde_json::json!({ "to": "draft" });
        let on = serde_json::json!({ "published": true });
        let unpublish = app.post_as(&teacher, &lifecycle_path, &to_draft);
        let toggle_on = app.patch_as(&teacher, &activity_path, &on);
        let (unpublished, toggled) = tokio::join!(unpublish, toggle_on);
        assert_eq!(
            unpublished.status,
            StatusCode::OK,
            "round {round}: {}",
            unpublished.text()
        );
        assert!(
            matches!(toggled.status, StatusCode::OK | StatusCode::CONFLICT),
            "round {round}: {}",
            toggled.text()
        );
        assert!(
            agree().await,
            "round {round}: lifecycle and activity flag disagree"
        );
    }

    // A socket drop mid-transition: the flag flipped with the lifecycle.
    for to in ["published", "draft"] {
        drop_request_when(
            app.post_as(&teacher, &lifecycle_path, &serde_json::json!({ "to": to })),
            async || lifecycle().await == to,
            |response| assert_eq!(response.status, StatusCode::OK, "{}", response.text()),
        )
        .await;
        wait_until("the dropped transition left a torn pair", async || {
            lifecycle().await == to && agree().await
        })
        .await;
    }
}

/// BUG-245/246: a client that hangs up mid-request never leaves a torn
/// write — the title PATCH moves the assessment title and the activity name
/// together, and a duplicate never leaves an activity without its
/// assessment.
#[sqlx::test(migrations = "../../migrations")]
async fn dropped_title_patch_and_duplicate_are_atomic(pool: PgPool) {
    let app = TestApp::spawn(pool).await;
    let teacher = instructor(&app, "teacher").await;
    let (_, chapter_id) = scaffold(&app, &teacher).await;
    let created = app
        .post_as(
            &teacher,
            "/api/v2/assessments",
            &serde_json::json!({ "chapter_id": chapter_id, "kind": "quiz", "title": "Q" }),
        )
        .await;
    let id = created.json()["id"].as_str().unwrap().to_owned();
    let uuid = uuid::Uuid::parse_str(&id).unwrap();
    let path = format!("/api/v2/assessments/{id}");
    let titles = async || -> (String, String) {
        sqlx::query_as(
            "SELECT a.title, act.name FROM assessments a
             JOIN activities act ON act.id = a.activity_id WHERE a.id = $1",
        )
        .bind(uuid)
        .fetch_one(&app.pool)
        .await
        .unwrap()
    };
    for round in 0..5 {
        let title = format!("drop {round}");
        drop_request_when(
            app.patch_as(&teacher, &path, &serde_json::json!({ "title": title })),
            async || titles().await.0 == title,
            |response| assert_eq!(response.status, StatusCode::OK, "{}", response.text()),
        )
        .await;
        wait_until("the dropped PATCH left a torn title", async || {
            titles().await == (title.clone(), title.clone())
        })
        .await;
    }

    let duplicate = format!("{path}/duplicate");
    for round in 0..5 {
        let title = format!("copy {round}");
        let copied = async || -> bool {
            sqlx::query_scalar("SELECT EXISTS (SELECT 1 FROM activities WHERE name = $1)")
                .bind(&title)
                .fetch_one(&app.pool)
                .await
                .unwrap()
        };
        drop_request_when(
            app.post_as(&teacher, &duplicate, &serde_json::json!({ "title": title })),
            async || copied().await,
            |response| {
                assert_eq!(response.status, StatusCode::CREATED, "{}", response.text());
            },
        )
        .await;
        let orphans: i64 = sqlx::query_scalar(
            "SELECT count(*) FROM activities act WHERE act.name = $1
             AND NOT EXISTS (SELECT 1 FROM assessments a WHERE a.activity_id = act.id)",
        )
        .bind(&title)
        .fetch_one(&app.pool)
        .await
        .unwrap();
        assert_eq!(orphans, 0, "round {round}: orphan activity");
    }
}
