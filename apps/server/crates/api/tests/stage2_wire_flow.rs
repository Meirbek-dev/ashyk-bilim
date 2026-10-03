//! Stage 2 wire additions (L-3), all additive to the old web's contract:
//!
//! - S-04: every resource the new web edits answers `version` (+ `ETag` on
//!   its read); a stale `If-Match` is 412 with nothing written, no `If-Match`
//!   keeps the old last-writer-wins path; creates replay under
//!   `Idempotency-Key`.
//! - `Prefer: return=representation` turns the admin 204 writes into 200 +
//!   the resource; without it they stay 204.
//! - S-05: keyset pages (`/page` siblings, leaderboard `cursor`, trail
//!   `limit`), the per-course learner list and remove-learner.
//! - Learner gaps: `next_action.course_id`, mark/unmark in
//!   `allowed_actions`, the trail's `learning_status` / `next_activity_id` /
//!   opt-in `learner_state`, guest learner-state and discussions,
//!   `GET /discussions/{id}`, empty editor documents rejected, the reply's
//!   `parent_replies_count`.
//! - Teacher/admin gaps: announcement author + actions, contributor
//!   actions, admin user read + sort/filters, role by slug, certificate
//!   preview PDF, `?lang=`.
#![allow(clippy::unwrap_used, clippy::expect_used, clippy::panic)]

use ab_testkit::{MintedSession, TestApp, TestResponse};
use axum::body::Body;
use axum::http::{Request, StatusCode, header};
use serde_json::{Value, json};
use sqlx::PgPool;

async fn send(
    app: &TestApp,
    who: &MintedSession,
    method: &str,
    uri: &str,
    body: Option<Value>,
    headers: &[(&str, &str)],
) -> TestResponse {
    let mut req = Request::builder()
        .method(method)
        .uri(uri)
        .header(header::COOKIE, &who.cookie);
    if body.is_some() {
        req = req.header(header::CONTENT_TYPE, "application/json");
    }
    for (k, v) in headers {
        req = req.header(*k, *v);
    }
    let body = body.map_or_else(Body::empty, |b| Body::from(b.to_string()));
    app.send(req.body(body).unwrap()).await
}

/// A real account with exactly `permissions` (a session without a user row
/// is no session).
async fn session(app: &TestApp, name: &str, permissions: &[&str]) -> MintedSession {
    let user = app
        .create_user(name, &format!("{name}@example.com"), &["user"])
        .await;
    app.mint_session_for(user, permissions).await
}

fn id(res: &TestResponse) -> String {
    res.json()["id"].as_str().unwrap().to_owned()
}

fn quoted(v: &Value) -> String {
    format!("\"{}\"", v.as_i64().unwrap())
}

/// A stale `If-Match` on `uri` is 412 `precondition-failed`; the current
/// one lands and answers a higher version.
async fn assert_guarded(
    app: &TestApp,
    who: &MintedSession,
    method: &str,
    uri: &str,
    body: Value,
    version: &Value,
) -> TestResponse {
    let stale = format!("\"{}\"", version.as_i64().unwrap() - 1);
    let res = send(
        app,
        who,
        method,
        uri,
        Some(body.clone()),
        &[("If-Match", &stale)],
    )
    .await;
    assert_eq!(
        res.status,
        StatusCode::PRECONDITION_FAILED,
        "{uri}: {}",
        res.text()
    );
    assert_eq!(res.json()["code"], "precondition-failed");
    assert_eq!(res.json()["details"]["actual"], *version);
    let ok = send(
        app,
        who,
        method,
        uri,
        Some(body),
        &[("If-Match", &quoted(version))],
    )
    .await;
    assert!(ok.status.is_success(), "{uri}: {}", ok.text());
    ok
}

struct World {
    app: TestApp,
    admin: MintedSession,
    course: String,
    chapter: String,
}

async fn world(pool: PgPool) -> World {
    let app = TestApp::spawn(pool).await;
    let admin = session(&app, "s1", &["*:*:*"]).await;
    let course = app
        .post_as(&admin, "/api/v2/courses", &json!({ "name": "Wire" }))
        .await;
    let course = id(&course);
    let chapter = app
        .post_as(
            &admin,
            &format!("/api/v2/courses/{course}/chapters"),
            &json!({ "name": "One" }),
        )
        .await;
    let chapter = id(&chapter);
    World {
        app,
        admin,
        course,
        chapter,
    }
}

#[sqlx::test(migrations = "../../migrations")]
async fn every_edited_resource_is_version_guarded(pool: PgPool) {
    let World {
        app,
        admin,
        course,
        chapter,
    } = world(pool).await;

    // Course: the read's ETag is the version; PATCH + lifecycle are guarded.
    let read = app
        .get_as(&admin, &format!("/api/v2/courses/{course}"))
        .await;
    let v = read.json()["version"].clone();
    assert_eq!(read.headers["etag"], quoted(&v));
    let patched = assert_guarded(
        &app,
        &admin,
        "PATCH",
        &format!("/api/v2/courses/{course}"),
        json!({ "description": "x" }),
        &v,
    )
    .await;
    let v2 = patched.json()["version"].clone();
    assert!(v2.as_i64() > v.as_i64());
    assert_eq!(patched.headers["etag"], quoted(&v2));
    // Without If-Match the old path still lands.
    let plain = app
        .patch_as(
            &admin,
            &format!("/api/v2/courses/{course}"),
            &json!({ "about": "y" }),
        )
        .await;
    assert_eq!(plain.status, StatusCode::OK);
    let v3 = plain.json()["version"].clone();
    let published = assert_guarded(
        &app,
        &admin,
        "POST",
        &format!("/api/v2/courses/{course}/lifecycle"),
        json!({ "action": "archive" }),
        &v3,
    )
    .await;
    assert!(published.json()["archived_at_unix"].is_i64());
    app.post_as(
        &admin,
        &format!("/api/v2/courses/{course}/lifecycle"),
        &json!({ "action": "restore" }),
    )
    .await;

    // Chapter.
    let cur = app
        .get_as(&admin, &format!("/api/v2/courses/{course}/curriculum"))
        .await;
    let cv = cur.json()["chapters"][0]["version"].clone();
    assert_guarded(
        &app,
        &admin,
        "PATCH",
        &format!("/api/v2/chapters/{chapter}"),
        json!({ "name": "Renamed" }),
        &cv,
    )
    .await;

    // Announcement: author + actions, guarded edit.
    let update = app
        .post_as(
            &admin,
            &format!("/api/v2/courses/{course}/updates"),
            &json!({ "title": "Hi", "content": "Body" }),
        )
        .await;
    assert_eq!(update.status, StatusCode::CREATED, "{}", update.text());
    assert_eq!(update.json()["author"]["id"], admin.user_id.to_string());
    assert_eq!(
        update.json()["allowed_actions"],
        json!(["update", "delete"])
    );
    assert_guarded(
        &app,
        &admin,
        "PATCH",
        &format!("/api/v2/course-updates/{}", id(&update)),
        json!({ "title": "Hi 2" }),
        &update.json()["version"],
    )
    .await;

    // Certification: ETag on the read, guarded PATCH.
    let cert = app
        .post_as(
            &admin,
            "/api/v2/certifications",
            &json!({ "course_id": course, "config": {} }),
        )
        .await;
    assert_eq!(cert.status, StatusCode::CREATED, "{}", cert.text());
    let cert_read = app
        .get_as(&admin, &format!("/api/v2/certifications/{}", id(&cert)))
        .await;
    assert_eq!(cert_read.headers["etag"], quoted(&cert.json()["version"]));
    assert_guarded(
        &app,
        &admin,
        "PATCH",
        &format!("/api/v2/certifications/{}", id(&cert)),
        json!({ "config": { "certification_name": "N" } }),
        &cert.json()["version"],
    )
    .await;

    // Usergroup.
    let group = app
        .post_as(&admin, "/api/v2/usergroups", &json!({ "name": "G" }))
        .await;
    assert_guarded(
        &app,
        &admin,
        "PATCH",
        &format!("/api/v2/usergroups/{}", id(&group)),
        json!({ "name": "G2" }),
        &group.json()["version"],
    )
    .await;

    // Role: by slug, ETag; metadata and grant writes share the version.
    let created = send(
        &app,
        &admin,
        "POST",
        "/api/v2/rbac/roles",
        Some(json!({ "slug": "wire-role", "display_name": "Wire", "priority": 5 })),
        &[("Prefer", "return=representation")],
    )
    .await;
    assert_eq!(created.status, StatusCode::CREATED, "{}", created.text());
    let role = app.get_as(&admin, "/api/v2/rbac/roles/wire-role").await;
    assert_eq!(role.status, StatusCode::OK);
    assert_eq!(role.headers["etag"], quoted(&role.json()["version"]));
    let after_put = assert_guarded(
        &app,
        &admin,
        "PUT",
        "/api/v2/rbac/roles/wire-role/permissions",
        json!({ "permissions": ["course:read:all"] }),
        &role.json()["version"],
    )
    .await;
    assert_eq!(after_put.status, StatusCode::NO_CONTENT);
    let role = app.get_as(&admin, "/api/v2/rbac/roles/wire-role").await;
    assert_eq!(
        role.json()["version"].as_i64(),
        created.json()["version"].as_i64().map(|v| v + 1)
    );
    let renamed = send(
        &app,
        &admin,
        "PATCH",
        "/api/v2/rbac/roles/wire-role",
        Some(json!({ "display_name": "Wired" })),
        &[
            ("Prefer", "return=representation"),
            ("If-Match", &quoted(&role.json()["version"])),
        ],
    )
    .await;
    assert_eq!(renamed.status, StatusCode::OK, "{}", renamed.text());
    assert_eq!(renamed.json()["display_name"], "Wired");

    // Platform: public read with ETag + actions; guarded PATCH.
    let platform = app.get_as(&admin, "/api/v2/platform").await;
    assert_eq!(platform.json()["allowed_actions"], json!(["update"]));
    assert_eq!(
        platform.headers["etag"],
        quoted(&platform.json()["version"])
    );
    assert_eq!(
        app.get("/api/v2/platform").await.json()["allowed_actions"],
        json!([])
    );
    assert_guarded(
        &app,
        &admin,
        "PATCH",
        "/api/v2/platform",
        json!({ "description": "d" }),
        &platform.json()["version"],
    )
    .await;

    // Assessment: guarded PATCH / policy / lifecycle; without If-Match the
    // old path (incl. its 409s) is unchanged.
    let assessment = app
        .post_as(
            &admin,
            "/api/v2/assessments",
            &json!({ "chapter_id": chapter, "kind": "quiz", "title": "Q" }),
        )
        .await;
    assert_eq!(
        assessment.status,
        StatusCode::CREATED,
        "{}",
        assessment.text()
    );
    let a = id(&assessment);
    let read = app
        .get_as(&admin, &format!("/api/v2/assessments/{a}"))
        .await;
    assert_eq!(read.headers["etag"], quoted(&read.json()["version"]));
    assert_guarded(
        &app,
        &admin,
        "PATCH",
        &format!("/api/v2/assessments/{a}"),
        json!({ "title": "Q2" }),
        &read.json()["version"],
    )
    .await;
}

#[sqlx::test(migrations = "../../migrations")]
async fn stale_if_match_is_checked_after_the_permission_gate(pool: PgPool) {
    let World { app, course, .. } = world(pool).await;
    app.publish_course(&course).await;
    let outsider = session(&app, "s2", &["course:read:all"]).await;
    let res = send(
        &app,
        &outsider,
        "PATCH",
        &format!("/api/v2/courses/{course}"),
        Some(json!({ "name": "x" })),
        &[("If-Match", "\"999\"")],
    )
    .await;
    assert_eq!(res.status, StatusCode::FORBIDDEN, "{}", res.text());
}

#[sqlx::test(migrations = "../../migrations")]
async fn creates_replay_under_idempotency_key(pool: PgPool) {
    let World {
        app,
        admin,
        course,
        chapter,
    } = world(pool).await;
    let creates = [
        ("/api/v2/courses".to_owned(), json!({ "name": "Twice" })),
        (
            format!("/api/v2/courses/{course}/chapters"),
            json!({ "name": "C" }),
        ),
        (
            format!("/api/v2/chapters/{chapter}/activities"),
            json!({ "name": "A", "activity_type": "dynamic", "activity_sub_type": "dynamic_page" }),
        ),
        (
            format!("/api/v2/courses/{course}/updates"),
            json!({ "title": "T", "content": "C" }),
        ),
        ("/api/v2/usergroups".to_owned(), json!({ "name": "G" })),
        (
            "/api/v2/certifications".to_owned(),
            json!({ "course_id": course, "config": {} }),
        ),
        (
            "/api/v2/assessments".to_owned(),
            json!({ "chapter_id": chapter, "kind": "quiz", "title": "Q" }),
        ),
    ];
    for (i, (uri, body)) in creates.iter().enumerate() {
        let key = format!("wire-key-{i}");
        let first = send(
            &app,
            &admin,
            "POST",
            uri,
            Some(body.clone()),
            &[("Idempotency-Key", &key)],
        )
        .await;
        assert_eq!(first.status, StatusCode::CREATED, "{uri}: {}", first.text());
        let again = send(
            &app,
            &admin,
            "POST",
            uri,
            Some(body.clone()),
            &[("Idempotency-Key", &key)],
        )
        .await;
        assert_eq!(again.status, StatusCode::CREATED, "{uri}");
        assert_eq!(id(&first), id(&again), "{uri}: replayed, not created twice");
    }

    // A role create without Prefer keeps its 204, also when replayed.
    for _ in 0..2 {
        let res = send(
            &app,
            &admin,
            "POST",
            "/api/v2/rbac/roles",
            Some(json!({ "slug": "replayed", "display_name": "R", "priority": 5 })),
            &[("Idempotency-Key", "role-key")],
        )
        .await;
        assert_eq!(res.status, StatusCode::NO_CONTENT, "{}", res.text());
        assert!(res.text().is_empty());
    }

    // Enrolment: a published course, a learner, the same key twice.
    app.publish_course(&course).await;
    let student = session(&app, "s3", &["trail:read:all", "trail:submit:assigned"]).await;
    for _ in 0..2 {
        let res = send(
            &app,
            &student,
            "POST",
            &format!("/api/v2/trail/courses/{course}"),
            None,
            &[
                ("Idempotency-Key", "enrol-key"),
                ("Prefer", "return=representation"),
            ],
        )
        .await;
        assert_eq!(res.status, StatusCode::OK, "{}", res.text());
        assert_eq!(res.json()["learner_state"]["enrolled"], true);
    }
}

#[sqlx::test(migrations = "../../migrations")]
async fn admin_writes_answer_the_resource_on_request(pool: PgPool) {
    let World { app, admin, .. } = world(pool).await;
    let target = app
        .create_user("target", "target@example.com", &["user"])
        .await;

    let plain = app
        .post_as(
            &admin,
            &format!("/api/v2/users/{target}/roles"),
            &json!({ "role": "instructor" }),
        )
        .await;
    assert_eq!(plain.status, StatusCode::NO_CONTENT);
    let removed = send(
        &app,
        &admin,
        "DELETE",
        &format!("/api/v2/users/{target}/roles/instructor"),
        None,
        &[("Prefer", "return=representation")],
    )
    .await;
    assert_eq!(removed.status, StatusCode::OK, "{}", removed.text());
    assert_eq!(removed.json()["roles"], json!(["user"]));
    let disabled = send(
        &app,
        &admin,
        "PATCH",
        &format!("/api/v2/users/{target}/status"),
        Some(json!({ "disabled": true })),
        &[("Prefer", "return=representation")],
    )
    .await;
    assert_eq!(disabled.status, StatusCode::OK, "{}", disabled.text());
    assert_eq!(disabled.json()["status"], "disabled");
    assert_eq!(
        disabled.json()["allowed_actions"],
        json!(["manage_roles", "enable"])
    );

    let group = app
        .post_as(&admin, "/api/v2/usergroups", &json!({ "name": "G" }))
        .await;
    let members = format!("/api/v2/usergroups/{}/members", id(&group));
    let added = send(
        &app,
        &admin,
        "POST",
        &members,
        Some(json!({ "user_ids": [target] })),
        &[("Prefer", "return=representation")],
    )
    .await;
    assert_eq!(added.status, StatusCode::OK, "{}", added.text());
    assert_eq!(added.json()["member_count"], 1);
    let page = app.get_as(&admin, &format!("{members}/page?limit=1")).await;
    assert_eq!(page.json()["items"][0]["id"], target.to_string());
    assert!(page.json()["next_cursor"].is_null());

    // Admin read of one account, sort and filters.
    let one = app
        .get_as(&admin, &format!("/api/v2/users/by-id/{target}/admin"))
        .await;
    assert_eq!(one.json()["username"], "target");
    let outsider = session(&app, "s4", &["course:read:all"]).await;
    let denied = app
        .get_as(&outsider, &format!("/api/v2/users/by-id/{target}/admin"))
        .await;
    assert_eq!(denied.status, StatusCode::FORBIDDEN);
    let disabled_only = app.get_as(&admin, "/api/v2/users?status=disabled").await;
    let items = disabled_only.json()["items"].as_array().unwrap().clone();
    assert_eq!(items.len(), 1);
    assert_eq!(items[0]["id"], target.to_string());
    app.create_user("aaron", "aaron@example.com", &["instructor"])
        .await;
    let by_name = app.get_as(&admin, "/api/v2/users?sort=name&limit=1").await;
    let first = by_name.json()["items"][0]["display_name"]
        .as_str()
        .unwrap()
        .to_lowercase();
    let next = by_name.json()["next_cursor"].as_str().unwrap().to_owned();
    let second = app
        .get_as(
            &admin,
            &format!("/api/v2/users?sort=name&limit=1&cursor={next}"),
        )
        .await;
    let second = second.json()["items"][0]["display_name"]
        .as_str()
        .unwrap()
        .to_lowercase();
    assert!(first <= second, "{first} then {second}");
    let instructors = app.get_as(&admin, "/api/v2/users?role=instructor").await;
    assert!(
        instructors.json()["items"]
            .as_array()
            .unwrap()
            .iter()
            .all(|u| u["roles"]
                .as_array()
                .unwrap()
                .contains(&json!("instructor")))
    );
}

async fn lesson(app: &TestApp, admin: &MintedSession, chapter: &str, name: &str) -> String {
    let created = app
        .post_as(
            admin,
            &format!("/api/v2/chapters/{chapter}/activities"),
            &json!({ "name": name, "activity_type": "dynamic", "activity_sub_type": "dynamic_page" }),
        )
        .await;
    let activity = id(&created);
    app.patch_as(
        admin,
        &format!("/api/v2/activities/{activity}"),
        &json!({ "published": true }),
    )
    .await;
    activity
}

#[sqlx::test(migrations = "../../migrations")]
async fn learner_flow_gaps(pool: PgPool) {
    let World {
        app,
        admin,
        course,
        chapter,
    } = world(pool).await;
    let first = lesson(&app, &admin, &chapter, "First").await;
    let second = lesson(&app, &admin, &chapter, "Second").await;
    app.publish_course(&course).await;

    // A guest reads the anonymous state and an empty discussion page.
    let guest = app
        .get(&format!("/api/v2/courses/{course}/learner-state"))
        .await;
    assert_eq!(guest.status, StatusCode::OK, "{}", guest.text());
    assert_eq!(guest.json()["enrolled"], false);
    assert_eq!(guest.json()["next_action"]["id"], "enroll");
    assert_eq!(guest.json()["next_action"]["course_id"], course);
    let talk = app
        .get(&format!("/api/v2/courses/{course}/discussions"))
        .await;
    assert_eq!(talk.status, StatusCode::OK, "{}", talk.text());
    assert_eq!(talk.json()["items"], json!([]));

    let student = session(
        &app,
        "student",
        &[
            "trail:read:all",
            "trail:submit:assigned",
            "discussion:read:all",
            "discussion:create:own",
            "discussion:update:own",
        ],
    )
    .await;
    app.post_as(
        &student,
        &format!("/api/v2/trail/courses/{course}"),
        &json!({}),
    )
    .await;
    let state = app
        .get_as(&student, &format!("/api/v2/courses/{course}/learner-state"))
        .await;
    let acts = &state.json()["outline"][0]["activities"];
    assert!(
        acts[0]["allowed_actions"]
            .as_array()
            .unwrap()
            .contains(&json!("mark_complete"))
    );
    assert_eq!(state.json()["next_action"]["activity_id"], first);
    assert_eq!(state.json()["next_action"]["course_id"], course);

    // Marking answers the learner state on request; the trail run knows
    // its real status and the next activity.
    let marked = send(
        &app,
        &student,
        "POST",
        &format!("/api/v2/trail/activities/{first}"),
        None,
        &[("Prefer", "return=representation")],
    )
    .await;
    assert_eq!(marked.status, StatusCode::OK, "{}", marked.text());
    let ls = &marked.json()["learner_state"];
    assert!(
        ls["outline"][0]["activities"][0]["allowed_actions"]
            .as_array()
            .unwrap()
            .contains(&json!("unmark_complete"))
    );
    let run = &marked.json()["runs"][0];
    assert_eq!(run["learning_status"], "in_progress");
    assert_eq!(run["next_activity_id"], second);
    let plain = app
        .post_as(
            &student,
            &format!("/api/v2/trail/activities/{second}"),
            &json!({}),
        )
        .await;
    assert!(plain.json()["learner_state"].is_null());
    let trail = app.get_as(&student, "/api/v2/trail?limit=1").await;
    assert_eq!(trail.json()["runs"][0]["learning_status"], "completed");
    assert!(trail.json()["runs"][0]["next_activity_id"].is_null());
    assert!(trail.json()["next_cursor"].is_null());

    // Discussions: an empty editor document is refused; a reply reports the
    // parent's count; a thread reads by id.
    let empty = app
        .post_as(
            &student,
            &format!("/api/v2/courses/{course}/discussions"),
            &json!({ "content": r#"{"type":"doc","content":[{"type":"paragraph"}]}"# }),
        )
        .await;
    assert_eq!(
        empty.status,
        StatusCode::UNPROCESSABLE_ENTITY,
        "{}",
        empty.text()
    );
    let post = app
        .post_as(
            &student,
            &format!("/api/v2/courses/{course}/discussions"),
            &json!({ "content": "Question" }),
        )
        .await;
    assert_eq!(post.status, StatusCode::CREATED, "{}", post.text());
    assert!(post.json()["parent_replies_count"].is_null());
    let reply = app
        .post_as(
            &student,
            &format!("/api/v2/courses/{course}/discussions"),
            &json!({ "content": "Answer", "parent_id": id(&post) }),
        )
        .await;
    assert_eq!(reply.json()["parent_replies_count"], 1);
    let thread = app
        .get_as(&student, &format!("/api/v2/discussions/{}", id(&post)))
        .await;
    assert_eq!(thread.status, StatusCode::OK, "{}", thread.text());
    assert_eq!(thread.json()["replies"][0]["id"], id(&reply));

    // The teacher lists members with progress and removes one.
    let learners = app
        .get_as(&admin, &format!("/api/v2/courses/{course}/learners"))
        .await;
    assert_eq!(learners.status, StatusCode::OK, "{}", learners.text());
    assert_eq!(
        learners.json()["items"][0]["user_id"],
        student.user_id.to_string()
    );
    assert_eq!(
        learners.json()["items"][0]["allowed_actions"],
        json!(["remove"])
    );
    let denied = app
        .get_as(&student, &format!("/api/v2/courses/{course}/learners"))
        .await;
    assert_eq!(denied.status, StatusCode::FORBIDDEN, "{}", denied.text());
    let refused = app
        .delete_as(
            &student,
            &format!("/api/v2/courses/{course}/learners/{}", student.user_id),
        )
        .await;
    assert_eq!(refused.status, StatusCode::FORBIDDEN);
    let removed = app
        .delete_as(
            &admin,
            &format!("/api/v2/courses/{course}/learners/{}", student.user_id),
        )
        .await;
    assert_eq!(removed.status, StatusCode::NO_CONTENT, "{}", removed.text());
    let after = app
        .get_as(&student, &format!("/api/v2/courses/{course}/learner-state"))
        .await;
    assert_eq!(after.json()["enrolled"], false);
}

#[sqlx::test(migrations = "../../migrations")]
async fn keyset_pages_and_teacher_gaps(pool: PgPool) {
    let World {
        app, admin, course, ..
    } = world(pool).await;
    for i in 0..3 {
        app.post_as(
            &admin,
            &format!("/api/v2/courses/{course}/updates"),
            &json!({ "title": format!("U{i}"), "content": "c" }),
        )
        .await;
    }
    let all = app
        .get_as(&admin, &format!("/api/v2/courses/{course}/updates"))
        .await;
    assert_eq!(
        all.json().as_array().unwrap().len(),
        3,
        "the old list is unchanged"
    );
    let mut seen = Vec::new();
    let mut cursor = String::new();
    loop {
        let uri = if cursor.is_empty() {
            format!("/api/v2/courses/{course}/updates/page?limit=2")
        } else {
            format!("/api/v2/courses/{course}/updates/page?limit=2&cursor={cursor}")
        };
        let page = app.get_as(&admin, &uri).await;
        for item in page.json()["items"].as_array().unwrap() {
            seen.push(item["id"].clone());
        }
        match page.json()["next_cursor"].as_str() {
            Some(next) => cursor = next.to_owned(),
            None => break,
        }
    }
    let ids: Vec<Value> = all
        .json()
        .as_array()
        .unwrap()
        .iter()
        .map(|u| u["id"].clone())
        .collect();
    assert_eq!(seen, ids);

    // Roster page: the creator first, with actions per row.
    let helper = app
        .create_user("helper", "helper@example.com", &["user"])
        .await;
    let added = app
        .post_as(
            &admin,
            &format!("/api/v2/courses/{course}/contributors"),
            &json!({ "user_id": helper }),
        )
        .await;
    assert_eq!(added.json()["allowed_actions"], json!(["update", "remove"]));
    let roster = app
        .get_as(
            &admin,
            &format!("/api/v2/courses/{course}/contributors/page?limit=1"),
        )
        .await;
    assert_eq!(roster.json()["items"][0]["role"], "creator");
    assert_eq!(roster.json()["items"][0]["allowed_actions"], json!([]));
    let next = roster.json()["next_cursor"].as_str().unwrap().to_owned();
    let rest = app
        .get_as(
            &admin,
            &format!("/api/v2/courses/{course}/contributors/page?cursor={next}"),
        )
        .await;
    assert_eq!(rest.json()["items"][0]["user_id"], helper.to_string());
    assert_guarded(
        &app,
        &admin,
        "PATCH",
        &format!("/api/v2/courses/{course}/contributors/{helper}"),
        json!({ "role": "maintainer" }),
        &rest.json()["items"][0]["version"],
    )
    .await;

    // Leaderboard: cursor pages next to limit/offset.
    for (i, name) in ["p1", "p2", "p3"].iter().enumerate() {
        let user = app
            .create_user(name, &format!("{name}@example.com"), &["user"])
            .await;
        sqlx::query("INSERT INTO gamification_profiles (user_id, total_xp) VALUES ($1, $2)")
            .bind(user.0)
            .bind((i32::try_from(i).unwrap() + 1) * 100)
            .execute(&app.pool)
            .await
            .unwrap();
    }
    let first = app
        .get_as(&admin, "/api/v2/gamification/leaderboard?limit=2&cursor=")
        .await;
    assert_eq!(first.status, StatusCode::OK, "{}", first.text());
    assert_eq!(first.json()["entries"][0]["username"], "p3");
    let next = first.json()["next_cursor"].as_str().unwrap().to_owned();
    let second = app
        .get_as(
            &admin,
            &format!("/api/v2/gamification/leaderboard?limit=2&cursor={next}"),
        )
        .await;
    assert_eq!(second.json()["entries"][0]["username"], "p1");
    assert_eq!(second.json()["entries"][0]["rank"], 3);
    let offset = app
        .get_as(&admin, "/api/v2/gamification/leaderboard?limit=1&offset=1")
        .await;
    assert_eq!(offset.json()["entries"][0]["username"], "p2");
    assert!(offset.json()["next_cursor"].is_null());

    // Certificate preview PDF, language by `?lang=`.
    let cert = app
        .post_as(
            &admin,
            "/api/v2/certifications",
            &json!({ "course_id": course, "config": { "certification_name": "Wire" } }),
        )
        .await;
    let pdf = app
        .get_as(
            &admin,
            &format!("/api/v2/certifications/{}/preview.pdf?lang=kk", id(&cert)),
        )
        .await;
    assert_eq!(pdf.status, StatusCode::OK, "{}", pdf.text());
    assert_eq!(pdf.content_type(), "application/pdf");
    assert!(pdf.bytes().starts_with(b"%PDF"));
    let outsider = session(&app, "s5", &["course:read:all"]).await;
    let hidden = app
        .get_as(
            &outsider,
            &format!("/api/v2/certifications/{}/preview.pdf", id(&cert)),
        )
        .await;
    assert!(hidden.status.is_client_error());

    // `?lang=` never reaches a strict query DTO.
    let listed = app
        .get_as(
            &admin,
            &format!("/api/v2/courses/{course}/discussions?lang=en"),
        )
        .await;
    assert_eq!(listed.status, StatusCode::OK, "{}", listed.text());

    // My certificates as pages (none yet).
    let mine = app.get_as(&admin, "/api/v2/me/certificates/page").await;
    assert_eq!(mine.json(), json!({ "items": [], "next_cursor": null }));
}
