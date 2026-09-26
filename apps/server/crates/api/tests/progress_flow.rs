//! Trail + progress end to end: runs and steps, lesson completion flowing
//! into the canonical projection and the learner course state (outline,
//! progress, next action), removal, visibility and permission gates, and
//! the assessment pipeline projecting into the same state.
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
            "certificate:create:platform",
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
    app.publish_course(&course_id).await;
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
    // Leaving a course with no trail at all is a 404.
    let no_trail = app
        .delete_as(&alice, &format!("/api/v2/trail/courses/{course_id}"))
        .await;
    assert_eq!(
        no_trail.status,
        StatusCode::NOT_FOUND,
        "{}",
        no_trail.text()
    );

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

    // Drop the course from the trail: runs and steps gone, the lesson
    // completions they stood for reset (legacy `remove_course_from_trail`),
    // so the learner is no longer enrolled and starts from zero.
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
    assert_eq!(still.json()["enrolled"], false);
    assert_eq!(still.json()["progress"]["progress_pct"], 0.0);
    assert_eq!(activity(&still.json(), &a1)["state"], "not_started");

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

/// Drafts never enter the denominator: marking one is a 404, and
/// unpublishing / deleting an activity re-aggregates every learner so
/// `total_required_count` follows the published set (BUG-098). Leaving an
/// unknown or invisible course is a 404 like joining it (BUG-100).
#[sqlx::test(migrations = "../../migrations")]
async fn drafts_never_count_and_totals_follow_publishing(pool: PgPool) {
    let app = TestApp::spawn(pool).await;
    let teacher = instructor(&app, "teacher").await;
    let (course_id, chapter_id) = public_course(&app, &teacher, "Drafts 101").await;
    let a1 = lesson(&app, &teacher, &chapter_id, "Intro").await;
    let a2 = lesson(&app, &teacher, &chapter_id, "Deep dive").await;
    let draft = app
        .post_as(
            &teacher,
            &format!("/api/v2/chapters/{chapter_id}/activities"),
            &serde_json::json!({ "name": "Draft", "activity_type": "dynamic",
                                  "activity_sub_type": "dynamic_page" }),
        )
        .await
        .json()["id"]
        .as_str()
        .unwrap()
        .to_owned();
    let alice = learner(&app, "alice").await;
    let learner_state = format!("/api/v2/courses/{course_id}/learner-state");
    let progress = || async { app.get_as(&alice, &learner_state).await.json()["progress"].clone() };

    let refused = app
        .post_as(
            &alice,
            &format!("/api/v2/trail/activities/{draft}"),
            &serde_json::json!({}),
        )
        .await;
    assert_eq!(refused.status, StatusCode::NOT_FOUND, "{}", refused.text());
    assert_eq!(refused.json()["code"], "not-found");

    for id in [&a1, &a2] {
        app.post_as(
            &alice,
            &format!("/api/v2/trail/activities/{id}"),
            &serde_json::json!({}),
        )
        .await;
    }
    let done = progress().await;
    assert_eq!(done["total_required_count"], 2);
    assert_eq!(done["progress_pct"], 100.0);

    // Unpublish one: 1/1, still complete; republish: 2/2.
    for (published, total) in [(false, 1), (true, 2)] {
        let toggled = app
            .patch_as(
                &teacher,
                &format!("/api/v2/activities/{a2}"),
                &serde_json::json!({ "published": published }),
            )
            .await;
        assert_eq!(toggled.status, StatusCode::OK, "{}", toggled.text());
        let after = progress().await;
        assert_eq!(after["total_required_count"], total);
        assert_eq!(after["completed_required_count"], total);
        assert_eq!(after["progress_pct"], 100.0);
    }

    // Delete one: its row cascades and the total follows.
    let deleted = app
        .delete_as(&teacher, &format!("/api/v2/activities/{a2}"))
        .await;
    assert_eq!(deleted.status, StatusCode::NO_CONTENT, "{}", deleted.text());
    let after = progress().await;
    assert_eq!(after["total_required_count"], 1);
    assert_eq!(after["progress_pct"], 100.0);

    // Leaving: unknown and invisible courses are 404s.
    let private = app
        .post_as(
            &teacher,
            "/api/v2/courses",
            &serde_json::json!({ "name": "Hidden" }),
        )
        .await;
    let private_id = private.json()["id"].as_str().unwrap().to_owned();
    for id in [private_id, uuid::Uuid::now_v7().to_string()] {
        let gone = app
            .delete_as(&alice, &format!("/api/v2/trail/courses/{id}"))
            .await;
        assert_eq!(gone.status, StatusCode::NOT_FOUND, "{}", gone.text());
    }
}

/// Studio lifecycle transitions flip the activity like the curriculum
/// toggle does, so persisted totals follow (BUG-150): a learner at 3/3 goes
/// to 3/4 when the studio publishes a quiz and back to 3/3 on unpublish.
#[sqlx::test(migrations = "../../migrations")]
async fn studio_publish_and_unpublish_follow_into_totals(pool: PgPool) {
    let app = TestApp::spawn(pool).await;
    let teacher = instructor(&app, "teacher").await;
    let (course_id, chapter_id) = public_course(&app, &teacher, "Studio 101").await;
    let alice = learner(&app, "alice").await;
    for name in ["A", "B", "C"] {
        let id = lesson(&app, &teacher, &chapter_id, name).await;
        app.post_as(
            &alice,
            &format!("/api/v2/trail/activities/{id}"),
            &serde_json::json!({}),
        )
        .await;
    }
    let learner_state = format!("/api/v2/courses/{course_id}/learner-state");
    let progress = || async { app.get_as(&alice, &learner_state).await.json()["progress"].clone() };
    let done = progress().await;
    assert_eq!(done["total_required_count"], 3);
    assert_eq!(done["progress_pct"], 100.0);

    let created = app
        .post_as(
            &teacher,
            "/api/v2/assessments",
            &serde_json::json!({ "chapter_id": chapter_id, "kind": "quiz", "title": "Quiz" }),
        )
        .await;
    let assessment_id = created.json()["id"].as_str().unwrap().to_owned();
    app.post_as(
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
    // Draft: nothing changes.
    assert_eq!(progress().await["total_required_count"], 3);

    for (to, total, pct) in [("published", 4, 75.0), ("draft", 3, 100.0)] {
        let moved = app
            .post_as(
                &teacher,
                &format!("/api/v2/assessments/{assessment_id}/lifecycle"),
                &serde_json::json!({ "to": to }),
            )
            .await;
        assert_eq!(moved.status, StatusCode::OK, "{}", moved.text());
        let after = progress().await;
        assert_eq!(after["total_required_count"], total, "{after}");
        assert_eq!(after["completed_required_count"], 3, "{after}");
        assert_eq!(after["progress_pct"], pct, "{after}");
    }
}

/// BUG-161: deleting a chapter cascades its activities, so the learner
/// totals are recalculated like `delete_activity` does: 2/3 with the
/// completed lecture in the deleted chapter → 1/2.
#[sqlx::test(migrations = "../../migrations")]
async fn chapter_delete_recalculates_totals(pool: PgPool) {
    let app = TestApp::spawn(pool).await;
    let teacher = instructor(&app, "teacher").await;
    let (course_id, chapter_id) = public_course(&app, &teacher, "Chapters 101").await;
    let other = app
        .post_as(
            &teacher,
            &format!("/api/v2/courses/{course_id}/chapters"),
            &serde_json::json!({ "name": "Week 2" }),
        )
        .await;
    let other_id = other.json()["id"].as_str().unwrap().to_owned();
    let alice = learner(&app, "alice").await;
    let a = lesson(&app, &teacher, &chapter_id, "A").await;
    let b = lesson(&app, &teacher, &chapter_id, "B").await;
    let c = lesson(&app, &teacher, &other_id, "C").await;
    for id in [&a, &c] {
        app.post_as(
            &alice,
            &format!("/api/v2/trail/activities/{id}"),
            &serde_json::json!({}),
        )
        .await;
    }
    let _ = b;
    let learner_state = format!("/api/v2/courses/{course_id}/learner-state");
    let progress = || async { app.get_as(&alice, &learner_state).await.json()["progress"].clone() };
    let before = progress().await;
    assert_eq!(before["total_required_count"], 3, "{before}");
    assert_eq!(before["completed_required_count"], 2, "{before}");

    let deleted = app
        .delete_as(&teacher, &format!("/api/v2/chapters/{other_id}"))
        .await;
    assert_eq!(deleted.status, StatusCode::NO_CONTENT, "{}", deleted.text());
    let after = progress().await;
    assert_eq!(after["total_required_count"], 2, "{after}");
    assert_eq!(after["completed_required_count"], 1, "{after}");
    assert_eq!(after["progress_pct"], 50.0, "{after}");
}

/// BUG-176: quiz / exam / code / file-submission activities complete through
/// their pipelines only — marking one by hand is a 409 and leaves no trail
/// step, no progress row and no XP behind.
#[sqlx::test(migrations = "../../migrations")]
async fn pipeline_owned_activities_cannot_be_marked_by_hand(pool: PgPool) {
    let app = TestApp::spawn(pool).await;
    let teacher = instructor(&app, "teacher").await;
    let (course_id, chapter_id) = public_course(&app, &teacher, "Pipelines").await;
    let mut activity_ids = Vec::new();
    for kind in ["quiz", "exam", "code_challenge"] {
        let created = app
            .post_as(
                &teacher,
                "/api/v2/assessments",
                &serde_json::json!({ "chapter_id": chapter_id, "kind": kind, "title": kind }),
            )
            .await;
        assert_eq!(created.status, StatusCode::CREATED, "{}", created.text());
        activity_ids.push(created.json()["activity_id"].as_str().unwrap().to_owned());
    }
    let essay = app
        .post_as(
            &teacher,
            "/api/v2/file-submissions",
            &serde_json::json!({ "chapter_id": chapter_id, "title": "Essay",
                                  "instructions": "Upload." }),
        )
        .await;
    assert_eq!(essay.status, StatusCode::CREATED, "{}", essay.text());
    activity_ids.push(essay.json()["activity_id"].as_str().unwrap().to_owned());
    // Published as activities (the learner must be able to see them).
    for id in &activity_ids {
        sqlx::query("UPDATE activities SET published = true WHERE id = $1")
            .bind(uuid::Uuid::parse_str(id).unwrap())
            .execute(&app.pool)
            .await
            .unwrap();
    }

    let alice = learner(&app, "alice").await;
    for id in &activity_ids {
        let refused = app
            .post_as(
                &alice,
                &format!("/api/v2/trail/activities/{id}"),
                &serde_json::json!({}),
            )
            .await;
        assert_eq!(
            refused.status,
            StatusCode::CONFLICT,
            "{id}: {}",
            refused.text()
        );
        assert_eq!(refused.json()["code"], "conflict");
    }
    let (steps, progress, xp): (i64, i64, i64) = sqlx::query_as(
        "SELECT (SELECT count(*) FROM trail_steps),
                (SELECT count(*) FROM activity_progress WHERE course_id = $1),
                (SELECT count(*) FROM xp_transactions)",
    )
    .bind(uuid::Uuid::parse_str(&course_id).unwrap())
    .fetch_one(&app.pool)
    .await
    .unwrap();
    assert_eq!((steps, progress, xp), (0, 0, 0));
}

/// A course unpublished under an enrolled learner leaves the trail listing
/// but the learner can still leave it and un-mark their own steps; with no
/// own step, an invisible course's activity is a 404 like an unknown one
/// (BUG-183).
#[sqlx::test(migrations = "../../migrations")]
async fn learner_can_always_leave_an_unpublished_course(pool: PgPool) {
    let app = TestApp::spawn(pool).await;
    let teacher = instructor(&app, "teacher").await;
    let (course_id, chapter_id) = public_course(&app, &teacher, "Vanishing 101").await;
    let a1 = lesson(&app, &teacher, &chapter_id, "Intro").await;
    let a2 = lesson(&app, &teacher, &chapter_id, "Deep dive").await;
    let alice = learner(&app, "alice").await;
    let marked = app
        .post_as(
            &alice,
            &format!("/api/v2/trail/activities/{a1}"),
            &serde_json::json!({}),
        )
        .await;
    assert_eq!(marked.status, StatusCode::OK, "{}", marked.text());

    sqlx::query("UPDATE courses SET public = false WHERE id = $1")
        .bind(uuid::Uuid::parse_str(&course_id).unwrap())
        .execute(&app.pool)
        .await
        .unwrap();

    // The run is kept but not listed while the course is invisible.
    let trail = app.get_as(&alice, "/api/v2/trail").await;
    assert_eq!(trail.status, StatusCode::OK, "{}", trail.text());
    assert!(trail.json()["runs"].as_array().unwrap().is_empty());

    // Own step: un-marking works; no own step: 404, not an oracle.
    let unmarked = app
        .delete_as(&alice, &format!("/api/v2/trail/activities/{a1}"))
        .await;
    assert_eq!(unmarked.status, StatusCode::OK, "{}", unmarked.text());
    let oracle = app
        .delete_as(&alice, &format!("/api/v2/trail/activities/{a2}"))
        .await;
    assert_eq!(oracle.status, StatusCode::NOT_FOUND, "{}", oracle.text());
    // UX-131: the detail is the same as for an unknown id — invisible
    // course, no step, no trail all read alike.
    assert_eq!(oracle.json()["detail"], "activity not found");
    let unknown = app
        .delete_as(
            &alice,
            &format!("/api/v2/trail/activities/{}", uuid::Uuid::now_v7()),
        )
        .await;
    assert_eq!(unknown.json()["detail"], "activity not found");
    let marking = app
        .post_as(
            &alice,
            &format!("/api/v2/trail/activities/{a2}"),
            &serde_json::json!({}),
        )
        .await;
    assert_eq!(marking.status, StatusCode::NOT_FOUND, "{}", marking.text());
    assert_eq!(marking.json()["detail"], "activity not found");
    let bob = learner(&app, "bob").await;
    let no_trail = app
        .delete_as(&bob, &format!("/api/v2/trail/activities/{a1}"))
        .await;
    assert_eq!(
        no_trail.status,
        StatusCode::NOT_FOUND,
        "{}",
        no_trail.text()
    );
    assert_eq!(no_trail.json()["detail"], "activity not found");

    // Leaving always works on an own run; a second leave is a 404.
    let left = app
        .delete_as(&alice, &format!("/api/v2/trail/courses/{course_id}"))
        .await;
    assert_eq!(left.status, StatusCode::OK, "{}", left.text());
    let again = app
        .delete_as(&alice, &format!("/api/v2/trail/courses/{course_id}"))
        .await;
    assert_eq!(again.status, StatusCode::NOT_FOUND, "{}", again.text());

    // Republished: nothing comes back, the learner really left.
    app.publish_course(&course_id).await;
    assert!(
        app.get_as(&alice, "/api/v2/trail").await.json()["runs"]
            .as_array()
            .unwrap()
            .is_empty()
    );

    // An unpublished activity inside a visible course is no oracle either:
    // with no own step the un-mark reads like an unknown id (UX-131).
    sqlx::query("UPDATE activities SET published = false WHERE id = $1")
        .bind(uuid::Uuid::parse_str(&a2).unwrap())
        .execute(&app.pool)
        .await
        .unwrap();
    let draft = app
        .delete_as(&alice, &format!("/api/v2/trail/activities/{a2}"))
        .await;
    assert_eq!(draft.status, StatusCode::NOT_FOUND, "{}", draft.text());
    assert_eq!(draft.json()["detail"], "activity not found");
    let state = app
        .get_as(
            &alice,
            &format!("/api/v2/courses/{course_id}/learner-state"),
        )
        .await;
    assert_eq!(state.json()["enrolled"], false);
}

/// Mark ∥ leave for the same course never 500s and never leaves the trail
/// and the projection disagreeing: either the step exists and the lesson
/// is complete, or neither does (BUG-210). Twenty rounds of both orders.
#[sqlx::test(migrations = "../../migrations")]
async fn mark_and_leave_race_stays_consistent(pool: PgPool) {
    let app = TestApp::spawn(pool).await;
    let teacher = instructor(&app, "teacher").await;
    let (course_id, chapter_id) = public_course(&app, &teacher, "Race 101").await;
    let a1 = lesson(&app, &teacher, &chapter_id, "Intro").await;
    let alice = learner(&app, "alice").await;
    let mark_path = format!("/api/v2/trail/activities/{a1}");
    let leave_path = format!("/api/v2/trail/courses/{course_id}");
    let state_path = format!("/api/v2/courses/{course_id}/learner-state");
    let empty = serde_json::json!({});
    for round in 0..20 {
        // Start each round enrolled so the leave has something to delete.
        let joined = app
            .post_as(&alice, &leave_path, &serde_json::json!({}))
            .await;
        assert_eq!(joined.status, StatusCode::OK, "{}", joined.text());
        // The mark reads activity, course and access before it writes; a
        // leave that starts a little later lands between those reads and
        // the run/step writes. Sweep the offset so both orders happen.
        let offset = std::time::Duration::from_micros(500 * (round % 20));
        let (mark, leave) = tokio::join!(app.post_as(&alice, &mark_path, &empty), async {
            tokio::time::sleep(offset).await;
            app.delete_as(&alice, &leave_path).await
        },);
        assert!(
            [StatusCode::OK, StatusCode::NOT_FOUND, StatusCode::CONFLICT].contains(&mark.status),
            "round {round}: mark {} {}",
            mark.status,
            mark.text()
        );
        assert!(
            [StatusCode::OK, StatusCode::NOT_FOUND].contains(&leave.status),
            "round {round}: leave {} {}",
            leave.status,
            leave.text()
        );
        let trail = app.get_as(&alice, "/api/v2/trail").await.json();
        let has_step = trail["runs"]
            .as_array()
            .unwrap()
            .iter()
            .any(|r| !r["steps"].as_array().unwrap().is_empty());
        let state = app.get_as(&alice, &state_path).await.json();
        let complete = activity(&state, &a1)["state"] == "complete";
        assert_eq!(
            has_step, complete,
            "round {round}: trail step {has_step} vs projection {complete}: {trail} {state}"
        );
        // Marking again always lands (never a silent no-op on a stuck step).
        let again = app
            .post_as(&alice, &mark_path, &serde_json::json!({}))
            .await;
        assert_eq!(again.status, StatusCode::OK, "{}", again.text());
        let state = app.get_as(&alice, &state_path).await.json();
        assert_eq!(
            activity(&state, &a1)["state"],
            "complete",
            "round {round}: {state}"
        );
        let left = app.delete_as(&alice, &leave_path).await;
        assert_eq!(left.status, StatusCode::OK, "{}", left.text());
    }
}

/// BUG-220: thirty marks of one lesson by one learner at once all answer
/// 200, and a bystander's request in the middle of the stampede is not
/// starved of a pool connection (the waiters spin on `try_lock`, they do
/// not park a connection each).
#[sqlx::test(migrations = "../../migrations")]
async fn mark_stampede_never_exhausts_the_pool(pool: PgPool) {
    let app = TestApp::spawn(pool).await;
    let teacher = instructor(&app, "teacher").await;
    let (_course_id, chapter_id) = public_course(&app, &teacher, "Stampede 101").await;
    let a1 = lesson(&app, &teacher, &chapter_id, "Intro").await;
    let alice = learner(&app, "alice").await;
    let bob = learner(&app, "bob").await;
    let mark_path = format!("/api/v2/trail/activities/{a1}");
    let empty = serde_json::json!({});
    let marks = futures::future::join_all((0..30).map(|_| app.post_as(&alice, &mark_path, &empty)));
    let bystander = async {
        tokio::time::sleep(std::time::Duration::from_millis(20)).await;
        let started = tokio::time::Instant::now();
        let response = app.get_as(&bob, "/api/v2/trail").await;
        (response, started.elapsed())
    };
    let (marks, (bystander, took)) = tokio::join!(marks, bystander);
    for (i, mark) in marks.iter().enumerate() {
        assert_eq!(mark.status, StatusCode::OK, "mark {i}: {}", mark.text());
    }
    assert_eq!(bystander.status, StatusCode::OK, "{}", bystander.text());
    assert!(
        took < std::time::Duration::from_secs(1),
        "bystander waited {took:?} behind the stampede"
    );
}

/// BUG-235: more first marks on distinct (learner, course) locks than the
/// pool has connections, at once. The hooks (analytics, course XP) run after
/// the lock commits, so no holder waits on a second connection: all 200 and
/// every event and award lands.
#[sqlx::test(migrations = "../../migrations")]
async fn first_marks_past_pool_size_all_land_with_their_hooks(pool: PgPool) {
    let learners = pool.options().get_max_connections() + 2;
    let app = TestApp::spawn(pool).await;
    let teacher = instructor(&app, "teacher").await;
    let (_course_id, chapter_id) = public_course(&app, &teacher, "Crowd 101").await;
    let a1 = lesson(&app, &teacher, &chapter_id, "Only").await;
    let mut sessions = Vec::new();
    for i in 0..learners {
        sessions.push(learner(&app, &format!("crowd{i}")).await);
    }
    let mark_path = format!("/api/v2/trail/activities/{a1}");
    let empty = serde_json::json!({});
    let marks =
        futures::future::join_all(sessions.iter().map(|s| app.post_as(s, &mark_path, &empty)))
            .await;
    for (i, mark) in marks.iter().enumerate() {
        assert_eq!(mark.status, StatusCode::OK, "mark {i}: {}", mark.text());
    }
    let (events, awards): (i64, i64) = sqlx::query_as(
        "SELECT (SELECT count(*) FROM analytics_events WHERE event_type = 'activity.completed'),
                (SELECT count(*) FROM xp_transactions WHERE source = 'course_completion')",
    )
    .fetch_one(&app.pool)
    .await
    .unwrap();
    assert_eq!((events, awards), (i64::from(learners), i64::from(learners)));
}

/// The (user, course) trail lock is held by some transaction of this test
/// database — the mark / leave is past its first write.
async fn trail_lock_held(pool: &PgPool) -> bool {
    sqlx::query_scalar::<_, bool>(
        "SELECT EXISTS(SELECT 1 FROM pg_locks WHERE locktype = 'advisory' AND granted
           AND database = (SELECT oid FROM pg_database WHERE datname = current_database()))",
    )
    .fetch_one(pool)
    .await
    .unwrap()
}

/// BUG-221: the client hangs up while a mark (then a leave) is inside its
/// transaction. Both still land whole: the step with its completion, the
/// run's removal with every un-completion — never one without the other.
#[sqlx::test(migrations = "../../migrations")]
async fn mark_and_leave_dropped_mid_flight_still_land_whole(pool: PgPool) {
    let app = TestApp::spawn(pool).await;
    let teacher = instructor(&app, "teacher").await;
    let (course_id, chapter_id) = public_course(&app, &teacher, "Hangup 101").await;
    let a1 = lesson(&app, &teacher, &chapter_id, "Intro").await;
    let a2 = lesson(&app, &teacher, &chapter_id, "Next").await;
    let alice = learner(&app, "alice").await;
    let mark_path = format!("/api/v2/trail/activities/{a1}");
    let leave_path = format!("/api/v2/trail/courses/{course_id}");
    let state_path = format!("/api/v2/courses/{course_id}/learner-state");
    let empty = serde_json::json!({});
    let steps = async || {
        let trail = app.get_as(&alice, "/api/v2/trail").await.json();
        trail["runs"]
            .as_array()
            .unwrap()
            .iter()
            .map(|r| r["steps"].as_array().unwrap().len())
            .sum::<usize>()
    };

    drop_request_when(
        app.post_as(&alice, &mark_path, &empty),
        async || trail_lock_held(&app.pool).await,
        |response| assert_eq!(response.status, StatusCode::OK, "{}", response.text()),
    )
    .await;
    wait_until("the dropped mark never landed", async || steps().await == 1).await;
    let state = app.get_as(&alice, &state_path).await.json();
    assert_eq!(activity(&state, &a1)["state"], "complete", "{state}");
    assert_eq!(state["progress"]["completed_required_count"], 1, "{state}");

    let second = app
        .post_as(&alice, &format!("/api/v2/trail/activities/{a2}"), &empty)
        .await;
    assert_eq!(second.status, StatusCode::OK, "{}", second.text());
    drop_request_when(
        app.delete_as(&alice, &leave_path),
        async || trail_lock_held(&app.pool).await,
        |response| assert_eq!(response.status, StatusCode::OK, "{}", response.text()),
    )
    .await;
    wait_until("the dropped leave never landed", async || {
        steps().await == 0
    })
    .await;
    let state = app.get_as(&alice, &state_path).await.json();
    assert_eq!(state["enrolled"], false, "{state}");
    for id in [&a1, &a2] {
        assert_ne!(activity(&state, id)["state"], "complete", "{state}");
    }
    assert_eq!(state["progress"]["completed_required_count"], 0, "{state}");
}

/// A published one-item quiz; returns (assessment_id, activity_id, item_id).
async fn quiz(
    app: &TestApp,
    teacher: &MintedSession,
    chapter_id: &str,
) -> (String, String, String) {
    let created = app
        .post_as(
            teacher,
            "/api/v2/assessments",
            &serde_json::json!({ "chapter_id": chapter_id, "kind": "quiz", "title": "Quiz" }),
        )
        .await;
    assert_eq!(created.status, StatusCode::CREATED, "{}", created.text());
    let assessment_id = created.json()["id"].as_str().unwrap().to_owned();
    let item = app
        .post_as(
            teacher,
            &format!("/api/v2/assessments/{assessment_id}/items"),
            &serde_json::json!({
                "title": "Q1", "max_score": 10,
                "body": { "kind": "choice", "prompt": "Q1",
                          "options": [{ "id": "a", "text": "yes", "is_correct": true },
                                      { "id": "b", "text": "no", "is_correct": false }] }
            }),
        )
        .await;
    let published = app
        .post_as(
            teacher,
            &format!("/api/v2/assessments/{assessment_id}/lifecycle"),
            &serde_json::json!({ "to": "published" }),
        )
        .await;
    assert_eq!(published.status, StatusCode::OK, "{}", published.text());
    (
        assessment_id,
        created.json()["activity_id"].as_str().unwrap().to_owned(),
        item.json()["id"].as_str().unwrap().to_owned(),
    )
}

/// BUG-268: a leaver who passed 1 of 2 required quizzes is no member, so the
/// course-wide recalculation after unpublishing or deleting the other quiz
/// leaves them alone — no completion, certificate or course XP.
#[sqlx::test(migrations = "../../migrations")]
async fn course_recalculation_skips_leavers(pool: PgPool) {
    let app = TestApp::spawn(pool).await;
    let teacher = instructor(&app, "teacher").await;
    let (course_id, chapter_id) = public_course(&app, &teacher, "Leavers 101").await;
    let created = app
        .post_as(
            &teacher,
            "/api/v2/certifications",
            &serde_json::json!({ "course_id": course_id, "config": { "template": "classic" } }),
        )
        .await;
    assert_eq!(created.status, StatusCode::CREATED, "{}", created.text());
    let (q1, _, item) = quiz(&app, &teacher, &chapter_id).await;
    let (q2, q2_activity, _) = quiz(&app, &teacher, &chapter_id).await;
    let alice = learner(&app, "alice").await;
    let draft = app
        .post_as(
            &alice,
            &format!("/api/v2/assessments/{q1}/submissions"),
            &serde_json::json!({}),
        )
        .await;
    let sub_id = draft.json()["id"].as_str().unwrap().to_owned();
    let submitted = app
        .post_as(
            &alice,
            &format!("/api/v2/submissions/{sub_id}/submit"),
            &serde_json::json!({ "answers": { item: { "kind": "choice", "selected": ["a"] } } }),
        )
        .await;
    assert_eq!(submitted.status, StatusCode::OK, "{}", submitted.text());
    let left = app
        .delete_as(&alice, &format!("/api/v2/trail/courses/{course_id}"))
        .await;
    assert_eq!(left.status, StatusCode::OK, "{}", left.text());

    let rewarded = || async {
        let row: (i64, i64, i64) = sqlx::query_as(
            "SELECT (SELECT count(*) FROM course_progress
                     WHERE user_id = $1 AND (completed_at IS NOT NULL OR certificate_eligible)),
                    (SELECT count(*) FROM certificate_users WHERE user_id = $1),
                    (SELECT count(*) FROM xp_transactions
                     WHERE user_id = $1 AND source = 'course_completion')",
        )
        .bind(alice.user_id.0)
        .fetch_one(&app.pool)
        .await
        .unwrap();
        row
    };
    for to in ["draft", "published"] {
        let moved = app
            .post_as(
                &teacher,
                &format!("/api/v2/assessments/{q2}/lifecycle"),
                &serde_json::json!({ "to": to }),
            )
            .await;
        assert_eq!(moved.status, StatusCode::OK, "{}", moved.text());
        assert_eq!(rewarded().await, (0, 0, 0), "after {to}");
    }
    let deleted = app
        .delete_as(&teacher, &format!("/api/v2/activities/{q2_activity}"))
        .await;
    assert_eq!(deleted.status, StatusCode::NO_CONTENT, "{}", deleted.text());
    assert_eq!(rewarded().await, (0, 0, 0), "after delete");
}

/// BUG-269: the concurrent BUG-268. Twelve members who passed 1 of 2
/// required quizzes are mid-leave (trail lock held, run deleted, not yet
/// committed) while the teacher unpublishes the other quiz. The course-wide
/// recalculation read them as members; it waits for each member's trail lock
/// and re-checks the run inside it, so no leaver completes once the leave
/// commits, while the members who stay do.
#[sqlx::test(migrations = "../../migrations")]
async fn course_recalculation_racing_leaves_skips_the_leavers(pool: PgPool) {
    let app = TestApp::spawn(pool).await;
    let teacher = instructor(&app, "teacher").await;
    let (course_id, chapter_id) = public_course(&app, &teacher, "Race 101").await;
    let created = app
        .post_as(
            &teacher,
            "/api/v2/certifications",
            &serde_json::json!({ "course_id": course_id, "config": { "template": "classic" } }),
        )
        .await;
    assert_eq!(created.status, StatusCode::CREATED, "{}", created.text());
    let (q1, _, item) = quiz(&app, &teacher, &chapter_id).await;
    let (q2, _, _) = quiz(&app, &teacher, &chapter_id).await;
    let mut members = Vec::new();
    for i in 0..14 {
        let member = learner(&app, &format!("member{i}")).await;
        let draft = app
            .post_as(
                &member,
                &format!("/api/v2/assessments/{q1}/submissions"),
                &serde_json::json!({}),
            )
            .await;
        let sub_id = draft.json()["id"].as_str().unwrap().to_owned();
        let submitted = app
            .post_as(
                &member,
                &format!("/api/v2/submissions/{sub_id}/submit"),
                &serde_json::json!({ "answers": { &item: { "kind": "choice", "selected": ["a"] } } }),
            )
            .await;
        assert_eq!(submitted.status, StatusCode::OK, "{}", submitted.text());
        members.push(member);
    }
    let (leavers, stayers) = members.split_at(12);
    // The DB half of `DELETE /trail/courses/{id}` (no lessons to un-mark),
    // under the same `try_lock_trail_run` key.
    let mut leave = app.pool.begin().await.unwrap();
    for leaver in leavers {
        sqlx::query(
            "SELECT pg_advisory_xact_lock(hashtextextended($1::uuid::text || $2::uuid::text, 0))",
        )
        .bind(leaver.user_id.0)
        .bind(&course_id)
        .execute(&mut *leave)
        .await
        .unwrap();
        sqlx::query("DELETE FROM trail_runs WHERE user_id = $1 AND course_id = $2::uuid")
            .bind(leaver.user_id.0)
            .bind(&course_id)
            .execute(&mut *leave)
            .await
            .unwrap();
    }
    let q2_path = format!("/api/v2/assessments/{q2}/lifecycle");
    let to_draft = serde_json::json!({ "to": "draft" });
    let unpublish = app.post_as(&teacher, &q2_path, &to_draft);
    let commit_leaves = async {
        tokio::time::sleep(std::time::Duration::from_millis(300)).await;
        leave.commit().await.unwrap();
    };
    let (unpublished, ()) = tokio::join!(unpublish, commit_leaves);
    assert_eq!(unpublished.status, StatusCode::OK, "{}", unpublished.text());

    let rewarded = async |member: &MintedSession| {
        sqlx::query_as::<_, (i64, i64, i64)>(
            "SELECT (SELECT count(*) FROM course_progress
                     WHERE user_id = $1 AND (completed_at IS NOT NULL OR certificate_eligible)),
                    (SELECT count(*) FROM certificate_users WHERE user_id = $1),
                    (SELECT count(*) FROM xp_transactions
                     WHERE user_id = $1 AND source = 'course_completion')",
        )
        .bind(member.user_id.0)
        .fetch_one(&app.pool)
        .await
        .unwrap()
    };
    for (i, leaver) in leavers.iter().enumerate() {
        assert_eq!(rewarded(leaver).await, (0, 0, 0), "leaver {i}");
    }
    for (i, stayer) in stayers.iter().enumerate() {
        assert_eq!(rewarded(stayer).await, (1, 1, 1), "stayer {i}");
    }
}

/// BUG-272: the first member's trail lock is held past the interactive 2 s
/// wait while the teacher unpublishes the other quiz — the course-wide
/// recalculation waits for it instead of aborting, so every member
/// (the held one included) completes.
#[sqlx::test(migrations = "../../migrations")]
async fn course_recalculation_outwaits_a_busy_member(pool: PgPool) {
    let app = TestApp::spawn(pool).await;
    let teacher = instructor(&app, "teacher").await;
    let (course_id, chapter_id) = public_course(&app, &teacher, "Busy 101").await;
    let (q1, _, item) = quiz(&app, &teacher, &chapter_id).await;
    let (q2, _, _) = quiz(&app, &teacher, &chapter_id).await;
    let mut members = Vec::new();
    for i in 0..3 {
        let member = learner(&app, &format!("member{i}")).await;
        let draft = app
            .post_as(
                &member,
                &format!("/api/v2/assessments/{q1}/submissions"),
                &serde_json::json!({}),
            )
            .await;
        let sub_id = draft.json()["id"].as_str().unwrap().to_owned();
        let submitted = app
            .post_as(
                &member,
                &format!("/api/v2/submissions/{sub_id}/submit"),
                &serde_json::json!({ "answers": { &item: { "kind": "choice", "selected": ["a"] } } }),
            )
            .await;
        assert_eq!(submitted.status, StatusCode::OK, "{}", submitted.text());
        members.push(member);
    }
    // The member the recalculation reaches first (`course_members` order).
    let first: uuid::Uuid =
        sqlx::query_scalar("SELECT user_id FROM trail_runs WHERE course_id = $1::uuid")
            .bind(&course_id)
            .fetch_one(&app.pool)
            .await
            .unwrap();
    let mut busy = app.pool.begin().await.unwrap();
    sqlx::query(
        "SELECT pg_advisory_xact_lock(hashtextextended($1::uuid::text || $2::uuid::text, 0))",
    )
    .bind(first)
    .bind(&course_id)
    .execute(&mut *busy)
    .await
    .unwrap();
    let release = async {
        tokio::time::sleep(std::time::Duration::from_millis(2500)).await;
        busy.commit().await.unwrap();
    };
    let (path, to_draft) = (
        format!("/api/v2/assessments/{q2}/lifecycle"),
        serde_json::json!({ "to": "draft" }),
    );
    let (unpublished, ()) = tokio::join!(app.post_as(&teacher, &path, &to_draft), release);
    assert_eq!(unpublished.status, StatusCode::OK, "{}", unpublished.text());
    for (i, member) in members.iter().enumerate() {
        let complete: bool = sqlx::query_scalar(
            "SELECT certificate_eligible FROM course_progress
             WHERE user_id = $1 AND course_id = $2::uuid",
        )
        .bind(member.user_id.0)
        .bind(&course_id)
        .fetch_one(&app.pool)
        .await
        .unwrap();
        assert!(complete, "member {i} was never recalculated");
    }
}

/// BUG-310: the curriculum toggle is detached — a teacher who hangs up
/// while a member's trail lock holds up the course-wide recalculation still
/// gets it once the lock frees: the learner with A done and only B left is
/// 1/1 and eligible after B is unpublished.
#[sqlx::test(migrations = "../../migrations")]
async fn unpublish_dropped_under_a_member_lock_still_recalculates(pool: PgPool) {
    let app = TestApp::spawn(pool).await;
    let teacher = instructor(&app, "teacher").await;
    let (course_id, chapter_id) = public_course(&app, &teacher, "Toggle 101").await;
    let a = lesson(&app, &teacher, &chapter_id, "A").await;
    let b = lesson(&app, &teacher, &chapter_id, "B").await;
    let alice = learner(&app, "alice").await;
    let marked = app
        .post_as(
            &alice,
            &format!("/api/v2/trail/activities/{a}"),
            &serde_json::json!({}),
        )
        .await;
    assert_eq!(marked.status, StatusCode::OK, "{}", marked.text());

    let mut held = app.pool.begin().await.unwrap();
    sqlx::query(
        "SELECT pg_advisory_xact_lock(hashtextextended($1::uuid::text || $2::uuid::text, 0))",
    )
    .bind(alice.user_id.0)
    .bind(&course_id)
    .execute(&mut *held)
    .await
    .unwrap();
    drop_request_when(
        app.patch_as(
            &teacher,
            &format!("/api/v2/activities/{b}"),
            &serde_json::json!({ "published": false }),
        ),
        async || {
            !sqlx::query_scalar::<_, bool>("SELECT published FROM activities WHERE id = $1::uuid")
                .bind(&b)
                .fetch_one(&app.pool)
                .await
                .unwrap()
        },
        |response| panic!("finished under the lock: {}", response.text()),
    )
    .await;
    held.commit().await.unwrap();
    let progress = async || {
        sqlx::query_as::<_, (i32, i32, bool)>(
            "SELECT completed_required_count, total_required_count, certificate_eligible
             FROM course_progress WHERE user_id = $1 AND course_id = $2::uuid",
        )
        .bind(alice.user_id.0)
        .bind(&course_id)
        .fetch_one(&app.pool)
        .await
        .unwrap()
    };
    wait_until("the dropped toggle never recalculated", async || {
        progress().await == (1, 1, true)
    })
    .await;
}

/// A published one-essay quiz (hand-graded); returns (assessment_id, activity_id, item_id).
async fn essay_quiz(
    app: &TestApp,
    teacher: &MintedSession,
    chapter_id: &str,
) -> (String, String, String) {
    let created = app
        .post_as(
            teacher,
            "/api/v2/assessments",
            &serde_json::json!({ "chapter_id": chapter_id, "kind": "quiz", "title": "Essay" }),
        )
        .await;
    assert_eq!(created.status, StatusCode::CREATED, "{}", created.text());
    let assessment_id = created.json()["id"].as_str().unwrap().to_owned();
    let item = app
        .post_as(
            teacher,
            &format!("/api/v2/assessments/{assessment_id}/items"),
            &serde_json::json!({ "title": "Essay", "max_score": 10,
                                  "body": { "kind": "open_text", "prompt": "Why?" } }),
        )
        .await;
    let published = app
        .post_as(
            teacher,
            &format!("/api/v2/assessments/{assessment_id}/lifecycle"),
            &serde_json::json!({ "to": "published" }),
        )
        .await;
    assert_eq!(published.status, StatusCode::OK, "{}", published.text());
    (
        assessment_id,
        created.json()["activity_id"].as_str().unwrap().to_owned(),
        item.json()["id"].as_str().unwrap().to_owned(),
    )
}

/// Submit an essay attempt (pending); returns the submission id.
async fn submit_essay(
    app: &TestApp,
    who: &MintedSession,
    assessment_id: &str,
    item: &str,
) -> String {
    let draft = app
        .post_as(
            who,
            &format!("/api/v2/assessments/{assessment_id}/submissions"),
            &serde_json::json!({}),
        )
        .await;
    let sub_id = draft.json()["id"].as_str().unwrap().to_owned();
    let submitted = app
        .post_as(
            who,
            &format!("/api/v2/submissions/{sub_id}/submit"),
            &serde_json::json!({ "answers": { item: { "kind": "open_text", "text": "Because." } } }),
        )
        .await;
    assert_eq!(
        submitted.json()["status"],
        "pending",
        "{}",
        submitted.text()
    );
    sub_id
}

/// The teacher publishes 100 on a pending submission.
async fn publish_full_marks(app: &TestApp, teacher: &MintedSession, sub_id: &str) {
    let graded = app
        .send(
            axum::http::Request::builder()
                .method("PATCH")
                .uri(format!("/api/v2/submissions/{sub_id}/grade"))
                .header(axum::http::header::CONTENT_TYPE, "application/json")
                .header(axum::http::header::COOKIE, &teacher.cookie)
                .header(axum::http::header::IF_MATCH, "1")
                .body(axum::body::Body::from(
                    serde_json::json!({ "action": "publish", "final_score": 100 }).to_string(),
                ))
                .unwrap(),
        )
        .await;
    assert_eq!(graded.status, StatusCode::OK, "{}", graded.text());
}

/// Submit an essay attempt (pending), leave, and have the teacher publish
/// 100 while the learner is away.
async fn graded_while_away(
    app: &TestApp,
    teacher: &MintedSession,
    who: &MintedSession,
    course_id: &str,
    assessment_id: &str,
    item: &str,
) {
    let sub_id = submit_essay(app, who, assessment_id, item).await;
    let left = app
        .delete_as(who, &format!("/api/v2/trail/courses/{course_id}"))
        .await;
    assert_eq!(left.status, StatusCode::OK, "{}", left.text());
    publish_full_marks(app, teacher, &sub_id).await;
}

/// BUG-275: a grade and a lesson published while the learner was away both
/// reach them on rejoin — through `POST trail/courses` and through a mark
/// that re-creates the run.
#[sqlx::test(migrations = "../../migrations")]
async fn rejoin_reprojects_what_changed_while_away(pool: PgPool) {
    let app = TestApp::spawn(pool).await;
    let teacher = instructor(&app, "teacher").await;
    let (course_id, chapter_id) = public_course(&app, &teacher, "Rejoin 101").await;
    let created = app
        .post_as(
            &teacher,
            "/api/v2/certifications",
            &serde_json::json!({ "course_id": course_id, "config": { "template": "classic" } }),
        )
        .await;
    assert_eq!(created.status, StatusCode::CREATED, "{}", created.text());
    let (essay, essay_activity, item) = essay_quiz(&app, &teacher, &chapter_id).await;
    let alice = learner(&app, "alice").await;
    let bob = learner(&app, "bob").await;
    graded_while_away(&app, &teacher, &alice, &course_id, &essay, &item).await;
    graded_while_away(&app, &teacher, &bob, &course_id, &essay, &item).await;
    let away_lesson = lesson(&app, &teacher, &chapter_id, "Published while away").await;

    // Alice rejoins the course: 1 of 2 (the new lesson counts), quiz passed.
    let rejoined = app
        .post_as(
            &alice,
            &format!("/api/v2/trail/courses/{course_id}"),
            &serde_json::json!({}),
        )
        .await;
    assert_eq!(rejoined.status, StatusCode::OK, "{}", rejoined.text());
    let path = format!("/api/v2/courses/{course_id}/learner-state");
    let state = app.get_as(&alice, &path).await.json();
    assert_eq!(
        activity(&state, &essay_activity)["complete"],
        true,
        "{state}"
    );
    assert_eq!(state["progress"]["completed_required_count"], 1, "{state}");
    assert_eq!(state["progress"]["total_required_count"], 2, "{state}");
    // Bob rejoins by marking the new lesson: 2 of 2 and the certificate.
    let marked = app
        .post_as(
            &bob,
            &format!("/api/v2/trail/activities/{away_lesson}"),
            &serde_json::json!({}),
        )
        .await;
    assert_eq!(marked.status, StatusCode::OK, "{}", marked.text());
    let state = app.get_as(&bob, &path).await.json();
    assert_eq!(
        activity(&state, &essay_activity)["complete"],
        true,
        "{state}"
    );
    assert_eq!(state["progress"]["completed_required_count"], 2, "{state}");
    assert_eq!(state["progress"]["total_required_count"], 2, "{state}");
    let certs: i64 =
        sqlx::query_scalar("SELECT count(*) FROM certificate_users WHERE user_id = $1")
            .bind(bob.user_id.0)
            .fetch_one(&app.pool)
            .await
            .unwrap();
    assert_eq!(certs, 1, "the rejoined member was not certified");
}

/// BUG-276 / UX-187: a learner who passed and left reads as not enrolled,
/// and asking for their certificates once one is configured issues none;
/// on rejoin it is issued.
#[sqlx::test(migrations = "../../migrations")]
async fn a_leaver_is_issued_no_certificate(pool: PgPool) {
    let app = TestApp::spawn(pool).await;
    let teacher = instructor(&app, "teacher").await;
    let (course_id, chapter_id) = public_course(&app, &teacher, "Late cert 101").await;
    let (q1, _, item) = quiz(&app, &teacher, &chapter_id).await;
    let alice = learner(&app, "alice").await;
    let draft = app
        .post_as(
            &alice,
            &format!("/api/v2/assessments/{q1}/submissions"),
            &serde_json::json!({}),
        )
        .await;
    let sub_id = draft.json()["id"].as_str().unwrap().to_owned();
    let submitted = app
        .post_as(
            &alice,
            &format!("/api/v2/submissions/{sub_id}/submit"),
            &serde_json::json!({ "answers": { item: { "kind": "choice", "selected": ["a"] } } }),
        )
        .await;
    assert_eq!(submitted.status, StatusCode::OK, "{}", submitted.text());
    let left = app
        .delete_as(&alice, &format!("/api/v2/trail/courses/{course_id}"))
        .await;
    assert_eq!(left.status, StatusCode::OK, "{}", left.text());
    let state = app
        .get_as(
            &alice,
            &format!("/api/v2/courses/{course_id}/learner-state"),
        )
        .await
        .json();
    assert_eq!(state["enrollment_state"], "not_enrolled", "{state}");
    // The leave drops the completion even with no lesson to un-mark.
    let completed: (bool, bool) = sqlx::query_as(
        "SELECT certificate_eligible, completed_at IS NOT NULL FROM course_progress
         WHERE user_id = $1 AND course_id = $2::uuid",
    )
    .bind(alice.user_id.0)
    .bind(&course_id)
    .fetch_one(&app.pool)
    .await
    .unwrap();
    assert_eq!(
        completed,
        (false, false),
        "the leaver still reads completed"
    );
    let created = app
        .post_as(
            &teacher,
            "/api/v2/certifications",
            &serde_json::json!({ "course_id": course_id, "config": { "template": "classic" } }),
        )
        .await;
    assert_eq!(created.status, StatusCode::CREATED, "{}", created.text());
    let mine = format!("/api/v2/courses/{course_id}/certificates/me");
    let away = app.get_as(&alice, &mine).await;
    assert_eq!(away.status, StatusCode::OK, "{}", away.text());
    assert_eq!(
        away.json().as_array().map(Vec::len),
        Some(0),
        "{}",
        away.text()
    );
    // UX-194: nor does learner-state call the leaver eligible.
    let state = app
        .get_as(
            &alice,
            &format!("/api/v2/courses/{course_id}/learner-state"),
        )
        .await
        .json();
    assert_eq!(state["certificate"]["eligible"], false, "{state}");
    let rejoined = app
        .post_as(
            &alice,
            &format!("/api/v2/trail/courses/{course_id}"),
            &serde_json::json!({}),
        )
        .await;
    assert_eq!(rejoined.status, StatusCode::OK, "{}", rejoined.text());
    let back = app.get_as(&alice, &mine).await;
    assert_eq!(
        back.json().as_array().map(Vec::len),
        Some(1),
        "{}",
        back.text()
    );
}

/// BUG-289: a learner who rejoins by submitting another quiz (no
/// `POST trail/courses`) picks up the grade published while they were away.
#[sqlx::test(migrations = "../../migrations")]
async fn rejoin_by_submission_reprojects_the_member(pool: PgPool) {
    let app = TestApp::spawn(pool).await;
    let teacher = instructor(&app, "teacher").await;
    let (course_id, chapter_id) = public_course(&app, &teacher, "Rejoin by quiz").await;
    let created = app
        .post_as(
            &teacher,
            "/api/v2/certifications",
            &serde_json::json!({ "course_id": course_id, "config": { "template": "classic" } }),
        )
        .await;
    assert_eq!(created.status, StatusCode::CREATED, "{}", created.text());
    let (essay, essay_activity, essay_item) = essay_quiz(&app, &teacher, &chapter_id).await;
    let (q2, _, q2_item) = quiz(&app, &teacher, &chapter_id).await;
    let alice = learner(&app, "alice").await;
    graded_while_away(&app, &teacher, &alice, &course_id, &essay, &essay_item).await;
    let draft = app
        .post_as(
            &alice,
            &format!("/api/v2/assessments/{q2}/submissions"),
            &serde_json::json!({}),
        )
        .await;
    let sub_id = draft.json()["id"].as_str().unwrap().to_owned();
    let submitted = app
        .post_as(
            &alice,
            &format!("/api/v2/submissions/{sub_id}/submit"),
            &serde_json::json!({ "answers": { q2_item: { "kind": "choice", "selected": ["a"] } } }),
        )
        .await;
    assert_eq!(submitted.status, StatusCode::OK, "{}", submitted.text());
    let state = app
        .get_as(
            &alice,
            &format!("/api/v2/courses/{course_id}/learner-state"),
        )
        .await
        .json();
    assert_eq!(
        activity(&state, &essay_activity)["complete"],
        true,
        "{state}"
    );
    assert_eq!(state["progress"]["completed_required_count"], 2, "{state}");
    assert_eq!(state["progress"]["total_required_count"], 2, "{state}");
    let mine = app
        .get_as(
            &alice,
            &format!("/api/v2/courses/{course_id}/certificates/me"),
        )
        .await;
    assert_eq!(
        mine.json().as_array().map(Vec::len),
        Some(1),
        "{}",
        mine.text()
    );
}

/// BUG-291: a learner who joins the staff and leaves it again — removed,
/// deactivated, demoted to reporter, or a platform grant revoked — is a
/// member again and picks up the grade published while they were staff.
#[sqlx::test(migrations = "../../migrations")]
async fn leaving_the_staff_reprojects_the_member(pool: PgPool) {
    let app = TestApp::spawn(pool).await;
    let teacher = instructor(&app, "teacher").await;
    let admin = app.mint_session(&["*:*:*"]).await;
    let (course_id, chapter_id) = public_course(&app, &teacher, "Staff and back").await;
    let created = app
        .post_as(
            &teacher,
            "/api/v2/certifications",
            &serde_json::json!({ "course_id": course_id, "config": { "template": "classic" } }),
        )
        .await;
    assert_eq!(created.status, StatusCode::CREATED, "{}", created.text());
    let (essay, _, essay_item) = essay_quiz(&app, &teacher, &chapter_id).await;
    let (q2, _, q2_item) = quiz(&app, &teacher, &chapter_id).await;
    let roster = format!("/api/v2/courses/{course_id}/contributors");
    for exit in ["remove", "deactivate", "reporter", "rbac"] {
        let who = learner(&app, &format!("l-{exit}")).await;
        let draft = app
            .post_as(
                &who,
                &format!("/api/v2/assessments/{q2}/submissions"),
                &serde_json::json!({}),
            )
            .await;
        let sub = draft.json()["id"].as_str().unwrap().to_owned();
        let passed = app
            .post_as(
                &who,
                &format!("/api/v2/submissions/{sub}/submit"),
                &serde_json::json!({ "answers": { &q2_item: { "kind": "choice", "selected": ["a"] } } }),
            )
            .await;
        assert_eq!(passed.status, StatusCode::OK, "{}", passed.text());
        let pending = submit_essay(&app, &who, &essay, &essay_item).await;
        let member = format!("{roster}/{}", who.user_id);
        let roles = format!("/api/v2/users/{}/roles", who.user_id);
        let joined = if exit == "rbac" {
            app.post_as(&admin, &roles, &serde_json::json!({ "role": "maintainer" }))
                .await
        } else {
            app.post_as(
                &teacher,
                &roster,
                &serde_json::json!({ "user_id": who.user_id, "role": "contributor" }),
            )
            .await
        };
        assert!(joined.status.is_success(), "{exit}: {}", joined.text());
        publish_full_marks(&app, &teacher, &pending).await;
        let left = match exit {
            "remove" => app.delete_as(&teacher, &member).await,
            "deactivate" => {
                app.patch_as(
                    &teacher,
                    &member,
                    &serde_json::json!({ "status": "inactive" }),
                )
                .await
            }
            "reporter" => {
                app.patch_as(
                    &teacher,
                    &member,
                    &serde_json::json!({ "role": "reporter" }),
                )
                .await
            }
            _ => app.delete_as(&admin, &format!("{roles}/maintainer")).await,
        };
        assert!(left.status.is_success(), "{exit}: {}", left.text());
        let state = app
            .get_as(&who, &format!("/api/v2/courses/{course_id}/learner-state"))
            .await
            .json();
        assert_eq!(
            state["progress"]["completed_required_count"], 2,
            "{exit}: {state}"
        );
        assert_eq!(
            state["progress"]["total_required_count"], 2,
            "{exit}: {state}"
        );
        let mine = app
            .get_as(
                &who,
                &format!("/api/v2/courses/{course_id}/certificates/me"),
            )
            .await;
        assert_eq!(
            mine.json().as_array().map(Vec::len),
            Some(1),
            "{exit}: {}",
            mine.text()
        );
    }
}

/// BUG-292: a member who joins the course's staff keeps the run but is no
/// member — `/trail` stops listing the course and learner-state shows no
/// progress of theirs; leaving the staff brings both back.
#[sqlx::test(migrations = "../../migrations")]
async fn a_staffed_run_is_not_listed(pool: PgPool) {
    let app = TestApp::spawn(pool).await;
    let teacher = instructor(&app, "teacher").await;
    let (course_id, chapter_id) = public_course(&app, &teacher, "Staffed run").await;
    let (q1, _, item) = quiz(&app, &teacher, &chapter_id).await;
    let alice = learner(&app, "alice").await;
    let draft = app
        .post_as(
            &alice,
            &format!("/api/v2/assessments/{q1}/submissions"),
            &serde_json::json!({}),
        )
        .await;
    let sub = draft.json()["id"].as_str().unwrap().to_owned();
    let passed = app
        .post_as(
            &alice,
            &format!("/api/v2/submissions/{sub}/submit"),
            &serde_json::json!({ "answers": { &item: { "kind": "choice", "selected": ["a"] } } }),
        )
        .await;
    assert_eq!(passed.status, StatusCode::OK, "{}", passed.text());
    let roster = format!("/api/v2/courses/{course_id}/contributors");
    let added = app
        .post_as(
            &teacher,
            &roster,
            &serde_json::json!({ "user_id": alice.user_id, "role": "contributor" }),
        )
        .await;
    assert_eq!(added.status, StatusCode::CREATED, "{}", added.text());
    let runs = |trail: serde_json::Value| trail["runs"].as_array().unwrap().len();
    let learner_state = format!("/api/v2/courses/{course_id}/learner-state");
    assert_eq!(runs(app.get_as(&alice, "/api/v2/trail").await.json()), 0);
    let state = app.get_as(&alice, &learner_state).await.json();
    assert_eq!(state["progress"]["completed_required_count"], 0, "{state}");
    assert_eq!(
        state["outline"][0]["activities"][0]["complete"], false,
        "{state}"
    );
    let removed = app
        .delete_as(&teacher, &format!("{roster}/{}", alice.user_id))
        .await;
    assert_eq!(removed.status, StatusCode::NO_CONTENT, "{}", removed.text());
    assert_eq!(runs(app.get_as(&alice, "/api/v2/trail").await.json()), 1);
    let state = app.get_as(&alice, &learner_state).await.json();
    assert_eq!(state["progress"]["completed_required_count"], 1, "{state}");
}

/// BUG-318: a learner's required set is what they may take — a quiz
/// restricted to an allowlist they are not on is neither required nor their
/// next step, so the rest completes the course; adding them to the list makes
/// it required again (the access change re-aggregates the members).
#[sqlx::test(migrations = "../../migrations")]
async fn restricted_assessment_is_required_only_of_the_allowlist(pool: PgPool) {
    let app = TestApp::spawn(pool).await;
    let teacher = instructor(&app, "teacher").await;
    let (course_id, chapter_id) = public_course(&app, &teacher, "Allowlist 101").await;
    let lesson_id = lesson(&app, &teacher, &chapter_id, "Intro").await;
    let (quiz_id, quiz_activity, _) = quiz(&app, &teacher, &chapter_id).await;
    let alice = learner(&app, "alice").await;
    let bob = learner(&app, "bob").await;
    for who in [&alice, &bob] {
        let added = app
            .post_as(
                who,
                &format!("/api/v2/trail/courses/{course_id}"),
                &serde_json::json!({}),
            )
            .await;
        assert_eq!(added.status, StatusCode::OK, "{}", added.text());
    }
    let set_access = |user_ids: serde_json::Value| {
        axum::http::Request::builder()
            .method("PUT")
            .uri(format!("/api/v2/assessments/{quiz_id}/access"))
            .header(axum::http::header::CONTENT_TYPE, "application/json")
            .header(axum::http::header::COOKIE, &teacher.cookie)
            .body(axum::body::Body::from(
                serde_json::json!({ "mode": "restricted", "user_ids": user_ids,
                                    "usergroup_ids": [] })
                .to_string(),
            ))
            .unwrap()
    };
    let restricted = app
        .send(set_access(serde_json::json!([alice.user_id])))
        .await;
    assert_eq!(restricted.status, StatusCode::OK, "{}", restricted.text());
    let marked = app
        .post_as(
            &bob,
            &format!("/api/v2/trail/activities/{lesson_id}"),
            &serde_json::json!({}),
        )
        .await;
    assert_eq!(marked.status, StatusCode::OK, "{}", marked.text());
    let state_path = format!("/api/v2/courses/{course_id}/learner-state");
    let off = app.get_as(&bob, &state_path).await.json();
    assert_eq!(off["progress"]["total_required_count"], 1, "{off}");
    assert_eq!(off["progress"]["progress_pct"], 100.0);
    assert_eq!(off["enrollment_state"], "completed");
    assert_eq!(off["next_action"]["id"], "review_completion");
    assert_eq!(activity(&off, &quiz_activity)["required"], false);
    assert_eq!(
        activity(&off, &quiz_activity)["blocked_reason"],
        "restricted"
    );
    // Alice is on the list: the quiz is hers to take.
    let on = app.get_as(&alice, &state_path).await.json();
    assert_eq!(on["progress"]["total_required_count"], 2, "{on}");

    let added = app
        .send(set_access(serde_json::json!([alice.user_id, bob.user_id])))
        .await;
    assert_eq!(added.status, StatusCode::OK, "{}", added.text());
    let back = app.get_as(&bob, &state_path).await.json();
    assert_eq!(back["progress"]["total_required_count"], 2, "{back}");
    assert_eq!(back["progress"]["progress_pct"], 50.0);
    assert_eq!(back["next_action"]["activity_id"], quiz_activity.as_str());
    assert_eq!(activity(&back, &quiz_activity)["required"], true);

    // Through a group: Bob off the user list but in a listed cohort (still
    // required); leaving the cohort drops it from his required set.
    let cohorts = app
        .mint_session_for(
            teacher.user_id,
            &[
                "usergroup:create:platform",
                "usergroup:read:platform",
                "course:update:own",
            ],
        )
        .await;
    let group = app
        .post_as(
            &cohorts,
            "/api/v2/usergroups",
            &serde_json::json!({ "name": "Cohort" }),
        )
        .await;
    let group_id = group.json()["id"].as_str().unwrap().to_owned();
    let members = format!("/api/v2/usergroups/{group_id}/members");
    app.post_as(
        &cohorts,
        &members,
        &serde_json::json!({ "user_ids": [bob.user_id] }),
    )
    .await;
    app.post_as(
        &cohorts,
        &format!("/api/v2/usergroups/{group_id}/courses"),
        &serde_json::json!({ "course_ids": [course_id] }),
    )
    .await;
    let via_group = app
        .send(
            axum::http::Request::builder()
                .method("PUT")
                .uri(format!("/api/v2/assessments/{quiz_id}/access"))
                .header(axum::http::header::CONTENT_TYPE, "application/json")
                .header(axum::http::header::COOKIE, &teacher.cookie)
                .body(axum::body::Body::from(
                    serde_json::json!({ "mode": "restricted", "user_ids": [alice.user_id],
                                        "usergroup_ids": [group_id] })
                    .to_string(),
                ))
                .unwrap(),
        )
        .await;
    assert_eq!(via_group.status, StatusCode::OK, "{}", via_group.text());
    let grouped = app.get_as(&bob, &state_path).await.json();
    assert_eq!(grouped["progress"]["total_required_count"], 2, "{grouped}");
    let left = app
        .send(
            axum::http::Request::builder()
                .method("DELETE")
                .uri(&members)
                .header(axum::http::header::CONTENT_TYPE, "application/json")
                .header(axum::http::header::COOKIE, &cohorts.cookie)
                .body(axum::body::Body::from(
                    serde_json::json!({ "user_ids": [bob.user_id] }).to_string(),
                ))
                .unwrap(),
        )
        .await;
    assert!(left.status.is_success(), "{} {}", left.status, left.text());
    let ungrouped = app.get_as(&bob, &state_path).await.json();
    assert_eq!(
        ungrouped["progress"]["total_required_count"], 1,
        "{ungrouped}"
    );
    assert_eq!(ungrouped["progress"]["progress_pct"], 100.0);

    // The access check ignores the course link: a group unlinked from the
    // course but still on the allowlist re-aggregates on member removal, and
    // deleting the group (its allowlist rows cascade) re-aggregates too.
    let bob_in = serde_json::json!({ "user_ids": [bob.user_id] });
    let with_body = |method: &str, uri: &str, body: &serde_json::Value| {
        axum::http::Request::builder()
            .method(method)
            .uri(uri)
            .header(axum::http::header::CONTENT_TYPE, "application/json")
            .header(axum::http::header::COOKIE, &cohorts.cookie)
            .body(axum::body::Body::from(body.to_string()))
            .unwrap()
    };
    let required = |state: serde_json::Value| state["progress"]["total_required_count"].clone();
    app.post_as(&cohorts, &members, &bob_in).await;
    let unlinked = app
        .send(with_body(
            "DELETE",
            &format!("/api/v2/usergroups/{group_id}/courses"),
            &serde_json::json!({ "course_ids": [course_id] }),
        ))
        .await;
    assert!(unlinked.status.is_success(), "{}", unlinked.text());
    assert_eq!(required(app.get_as(&bob, &state_path).await.json()), 2);
    let removed = app.send(with_body("DELETE", &members, &bob_in)).await;
    assert!(removed.status.is_success(), "{}", removed.text());
    assert_eq!(required(app.get_as(&bob, &state_path).await.json()), 1);
    app.post_as(&cohorts, &members, &bob_in).await;
    assert_eq!(required(app.get_as(&bob, &state_path).await.json()), 2);
    let deleted = app
        .delete_as(&cohorts, &format!("/api/v2/usergroups/{group_id}"))
        .await;
    assert!(deleted.status.is_success(), "{}", deleted.text());
    let gone = app.get_as(&bob, &state_path).await.json();
    assert_eq!(gone["progress"]["total_required_count"], 1, "{gone}");
    assert_eq!(gone["progress"]["progress_pct"], 100.0);
}

/// UX-213: dropped from a quiz's allowlist, a learner can no longer take it
/// but still reads their own attempts and results.
#[sqlx::test(migrations = "../../migrations")]
async fn a_learner_off_the_allowlist_still_reads_their_attempts(pool: PgPool) {
    let app = TestApp::spawn(pool).await;
    let teacher = instructor(&app, "teacher").await;
    let (course_id, chapter_id) = public_course(&app, &teacher, "Allowlist 102").await;
    let (quiz_id, _, item) = quiz(&app, &teacher, &chapter_id).await;
    let alice = learner(&app, "alice").await;
    let bob = learner(&app, "bob").await;
    for who in [&alice, &bob] {
        app.post_as(
            who,
            &format!("/api/v2/trail/courses/{course_id}"),
            &serde_json::json!({}),
        )
        .await;
    }
    let draft = app
        .post_as(
            &alice,
            &format!("/api/v2/assessments/{quiz_id}/submissions"),
            &serde_json::json!({}),
        )
        .await;
    let sub_id = draft.json()["id"].as_str().unwrap().to_owned();
    let submitted = app
        .post_as(
            &alice,
            &format!("/api/v2/submissions/{sub_id}/submit"),
            &serde_json::json!({ "answers": { item: { "kind": "choice", "selected": ["a"] } } }),
        )
        .await;
    assert_eq!(submitted.status, StatusCode::OK, "{}", submitted.text());
    let restricted = app
        .send(
            axum::http::Request::builder()
                .method("PUT")
                .uri(format!("/api/v2/assessments/{quiz_id}/access"))
                .header(axum::http::header::CONTENT_TYPE, "application/json")
                .header(axum::http::header::COOKIE, &teacher.cookie)
                .body(axum::body::Body::from(
                    serde_json::json!({ "mode": "restricted", "user_ids": [bob.user_id],
                                        "usergroup_ids": [] })
                    .to_string(),
                ))
                .unwrap(),
        )
        .await;
    assert_eq!(restricted.status, StatusCode::OK, "{}", restricted.text());

    let state = app
        .get_as(
            &alice,
            &format!("/api/v2/assessments/{quiz_id}/attempt-state"),
        )
        .await;
    assert_eq!(state.status, StatusCode::FORBIDDEN, "{}", state.text());
    let again = app
        .post_as(
            &alice,
            &format!("/api/v2/assessments/{quiz_id}/submissions"),
            &serde_json::json!({}),
        )
        .await;
    assert_eq!(again.status, StatusCode::FORBIDDEN, "{}", again.text());
    let mine = app
        .get_as(
            &alice,
            &format!("/api/v2/assessments/{quiz_id}/submissions/me"),
        )
        .await;
    assert_eq!(mine.status, StatusCode::OK, "{}", mine.text());
    assert_eq!(mine.json().as_array().unwrap().len(), 1, "{}", mine.text());
    let one = app
        .get_as(&alice, &format!("/api/v2/submissions/{sub_id}"))
        .await;
    assert_eq!(one.status, StatusCode::OK, "{}", one.text());
    assert_eq!(one.json()["final_score"], 100.0, "{}", one.text());
}

/// ETL-loaded learners arrive with trail steps but no projection rows: the
/// backfill turns each complete step into a `completed` lesson row and the
/// course aggregate, and pays no XP for those old completions.
#[sqlx::test(migrations = "../../migrations")]
async fn backfill_projects_migrated_trail_steps_without_xp(pool: PgPool) {
    let app = TestApp::spawn(pool.clone()).await;
    let teacher = instructor(&app, "teacher").await;
    let (course_id, chapter_id) = public_course(&app, &teacher, "Migrated 101").await;
    let a1 = lesson(&app, &teacher, &chapter_id, "Intro").await;
    let a2 = lesson(&app, &teacher, &chapter_id, "Outro").await;
    // A certification makes completion eligible — what pays the hook.
    let created = app
        .post_as(
            &teacher,
            "/api/v2/certifications",
            &serde_json::json!({ "course_id": course_id, "config": { "template": "classic" } }),
        )
        .await;
    assert_eq!(created.status, StatusCode::CREATED, "{}", created.text());
    let alice = learner(&app, "alice").await;
    app.post_as(
        &alice,
        &format!("/api/v2/trail/courses/{course_id}"),
        &serde_json::json!({}),
    )
    .await;
    for a in [&a1, &a2] {
        let step = app
            .post_as(
                &alice,
                &format!("/api/v2/trail/activities/{a}"),
                &serde_json::json!({}),
            )
            .await;
        assert_eq!(step.status, StatusCode::OK, "{}", step.text());
    }
    // What the ETL leaves behind: steps only.
    sqlx::query("DELETE FROM activity_progress")
        .execute(&pool)
        .await
        .unwrap();
    sqlx::query("DELETE FROM course_progress")
        .execute(&pool)
        .await
        .unwrap();
    sqlx::query("DELETE FROM xp_transactions")
        .execute(&pool)
        .await
        .unwrap();

    let report = ab_domain::progress::ProgressProjector::new(pool.clone())
        .backfill(None)
        .await
        .unwrap();
    assert_eq!(report.activity_rows, 2);
    let state = app
        .get_as(
            &alice,
            &format!("/api/v2/courses/{course_id}/learner-state"),
        )
        .await;
    assert_eq!(activity(&state.json(), &a1)["state"], "complete");
    assert_eq!(activity(&state.json(), &a2)["state"], "complete");
    assert_eq!(state.json()["progress"]["progress_pct"], 100.0);
    // Reading an old completion (this route recalculates) is no transition:
    // it pays nothing either.
    let mine = app
        .get_as(
            &alice,
            &format!("/api/v2/courses/{course_id}/certificates/me"),
        )
        .await;
    assert_eq!(mine.status, StatusCode::OK, "{}", mine.text());
    let xp: i64 = sqlx::query_scalar("SELECT count(*) FROM xp_transactions")
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(xp, 0, "a repair pays no XP");
    let certs: i64 = sqlx::query_scalar("SELECT count(*) FROM certificate_users")
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(certs, 1, "the certificate itself is kept");
}
