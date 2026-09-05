//! Gamification end to end: XP and streaks as side effects of completing a
//! lesson and a course, the dashboard/leaderboard/rank reads, preference
//! merging, manual streak touches, and the platform-manager award and
//! policy endpoints (learners cannot self-award).
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
        ],
    )
    .await
}

async fn learner(app: &TestApp, name: &str) -> MintedSession {
    let user = app
        .create_user(name, &format!("{name}@example.com"), &["user"])
        .await;
    app.mint_session_for(user, &["trail:read:all", "trail:submit:assigned"])
        .await
}

/// Public course with two published lessons; returns (course_id, [a1, a2]).
async fn course_with_lessons(app: &TestApp, teacher: &MintedSession) -> (String, Vec<String>) {
    let course = app
        .post_as(
            teacher,
            "/api/v2/courses",
            &serde_json::json!({ "name": "XP 101" }),
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
    let chapter_id = chapter.json()["id"].as_str().unwrap().to_owned();
    let mut ids = Vec::new();
    for name in ["Intro", "Deep dive"] {
        let activity = app
            .post_as(
                teacher,
                &format!("/api/v2/chapters/{chapter_id}/activities"),
                &serde_json::json!({ "name": name, "activity_type": "dynamic",
                                      "activity_sub_type": "dynamic_page" }),
            )
            .await;
        let id = activity.json()["id"].as_str().unwrap().to_owned();
        app.patch_as(
            teacher,
            &format!("/api/v2/activities/{id}"),
            &serde_json::json!({ "published": true }),
        )
        .await;
        ids.push(id);
    }
    (course_id, ids)
}

fn put_json(session: &MintedSession, uri: &str, body: &serde_json::Value) -> Request<Body> {
    Request::builder()
        .method("PUT")
        .uri(uri)
        .header(header::CONTENT_TYPE, "application/json")
        .header(header::COOKIE, &session.cookie)
        .body(Body::from(body.to_string()))
        .unwrap()
}

#[sqlx::test(migrations = "../../migrations")]
async fn xp_flows_from_completion_and_admin_awards(pool: PgPool) {
    let app = TestApp::spawn(pool).await;
    let teacher = instructor(&app, "teacher").await;
    let (course_id, lessons) = course_with_lessons(&app, &teacher).await;
    let alice = learner(&app, "alice").await;
    let bob = learner(&app, "bob").await;

    // A fresh dashboard: level 1, nothing earned, rank 1 of 1.
    let fresh = app.get_as(&alice, "/api/v2/gamification").await;
    assert_eq!(fresh.status, StatusCode::OK, "{}", fresh.text());
    assert_eq!(fresh.json()["profile"]["total_xp"], 0);
    assert_eq!(fresh.json()["profile"]["level"], 1);
    assert_eq!(fresh.json()["profile"]["xp_to_next_level"], 100);
    assert_eq!(fresh.json()["user_rank"], 1);
    assert_eq!(fresh.json()["leaderboard"]["total_participants"], 1);

    // Completing a lesson: +25 once, learning streak 1, counter 1.
    for _ in 0..2 {
        app.post_as(
            &alice,
            &format!("/api/v2/trail/activities/{}", lessons[0]),
            &serde_json::json!({}),
        )
        .await;
    }
    let after_one = app.get_as(&alice, "/api/v2/gamification").await;
    let profile = &after_one.json()["profile"];
    assert_eq!(profile["total_xp"], 25, "{}", after_one.text());
    assert_eq!(profile["learning_streak"], 1);
    assert_eq!(profile["total_activities_completed"], 1);
    assert_eq!(profile["daily_xp_earned"], 25);
    let recent = after_one.json()["recent_transactions"]
        .as_array()
        .unwrap()
        .clone();
    assert_eq!(recent.len(), 1);
    assert_eq!(recent[0]["source"], "activity_completion");
    assert_eq!(recent[0]["source_id"], lessons[0].as_str());

    // Completing the course: +25 +200 → 250, level 2, courses counter 1.
    app.post_as(
        &alice,
        &format!("/api/v2/trail/activities/{}", lessons[1]),
        &serde_json::json!({}),
    )
    .await;
    let done = app.get_as(&alice, "/api/v2/gamification").await;
    let profile = &done.json()["profile"];
    assert_eq!(profile["total_xp"], 250, "{}", done.text());
    assert_eq!(profile["level"], 2);
    assert_eq!(profile["total_courses_completed"], 1);
    let sources: Vec<String> = done.json()["recent_transactions"]
        .as_array()
        .unwrap()
        .iter()
        .map(|t| t["source"].as_str().unwrap().to_owned())
        .collect();
    assert!(
        sources.contains(&"course_completion".to_owned()),
        "{sources:?}"
    );
    let done_json = done.json();
    let level_up = done_json["recent_transactions"]
        .as_array()
        .unwrap()
        .iter()
        .find(|t| t["source"] == "course_completion")
        .unwrap();
    assert_eq!(level_up["triggered_level_up"], true);
    assert_eq!(level_up["previous_level"], 1);
    // Un-marking and re-marking does not pay twice.
    app.delete_as(&alice, &format!("/api/v2/trail/activities/{}", lessons[1]))
        .await;
    app.post_as(
        &alice,
        &format!("/api/v2/trail/activities/{}", lessons[1]),
        &serde_json::json!({}),
    )
    .await;
    let again = app.get_as(&alice, "/api/v2/gamification").await;
    assert_eq!(again.json()["profile"]["total_xp"], 250);

    // Leaderboard and rank: alice leads bob.
    app.get_as(&bob, "/api/v2/gamification").await;
    let board = app
        .get_as(&bob, "/api/v2/gamification/leaderboard?limit=5")
        .await;
    assert_eq!(board.status, StatusCode::OK, "{}", board.text());
    assert_eq!(board.json()["total_participants"], 2);
    assert_eq!(board.json()["entries"][0]["rank"], 1);
    assert_eq!(board.json()["entries"][0]["username"], "alice");
    assert!(board.json()["entries"][0].get("email").is_none());
    let bob_rank = app.get_as(&bob, "/api/v2/gamification/rank").await;
    assert_eq!(bob_rank.json()["rank"], 2);

    // Streak touch and preferences.
    let streak = app
        .post_as(
            &bob,
            "/api/v2/gamification/streaks/login",
            &serde_json::json!({}),
        )
        .await;
    assert_eq!(streak.status, StatusCode::OK, "{}", streak.text());
    assert_eq!(streak.json()["current_count"], 1);
    assert_eq!(streak.json()["is_new_record"], true);
    let prefs = app
        .patch_as(
            &bob,
            "/api/v2/gamification/preferences",
            &serde_json::json!({ "theme": "dark", "sound": true }),
        )
        .await;
    assert_eq!(prefs.status, StatusCode::OK, "{}", prefs.text());
    assert_eq!(prefs.json()["preferences"]["theme"], "dark");
    let prefs = app
        .patch_as(
            &bob,
            "/api/v2/gamification/preferences",
            &serde_json::json!({ "sound": null }),
        )
        .await;
    assert_eq!(prefs.json()["preferences"]["theme"], "dark");
    assert!(prefs.json()["preferences"].get("sound").is_none());

    // Awards: learners cannot; a platform manager can, idempotently.
    let admin = app.mint_session(&["platform:manage:platform"]).await;
    assert_eq!(
        app.post_as(
            &bob,
            "/api/v2/gamification/xp",
            &serde_json::json!({ "user_id": bob.user_id, "amount": 500 })
        )
        .await
        .status,
        StatusCode::FORBIDDEN
    );
    let awarded = app
        .post_as(
            &admin,
            "/api/v2/gamification/xp",
            &serde_json::json!({ "user_id": bob.user_id, "amount": 120,
                                  "reason": "hackathon", "idempotency_key": "hack-2026" }),
        )
        .await;
    assert_eq!(awarded.status, StatusCode::CREATED, "{}", awarded.text());
    assert_eq!(awarded.json()["is_new_transaction"], true);
    assert_eq!(awarded.json()["transaction"]["source"], "admin_award");
    assert_eq!(awarded.json()["level_up_occurred"], true);
    assert_eq!(awarded.json()["profile"]["total_xp"], 120);
    let replay = app
        .post_as(
            &admin,
            "/api/v2/gamification/xp",
            &serde_json::json!({ "user_id": bob.user_id, "amount": 120,
                                  "idempotency_key": "hack-2026" }),
        )
        .await;
    assert_eq!(replay.json()["is_new_transaction"], false);
    assert_eq!(replay.json()["profile"]["total_xp"], 120);

    // Policy: config reads/writes are for managers; a tiny daily cap bites.
    assert_eq!(
        app.get_as(&bob, "/api/v2/gamification/config").await.status,
        StatusCode::FORBIDDEN
    );
    let config = app
        .send(put_json(
            &admin,
            "/api/v2/gamification/config",
            &serde_json::json!({ "daily_xp_limit": 30, "rewards": { "activity_completion": 40 } }),
        ))
        .await;
    assert_eq!(config.status, StatusCode::OK, "{}", config.text());
    assert_eq!(config.json()["daily_xp_limit"], 30);
    // Bob's first lesson would pay 40 > cap 30 → the award is skipped, the
    // step still lands (best-effort hook).
    let step = app
        .post_as(
            &bob,
            &format!("/api/v2/trail/activities/{}", lessons[0]),
            &serde_json::json!({}),
        )
        .await;
    assert_eq!(step.status, StatusCode::OK, "{}", step.text());
    let capped = app.get_as(&bob, "/api/v2/gamification").await;
    assert_eq!(capped.json()["profile"]["total_xp"], 120);
    assert_eq!(
        app.get_as(
            &alice,
            &format!("/api/v2/courses/{course_id}/learner-state")
        )
        .await
        .json()["progress"]["progress_pct"],
        100.0
    );
}
