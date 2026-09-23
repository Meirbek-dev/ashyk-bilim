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
            "usergroup:create:platform",
        ],
    )
    .await
}

/// A usergroup linked to `course_id` with `user_id` in it (cohort access).
async fn cohort(
    app: &TestApp,
    teacher: &MintedSession,
    course_id: &str,
    user_id: ab_core::id::UserId,
) {
    let group = app
        .post_as(
            teacher,
            "/api/v2/usergroups",
            &serde_json::json!({ "name": "Cohort" }),
        )
        .await;
    let group_id = group.json()["id"].as_str().unwrap().to_owned();
    app.post_as(
        teacher,
        &format!("/api/v2/usergroups/{group_id}/members"),
        &serde_json::json!({ "user_ids": [user_id] }),
    )
    .await;
    let linked = app
        .post_as(
            teacher,
            &format!("/api/v2/usergroups/{group_id}/courses"),
            &serde_json::json!({ "course_ids": [course_id] }),
        )
        .await;
    assert_eq!(linked.status, StatusCode::NO_CONTENT, "{}", linked.text());
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
        app.publish_course(&id).await;
    }
    id
}

#[sqlx::test(migrations = "../../migrations")]
async fn search_respects_visibility_and_gates_people(pool: PgPool) {
    let app = TestApp::spawn(pool).await;
    let teacher = author(&app, "rustacean").await;
    let public_course = course(&app, &teacher, "Rust Programming", true).await;
    let secret_course = course(&app, &teacher, "Rust Secrets", false).await;
    // Listed for everyone; private; public but nothing visible in it (UX-119
    // rule shared with the collections list, UX-127); public and empty.
    for (name, public, courses) in [
        ("Rust Path", true, vec![public_course.as_str()]),
        ("Rust Private Path", false, vec![]),
        ("Rust Secret Path", true, vec![secret_course.as_str()]),
        ("Rust Empty Path", true, vec![]),
    ] {
        let created = app
            .post_as(
                &teacher,
                "/api/v2/collections",
                &serde_json::json!({ "name": name, "public": public, "courses": courses }),
            )
            .await;
        assert_eq!(created.status, StatusCode::CREATED, "{}", created.text());
    }

    // Anonymous: public hits only, and never a people section.
    let anon = app.get("/api/v2/search?q=rust").await;
    assert_eq!(anon.status, StatusCode::OK);
    // UX-156: an out-of-range page size is a 422, not a silent clamp.
    let refused = app.get("/api/v2/search?q=rust&limit=51").await;
    assert_eq!(
        refused.status,
        StatusCode::UNPROCESSABLE_ENTITY,
        "{}",
        refused.text()
    );
    let body = anon.json();
    let course_names: Vec<_> = body["courses"]
        .as_array()
        .unwrap()
        .iter()
        .map(|c| c["name"].as_str().unwrap().to_owned())
        .collect();
    assert_eq!(course_names, ["Rust Programming"]);
    assert_eq!(body["collections"][0]["name"], "Rust Path");
    assert_eq!(body["collections"].as_array().unwrap().len(), 1);
    assert!(body["users"].as_array().unwrap().is_empty());

    // The creator finds their own drafts; people search works when signed in
    // and matches username — but never email.
    let mine = app.get_as(&teacher, "/api/v2/search?q=rust").await;
    let body = mine.json();
    assert_eq!(body["courses"].as_array().unwrap().len(), 2);
    assert_eq!(body["collections"].as_array().unwrap().len(), 4);
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

    // UX-152: partial words hit like the people search does — a prefix of a
    // hyphenated name, a Cyrillic stem — and `-word` still excludes.
    let gauntlet = course(
        &app,
        &teacher,
        "gauntlet21-analytics-live Критик pass",
        true,
    )
    .await;
    for q in [
        "gaunt",
        "gauntlet21-analytics",
        "%D0%9A%D1%80%D0%B8%D1%82",
        "prog%20-secrets",
    ] {
        let hits = app.get_as(&teacher, &format!("/api/v2/search?q={q}")).await;
        assert_eq!(
            hits.json()["courses"].as_array().unwrap().len(),
            1,
            "{q}: {}",
            hits.text()
        );
    }
    // UX-155: `-word` negates as a prefix too — `-gaunt` excludes the course.
    let negated = app.get_as(&teacher, "/api/v2/search?q=-gaunt").await;
    let hits = negated.json()["courses"].clone();
    let hits: Vec<&str> = hits
        .as_array()
        .unwrap()
        .iter()
        .filter_map(|c| c["id"].as_str())
        .collect();
    assert!(
        !hits.is_empty() && !hits.contains(&gauntlet.as_str()),
        "{}",
        negated.text()
    );
    let quirky = app
        .get_as(&teacher, "/api/v2/search?q=it%27s%20%26%20%22")
        .await;
    assert_eq!(quirky.status, StatusCode::OK, "{}", quirky.text());
}

/// BUG-190: search uses the catalogue's visibility predicate, usergroup arm
/// included — a cohort member finds the private course, anon does not.
#[sqlx::test(migrations = "../../migrations")]
async fn cohort_member_finds_the_usergroup_shared_course(pool: PgPool) {
    let app = TestApp::spawn(pool).await;
    let teacher = author(&app, "rustacean").await;
    let secret_course = course(&app, &teacher, "Rust Secrets", false).await;
    let member_id = app
        .create_user("member", "member@example.com", &["user"])
        .await;
    let member = app.mint_session_for(member_id, &[]).await;
    cohort(&app, &teacher, &secret_course, member_id).await;

    let found = app.get_as(&member, "/api/v2/search?q=secrets").await;
    assert_eq!(found.status, StatusCode::OK);
    assert_eq!(
        found.json()["courses"][0]["id"],
        secret_course,
        "{}",
        found.text()
    );

    let anon = app.get("/api/v2/search?q=secrets").await;
    assert!(anon.json()["courses"].as_array().unwrap().is_empty());
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
