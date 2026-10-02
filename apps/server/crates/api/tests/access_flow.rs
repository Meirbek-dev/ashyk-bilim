//! S-02: what the UI may draw is what the server enforces.
//!
//! - `GET /auth/session` carries the shell's user block and the closed
//!   `capabilities` set, computed from the grants (and course authorship
//!   for `teach`); a session without its account row is 401.
//! - `allowed_actions` on course, collection and discussion: an action is
//!   listed iff its mutation does not answer 403 - probed for every actor
//!   and action on a fresh object, with the real seeded role grants.
//! - `ashyq admin seed-e2e` builds its accounts and a published course with
//!   one activity of every type, is idempotent, and refuses production.
#![allow(clippy::unwrap_used, clippy::expect_used, clippy::panic)]

use ab_testkit::{MintedSession, TestApp};
use axum::body::Body;
use axum::http::{Request, StatusCode, header};
use serde_json::{Value, json};
use sqlx::PgPool;
use wiremock::matchers::{method, path};
use wiremock::{Mock, ResponseTemplate};

/// A user holding `role` with exactly that role's seeded grants.
async fn as_role(app: &TestApp, name: &str, role: &str) -> MintedSession {
    let user = app
        .create_user(name, &format!("{name}@example.com"), &[role])
        .await;
    let (_, grants) = ab_db::identity::load_user_grants(&app.pool, user)
        .await
        .unwrap();
    let grants: Vec<&str> = grants.iter().map(String::as_str).collect();
    app.mint_session_for(user, &grants).await
}

fn actions(body: &Value) -> Vec<String> {
    body["allowed_actions"]
        .as_array()
        .unwrap_or_else(|| panic!("no allowed_actions in {body}"))
        .iter()
        .map(|a| a.as_str().unwrap().to_owned())
        .collect()
}

fn id(res: &ab_testkit::TestResponse) -> String {
    res.json()["id"].as_str().unwrap().to_owned()
}

async fn put_as(app: &TestApp, who: &MintedSession, uri: &str) -> ab_testkit::TestResponse {
    app.send(
        Request::builder()
            .method("PUT")
            .uri(uri)
            .header(header::COOKIE, &who.cookie)
            .body(Body::empty())
            .unwrap(),
    )
    .await
}

/// Listed ⇔ not 403, for one probe.
fn check(who: &str, action: &str, listed: &[String], status: StatusCode, body: &str) {
    let is_listed = listed.iter().any(|a| a == action);
    assert_eq!(
        is_listed,
        status != StatusCode::FORBIDDEN,
        "{who}/{action}: listed={is_listed} but the mutation answered {status}: {body}"
    );
}

#[sqlx::test(migrations = "../../migrations")]
async fn session_carries_user_and_capabilities(pool: PgPool) {
    let app = TestApp::spawn(pool).await;
    let student = as_role(&app, "stu", "user").await;
    let teacher = as_role(&app, "tea", "instructor").await;
    let admin = as_role(&app, "adm", "admin").await;

    let res = app.get_as(&student, "/api/v2/auth/session").await;
    assert_eq!(res.status, StatusCode::OK, "{}", res.text());
    let body = res.json();
    assert_eq!(body["user"]["username"], "stu");
    assert_eq!(body["user"]["email"], "stu@example.com");
    assert_eq!(body["user"]["id"], body["user_id"]);
    assert!(body["user"]["locale"].is_string());
    assert!(body["user"].get("theme").is_some());
    assert!(body["user"].get("avatar_key").is_some());
    assert_eq!(body["capabilities"], json!([]));
    // The legacy fields stay.
    assert!(body["permissions"].is_array());

    let caps = app.get_as(&teacher, "/api/v2/auth/session").await.json()["capabilities"].clone();
    assert_eq!(
        caps,
        json!([
            "teach",
            "course.create",
            "collection.create",
            "groups.manage",
            "analytics.view",
            "analytics.export"
        ])
    );

    let caps = app.get_as(&admin, "/api/v2/auth/session").await.json()["capabilities"].clone();
    assert_eq!(caps.as_array().unwrap().len(), 13, "{caps}");
    assert!(caps.as_array().unwrap().contains(&json!("admin.ai")));

    // A learner co-authoring a course teaches - authorship, not a grant.
    let course = app
        .post_as(&teacher, "/api/v2/courses", &json!({ "name": "Shared" }))
        .await;
    let course_id = id(&course);
    let added = app
        .post_as(
            &teacher,
            &format!("/api/v2/courses/{course_id}/contributors"),
            &json!({ "username": "stu" }),
        )
        .await;
    assert_eq!(added.status, StatusCode::CREATED, "{}", added.text());
    let caps = app.get_as(&student, "/api/v2/auth/session").await.json()["capabilities"].clone();
    assert_eq!(caps, json!(["teach"]));

    // A session whose account row is gone is no session.
    let ghost = app.mint_session(&["course:read:all"]).await;
    assert_eq!(
        app.get_as(&ghost, "/api/v2/auth/session").await.status,
        StatusCode::UNAUTHORIZED
    );
}

#[sqlx::test(migrations = "../../migrations")]
async fn course_actions_match_enforcement(pool: PgPool) {
    let app = TestApp::spawn(pool).await;
    let owner = as_role(&app, "owner", "instructor").await;
    let actors = [
        ("owner", owner.clone()),
        ("other-teacher", as_role(&app, "other", "instructor").await),
        ("maintainer-role", as_role(&app, "mnt", "maintainer").await),
        ("student", as_role(&app, "stu", "user").await),
        ("admin", as_role(&app, "adm", "admin").await),
    ];
    app.create_user("helper", "helper@example.com", &["user"])
        .await;
    let probes: [(&str, &str, &str, Value); 5] = [
        ("update", "PATCH", "", json!({ "description": "probe" })),
        (
            "unpublish",
            "POST",
            "/lifecycle",
            json!({ "action": "unpublish" }),
        ),
        (
            "archive",
            "POST",
            "/lifecycle",
            json!({ "action": "archive" }),
        ),
        (
            "manage_contributors",
            "POST",
            "/contributors",
            json!({ "username": "helper" }),
        ),
        ("delete", "DELETE", "", Value::Null),
    ];
    for (who, session) in &actors {
        for (action, verb, suffix, body) in &probes {
            // A fresh published course per probe: no probe sees another's effect.
            let course = app
                .post_as(&owner, "/api/v2/courses", &json!({ "name": "Probe" }))
                .await;
            let course_id = id(&course);
            app.publish_course(&course_id).await;
            let read = app
                .get_as(session, &format!("/api/v2/courses/{course_id}"))
                .await;
            assert_eq!(read.status, StatusCode::OK, "{}", read.text());
            let listed = actions(&read.json());
            assert!(
                !listed.contains(&"publish".to_owned()),
                "published course offers publish"
            );
            let uri = format!("/api/v2/courses/{course_id}{suffix}");
            let res = match *verb {
                "PATCH" => app.patch_as(session, &uri, body).await,
                "POST" => app.post_as(session, &uri, body).await,
                _ => app.delete_as(session, &uri).await,
            };
            check(who, action, &listed, res.status, &res.text());
        }
    }

    // State-bound actions: a draft offers publish, an archived course only
    // restore (and delete).
    let course = app
        .post_as(&owner, "/api/v2/courses", &json!({ "name": "Draft" }))
        .await;
    let course_id = id(&course);
    assert_eq!(
        actions(&course.json()),
        [
            "update",
            "publish",
            "archive",
            "delete",
            "manage_contributors"
        ]
    );
    let archived = app
        .post_as(
            &owner,
            &format!("/api/v2/courses/{course_id}/lifecycle"),
            &json!({ "action": "archive" }),
        )
        .await;
    assert_eq!(archived.status, StatusCode::OK, "{}", archived.text());
    assert_eq!(actions(&archived.json()), ["restore", "delete"]);
    // The listing carries the same field.
    let page = app
        .get_as(&owner, "/api/v2/courses?mine=true&preset=archived")
        .await;
    assert_eq!(
        actions(&page.json()["items"][0]),
        ["restore", "delete"],
        "{}",
        page.text()
    );
}

#[sqlx::test(migrations = "../../migrations")]
async fn collection_actions_match_enforcement(pool: PgPool) {
    let app = TestApp::spawn(pool).await;
    let owner = as_role(&app, "owner", "instructor").await;
    let actors = [
        ("owner", owner.clone()),
        ("other-teacher", as_role(&app, "other", "instructor").await),
        ("student", as_role(&app, "stu", "user").await),
        ("admin", as_role(&app, "adm", "admin").await),
    ];
    // An empty collection is listed to nobody but staff: give it a course.
    let course = app
        .post_as(&owner, "/api/v2/courses", &json!({ "name": "Member" }))
        .await;
    let course_id = id(&course);
    app.publish_course(&course_id).await;
    for (who, session) in &actors {
        for action in ["update", "delete"] {
            let created = app
                .post_as(
                    &owner,
                    "/api/v2/collections",
                    &json!({ "name": "Probe", "public": true, "courses": [course_id] }),
                )
                .await;
            assert_eq!(created.status, StatusCode::CREATED, "{}", created.text());
            let collection_id = id(&created);
            let uri = format!("/api/v2/collections/{collection_id}");
            let read = app.get_as(session, &uri).await;
            assert_eq!(read.status, StatusCode::OK, "{}", read.text());
            let listed = actions(&read.json());
            let page = app.get_as(session, "/api/v2/collections").await.json();
            let item = page["items"]
                .as_array()
                .unwrap()
                .iter()
                .find(|c| c["id"] == read.json()["id"])
                .unwrap()
                .clone();
            assert_eq!(actions(&item), listed, "list item = detail");
            let res = if action == "update" {
                app.patch_as(session, &uri, &json!({ "description": "probe" }))
                    .await
            } else {
                app.delete_as(session, &uri).await
            };
            check(who, action, &listed, res.status, &res.text());
        }
    }
}

#[sqlx::test(migrations = "../../migrations")]
async fn discussion_actions_match_enforcement(pool: PgPool) {
    let app = TestApp::spawn(pool).await;
    let teacher = as_role(&app, "teacher", "instructor").await;
    let author = as_role(&app, "author", "user").await;
    let actors = [
        ("author", author.clone()),
        ("other-student", as_role(&app, "stu", "user").await),
        ("course-owner", teacher.clone()),
        ("moderator-role", as_role(&app, "mod", "moderator").await),
        ("admin", as_role(&app, "adm", "admin").await),
    ];
    let course = app
        .post_as(&teacher, "/api/v2/courses", &json!({ "name": "Talk" }))
        .await;
    let course_id = id(&course);
    app.publish_course(&course_id).await;
    let probes = ["update", "moderate", "reply", "react", "delete"];
    for (who, session) in &actors {
        for action in probes {
            let post = app
                .post_as(
                    &author,
                    &format!("/api/v2/courses/{course_id}/discussions"),
                    &json!({ "content": "Hello" }),
                )
                .await;
            assert_eq!(post.status, StatusCode::CREATED, "{}", post.text());
            let post_id = id(&post);
            let page = app
                .get_as(session, &format!("/api/v2/courses/{course_id}/discussions"))
                .await;
            assert_eq!(page.status, StatusCode::OK, "{}", page.text());
            let item = page.json()["items"]
                .as_array()
                .unwrap()
                .iter()
                .find(|d| d["id"] == post_id.as_str())
                .unwrap()
                .clone();
            let listed = actions(&item);
            let uri = format!("/api/v2/discussions/{post_id}");
            let res = match action {
                "update" => {
                    app.patch_as(session, &uri, &json!({ "content": "Edited" }))
                        .await
                }
                "moderate" => {
                    app.patch_as(session, &uri, &json!({ "status": "hidden" }))
                        .await
                }
                "reply" => {
                    app.post_as(
                        session,
                        &format!("/api/v2/courses/{course_id}/discussions"),
                        &json!({ "content": "Reply", "parent_id": post_id }),
                    )
                    .await
                }
                "react" => put_as(&app, session, &format!("{uri}/like")).await,
                _ => app.delete_as(session, &uri).await,
            };
            check(who, action, &listed, res.status, &res.text());
        }
    }
    // A reply offers no reply of its own.
    let post = app
        .post_as(
            &author,
            &format!("/api/v2/courses/{course_id}/discussions"),
            &json!({ "content": "Parent" }),
        )
        .await;
    let reply = app
        .post_as(
            &author,
            &format!("/api/v2/courses/{course_id}/discussions"),
            &json!({ "content": "Child", "parent_id": id(&post) }),
        )
        .await;
    assert_eq!(actions(&reply.json()), ["update", "delete", "react"]);
}

/// Zitadel's user creation for the four seed accounts (verified email,
/// password set), one id per username.
async fn mount_zitadel_create(app: &TestApp) {
    for username in ["e2e-admin", "e2e-teacher", "e2e-student1", "e2e-student2"] {
        Mock::given(method("POST"))
            .and(path("/v2/users/human"))
            .and(wiremock::matchers::body_partial_json(json!({
                "username": username,
                "email": { "isVerified": true },
                "password": { "password": "seed-pass-123" }
            })))
            .respond_with(ResponseTemplate::new(201).set_body_json(json!({
                "userId": format!("z-{username}"), "details": {}
            })))
            .expect(1)
            .mount(&app.zitadel)
            .await;
    }
}

#[sqlx::test(migrations = "../../migrations")]
async fn seed_e2e_builds_fixtures_idempotently(pool: PgPool) {
    let app = TestApp::spawn(pool).await;
    mount_zitadel_create(&app).await;
    let password = secrecy::SecretString::from("seed-pass-123");

    let first = ab_api::seed::seed_e2e(&app.state, &password).await.unwrap();
    let report = serde_json::to_value(&first).unwrap();
    assert!(!report.to_string().contains("seed-pass-123"), "{report}");
    let accounts = report["accounts"].as_array().unwrap();
    assert_eq!(accounts.len(), 4);
    assert_eq!(accounts[0]["email"], "admin@e2e.test");
    let mut types: Vec<&str> = report["course"]["activities"]
        .as_array()
        .unwrap()
        .iter()
        .map(|a| a["activity_type"].as_str().unwrap())
        .collect();
    types.sort_unstable();
    assert_eq!(
        types,
        [
            "code_challenge",
            "document",
            "dynamic",
            "exam",
            "file_submission",
            "quiz",
            "video"
        ]
    );
    let course_id = report["course"]["id"].as_str().unwrap();
    let public: bool = sqlx::query_scalar("SELECT public FROM courses WHERE id = $1::uuid")
        .bind(course_id)
        .fetch_one(&app.pool)
        .await
        .unwrap();
    assert!(public, "the seed course is published");
    let roles = |name: &'static str| {
        let pool = app.pool.clone();
        async move {
            let id = ab_db::identity::find_user_id_by_username(&pool, name)
                .await
                .unwrap()
                .unwrap();
            ab_db::identity::load_user_grants(&pool, id)
                .await
                .unwrap()
                .0
        }
    };
    assert!(roles("e2e-admin").await.contains(&"admin".to_owned()));
    assert!(
        roles("e2e-teacher")
            .await
            .contains(&"instructor".to_owned())
    );
    let enrolled: i64 = sqlx::query_scalar(
        "SELECT count(*) FROM trail_runs r JOIN users u ON u.id = r.user_id
         WHERE r.course_id = $1::uuid AND u.username IN ('e2e-student1', 'e2e-student2')",
    )
    .bind(course_id)
    .fetch_one(&app.pool)
    .await
    .unwrap();
    assert_eq!(enrolled, 1, "student 1 only");

    // Second run: same ids, no new accounts (Zitadel `expect(1)`) or course.
    let second =
        serde_json::to_value(ab_api::seed::seed_e2e(&app.state, &password).await.unwrap()).unwrap();
    assert_eq!(second["accounts"], report["accounts"]);
    assert_eq!(second["course"]["id"], report["course"]["id"]);
    let courses: i64 = sqlx::query_scalar("SELECT count(*) FROM courses")
        .fetch_one(&app.pool)
        .await
        .unwrap();
    assert_eq!(courses, 1);
}

#[sqlx::test(migrations = "../../migrations")]
async fn seed_e2e_refuses_production(pool: PgPool) {
    let app = TestApp::spawn_with(pool, |config| {
        config.environment = ab_core::config::Environment::Production;
    })
    .await;
    let err = ab_api::seed::seed_e2e(&app.state, &secrecy::SecretString::from("x"))
        .await
        .unwrap_err();
    assert_eq!(err.code(), ab_core::ErrorCode::Forbidden);
    let users: i64 = sqlx::query_scalar("SELECT count(*) FROM users")
        .fetch_one(&app.pool)
        .await
        .unwrap();
    assert_eq!(users, 0);
}
