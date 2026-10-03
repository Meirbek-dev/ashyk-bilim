//! Stage 2 server lane L-5 (all additive to the old web's contract):
//!
//! - Assessment items: optional `If-Match` (the assessment `version`) on
//!   create / update / delete / reorder, 412 when stale; every item reply
//!   carries `assessment_version` (+ `ETag`); delete answers the assessment
//!   with `Prefer: return=representation`.
//! - `Assessment.edit_lock` / the `edit` action / `allowed_transitions`;
//!   `AccessView.version`; override and audit rows carry display names.
//! - A per-learner override with a due date notifies the learner.
//! - Attempt refusals carry typed codes (403 kept).
//! - S-11: `AB__SERVER__WEB_LINKS=v2` switches built links to the new URL map.
//! - S-10: `/enrollments`, `/progress/activities`, `/groups` answer like the
//!   old paths, which the export marks `deprecated` + `x-replaced-by`.
//! - Gamification preferences take snake_case twins and answer `settings`.
//! - D-03: locales are stored short whatever form comes in; `locale` keeps
//!   the legacy form, `language` the short one.
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

async fn session(app: &TestApp, name: &str, permissions: &[&str]) -> MintedSession {
    let user = app
        .create_user(name, &format!("{name}@example.com"), &["user"])
        .await;
    app.mint_session_for(user, permissions).await
}

fn id(res: &TestResponse) -> String {
    res.json()["id"].as_str().unwrap().to_owned()
}

fn now() -> i64 {
    i64::try_from(
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_secs(),
    )
    .unwrap()
}

fn q(v: i64) -> String {
    format!("\"{v}\"")
}

const LEARNER: &[&str] = &[
    "trail:read:all",
    "trail:submit:assigned",
    "assessment:submit:assigned",
];

struct World {
    app: TestApp,
    admin: MintedSession,
    course: String,
    chapter: String,
}

async fn world(app: TestApp) -> World {
    let admin = session(&app, "admin5", &["*:*:*"]).await;
    let course = id(&app
        .post_as(&admin, "/api/v2/courses", &json!({ "name": "L5" }))
        .await);
    let chapter = id(&app
        .post_as(
            &admin,
            &format!("/api/v2/courses/{course}/chapters"),
            &json!({ "name": "One" }),
        )
        .await);
    World {
        app,
        admin,
        course,
        chapter,
    }
}

fn choice(prompt: &str) -> Value {
    json!({ "title": prompt, "max_score": 10, "body": { "kind": "choice", "prompt": prompt,
        "options": [{ "id": "a", "text": "yes", "is_correct": true },
                    { "id": "b", "text": "no", "is_correct": false }] } })
}

async fn quiz(w: &World) -> (String, i64) {
    let created = w
        .app
        .post_as(
            &w.admin,
            "/api/v2/assessments",
            &json!({ "chapter_id": w.chapter, "kind": "quiz", "title": "Q" }),
        )
        .await;
    assert_eq!(created.status, StatusCode::CREATED, "{}", created.text());
    (id(&created), created.json()["version"].as_i64().unwrap())
}

#[sqlx::test(migrations = "../../migrations")]
async fn assessment_items_are_guarded_and_answer_the_version(pool: PgPool) {
    let w = world(TestApp::spawn(pool).await).await;
    let (quiz_id, v0) = quiz(&w).await;
    let app = &w.app;
    let detail = app
        .get_as(&w.admin, &format!("/api/v2/assessments/{quiz_id}"))
        .await;
    let d = detail.json();
    assert_eq!(d["edit_lock"], Value::Null);
    assert!(
        d["allowed_actions"]
            .as_array()
            .unwrap()
            .contains(&json!("edit"))
    );
    let mut transitions: Vec<&str> = d["allowed_transitions"]
        .as_array()
        .unwrap()
        .iter()
        .map(|t| t.as_str().unwrap())
        .collect();
    transitions.sort_unstable();
    assert_eq!(transitions, ["archived", "published", "scheduled"]);

    let items = format!("/api/v2/assessments/{quiz_id}/items");
    let stale = send(
        app,
        &w.admin,
        "POST",
        &items,
        Some(choice("one")),
        &[("If-Match", &q(v0 - 1))],
    )
    .await;
    assert_eq!(
        stale.status,
        StatusCode::PRECONDITION_FAILED,
        "{}",
        stale.text()
    );
    let first = send(
        app,
        &w.admin,
        "POST",
        &items,
        Some(choice("one")),
        &[("If-Match", &q(v0))],
    )
    .await;
    assert_eq!(first.status, StatusCode::CREATED, "{}", first.text());
    let v1 = first.json()["assessment_version"].as_i64().unwrap();
    assert!(v1 > v0);
    assert_eq!(first.headers[header::ETAG], q(v1));
    let second = send(
        app,
        &w.admin,
        "POST",
        &items,
        Some(choice("two")),
        &[("If-Match", &q(v1))],
    )
    .await;
    let v2 = second.json()["assessment_version"].as_i64().unwrap();
    let (one, two) = (id(&first), id(&second));

    // A title-only edit is not content: the version stays.
    let renamed = send(
        app,
        &w.admin,
        "PATCH",
        &format!("/api/v2/assessment-items/{one}"),
        Some(json!({ "title": "uno" })),
        &[("If-Match", &q(v2))],
    )
    .await;
    assert_eq!(renamed.status, StatusCode::OK, "{}", renamed.text());
    assert_eq!(renamed.json()["assessment_version"], v2);
    let stale_patch = send(
        app,
        &w.admin,
        "PATCH",
        &format!("/api/v2/assessment-items/{one}"),
        Some(json!({ "title": "x" })),
        &[("If-Match", &q(v0))],
    )
    .await;
    assert_eq!(stale_patch.status, StatusCode::PRECONDITION_FAILED);

    let reorder = format!("/api/v2/assessments/{quiz_id}/items/reorder");
    let stale_order = send(
        app,
        &w.admin,
        "POST",
        &reorder,
        Some(json!({ "items": [two, one] })),
        &[("If-Match", &q(v0))],
    )
    .await;
    assert_eq!(stale_order.status, StatusCode::PRECONDITION_FAILED);
    let ordered = send(
        app,
        &w.admin,
        "POST",
        &reorder,
        Some(json!({ "items": [two, one] })),
        &[("If-Match", &q(v2))],
    )
    .await;
    assert_eq!(ordered.status, StatusCode::OK, "{}", ordered.text());
    assert_eq!(ordered.json()[0]["assessment_version"], v2);

    // Delete: 204 + ETag, or the assessment on request.
    let gone = send(
        app,
        &w.admin,
        "DELETE",
        &format!("/api/v2/assessment-items/{two}"),
        None,
        &[("If-Match", &q(v2))],
    )
    .await;
    assert_eq!(gone.status, StatusCode::NO_CONTENT, "{}", gone.text());
    let v3: i64 = gone.headers[header::ETAG]
        .to_str()
        .unwrap()
        .trim_matches('"')
        .parse()
        .unwrap();
    assert!(v3 > v2);
    let third = send(app, &w.admin, "POST", &items, Some(choice("three")), &[]).await;
    let repr = send(
        app,
        &w.admin,
        "DELETE",
        &format!("/api/v2/assessment-items/{}", id(&third)),
        None,
        &[("Prefer", "return=representation")],
    )
    .await;
    assert_eq!(repr.status, StatusCode::OK, "{}", repr.text());
    assert_eq!(repr.json()["items"].as_array().unwrap().len(), 1);
    assert_eq!(
        repr.headers[header::ETAG],
        q(repr.json()["version"].as_i64().unwrap())
    );

    // The access view carries its version in the body too.
    let access = app
        .get_as(&w.admin, &format!("/api/v2/assessments/{quiz_id}/access"))
        .await;
    assert_eq!(
        access.headers[header::ETAG],
        q(access.json()["version"].as_i64().unwrap())
    );

    // Publish → audit row with the actor's name; archive → locked.
    let published = app
        .post_as(
            &w.admin,
            &format!("/api/v2/assessments/{quiz_id}/lifecycle"),
            &json!({ "to": "published" }),
        )
        .await;
    assert_eq!(published.status, StatusCode::OK, "{}", published.text());
    assert_eq!(published.json()["edit_lock"], Value::Null);
    assert_eq!(
        published.json()["allowed_transitions"],
        json!(["draft", "archived"])
    );
    let audit = app
        .get_as(&w.admin, &format!("/api/v2/assessments/{quiz_id}/audit"))
        .await;
    assert_eq!(audit.json()[0]["event"], "lifecycle-transition");
    assert!(audit.json()[0]["actor_name"].is_string());
    let archived = app
        .post_as(
            &w.admin,
            &format!("/api/v2/assessments/{quiz_id}/lifecycle"),
            &json!({ "to": "archived" }),
        )
        .await;
    assert_eq!(archived.json()["edit_lock"], "archived");
    assert!(
        !archived.json()["allowed_actions"]
            .as_array()
            .unwrap()
            .contains(&json!("edit"))
    );
    assert_eq!(archived.json()["allowed_transitions"], json!(["draft"]));
}

#[sqlx::test(migrations = "../../migrations")]
async fn overrides_name_people_and_notify_the_learner(pool: PgPool) {
    let w = world(TestApp::spawn(pool).await).await;
    let (quiz_id, _) = quiz(&w).await;
    let app = &w.app;
    app.publish_course(&w.course).await;
    let learner_id = app.create_user("kid5", "kid5@example.com", &["user"]).await;
    let learner = app.mint_session_for(learner_id, LEARNER).await;
    // S-10: enrol through the new path.
    let enrolled = app
        .post_as(
            &learner,
            &format!("/api/v2/enrollments/{}", w.course),
            &json!({}),
        )
        .await;
    assert_eq!(enrolled.status, StatusCode::OK, "{}", enrolled.text());
    let listed = app.get_as(&learner, "/api/v2/enrollments").await;
    assert_eq!(listed.json()["runs"].as_array().unwrap().len(), 1);

    let due = now() + 86_400 * 30;
    let created = app
        .post_as(
            &w.admin,
            &format!("/api/v2/assessments/{quiz_id}/overrides/{learner_id}"),
            &json!({ "due_at_override_unix": due }),
        )
        .await;
    assert_eq!(created.status, StatusCode::CREATED, "{}", created.text());
    assert!(created.json()["user_display_name"].is_string());
    assert!(created.json()["granted_by_name"].is_string());
    let audit = app
        .get_as(&w.admin, &format!("/api/v2/assessments/{quiz_id}/audit"))
        .await;
    assert_eq!(audit.json()[0]["event"], "override-created");

    let inbox = app.get_as(&learner, "/api/v2/me/notifications").await;
    assert_eq!(inbox.status, StatusCode::OK, "{}", inbox.text());
    let types: Vec<String> = inbox.json()["items"]
        .as_array()
        .unwrap()
        .iter()
        .map(|n| n["type"].as_str().unwrap().to_owned())
        .collect();
    assert!(types.iter().any(|t| t.contains("deadline")), "{types:?}");
}

#[sqlx::test(migrations = "../../migrations")]
async fn past_due_refusal_has_a_typed_code(pool: PgPool) {
    let w = world(TestApp::spawn(pool).await).await;
    let (quiz_id, _) = quiz(&w).await;
    let app = &w.app;
    app.post_as(
        &w.admin,
        &format!("/api/v2/assessments/{quiz_id}/items"),
        &choice("one"),
    )
    .await;
    let detail = app
        .get_as(&w.admin, &format!("/api/v2/assessments/{quiz_id}"))
        .await;
    let mut policy = detail.json()["policy"].clone();
    policy["due_at_unix"] = json!(now() - 3600);
    policy["allow_late"] = json!(false);
    let set = send(
        app,
        &w.admin,
        "PUT",
        &format!("/api/v2/assessments/{quiz_id}/policy"),
        Some(policy),
        &[],
    )
    .await;
    assert_eq!(set.status, StatusCode::OK, "{}", set.text());
    app.post_as(
        &w.admin,
        &format!("/api/v2/assessments/{quiz_id}/lifecycle"),
        &json!({ "to": "published" }),
    )
    .await;
    app.publish_course(&w.course).await;
    let learner = session(app, "late5", LEARNER).await;
    app.post_as(
        &learner,
        &format!("/api/v2/enrollments/{}", w.course),
        &json!({}),
    )
    .await;
    let refused = app
        .post_as(
            &learner,
            &format!("/api/v2/assessments/{quiz_id}/submissions"),
            &json!({}),
        )
        .await;
    assert_eq!(refused.status, StatusCode::FORBIDDEN, "{}", refused.text());
    assert_eq!(refused.json()["code"], "attempt-past-due");
    assert!(
        refused.json()["detail"]
            .as_str()
            .unwrap()
            .contains("PAST_DUE")
    );
    assert_eq!(refused.json()["details"]["reasons"], json!(["PAST_DUE"]));
}

#[sqlx::test(migrations = "../../migrations")]
async fn v2_link_scheme_switches_built_links(pool: PgPool) {
    let app = TestApp::spawn_with(pool, |c| {
        c.server.web_links = ab_core::links::LinkScheme::V2;
    })
    .await;
    let w = world(app).await;
    w.app.publish_course(&w.course).await;
    let guest = w
        .app
        .get(&format!("/api/v2/courses/{}/learner-state", w.course))
        .await;
    assert_eq!(
        guest.json()["next_action"]["href"],
        format!("/courses/{}", w.course)
    );
    let cancelled = w.app.get("/api/v2/auth/google/callback?error=x").await;
    let location = cancelled.headers[header::LOCATION].to_str().unwrap();
    assert!(location.starts_with("/login?error="), "{location}");
}

#[sqlx::test(migrations = "../../migrations")]
async fn legacy_link_scheme_is_the_default(pool: PgPool) {
    let w = world(TestApp::spawn(pool).await).await;
    w.app.publish_course(&w.course).await;
    let guest = w
        .app
        .get(&format!("/api/v2/courses/{}/learner-state", w.course))
        .await;
    assert_eq!(
        guest.json()["next_action"]["href"],
        format!("/course/{}", w.course)
    );
    let cancelled = w.app.get("/api/v2/auth/google/callback?error=x").await;
    let location = cancelled.headers[header::LOCATION].to_str().unwrap();
    assert!(location.starts_with("/auth/login?error="), "{location}");
}

#[sqlx::test(migrations = "../../migrations")]
async fn s10_names_answer_like_the_old_paths(pool: PgPool) {
    let w = world(TestApp::spawn(pool).await).await;
    let app = &w.app;
    let group = app
        .post_as(&w.admin, "/api/v2/groups", &json!({ "name": "G" }))
        .await;
    assert_eq!(group.status, StatusCode::CREATED, "{}", group.text());
    let gid = id(&group);
    let read = app.get_as(&w.admin, &format!("/api/v2/groups/{gid}")).await;
    assert_eq!(read.json()["name"], "G");
    let old = app
        .get_as(&w.admin, &format!("/api/v2/usergroups/{gid}"))
        .await;
    assert_eq!(old.json(), read.json());
    let linked = send(
        app,
        &w.admin,
        "POST",
        &format!("/api/v2/groups/{gid}/courses"),
        Some(json!({ "course_ids": [w.course] })),
        &[],
    )
    .await;
    assert_eq!(linked.status, StatusCode::NO_CONTENT, "{}", linked.text());
    let for_course = app
        .get_as(&w.admin, &format!("/api/v2/courses/{}/groups", w.course))
        .await;
    assert_eq!(for_course.json()[0]["id"], gid.as_str());

    // The export marks every old operation and names its replacement.
    let doc = ab_api::openapi_doc();
    let ops: Vec<&serde_json::Map<String, Value>> = doc["paths"]
        .as_object()
        .unwrap()
        .values()
        .flat_map(|item| item.as_object().unwrap().values())
        .filter_map(Value::as_object)
        .collect();
    for (old, new) in ab_api::RENAMED {
        let op = |name: &str| {
            ops.iter()
                .find(|o| o.get("operationId") == Some(&json!(name)))
                .unwrap_or_else(|| panic!("no operation {name}"))
        };
        assert_eq!(op(old)["deprecated"], true, "{old}");
        assert_eq!(op(old)["x-replaced-by"], *new, "{old}");
        assert!(
            op(new).get("deprecated").is_none_or(|d| d == false),
            "{new}"
        );
    }
}

#[sqlx::test(migrations = "../../migrations")]
async fn preferences_take_snake_case_and_locales_are_stored_short(pool: PgPool) {
    let app = TestApp::spawn(pool).await;
    let user_id = app
        .create_user("pref5", "pref5@example.com", &["user"])
        .await;
    let me = app
        .mint_session_for(user_id, &["user:update:own", "user:read:own"])
        .await;
    let patched = send(
        &app,
        &me,
        "PATCH",
        "/api/v2/gamification/preferences",
        Some(json!({ "privacy": { "show_on_leaderboard": false },
                     "display": { "compactMode": true } })),
        &[],
    )
    .await;
    assert_eq!(patched.status, StatusCode::OK, "{}", patched.text());
    let p = patched.json();
    assert_eq!(
        p["preferences"]["privacy"],
        json!({ "showOnLeaderboard": false })
    );
    assert_eq!(p["settings"]["privacy"]["show_on_leaderboard"], false);
    assert_eq!(p["settings"]["display"]["compact_mode"], true);
    assert_eq!(p["settings"]["notifications"]["xp_gain"], Value::Null);
    let bad = send(
        &app,
        &me,
        "PATCH",
        "/api/v2/gamification/preferences",
        Some(json!({ "privacy": { "showonleaderboard": false } })),
        &[],
    )
    .await;
    assert_eq!(bad.status, StatusCode::UNPROCESSABLE_ENTITY);

    let stored = |app: &TestApp| {
        let pool = app.pool.clone();
        async move {
            sqlx::query_scalar::<_, String>("SELECT locale FROM users WHERE id = $1")
                .bind(user_id.0)
                .fetch_one(&pool)
                .await
                .unwrap()
        }
    };
    for (sent, legacy, short) in [("kk", "kk-KZ", "kk"), ("en-US", "en-US", "en")] {
        let res = send(
            &app,
            &me,
            "PATCH",
            "/api/v2/users/me",
            Some(json!({ "locale": sent })),
            &[],
        )
        .await;
        assert_eq!(res.status, StatusCode::OK, "{}", res.text());
        assert_eq!(res.json()["locale"], legacy);
        assert_eq!(res.json()["language"], short);
        assert_eq!(stored(&app).await, short);
    }
}

#[sqlx::test(migrations = "../../migrations")]
async fn duplicate_course_copies_content_as_drafts(pool: PgPool) {
    let w = world(TestApp::spawn(pool).await).await;
    let app = &w.app;
    let lesson = id(&app
        .post_as(
            &w.admin,
            &format!("/api/v2/chapters/{}/activities", w.chapter),
            &json!({ "name": "Read", "activity_type": "dynamic", "activity_sub_type": "dynamic_page" }),
        )
        .await);
    app.patch_as(
        &w.admin,
        &format!("/api/v2/activities/{lesson}"),
        &json!({ "published": true }),
    )
    .await;
    let (quiz_id, _) = quiz(&w).await;
    app.post_as(
        &w.admin,
        &format!("/api/v2/assessments/{quiz_id}/items"),
        &choice("one"),
    )
    .await;
    app.post_as(
        &w.admin,
        &format!("/api/v2/assessments/{quiz_id}/lifecycle"),
        &json!({ "to": "published" }),
    )
    .await;
    app.publish_course(&w.course).await;
    let learner = session(app, "kid6", LEARNER).await;
    app.post_as(
        &learner,
        &format!("/api/v2/enrollments/{}", w.course),
        &json!({}),
    )
    .await;

    // A learner may not copy.
    let refused = app
        .post_as(
            &learner,
            &format!("/api/v2/courses/{}/duplicate", w.course),
            &json!({}),
        )
        .await;
    assert_eq!(refused.status, StatusCode::FORBIDDEN, "{}", refused.text());

    let uri = format!("/api/v2/courses/{}/duplicate", w.course);
    let key = [("Idempotency-Key", "copy-1")];
    let copied = send(
        app,
        &w.admin,
        "POST",
        &uri,
        Some(json!({ "name": "Copy" })),
        &key,
    )
    .await;
    assert_eq!(copied.status, StatusCode::CREATED, "{}", copied.text());
    let again = send(
        app,
        &w.admin,
        "POST",
        &uri,
        Some(json!({ "name": "Copy" })),
        &key,
    )
    .await;
    assert_eq!(id(&again), id(&copied));
    let copy = id(&copied);
    assert_ne!(copy, w.course);
    assert_eq!(copied.json()["name"], "Copy");
    assert_eq!(copied.json()["public"], false);

    let curriculum = app
        .get_as(&w.admin, &format!("/api/v2/courses/{copy}/curriculum"))
        .await;
    let chapters = curriculum.json()["chapters"].clone();
    assert_eq!(chapters.as_array().unwrap().len(), 1);
    let activities = chapters[0]["activities"].as_array().unwrap().clone();
    let names: Vec<&str> = activities
        .iter()
        .map(|a| a["name"].as_str().unwrap())
        .collect();
    assert_eq!(names, ["Read", "Q"]);
    assert!(activities.iter().all(|a| a["published"] == false));
    let assessments = app
        .get_as(&w.admin, &format!("/api/v2/courses/{copy}/assessments"))
        .await;
    let a = &assessments.json()[0];
    assert_eq!(a["lifecycle"], "draft");
    assert_ne!(a["id"], quiz_id.as_str());
    let detail = app
        .get_as(
            &w.admin,
            &format!("/api/v2/assessments/{}", a["id"].as_str().unwrap()),
        )
        .await;
    assert_eq!(detail.json()["items"].as_array().unwrap().len(), 1);
    // Learners stay behind; the source is untouched.
    let learners = app
        .get_as(&w.admin, &format!("/api/v2/courses/{copy}/learners"))
        .await;
    assert_eq!(learners.status, StatusCode::OK, "{}", learners.text());
    assert_eq!(learners.json()["items"], json!([]));
    let source = app
        .get_as(
            &w.admin,
            &format!("/api/v2/courses/{}/assessments", w.course),
        )
        .await;
    assert_eq!(source.json()[0]["lifecycle"], "published");
}
