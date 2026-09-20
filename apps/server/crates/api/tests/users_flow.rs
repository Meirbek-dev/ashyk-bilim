//! User profile self-service flows.
#![allow(clippy::unwrap_used, clippy::expect_used, clippy::panic)]

use ab_testkit::TestApp;
use axum::http::StatusCode;
use sqlx::PgPool;

#[sqlx::test(migrations = "../../migrations")]
async fn profile_read_and_partial_update(pool: PgPool) {
    let app = TestApp::spawn(pool).await;
    let user = app.create_user("meirbek", "m@example.com", &["user"]).await;
    let session = app
        .mint_session_for(user, &["user:read:own", "user:update:own"])
        .await;

    let me = app.get_as(&session, "/api/v2/users/me").await;
    assert_eq!(me.status, StatusCode::OK);
    assert_eq!(me.json()["username"], "meirbek");
    assert_eq!(me.json()["locale"], "ru-RU");

    let updated = app
        .send(
            axum::http::Request::builder()
                .method("PATCH")
                .uri("/api/v2/users/me")
                .header(axum::http::header::CONTENT_TYPE, "application/json")
                .header(axum::http::header::COOKIE, &session.cookie)
                .body(axum::body::Body::from(
                    serde_json::json!({ "display_name": "Meirbek", "locale": "kk-KZ", "bio": "  " })
                        .to_string(),
                ))
                .unwrap(),
        )
        .await;
    assert_eq!(updated.status, StatusCode::OK);
    assert_eq!(updated.json()["display_name"], "Meirbek");
    assert_eq!(updated.json()["locale"], "kk-KZ");
    // UX-132: bio is trimmed like display_name (blank → "").
    assert_eq!(updated.json()["bio"], "");
    // Untouched fields survive the partial update.
    assert_eq!(updated.json()["email"], "m@example.com");
}

#[sqlx::test(migrations = "../../migrations")]
async fn profile_update_requires_the_permission(pool: PgPool) {
    let app = TestApp::spawn(pool).await;
    let user = app.create_user("noperm", "n@example.com", &[]).await;
    let session = app.mint_session_for(user, &[]).await;

    let res = app
        .send(
            axum::http::Request::builder()
                .method("PATCH")
                .uri("/api/v2/users/me")
                .header(axum::http::header::CONTENT_TYPE, "application/json")
                .header(axum::http::header::COOKIE, &session.cookie)
                .body(axum::body::Body::from(
                    serde_json::json!({ "display_name": "x" }).to_string(),
                ))
                .unwrap(),
        )
        .await;
    assert_eq!(res.status, StatusCode::FORBIDDEN);
    assert_eq!(res.json()["code"], "forbidden");
}

#[sqlx::test(migrations = "../../migrations")]
async fn unsupported_locale_is_rejected(pool: PgPool) {
    let app = TestApp::spawn(pool).await;
    let user = app.create_user("loc", "l@example.com", &["user"]).await;
    let session = app.mint_session_for(user, &["user:update:own"]).await;

    let res = app
        .send(
            axum::http::Request::builder()
                .method("PATCH")
                .uri("/api/v2/users/me")
                .header(axum::http::header::CONTENT_TYPE, "application/json")
                .header(axum::http::header::COOKIE, &session.cookie)
                .body(axum::body::Body::from(
                    serde_json::json!({ "locale": "fr-FR" }).to_string(),
                ))
                .unwrap(),
        )
        .await;
    assert_eq!(res.status, StatusCode::UNPROCESSABLE_ENTITY);
    assert_eq!(res.json()["field_errors"][0]["field"], "locale");
}

#[sqlx::test(migrations = "../../migrations")]
async fn blank_display_name_is_rejected_and_names_are_trimmed(pool: PgPool) {
    let app = TestApp::spawn(pool).await;
    let user = app.create_user("blank", "b@example.com", &["user"]).await;
    let session = app.mint_session_for(user, &["user:update:own"]).await;

    let res = app
        .patch_as(
            &session,
            "/api/v2/users/me",
            &serde_json::json!({ "display_name": "   " }),
        )
        .await;
    assert_eq!(
        res.status,
        StatusCode::UNPROCESSABLE_ENTITY,
        "{}",
        res.text()
    );
    assert_eq!(res.json()["field_errors"][0]["field"], "display_name");
    assert_eq!(res.json()["field_errors"][0]["code"], "required");

    let res = app
        .patch_as(
            &session,
            "/api/v2/users/me",
            &serde_json::json!({ "display_name": "  Aigerim  " }),
        )
        .await;
    assert_eq!(res.status, StatusCode::OK, "{}", res.text());
    assert_eq!(res.json()["display_name"], "Aigerim");
}

#[sqlx::test(migrations = "../../migrations")]
async fn avatar_claims_upload_and_releases_replaced(pool: PgPool) {
    let app = TestApp::spawn(pool).await;
    let user = app
        .create_user("selfie", "selfie@example.com", &["user"])
        .await;
    let session = app
        .mint_session_for(user, &["user:update:own", "file:create:own"])
        .await;

    let upload_avatar = |mime: &'static str| {
        let app = &app;
        let session = &session;
        async move {
            let payload = b"avatar bytes".to_vec();
            let created = app
                .post_as(
                    session,
                    "/api/v2/uploads",
                    &serde_json::json!({ "purpose": "avatar", "mime": mime,
                                          "size_bytes": payload.len() }),
                )
                .await;
            assert_eq!(created.status, StatusCode::OK);
            let id = created.json()["id"].as_str().unwrap().to_owned();
            let put_url = created.json()["put_url"].as_str().unwrap().to_owned();
            let put = reqwest::Client::new()
                .put(&put_url)
                .header("content-type", mime)
                .body(payload)
                .send()
                .await
                .unwrap();
            assert!(put.status().is_success());
            let finalized = app
                .post_as(
                    session,
                    &format!("/api/v2/uploads/{id}/finalize"),
                    &serde_json::json!({}),
                )
                .await;
            assert_eq!(finalized.status, StatusCode::OK);
            (id, finalized.json()["key"].as_str().unwrap().to_owned())
        }
    };

    let (first_id, first_key) = upload_avatar("image/png").await;
    let set = app
        .patch_as(
            &session,
            "/api/v2/users/me",
            &serde_json::json!({ "avatar_upload_id": first_id }),
        )
        .await;
    assert_eq!(set.status, StatusCode::OK);
    assert_eq!(set.json()["avatar_key"], first_key.as_str());

    // Replacing releases the old object back to the reaper.
    let (second_id, second_key) = upload_avatar("image/webp").await;
    let replaced = app
        .patch_as(
            &session,
            "/api/v2/users/me",
            &serde_json::json!({ "avatar_upload_id": second_id }),
        )
        .await;
    assert_eq!(replaced.status, StatusCode::OK);
    assert_eq!(replaced.json()["avatar_key"], second_key.as_str());
    let expiring: bool =
        sqlx::query_scalar("SELECT expires_at IS NOT NULL FROM uploads WHERE id = $1")
            .bind(uuid::Uuid::parse_str(&first_id).unwrap())
            .fetch_one(&app.pool)
            .await
            .unwrap();
    assert!(expiring, "replaced avatar must re-enter the reaper queue");

    // Wrong-purpose uploads are refused.
    let wrong = app
        .post_as(
            &session,
            "/api/v2/uploads",
            &serde_json::json!({ "purpose": "file-submission", "mime": "image/png",
                                  "size_bytes": 4 }),
        )
        .await;
    let wrong_id = wrong.json()["id"].as_str().unwrap().to_owned();
    let refused = app
        .patch_as(
            &session,
            "/api/v2/users/me",
            &serde_json::json!({ "avatar_upload_id": wrong_id }),
        )
        .await;
    assert_eq!(refused.status, StatusCode::UNPROCESSABLE_ENTITY);
}

#[sqlx::test(migrations = "../../migrations")]
async fn admin_lists_users_and_disables_accounts(pool: PgPool) {
    let app = TestApp::spawn(pool).await;
    let admin_user = app
        .create_user("boss", "boss@example.com", &["admin"])
        .await;
    let admin = app
        .mint_session_for(
            admin_user,
            &["platform:read:platform", "platform:manage:platform"],
        )
        .await;
    let victim = app
        .create_user("troublemaker", "t@example.com", &["user"])
        .await;
    let victim_session = app.mint_session_for(victim, &["user:read:own"]).await;

    // Listing shows both, with roles; the q filter narrows.
    let listed = app.get_as(&admin, "/api/v2/users").await;
    assert_eq!(listed.status, StatusCode::OK);
    assert_eq!(listed.json()["items"].as_array().unwrap().len(), 2);
    let filtered = app.get_as(&admin, "/api/v2/users?q=trouble").await;
    let items = filtered.json()["items"].as_array().unwrap().clone();
    assert_eq!(items.len(), 1);
    assert_eq!(items[0]["username"], "troublemaker");
    assert_eq!(items[0]["roles"], serde_json::json!(["user"]));

    // A non-admin (even with the broad user:read:platform) cannot list.
    let pleb = app.mint_session(&["user:read:platform"]).await;
    let denied = app.get_as(&pleb, "/api/v2/users").await;
    assert_eq!(denied.status, StatusCode::FORBIDDEN);

    // Disabling revokes the victim's live session and blocks re-login paths.
    let disabled = app
        .patch_as(
            &admin,
            &format!("/api/v2/users/{victim}/status"),
            &serde_json::json!({ "disabled": true }),
        )
        .await;
    assert_eq!(disabled.status, StatusCode::NO_CONTENT);
    let dead = app.get_as(&victim_session, "/api/v2/users/me").await;
    assert_eq!(dead.status, StatusCode::UNAUTHORIZED);

    // Self-disable is refused; re-enable works.
    let own = app
        .patch_as(
            &admin,
            &format!("/api/v2/users/{admin_user}/status"),
            &serde_json::json!({ "disabled": true }),
        )
        .await;
    assert_eq!(own.status, StatusCode::CONFLICT);
    assert_eq!(own.json()["code"], "self-disable");
    let enabled = app
        .patch_as(
            &admin,
            &format!("/api/v2/users/{victim}/status"),
            &serde_json::json!({ "disabled": false }),
        )
        .await;
    assert_eq!(enabled.status, StatusCode::NO_CONTENT);
}

#[sqlx::test(migrations = "../../migrations")]
async fn disabling_the_last_admin_is_refused(pool: PgPool) {
    let app = TestApp::spawn(pool).await;
    let operator = app.mint_session(&["platform:manage:platform"]).await;
    let only_admin = app
        .create_user("boss", "boss@example.com", &["admin"])
        .await;

    let refused = app
        .patch_as(
            &operator,
            &format!("/api/v2/users/{only_admin}/status"),
            &serde_json::json!({ "disabled": true }),
        )
        .await;
    assert_eq!(refused.status, StatusCode::CONFLICT);
    assert_eq!(refused.json()["code"], "last-admin");

    // With a second active admin the first one can be disabled.
    app.create_user("deputy", "deputy@example.com", &["admin"])
        .await;
    let disabled = app
        .patch_as(
            &operator,
            &format!("/api/v2/users/{only_admin}/status"),
            &serde_json::json!({ "disabled": true }),
        )
        .await;
    assert_eq!(disabled.status, StatusCode::NO_CONTENT);
}

// ── Admin account creation (`POST /users`, DECISIONS 2026-09-12) ────────────

#[sqlx::test(migrations = "../../migrations")]
async fn admin_creates_accounts_with_roles(pool: PgPool) {
    use wiremock::matchers::{body_partial_json, method, path};
    use wiremock::{Mock, ResponseTemplate};

    let app = TestApp::spawn(pool).await;
    let admin_user = app
        .create_user("boss", "boss@example.com", &["admin"])
        .await;
    let admin = app
        .mint_session_for(admin_user, &["platform:manage:platform"])
        .await;
    // The admin vouches for the address: created verified, no code, no
    // email. A password-less body creates an IdP-only (Google) account.
    Mock::given(method("POST"))
        .and(path("/v2/users/human"))
        .and(body_partial_json(serde_json::json!({
            "username": "newteacher",
            "email": { "email": "nt@example.com", "isVerified": true }
        })))
        .respond_with(ResponseTemplate::new(201).set_body_json(serde_json::json!({
            "userId": "z-nt", "details": {}
        })))
        .expect(1)
        .mount(&app.zitadel)
        .await;

    let res = app
        .post_as(
            &admin,
            "/api/v2/users",
            &serde_json::json!({
                "username": "newteacher",
                "email": "nt@example.com",
                "first_name": "New",
                "last_name": "Teacher",
                "roles": ["instructor"],
            }),
        )
        .await;
    assert_eq!(res.status, StatusCode::CREATED, "{}", res.json());
    let body = res.json();
    assert_eq!(body["username"], "newteacher");
    assert_eq!(body["status"], "active");
    assert_eq!(body["roles"], serde_json::json!(["instructor", "user"]));
    assert!(app.resend.received_requests().await.unwrap().is_empty());

    // Unknown role → 422 before anything is created.
    let res = app
        .post_as(
            &admin,
            "/api/v2/users",
            &serde_json::json!({
                "username": "another",
                "email": "an@example.com",
                "first_name": "A",
                "last_name": "B",
                "roles": ["wizard"],
            }),
        )
        .await;
    assert_eq!(res.status, StatusCode::UNPROCESSABLE_ENTITY);
    assert_eq!(res.json()["field_errors"][0]["field"], "roles");

    // Duplicate → dedicated code.
    let res = app
        .post_as(
            &admin,
            "/api/v2/users",
            &serde_json::json!({
                "username": "newteacher",
                "email": "other@example.com",
                "first_name": "A",
                "last_name": "B",
            }),
        )
        .await;
    assert_eq!(res.status, StatusCode::CONFLICT);
    assert_eq!(res.json()["code"], "username-taken");

    // Not an admin → 403.
    let pleb = app.mint_session(&["user:read:platform"]).await;
    let res = app
        .post_as(
            &pleb,
            "/api/v2/users",
            &serde_json::json!({
                "username": "sneaky",
                "email": "s@example.com",
                "first_name": "A",
                "last_name": "B",
            }),
        )
        .await;
    assert_eq!(res.status, StatusCode::FORBIDDEN);
}

#[sqlx::test(migrations = "../../migrations")]
async fn user_courses_lists_authored_and_co_authored_courses(pool: PgPool) {
    let app = TestApp::spawn(pool).await;
    let author = app
        .create_user("author", "a@example.com", &["instructor"])
        .await;
    let teacher = app
        .mint_session_for(
            author,
            &[
                "course:create:platform",
                "course:read:all",
                "course:update:own",
                "usergroup:create:platform",
            ],
        )
        .await;
    let mut ids = Vec::new();
    for name in ["Public one", "Draft one"] {
        let res = app
            .post_as(
                &teacher,
                "/api/v2/courses",
                &serde_json::json!({ "name": name }),
            )
            .await;
        ids.push(res.json()["id"].as_str().unwrap().to_owned());
    }
    app.publish_course(&ids[0]).await;

    // Strangers see public courses only; the author sees both.
    let stranger = app.mint_session(&[]).await;
    let public = app.get_as(&stranger, "/api/v2/users/Author/courses").await;
    assert_eq!(public.status, StatusCode::OK, "{}", public.text());
    assert_eq!(public.json()["items"].as_array().unwrap().len(), 1);
    assert_eq!(public.json()["items"][0]["name"], "Public one");
    let own = app.get_as(&teacher, "/api/v2/users/author/courses").await;
    assert_eq!(own.json()["items"].as_array().unwrap().len(), 2);
    // Anonymous visitors read the public profile too.
    let anon = app.get("/api/v2/users/author/courses").await;
    assert_eq!(anon.status, StatusCode::OK, "{}", anon.text());
    assert_eq!(anon.json()["items"].as_array().unwrap().len(), 1);
    let card = app.get("/api/v2/users/Author").await;
    assert_eq!(card.status, StatusCode::OK, "{}", card.text());
    assert_eq!(card.json()["username"], "author");
    assert_eq!(card.json()["id"], author.to_string());
    assert_eq!(card.json()["display_name"], "author");
    assert!(card.json()["avatar_key"].is_null());
    assert!(card.json().get("email").is_none());
    let no_card = app.get("/api/v2/users/nobody").await;
    assert_eq!(no_card.status, StatusCode::NOT_FOUND);

    // Active contributors are listed on their own profile too.
    let helper = app
        .create_user("helper", "h@example.com", &["instructor"])
        .await;
    let added = app
        .post_as(
            &teacher,
            &format!("/api/v2/courses/{}/contributors", ids[0]),
            &serde_json::json!({ "user_id": helper }),
        )
        .await;
    assert_eq!(added.status, StatusCode::CREATED, "{}", added.text());
    let helped = app.get_as(&stranger, "/api/v2/users/helper/courses").await;
    assert_eq!(helped.json()["items"].as_array().unwrap().len(), 1);
    // A reporter (read-only roster role) is not an author (BUG-146).
    let reporter = app
        .create_user("reporter", "r@example.com", &["user"])
        .await;
    let added = app
        .post_as(
            &teacher,
            &format!("/api/v2/courses/{}/contributors", ids[0]),
            &serde_json::json!({ "user_id": reporter, "role": "reporter" }),
        )
        .await;
    assert_eq!(added.status, StatusCode::CREATED, "{}", added.text());
    let reported = app.get("/api/v2/users/reporter/courses").await;
    assert_eq!(reported.status, StatusCode::OK, "{}", reported.text());
    assert_eq!(reported.json()["items"].as_array().unwrap().len(), 0);

    // UX-133: the profile applies the catalogue's `course_visible` rule —
    // a cohort member sees the private course, anonymous visitors do not.
    let member_id = app
        .create_user("member", "member@example.com", &["user"])
        .await;
    let member = app.mint_session_for(member_id, &[]).await;
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
        &serde_json::json!({ "user_ids": [member_id] }),
    )
    .await;
    let linked = app
        .post_as(
            &teacher,
            &format!("/api/v2/usergroups/{group_id}/courses"),
            &serde_json::json!({ "course_ids": [ids[1]] }),
        )
        .await;
    assert_eq!(linked.status, StatusCode::NO_CONTENT, "{}", linked.text());
    let cohort = app.get_as(&member, "/api/v2/users/author/courses").await;
    assert_eq!(cohort.json()["items"].as_array().unwrap().len(), 2);
    let anon = app.get("/api/v2/users/author/courses").await;
    assert_eq!(anon.json()["items"].as_array().unwrap().len(), 1);

    let unknown = app.get_as(&stranger, "/api/v2/users/nobody/courses").await;
    assert_eq!(unknown.status, StatusCode::NOT_FOUND);
}

/// Claiming another user's upload as an avatar is a 403 (never a takeover,
/// never a 404 that leaks the upload's existence).
#[sqlx::test(migrations = "../../migrations")]
async fn claiming_a_foreign_upload_as_avatar_is_forbidden(pool: PgPool) {
    let app = TestApp::spawn(pool).await;
    let owner = app
        .create_user("owner", "owner@example.com", &["user"])
        .await;
    let owner_session = app
        .mint_session_for(owner, &["user:update:own", "file:create:own"])
        .await;
    let created = app
        .post_as(
            &owner_session,
            "/api/v2/uploads",
            &serde_json::json!({ "purpose": "avatar", "mime": "image/png", "size_bytes": 4 }),
        )
        .await;
    assert_eq!(created.status, StatusCode::OK, "{}", created.text());
    let upload_id = created.json()["id"].as_str().unwrap().to_owned();

    let thief = app
        .create_user("thief", "thief@example.com", &["user"])
        .await;
    let thief_session = app.mint_session_for(thief, &["user:update:own"]).await;
    let refused = app
        .patch_as(
            &thief_session,
            "/api/v2/users/me",
            &serde_json::json!({ "avatar_upload_id": upload_id }),
        )
        .await;
    assert_eq!(refused.status, StatusCode::FORBIDDEN, "{}", refused.text());
}

/// `GET /users` clamps `limit` to 1..=100 and walks by cursor; an unknown
/// id on the status route is a 404.
#[sqlx::test(migrations = "../../migrations")]
async fn user_listing_clamps_limit_and_walks_the_cursor(pool: PgPool) {
    let app = TestApp::spawn(pool).await;
    let admin_user = app
        .create_user("boss", "boss@example.com", &["admin"])
        .await;
    let admin = app
        .mint_session_for(
            admin_user,
            &["platform:read:platform", "platform:manage:platform"],
        )
        .await;
    for i in 0..3 {
        app.create_user(&format!("u{i}"), &format!("u{i}@example.com"), &["user"])
            .await;
    }

    let zero = app.get_as(&admin, "/api/v2/users?limit=0").await;
    assert_eq!(zero.status, StatusCode::OK, "{}", zero.text());
    assert_eq!(zero.json()["items"].as_array().unwrap().len(), 1);
    let huge = app.get_as(&admin, "/api/v2/users?limit=1000").await;
    assert_eq!(huge.status, StatusCode::OK);
    assert_eq!(huge.json()["items"].as_array().unwrap().len(), 4);
    assert!(huge.json()["next_cursor"].is_null());

    let mut seen = Vec::new();
    let mut cursor: Option<String> = None;
    loop {
        let path = match &cursor {
            Some(c) => format!("/api/v2/users?limit=2&cursor={c}"),
            None => "/api/v2/users?limit=2".to_owned(),
        };
        let page = app.get_as(&admin, &path).await;
        assert_eq!(page.status, StatusCode::OK, "{}", page.text());
        for item in page.json()["items"].as_array().unwrap() {
            seen.push(item["id"].as_str().unwrap().to_owned());
        }
        match page.json()["next_cursor"].as_str() {
            Some(next) => cursor = Some(next.to_owned()),
            None => break,
        }
    }
    seen.sort();
    seen.dedup();
    assert_eq!(seen.len(), 4, "every user exactly once: {seen:?}");

    let ghost = app
        .patch_as(
            &admin,
            &format!("/api/v2/users/{}/status", uuid::Uuid::now_v7()),
            &serde_json::json!({ "disabled": true }),
        )
        .await;
    assert_eq!(ghost.status, StatusCode::NOT_FOUND, "{}", ghost.text());
}
