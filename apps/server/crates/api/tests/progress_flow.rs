//! Trail + progress end to end: runs and steps, lesson completion flowing
//! into the canonical projection and the learner course state (outline,
//! progress, next action), removal, visibility and permission gates, and
//! the assessment pipeline projecting into the same state.
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

async fn learner(app: &TestApp, name: &str) -> MintedSession {
    let user = app
        .create_user(name, &format!("{name}@example.com"), &["user"])
        .await;
    app.mint_session_for(
        user,
        &[
            "assessment:submit:assigned",
            "assessment:read:assigned",
            "trail:read:all",
            "trail:submit:assigned",
        ],
    )
    .await
}

/// Public course + chapter; returns (course_id, chapter_id).
async fn public_course(app: &TestApp, teacher: &MintedSession, name: &str) -> (String, String) {
    let course = app
        .post_as(
            teacher,
            "/api/v2/courses",
            &serde_json::json!({ "name": name }),
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

/// A published lesson activity.
async fn lesson(app: &TestApp, teacher: &MintedSession, chapter_id: &str, name: &str) -> String {
    let created = app
        .post_as(
            teacher,
            &format!("/api/v2/chapters/{chapter_id}/activities"),
            &serde_json::json!({ "name": name, "activity_type": "dynamic",
                                  "activity_sub_type": "dynamic_page" }),
        )
        .await;
    assert_eq!(created.status, StatusCode::CREATED, "{}", created.text());
    let id = created.json()["id"].as_str().unwrap().to_owned();
    let published = app
        .patch_as(
            teacher,
            &format!("/api/v2/activities/{id}"),
            &serde_json::json!({ "published": true }),
        )
        .await;
    assert_eq!(published.status, StatusCode::OK, "{}", published.text());
    id
}

fn activity<'a>(state: &'a serde_json::Value, id: &str) -> &'a serde_json::Value {
    state["outline"]
        .as_array()
        .unwrap()
        .iter()
        .flat_map(|c| c["activities"].as_array().unwrap())
        .find(|a| a["id"] == id)
        .unwrap()
}

#[sqlx::test(migrations = "../../migrations")]
async fn trail_runs_steps_and_learner_state(pool: PgPool) {
    let app = TestApp::spawn(pool).await;
    let teacher = instructor(&app, "teacher").await;
    let (course_id, chapter_id) = public_course(&app, &teacher, "Trail 101").await;
    let a1 = lesson(&app, &teacher, &chapter_id, "Intro").await;
    let a2 = lesson(&app, &teacher, &chapter_id, "Deep dive").await;
    // An unpublished lesson never counts.
    app.post_as(
        &teacher,
        &format!("/api/v2/chapters/{chapter_id}/activities"),
        &serde_json::json!({ "name": "Draft", "activity_type": "dynamic",
                              "activity_sub_type": "dynamic_page" }),
    )
    .await;
    let alice = learner(&app, "alice").await;

    // Anonymous and empty trails are 200s, not 404s.
    let anon = app.get("/api/v2/trail").await;
    assert_eq!(anon.status, StatusCode::OK, "{}", anon.text());
    assert!(anon.json()["runs"].as_array().unwrap().is_empty());
    let empty = app.get_as(&alice, "/api/v2/trail").await;
    assert_eq!(empty.status, StatusCode::OK);
    assert!(empty.json()["id"].is_null());

    // Not enrolled yet: the state says so.
    let before = app
        .get_as(
            &alice,
            &format!("/api/v2/courses/{course_id}/learner-state"),
        )
        .await;
    assert_eq!(before.status, StatusCode::OK, "{}", before.text());
    assert_eq!(before.json()["enrolled"], false);
    assert_eq!(before.json()["enrollment_state"], "not_enrolled");
    assert_eq!(before.json()["next_action"]["id"], "enroll");
    assert_eq!(
        before.json()["outline"][0]["activities"]
            .as_array()
            .unwrap()
            .len(),
        2
    );

    // Add the course: one run, two published steps possible, none done.
    let added = app
        .post_as(
            &alice,
            &format!("/api/v2/trail/courses/{course_id}"),
            &serde_json::json!({}),
        )
        .await;
    assert_eq!(added.status, StatusCode::OK, "{}", added.text());
    assert_eq!(added.json()["runs"][0]["course"]["name"], "Trail 101");
    assert_eq!(added.json()["runs"][0]["course_total_steps"], 2);
    assert!(
        added.json()["runs"][0]["steps"]
            .as_array()
            .unwrap()
            .is_empty()
    );
    let enrolled = app
        .get_as(
            &alice,
            &format!("/api/v2/courses/{course_id}/learner-state"),
        )
        .await;
    assert_eq!(enrolled.json()["enrolled"], true);
    assert_eq!(enrolled.json()["enrollment_state"], "in_progress");
    assert_eq!(enrolled.json()["next_action"]["id"], "start");
    assert_eq!(enrolled.json()["next_action"]["reason"], "next_required");
    assert_eq!(enrolled.json()["next_action"]["activity_id"], a1.as_str());
    assert_eq!(activity(&enrolled.json(), &a1)["state"], "not_started");

    // Mark the first lesson done: step + canonical completion.
    let step = app
        .post_as(
            &alice,
            &format!("/api/v2/trail/activities/{a1}"),
            &serde_json::json!({}),
        )
        .await;
    assert_eq!(step.status, StatusCode::OK, "{}", step.text());
    assert_eq!(
        step.json()["runs"][0]["steps"][0]["activity"]["name"],
        "Intro"
    );
    assert_eq!(step.json()["runs"][0]["steps"][0]["complete"], true);
    let half = app
        .get_as(
            &alice,
            &format!("/api/v2/courses/{course_id}/learner-state"),
        )
        .await;
    assert_eq!(activity(&half.json(), &a1)["state"], "complete");
    assert_eq!(activity(&half.json(), &a1)["complete"], true);
    assert_eq!(half.json()["progress"]["completed_required_count"], 1);
    assert_eq!(half.json()["progress"]["total_required_count"], 2);
    assert_eq!(half.json()["progress"]["progress_pct"], 50.0);
    assert_eq!(half.json()["next_action"]["activity_id"], a2.as_str());
    // Idempotent.
    let again = app
        .post_as(
            &alice,
            &format!("/api/v2/trail/activities/{a1}"),
            &serde_json::json!({}),
        )
        .await;
    assert_eq!(
        again.json()["runs"][0]["steps"].as_array().unwrap().len(),
        1
    );

    // Finish the course.
    app.post_as(
        &alice,
        &format!("/api/v2/trail/activities/{a2}"),
        &serde_json::json!({}),
    )
    .await;
    let done = app
        .get_as(
            &alice,
            &format!("/api/v2/courses/{course_id}/learner-state"),
        )
        .await;
    assert_eq!(done.json()["progress"]["progress_pct"], 100.0);
    assert_eq!(done.json()["enrollment_state"], "completed");
    assert_eq!(done.json()["next_action"]["id"], "review_completion");
    // No certification configured → the block stays inert (legacy semantics).
    assert_eq!(done.json()["certificate"]["configured"], false);
    assert_eq!(done.json()["certificate"]["eligible"], false);
    let eligible: bool =
        sqlx::query_scalar("SELECT certificate_eligible FROM course_progress WHERE course_id = $1")
            .bind(uuid::Uuid::parse_str(&course_id).unwrap())
            .fetch_one(&app.pool)
            .await
            .unwrap();
    assert!(eligible);

    // Un-mark one: back to 50%.
    let removed = app
        .delete_as(&alice, &format!("/api/v2/trail/activities/{a2}"))
        .await;
    assert_eq!(removed.status, StatusCode::OK, "{}", removed.text());
    assert_eq!(
        removed.json()["runs"][0]["steps"].as_array().unwrap().len(),
        1
    );
    let back = app
        .get_as(
            &alice,
            &format!("/api/v2/courses/{course_id}/learner-state"),
        )
        .await;
    assert_eq!(back.json()["progress"]["progress_pct"], 50.0);
    assert_eq!(activity(&back.json(), &a2)["state"], "not_started");

    // Drop the course from the trail: runs gone, projection kept.
    let dropped = app
        .delete_as(&alice, &format!("/api/v2/trail/courses/{course_id}"))
        .await;
    assert!(dropped.json()["runs"].as_array().unwrap().is_empty());
    let still = app
        .get_as(
            &alice,
            &format!("/api/v2/courses/{course_id}/learner-state"),
        )
        .await;
    assert_eq!(still.json()["enrolled"], true);
    assert_eq!(still.json()["progress"]["progress_pct"], 50.0);

    // Gates: a private course is invisible; zero grants cannot write.
    let private = app
        .post_as(
            &teacher,
            "/api/v2/courses",
            &serde_json::json!({ "name": "Hidden" }),
        )
        .await;
    let private_id = private.json()["id"].as_str().unwrap().to_owned();
    assert_eq!(
        app.post_as(
            &alice,
            &format!("/api/v2/trail/courses/{private_id}"),
            &serde_json::json!({})
        )
        .await
        .status,
        StatusCode::NOT_FOUND
    );
    assert_eq!(
        app.get_as(
            &alice,
            &format!("/api/v2/courses/{private_id}/learner-state")
        )
        .await
        .status,
        StatusCode::NOT_FOUND
    );
    let powerless = app.mint_session(&[]).await;
    assert_eq!(
        app.post_as(
            &powerless,
            &format!("/api/v2/trail/courses/{course_id}"),
            &serde_json::json!({})
        )
        .await
        .status,
        StatusCode::FORBIDDEN
    );
}

#[sqlx::test(migrations = "../../migrations")]
async fn assessment_submissions_project_into_progress(pool: PgPool) {
    let app = TestApp::spawn(pool).await;
    let teacher = instructor(&app, "teacher").await;
    let (course_id, chapter_id) = public_course(&app, &teacher, "Quiz 101").await;
    let created = app
        .post_as(
            &teacher,
            "/api/v2/assessments",
            &serde_json::json!({ "chapter_id": chapter_id, "kind": "quiz", "title": "Quiz" }),
        )
        .await;
    assert_eq!(created.status, StatusCode::CREATED, "{}", created.text());
    let assessment_id = created.json()["id"].as_str().unwrap().to_owned();
    let activity_id = created.json()["activity_id"].as_str().unwrap().to_owned();
    let item = app
        .post_as(
            &teacher,
            &format!("/api/v2/assessments/{assessment_id}/items"),
            &serde_json::json!({
                "title": "Q1", "max_score": 10,
                "body": { "kind": "choice", "prompt": "Q1",
                          "options": [{ "id": "a", "text": "yes", "is_correct": true },
                                      { "id": "b", "text": "no", "is_correct": false }] }
            }),
        )
        .await;
    let item_id = item.json()["id"].as_str().unwrap().to_owned();
    let published = app
        .post_as(
            &teacher,
            &format!("/api/v2/assessments/{assessment_id}/lifecycle"),
            &serde_json::json!({ "to": "published" }),
        )
        .await;
    assert_eq!(published.status, StatusCode::OK, "{}", published.text());
    let alice = learner(&app, "alice").await;

    // Opening a draft enrolls the learner and shows in_progress.
    let draft = app
        .post_as(
            &alice,
            &format!("/api/v2/assessments/{assessment_id}/submissions"),
            &serde_json::json!({}),
        )
        .await;
    assert_eq!(draft.status, StatusCode::CREATED, "{}", draft.text());
    let sub_id = draft.json()["id"].as_str().unwrap().to_owned();
    let started = app
        .get_as(
            &alice,
            &format!("/api/v2/courses/{course_id}/learner-state"),
        )
        .await;
    assert_eq!(started.status, StatusCode::OK, "{}", started.text());
    assert_eq!(started.json()["enrolled"], true);
    assert_eq!(
        activity(&started.json(), &activity_id)["state"],
        "in_progress"
    );
    assert_eq!(started.json()["next_action"]["id"], "continue");
    assert_eq!(started.json()["next_action"]["reason"], "in_progress");

    // A correct auto-graded submit passes and completes the course.
    let submitted = app
        .post_as(
            &alice,
            &format!("/api/v2/submissions/{sub_id}/submit"),
            &serde_json::json!({ "answers": { item_id: { "kind": "choice", "selected": ["a"] } } }),
        )
        .await;
    assert_eq!(submitted.status, StatusCode::OK, "{}", submitted.text());
    let after = app
        .get_as(
            &alice,
            &format!("/api/v2/courses/{course_id}/learner-state"),
        )
        .await;
    let after_json = after.json();
    let quiz = activity(&after_json, &activity_id);
    assert_eq!(quiz["state"], "passed", "{}", after.text());
    assert_eq!(quiz["score"], 100.0);
    assert_eq!(quiz["passed"], true);
    assert_eq!(quiz["complete"], true);
    assert_eq!(after.json()["progress"]["progress_pct"], 100.0);
    assert_eq!(after.json()["progress"]["grade_average"], 100.0);
    assert_eq!(after.json()["next_action"]["id"], "review_completion");

    // The projection row carries the submission linkage.
    let (state, attempts, latest): (String, i32, Option<uuid::Uuid>) = sqlx::query_as(
        "SELECT state, attempt_count, latest_submission_id FROM activity_progress
         WHERE activity_id = $1",
    )
    .bind(uuid::Uuid::parse_str(&activity_id).unwrap())
    .fetch_one(&app.pool)
    .await
    .unwrap();
    assert_eq!(state, "passed");
    assert_eq!(attempts, 1);
    assert_eq!(latest, Some(uuid::Uuid::parse_str(&sub_id).unwrap()));
}
