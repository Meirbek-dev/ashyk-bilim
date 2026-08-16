//! Platform search + anonymous catalog browsing: FTS over courses and
//! collections, people section for authenticated callers only, and
//! sessionless reads of the public catalog.
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
            "course:update:own",
            "collection:create:platform",
        ],
    )
    .await
}

async fn course(app: &TestApp, session: &MintedSession, name: &str, publish: bool) -> String {
    let res = app
        .post_as(
            session,
            "/api/v2/courses",
            &serde_json::json!({ "name": name, "description": "learn things" }),
        )
        .await;
    let id = res.json()["id"].as_str().unwrap().to_owned();
    if publish {
        app.post_as(
            session,
            &format!("/api/v2/courses/{id}/lifecycle"),
            &serde_json::json!({ "action": "publish" }),
        )
        .await;
    }
    id
}

#[sqlx::test(migrations = "../../migrations")]
async fn search_respects_visibility_and_gates_people(pool: PgPool) {
    let app = TestApp::spawn(pool).await;
    let teacher = author(&app, "rustacean").await;
    course(&app, &teacher, "Rust Programming", true).await;
    course(&app, &teacher, "Rust Secrets", false).await;
    app.post_as(
        &teacher,
        "/api/v2/collections",
        &serde_json::json!({ "name": "Rust Path", "public": true }),
    )
    .await;
    app.post_as(
        &teacher,
        "/api/v2/collections",
        &serde_json::json!({ "name": "Rust Private Path", "public": false }),
    )
    .await;

    // Anonymous: public hits only, and never a people section.
    let anon = app.get("/api/v2/search?q=rust").await;
    assert_eq!(anon.status, StatusCode::OK);
    let body = anon.json();
    let course_names: Vec<_> = body["courses"]
        .as_array()
        .unwrap()
        .iter()
        .map(|c| c["name"].as_str().unwrap().to_owned())
        .collect();
    assert_eq!(course_names, ["Rust Programming"]);
    assert_eq!(body["collections"].as_array().unwrap().len(), 1);
    assert!(body["users"].as_array().unwrap().is_empty());

    // The creator finds their own drafts; people search works when signed in
    // and matches username — but never email.
    let mine = app.get_as(&teacher, "/api/v2/search?q=rust").await;
    let body = mine.json();
    assert_eq!(body["courses"].as_array().unwrap().len(), 2);
    assert_eq!(body["collections"].as_array().unwrap().len(), 2);
    let people: Vec<_> = body["users"]
        .as_array()
        .unwrap()
        .iter()
        .map(|u| u["username"].as_str().unwrap().to_owned())
        .collect();
    assert_eq!(people, ["rustacean"]);
    assert!(body["users"][0].get("email").is_none());

    let by_email = app
        .get_as(&teacher, "/api/v2/search?q=rustacean%40example.com")
        .await;
    assert!(
        by_email.json()["users"].as_array().unwrap().is_empty(),
        "email fragments must not match people (FINDINGS #16)"
    );

    // Blank queries return empty sections, not errors.
    let blank = app.get_as(&teacher, "/api/v2/search?q=%20").await;
    assert_eq!(blank.status, StatusCode::OK);
    assert!(blank.json()["courses"].as_array().unwrap().is_empty());
}

#[sqlx::test(migrations = "../../migrations")]
async fn anonymous_browsing_sees_public_catalog_only(pool: PgPool) {
    let app = TestApp::spawn(pool).await;
    let teacher = author(&app, "teacher").await;
    let public_id = course(&app, &teacher, "Open Course", true).await;
    let draft_id = course(&app, &teacher, "Hidden Draft", false).await;
    app.post_as(
        &teacher,
        &format!("/api/v2/courses/{public_id}/chapters"),
        &serde_json::json!({ "name": "Intro" }),
    )
    .await;

    // Listing without any session: public only.
    let listing = app.get("/api/v2/courses").await;
    assert_eq!(listing.status, StatusCode::OK);
    let names: Vec<_> = listing.json()["items"]
        .as_array()
        .unwrap()
        .iter()
        .map(|c| c["name"].as_str().unwrap().to_owned())
        .collect();
    assert_eq!(names, ["Open Course"]);

    // Single reads and the curriculum follow the same rule.
    let visible = app.get(&format!("/api/v2/courses/{public_id}")).await;
    assert_eq!(visible.status, StatusCode::OK);
    let hidden = app.get(&format!("/api/v2/courses/{draft_id}")).await;
    assert_eq!(hidden.status, StatusCode::NOT_FOUND);
    let curriculum = app
        .get(&format!("/api/v2/courses/{public_id}/curriculum"))
        .await;
    assert_eq!(curriculum.status, StatusCode::OK);
    assert_eq!(curriculum.json()["chapters"].as_array().unwrap().len(), 1);

    // A garbage session cookie degrades to anonymous instead of erroring.
    let garbage = app
        .send(
            axum::http::Request::builder()
                .uri("/api/v2/courses")
                .header(axum::http::header::COOKIE, "ab_session=nonsense")
                .body(axum::body::Body::empty())
                .unwrap(),
        )
        .await;
    assert_eq!(garbage.status, StatusCode::OK);

    // Mutations stay locked: no session → 401 on course creation.
    let denied = app
        .post_json(
            "/api/v2/courses",
            &serde_json::json!({ "name": "Anonymous course" }),
        )
        .await;
    assert_eq!(denied.status, StatusCode::UNAUTHORIZED);
}
