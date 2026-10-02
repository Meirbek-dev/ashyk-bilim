//! Course archiving (docs/COURSE_ARCHIVING.md, section 11):
//!
//! 1. lifecycle: archive → 200 with `archived_at_unix`; archive again → 409
//!    `conflict`; publish / unpublish on an archived course → 409
//!    `course-archived`; restore → 200 with the old `public`;
//! 2. rights: creator, maintainer and `course:manage:platform` may; a
//!    contributor, reporter or learner is 403, an outsider on a private
//!    course 404;
//! 3. visibility: an enrolled learner keeps a private archived course
//!    (direct read + `/trail`), an outsider does not; a public archived
//!    course leaves the catalogue, search, the author profile, collection
//!    contents and `/work`, and shows under `preset=archived&mine=true`
//!    with `summary.archived` counting it and nothing else;
//! 4. the write matrix (section 7): every refused call → 409
//!    `course-archived` with the database untouched; every allowed read or
//!    export → 200;
//! 5. scheduled assessments go back to draft (audited) and the publish-due
//!    sweep publishes nothing;
//! 6. the auto-submit sweep still finalizes an expired timed draft;
//! 7. nothing is released: upload `referenced_count` is unchanged;
//! 8. deleting an archived course takes the usual delete gate.
#![allow(clippy::unwrap_used, clippy::expect_used, clippy::panic)]

use ab_testkit::{MintedSession, TestApp, TestResponse};
use axum::body::Body;
use axum::http::{Request, StatusCode, header};
use sqlx::PgPool;

const STAFF_GRANTS: &[&str] = &[
    "course:create:platform",
    "course:read:all",
    "course:update:own",
    "course:delete:own",
    "assessment:*:own",
    "certificate:create:platform",
    "certificate:read:own",
    "certificate:update:own",
    "certificate:delete:own",
    "discussion:read:all",
    "discussion:create:platform",
    "discussion:update:own",
    "discussion:delete:own",
    "usergroup:create:platform",
    "usergroup:manage:platform",
    "usergroup:read:platform",
    "collection:create:platform",
    "collection:update:own",
    "collection:read:all",
    "analytics:read:assigned",
    "analytics:export:assigned",
    "file:create:own",
];

const LEARNER_GRANTS: &[&str] = &[
    "assessment:submit:assigned",
    "assessment:read:assigned",
    "trail:read:all",
    "trail:submit:assigned",
    "discussion:read:all",
    "discussion:create:platform",
    "discussion:update:own",
    "discussion:delete:own",
    "course:read:all",
];

async fn staff(app: &TestApp, name: &str) -> MintedSession {
    let user = app
        .create_user(name, &format!("{name}@example.com"), &["instructor"])
        .await;
    app.mint_session_for(user, STAFF_GRANTS).await
}

async fn learner(app: &TestApp, name: &str) -> MintedSession {
    let user = app
        .create_user(name, &format!("{name}@example.com"), &["user"])
        .await;
    app.mint_session_for(user, LEARNER_GRANTS).await
}

async fn create_course(app: &TestApp, session: &MintedSession, name: &str) -> String {
    let res = app
        .post_as(
            session,
            "/api/v2/courses",
            &serde_json::json!({ "name": name }),
        )
        .await;
    assert_eq!(res.status, StatusCode::CREATED, "{}", res.text());
    res.json()["id"].as_str().unwrap().to_owned()
}

async fn create_chapter(app: &TestApp, session: &MintedSession, course_id: &str) -> String {
    let res = app
        .post_as(
            session,
            &format!("/api/v2/courses/{course_id}/chapters"),
            &serde_json::json!({ "name": "Week 1" }),
        )
        .await;
    assert_eq!(res.status, StatusCode::CREATED, "{}", res.text());
    res.json()["id"].as_str().unwrap().to_owned()
}

/// A published lesson activity.
async fn lesson(app: &TestApp, teacher: &MintedSession, chapter_id: &str) -> String {
    let created = app
        .post_as(
            teacher,
            &format!("/api/v2/chapters/{chapter_id}/activities"),
            &serde_json::json!({ "name": "Intro", "activity_type": "dynamic",
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

/// A quiz with one choice item; returns (assessment_id, item_id). Published
/// unless `to` says otherwise (`scheduled` needs `scheduled_at_unix`).
async fn quiz(
    app: &TestApp,
    teacher: &MintedSession,
    chapter_id: &str,
    policy_patch: serde_json::Value,
    lifecycle: serde_json::Value,
) -> (String, String) {
    let created = app
        .post_as(
            teacher,
            "/api/v2/assessments",
            &serde_json::json!({ "chapter_id": chapter_id, "kind": "quiz", "title": "Quiz" }),
        )
        .await;
    assert_eq!(created.status, StatusCode::CREATED, "{}", created.text());
    let id = created.json()["id"].as_str().unwrap().to_owned();
    let item = app
        .post_as(
            teacher,
            &format!("/api/v2/assessments/{id}/items"),
            &choice_item("1+1?"),
        )
        .await;
    assert_eq!(item.status, StatusCode::CREATED, "{}", item.text());
    let item_id = item.json()["id"].as_str().unwrap().to_owned();
    let mut policy = created.json()["policy"].clone();
    for (key, value) in policy_patch.as_object().unwrap() {
        policy[key] = value.clone();
    }
    let policy_res = app
        .send(
            Request::builder()
                .method("PUT")
                .uri(format!("/api/v2/assessments/{id}/policy"))
                .header(header::CONTENT_TYPE, "application/json")
                .header(header::COOKIE, &teacher.cookie)
                .body(Body::from(policy.to_string()))
                .unwrap(),
        )
        .await;
    assert_eq!(policy_res.status, StatusCode::OK, "{}", policy_res.text());
    let moved = app
        .post_as(
            teacher,
            &format!("/api/v2/assessments/{id}/lifecycle"),
            &lifecycle,
        )
        .await;
    assert_eq!(moved.status, StatusCode::OK, "{}", moved.text());
    (id, item_id)
}

async fn lifecycle(
    app: &TestApp,
    session: &MintedSession,
    course_id: &str,
    action: &str,
) -> TestResponse {
    app.post_as(
        session,
        &format!("/api/v2/courses/{course_id}/lifecycle"),
        &serde_json::json!({ "action": action }),
    )
    .await
}

async fn archive(app: &TestApp, session: &MintedSession, course_id: &str) -> serde_json::Value {
    let res = lifecycle(app, session, course_id, "archive").await;
    assert_eq!(res.status, StatusCode::OK, "{}", res.text());
    res.json()
}

async fn enrol(app: &TestApp, session: &MintedSession, course_id: &str) {
    let res = app
        .post_as(
            session,
            &format!("/api/v2/trail/courses/{course_id}"),
            &serde_json::json!({}),
        )
        .await;
    assert_eq!(res.status, StatusCode::OK, "{}", res.text());
}

/// Open a quiz draft; returns (submission_id, draft_version).
async fn start_quiz(app: &TestApp, session: &MintedSession, quiz_id: &str) -> (String, i64) {
    let res = app
        .post_as(
            session,
            &format!("/api/v2/assessments/{quiz_id}/submissions"),
            &serde_json::json!({}),
        )
        .await;
    assert_eq!(res.status, StatusCode::CREATED, "{}", res.text());
    (
        res.json()["id"].as_str().unwrap().to_owned(),
        res.json()["draft_version"].as_i64().unwrap(),
    )
}

async fn catalogue(app: &TestApp, session: &MintedSession, path: &str) -> TestResponse {
    app.get_as(session, path).await
}

fn names(items: &serde_json::Value) -> Vec<String> {
    items
        .as_array()
        .unwrap()
        .iter()
        .map(|c| c["name"].as_str().unwrap().to_owned())
        .collect()
}

fn far_future() -> i64 {
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_secs();
    i64::try_from(now).unwrap() + 3600
}

// ── 1. lifecycle ────────────────────────────────────────────────────────

#[sqlx::test(migrations = "../../migrations")]
async fn archive_and_restore_lifecycle(pool: PgPool) {
    let app = TestApp::spawn(pool).await;
    let teacher = staff(&app, "teacher").await;
    let course_id = create_course(&app, &teacher, "Archive me").await;
    let chapter_id = create_chapter(&app, &teacher, &course_id).await;
    lesson(&app, &teacher, &chapter_id).await;
    let published = lifecycle(&app, &teacher, &course_id, "publish").await;
    assert_eq!(published.status, StatusCode::OK, "{}", published.text());
    assert!(published.json()["archived_at_unix"].is_null());

    let archived = archive(&app, &teacher, &course_id).await;
    assert!(archived["archived_at_unix"].is_i64());
    assert_eq!(archived["archived_by"], teacher.user_id.to_string());
    assert_eq!(archived["public"], true, "public is untouched");
    let archived_at = archived["archived_at_unix"].as_i64().unwrap();

    let again = lifecycle(&app, &teacher, &course_id, "archive").await;
    assert_eq!(again.status, StatusCode::CONFLICT, "{}", again.text());
    assert_eq!(again.json()["code"], "conflict");

    for action in ["publish", "unpublish"] {
        let refused = lifecycle(&app, &teacher, &course_id, action).await;
        assert_eq!(
            refused.status,
            StatusCode::CONFLICT,
            "{action}: {}",
            refused.text()
        );
        assert_eq!(refused.json()["code"], "course-archived");
        assert_eq!(refused.json()["details"]["archived_at_unix"], archived_at);
    }
    let still = app
        .get_as(&teacher, &format!("/api/v2/courses/{course_id}"))
        .await;
    assert_eq!(still.json()["public"], true);

    let restored = lifecycle(&app, &teacher, &course_id, "restore").await;
    assert_eq!(restored.status, StatusCode::OK, "{}", restored.text());
    assert!(restored.json()["archived_at_unix"].is_null());
    assert!(restored.json()["archived_by"].is_null());
    assert_eq!(restored.json()["public"], true, "restored as it was");
    let not_archived = lifecycle(&app, &teacher, &course_id, "restore").await;
    assert_eq!(not_archived.status, StatusCode::CONFLICT);
    assert_eq!(not_archived.json()["code"], "conflict");

    // A bogus action is a 422 on `action`.
    let bogus = lifecycle(&app, &teacher, &course_id, "freeze").await;
    assert_eq!(bogus.status, StatusCode::UNPROCESSABLE_ENTITY);
}

// ── 2. rights ───────────────────────────────────────────────────────────

async fn add_author(
    app: &TestApp,
    creator: &MintedSession,
    course_id: &str,
    name: &str,
    role: &str,
) -> MintedSession {
    let session = staff(app, name).await;
    let added = app
        .post_as(
            creator,
            &format!("/api/v2/courses/{course_id}/contributors"),
            &serde_json::json!({ "user_id": session.user_id, "role": role }),
        )
        .await;
    assert_eq!(added.status, StatusCode::CREATED, "{}", added.text());
    session
}

#[sqlx::test(migrations = "../../migrations")]
async fn roster_managers_archive_and_restore(pool: PgPool) {
    let app = TestApp::spawn(pool).await;
    let creator = staff(&app, "creator").await;
    let course_id = create_course(&app, &creator, "Rights").await;
    app.publish_course(&course_id).await;
    let maintainer = add_author(&app, &creator, &course_id, "maint", "maintainer").await;
    let contributor = add_author(&app, &creator, &course_id, "contrib", "contributor").await;
    let reporter = add_author(&app, &creator, &course_id, "reporter", "reporter").await;
    let alice = learner(&app, "alice").await;
    let admin_user = app
        .create_user("admin", "admin@example.com", &["admin"])
        .await;
    let admin = app
        .mint_session_for(admin_user, &["course:manage:platform", "course:read:all"])
        .await;
    let preview = format!("/api/v2/courses/{course_id}/archive-preview");

    for (who, session) in [
        ("contributor", &contributor),
        ("reporter", &reporter),
        ("learner", &alice),
    ] {
        let refused = lifecycle(&app, session, &course_id, "archive").await;
        assert_eq!(
            refused.status,
            StatusCode::FORBIDDEN,
            "{who}: {}",
            refused.text()
        );
        assert_eq!(
            app.get_as(session, &preview).await.status,
            StatusCode::FORBIDDEN
        );
    }
    assert_eq!(
        app.post_json(
            &format!("/api/v2/courses/{course_id}/lifecycle"),
            &serde_json::json!({ "action": "archive" })
        )
        .await
        .status,
        StatusCode::UNAUTHORIZED
    );

    let seen = app.get_as(&maintainer, &preview).await;
    assert_eq!(seen.status, StatusCode::OK, "{}", seen.text());
    assert_eq!(seen.json()["public"], true);
    assert_eq!(seen.json()["learners_enrolled"], 0);

    for (who, session) in [
        ("maintainer", &maintainer),
        ("admin", &admin),
        ("creator", &creator),
    ] {
        let archived = lifecycle(&app, session, &course_id, "archive").await;
        assert_eq!(
            archived.status,
            StatusCode::OK,
            "{who}: {}",
            archived.text()
        );
        assert_eq!(archived.json()["archived_by"], session.user_id.to_string());
        let restored = lifecycle(&app, session, &course_id, "restore").await;
        assert_eq!(
            restored.status,
            StatusCode::OK,
            "{who}: {}",
            restored.text()
        );
    }

    // Invisible course: 404, not 403 (no existence leak).
    let private = create_course(&app, &creator, "Private").await;
    let hidden = lifecycle(&app, &alice, &private, "archive").await;
    assert_eq!(hidden.status, StatusCode::NOT_FOUND, "{}", hidden.text());
    assert_eq!(
        app.get_as(
            &alice,
            &format!("/api/v2/courses/{private}/archive-preview")
        )
        .await
        .status,
        StatusCode::NOT_FOUND
    );
}

// ── 3. visibility ───────────────────────────────────────────────────────

#[sqlx::test(migrations = "../../migrations")]
async fn enrolled_learners_keep_a_private_archived_course(pool: PgPool) {
    let app = TestApp::spawn(pool).await;
    let teacher = staff(&app, "teacher").await;
    let alice = learner(&app, "alice").await;
    let carol = learner(&app, "carol").await;
    let course_id = create_course(&app, &teacher, "Private history").await;
    let chapter_id = create_chapter(&app, &teacher, &course_id).await;
    lesson(&app, &teacher, &chapter_id).await;
    let published = lifecycle(&app, &teacher, &course_id, "publish").await;
    assert_eq!(published.status, StatusCode::OK, "{}", published.text());
    enrol(&app, &alice, &course_id).await;

    // BUG-183 as it is: an unpublished course hides from its learners.
    let unpublished = lifecycle(&app, &teacher, &course_id, "unpublish").await;
    assert_eq!(unpublished.status, StatusCode::OK, "{}", unpublished.text());
    let path = format!("/api/v2/courses/{course_id}");
    assert_eq!(
        app.get_as(&alice, &path).await.status,
        StatusCode::NOT_FOUND
    );

    // Archived: the enrolled learner reads it again, the outsider does not.
    let archived = archive(&app, &teacher, &course_id).await;
    assert_eq!(archived["public"], false);
    let mine = app.get_as(&alice, &path).await;
    assert_eq!(mine.status, StatusCode::OK, "{}", mine.text());
    assert!(mine.json()["archived_at_unix"].is_i64());
    let trail = app.get_as(&alice, "/api/v2/trail").await;
    let runs = trail.json()["runs"].as_array().unwrap().clone();
    assert_eq!(runs.len(), 1);
    assert_eq!(runs[0]["course_id"], course_id);
    assert!(runs[0]["course"]["archived_at_unix"].is_i64());
    assert_eq!(
        app.get_as(&carol, &path).await.status,
        StatusCode::NOT_FOUND
    );
    assert_eq!(app.get(&path).await.status, StatusCode::NOT_FOUND);
}

#[sqlx::test(migrations = "../../migrations")]
async fn a_public_archived_course_is_undiscoverable(pool: PgPool) {
    let app = TestApp::spawn(pool).await;
    let teacher = staff(&app, "author").await;
    let alice = learner(&app, "alice").await;
    let course_id = create_course(&app, &teacher, "Rustacean archive").await;
    let chapter_id = create_chapter(&app, &teacher, &course_id).await;
    lesson(&app, &teacher, &chapter_id).await;
    let (quiz_id, _) = quiz(
        &app,
        &teacher,
        &chapter_id,
        serde_json::json!({}),
        serde_json::json!({ "to": "published" }),
    )
    .await;
    app.publish_course(&course_id).await;
    let active = create_course(&app, &teacher, "Rustacean active").await;
    app.publish_course(&active).await;
    let collection = app
        .post_as(
            &teacher,
            "/api/v2/collections",
            &serde_json::json!({ "name": "Rustacean pack", "public": true,
                                  "courses": [course_id, active] }),
        )
        .await;
    assert_eq!(
        collection.status,
        StatusCode::CREATED,
        "{}",
        collection.text()
    );
    let collection_id = collection.json()["id"].as_str().unwrap().to_owned();
    enrol(&app, &alice, &course_id).await;
    start_quiz(&app, &alice, &quiz_id).await;

    let before = catalogue(&app, &alice, "/api/v2/courses").await;
    assert_eq!(names(&before.json()["items"]).len(), 2);
    let work = catalogue(&app, &alice, "/api/v2/work").await;
    assert_eq!(work.json()["items"].as_array().unwrap().len(), 1);

    archive(&app, &teacher, &course_id).await;

    let listed = catalogue(&app, &alice, "/api/v2/courses").await;
    assert_eq!(names(&listed.json()["items"]), ["Rustacean active"]);
    let searched = catalogue(&app, &alice, "/api/v2/search?q=rustacean").await;
    assert_eq!(names(&searched.json()["courses"]), ["Rustacean active"]);
    let profile = catalogue(&app, &alice, "/api/v2/users/author/courses").await;
    assert_eq!(names(&profile.json()["items"]), ["Rustacean active"]);
    let contents = catalogue(
        &app,
        &alice,
        &format!("/api/v2/collections/{collection_id}"),
    )
    .await;
    assert_eq!(names(&contents.json()["courses"]), ["Rustacean active"]);
    let owner_view = catalogue(
        &app,
        &teacher,
        &format!("/api/v2/collections/{collection_id}"),
    )
    .await;
    assert_eq!(
        names(&owner_view.json()["courses"]),
        ["Rustacean archive", "Rustacean active"],
        "the collection's creator still sees the archived member"
    );
    let work = catalogue(&app, &alice, "/api/v2/work").await;
    assert!(
        work.json()["items"].as_array().unwrap().is_empty(),
        "{}",
        work.text()
    );
    // Still reachable by its link, run and all.
    assert_eq!(
        catalogue(&app, &alice, &format!("/api/v2/courses/{course_id}"))
            .await
            .status,
        StatusCode::OK
    );

    // The workspace archive view.
    let mine = catalogue(&app, &teacher, "/api/v2/courses?mine=true").await;
    assert_eq!(names(&mine.json()["items"]), ["Rustacean active"]);
    assert_eq!(mine.json()["summary"]["total"], 1);
    assert_eq!(mine.json()["summary"]["ready"], 1);
    assert_eq!(mine.json()["summary"]["archived"], 1);
    let archived = catalogue(&app, &teacher, "/api/v2/courses?mine=true&preset=archived").await;
    assert_eq!(names(&archived.json()["items"]), ["Rustacean archive"]);
    assert!(archived.json()["items"][0]["archived_at_unix"].is_i64());
    let refused = catalogue(&app, &teacher, "/api/v2/courses?preset=archived").await;
    assert_eq!(
        refused.status,
        StatusCode::UNPROCESSABLE_ENTITY,
        "{}",
        refused.text()
    );
    assert_eq!(refused.json()["field_errors"][0]["field"], "preset");
}

// ── 4. the write matrix ─────────────────────────────────────────────────

/// Every row of the tables a course owns, as text, so a refused call that
/// wrote anything shows up (BUG-186 pattern, whole-database edition).
async fn fingerprint(pool: &PgPool) -> Vec<String> {
    const TABLES: &[&str] = &[
        "courses",
        "chapters",
        "activities",
        "blocks",
        "assessments",
        "assessment_items",
        "assessment_access_users",
        "assessment_overrides",
        "submissions",
        "grading_entries",
        "file_submissions",
        "file_submission_attempts",
        "course_discussions",
        "discussion_reactions",
        "certifications",
        "resource_authors",
        "usergroup_courses",
        "collection_courses",
        "trail_runs",
        "trail_steps",
        "course_updates",
        "bulk_actions",
        "ai_runs",
        "ai_threads",
        "teacher_interventions",
        "code_runs",
        "uploads",
    ];
    let mut out = Vec::with_capacity(TABLES.len());
    for table in TABLES {
        // SAFETY: `table` comes from the constant list above, never from input.
        let digest: String = sqlx::query_scalar(sqlx::AssertSqlSafe(format!(
            "SELECT md5(coalesce(string_agg(t::text, ',' ORDER BY t::text), '')) FROM {table} t"
        )))
        .fetch_one(pool)
        .await
        .unwrap();
        out.push(format!("{table}:{digest}"));
    }
    out
}

struct Call<'a> {
    label: &'static str,
    method: &'static str,
    path: String,
    body: Option<serde_json::Value>,
    session: &'a MintedSession,
    if_match: Option<String>,
}

impl<'a> Call<'a> {
    const fn new(
        label: &'static str,
        method: &'static str,
        path: String,
        session: &'a MintedSession,
    ) -> Self {
        Self {
            label,
            method,
            path,
            body: None,
            session,
            if_match: None,
        }
    }

    fn body(mut self, body: serde_json::Value) -> Self {
        self.body = Some(body);
        self
    }

    fn if_match(mut self, version: i64) -> Self {
        self.if_match = Some(version.to_string());
        self
    }

    async fn send(&self, app: &TestApp) -> TestResponse {
        let mut builder = Request::builder()
            .method(self.method)
            .uri(format!("/api/v2{}", self.path))
            .header(header::COOKIE, &self.session.cookie);
        if let Some(version) = &self.if_match {
            builder = builder.header(header::IF_MATCH, version);
        }
        let body = match &self.body {
            Some(body) => {
                builder = builder.header(header::CONTENT_TYPE, "application/json");
                Body::from(body.to_string())
            }
            None => Body::empty(),
        };
        app.send(builder.body(body).unwrap()).await
    }
}

#[sqlx::test(migrations = "../../migrations")]
async fn archived_course_is_read_only_for_everyone(pool: PgPool) {
    let app = TestApp::spawn(pool.clone()).await;
    let teacher = staff(&app, "teacher").await;
    let alice = learner(&app, "alice").await;
    let bob = learner(&app, "bob").await;
    let carol = learner(&app, "carol").await;

    // A course with one of everything.
    let course_id = create_course(&app, &teacher, "Everything").await;
    let chapter_id = create_chapter(&app, &teacher, &course_id).await;
    let lesson_id = lesson(&app, &teacher, &chapter_id).await;
    let (quiz_id, item_id) = quiz(
        &app,
        &teacher,
        &chapter_id,
        serde_json::json!({}),
        serde_json::json!({ "to": "published" }),
    )
    .await;
    app.publish_course(&course_id).await;
    let maintainer = add_author(&app, &teacher, &course_id, "maint", "maintainer").await;
    let file_sub = app
        .post_as(
            &teacher,
            "/api/v2/file-submissions",
            &serde_json::json!({ "chapter_id": chapter_id, "title": "Essay PDF",
                                  "instructions": "Upload your essay as a PDF." }),
        )
        .await;
    assert_eq!(file_sub.status, StatusCode::CREATED, "{}", file_sub.text());
    let file_id = file_sub.json()["id"].as_str().unwrap().to_owned();
    let published = app
        .post_as(
            &teacher,
            &format!("/api/v2/file-submissions/{file_id}/publish"),
            &serde_json::json!({}),
        )
        .await;
    assert_eq!(published.status, StatusCode::OK, "{}", published.text());
    let update = app
        .post_as(
            &teacher,
            &format!("/api/v2/courses/{course_id}/updates"),
            &serde_json::json!({ "title": "Welcome", "content": "Hi" }),
        )
        .await;
    assert_eq!(update.status, StatusCode::CREATED, "{}", update.text());
    let update_id = update.json()["id"].as_str().unwrap().to_owned();
    let cert = app
        .post_as(
            &teacher,
            "/api/v2/certifications",
            &serde_json::json!({ "course_id": course_id,
                                  "config": { "template": "classic", "title": "Certified" } }),
        )
        .await;
    assert_eq!(cert.status, StatusCode::CREATED, "{}", cert.text());
    let cert_id = cert.json()["id"].as_str().unwrap().to_owned();
    let group = app
        .post_as(
            &teacher,
            "/api/v2/usergroups",
            &serde_json::json!({ "name": "Cohort", "description": "" }),
        )
        .await;
    assert_eq!(group.status, StatusCode::CREATED, "{}", group.text());
    let group_id = group.json()["id"].as_str().unwrap().to_owned();
    let linked = app
        .post_as(
            &teacher,
            &format!("/api/v2/usergroups/{group_id}/courses"),
            &serde_json::json!({ "course_ids": [course_id] }),
        )
        .await;
    assert_eq!(linked.status, StatusCode::NO_CONTENT, "{}", linked.text());
    let with = app
        .post_as(
            &teacher,
            "/api/v2/collections",
            &serde_json::json!({ "name": "With", "public": true, "courses": [course_id] }),
        )
        .await;
    assert_eq!(with.status, StatusCode::CREATED, "{}", with.text());
    let with_id = with.json()["id"].as_str().unwrap().to_owned();
    let without = app
        .post_as(
            &teacher,
            "/api/v2/collections",
            &serde_json::json!({ "name": "Without", "public": true, "courses": [] }),
        )
        .await;
    assert_eq!(without.status, StatusCode::CREATED, "{}", without.text());
    let without_id = without.json()["id"].as_str().unwrap().to_owned();

    // Learners: alice has an open draft and a post, bob a hand-in.
    enrol(&app, &alice, &course_id).await;
    enrol(&app, &bob, &course_id).await;
    let (draft_id, draft_version) = start_quiz(&app, &alice, &quiz_id).await;
    let (bob_sub, _) = start_quiz(&app, &bob, &quiz_id).await;
    let handed_in = app
        .post_as(
            &bob,
            &format!("/api/v2/submissions/{bob_sub}/submit"),
            &serde_json::json!({ "answers": { &item_id: { "kind": "choice", "selected": ["a"] } } }),
        )
        .await;
    assert_eq!(handed_in.status, StatusCode::OK, "{}", handed_in.text());
    let post = app
        .post_as(
            &alice,
            &format!("/api/v2/courses/{course_id}/discussions"),
            &serde_json::json!({ "content": "<p>Is recursion covered?</p>" }),
        )
        .await;
    assert_eq!(post.status, StatusCode::CREATED, "{}", post.text());
    let post_id = post.json()["id"].as_str().unwrap().to_owned();

    // The preview counts what the archive will freeze.
    let preview = app
        .get_as(
            &teacher,
            &format!("/api/v2/courses/{course_id}/archive-preview"),
        )
        .await;
    assert_eq!(preview.status, StatusCode::OK, "{}", preview.text());
    assert_eq!(preview.json()["learners_enrolled"], 2);
    assert_eq!(preview.json()["learners_in_progress"], 2);
    assert_eq!(preview.json()["open_attempts"], 1);
    assert_eq!(preview.json()["scheduled_assessments"], 0);
    assert_eq!(preview.json()["public"], true);

    let archived = archive(&app, &teacher, &course_id).await;
    let archived_at = archived["archived_at_unix"].as_i64().unwrap();
    let before = fingerprint(&pool).await;

    let c = |label, method, path: String, session| Call::new(label, method, path, session);
    let refused: Vec<Call> = vec![
        // Course
        c(
            "patch course",
            "PATCH",
            format!("/courses/{course_id}"),
            &teacher,
        )
        .body(serde_json::json!({ "name": "Renamed" })),
        c(
            "publish",
            "POST",
            format!("/courses/{course_id}/lifecycle"),
            &teacher,
        )
        .body(serde_json::json!({ "action": "unpublish" })),
        c(
            "post update",
            "POST",
            format!("/courses/{course_id}/updates"),
            &teacher,
        )
        .body(serde_json::json!({ "title": "t", "content": "c" })),
        c(
            "edit update",
            "PATCH",
            format!("/course-updates/{update_id}"),
            &teacher,
        )
        .body(serde_json::json!({ "title": "t2" })),
        c(
            "delete update",
            "DELETE",
            format!("/course-updates/{update_id}"),
            &teacher,
        ),
        // Curriculum
        c(
            "add chapter",
            "POST",
            format!("/courses/{course_id}/chapters"),
            &teacher,
        )
        .body(serde_json::json!({ "name": "Week 2" })),
        c(
            "rename chapter",
            "PATCH",
            format!("/chapters/{chapter_id}"),
            &teacher,
        )
        .body(serde_json::json!({ "name": "Renamed" })),
        c(
            "move chapter",
            "POST",
            format!("/chapters/{chapter_id}/move"),
            &teacher,
        )
        .body(serde_json::json!({ "position": 1 })),
        c(
            "delete chapter",
            "DELETE",
            format!("/chapters/{chapter_id}"),
            &teacher,
        ),
        c(
            "add activity",
            "POST",
            format!("/chapters/{chapter_id}/activities"),
            &teacher,
        )
        .body(
            serde_json::json!({ "name": "New", "activity_type": "dynamic",
                                      "activity_sub_type": "dynamic_page" }),
        ),
        c(
            "rename activity",
            "PATCH",
            format!("/activities/{lesson_id}"),
            &teacher,
        )
        .body(serde_json::json!({ "name": "Renamed" })),
        c(
            "move activity",
            "POST",
            format!("/activities/{lesson_id}/move"),
            &teacher,
        )
        .body(serde_json::json!({ "position": 1 })),
        c(
            "delete activity",
            "DELETE",
            format!("/activities/{lesson_id}"),
            &teacher,
        ),
        c(
            "add block",
            "POST",
            format!("/activities/{lesson_id}/blocks"),
            &teacher,
        )
        .body(serde_json::json!({})),
        // Assessments
        c(
            "create assessment",
            "POST",
            "/assessments".to_owned(),
            &teacher,
        )
        .body(serde_json::json!({ "chapter_id": chapter_id, "kind": "quiz", "title": "Q2" })),
        c(
            "patch assessment",
            "PATCH",
            format!("/assessments/{quiz_id}"),
            &teacher,
        )
        .body(serde_json::json!({ "title": "Renamed" })),
        c(
            "put policy",
            "PUT",
            format!("/assessments/{quiz_id}/policy"),
            &teacher,
        )
        .body(serde_json::json!({})),
        c(
            "assessment lifecycle",
            "POST",
            format!("/assessments/{quiz_id}/lifecycle"),
            &teacher,
        )
        .body(serde_json::json!({ "to": "archived" })),
        c(
            "duplicate",
            "POST",
            format!("/assessments/{quiz_id}/duplicate"),
            &teacher,
        )
        .body(serde_json::json!({})),
        c(
            "add item",
            "POST",
            format!("/assessments/{quiz_id}/items"),
            &teacher,
        )
        .body(choice_item("2+2?")),
        c(
            "patch item",
            "PATCH",
            format!("/assessment-items/{item_id}"),
            &teacher,
        )
        .body(serde_json::json!({ "title": "Renamed" })),
        c(
            "delete item",
            "DELETE",
            format!("/assessment-items/{item_id}"),
            &teacher,
        ),
        c(
            "reorder items",
            "POST",
            format!("/assessments/{quiz_id}/items/reorder"),
            &teacher,
        )
        .body(serde_json::json!({ "item_ids": [item_id] })),
        c(
            "put access",
            "PUT",
            format!("/assessments/{quiz_id}/access"),
            &teacher,
        )
        .body(serde_json::json!({ "mode": "restricted", "user_ids": [alice.user_id] })),
        c(
            "create override",
            "POST",
            format!("/assessments/{quiz_id}/overrides/{}", alice.user_id),
            &teacher,
        )
        .body(serde_json::json!({ "max_attempts_override": 11 })),
        c(
            "update override",
            "PUT",
            format!("/assessments/{quiz_id}/overrides/{}", alice.user_id),
            &teacher,
        )
        .body(serde_json::json!({ "max_attempts_override": 12 })),
        c(
            "delete override",
            "DELETE",
            format!("/assessments/{quiz_id}/overrides/{}", alice.user_id),
            &teacher,
        ),
        c(
            "reference check",
            "POST",
            format!("/assessments/{quiz_id}/reference-check"),
            &teacher,
        ),
        c(
            "create file submission",
            "POST",
            "/file-submissions".to_owned(),
            &teacher,
        )
        .body(serde_json::json!({ "chapter_id": chapter_id, "title": "Essay 2" })),
        c(
            "patch file submission",
            "PATCH",
            format!("/file-submissions/{file_id}"),
            &teacher,
        )
        .body(serde_json::json!({ "title": "Renamed" })),
        c(
            "publish file submission",
            "POST",
            format!("/file-submissions/{file_id}/publish"),
            &teacher,
        )
        .body(serde_json::json!({})),
        // Learner attempts (and the staff preview)
        c(
            "start quiz",
            "POST",
            format!("/assessments/{quiz_id}/submissions"),
            &alice,
        )
        .body(serde_json::json!({})),
        c(
            "start preview",
            "POST",
            format!("/assessments/{quiz_id}/submissions"),
            &teacher,
        )
        .body(serde_json::json!({})),
        c(
            "save draft",
            "PATCH",
            format!("/submissions/{draft_id}/draft"),
            &alice,
        )
        .body(serde_json::json!({ "answers": {} }))
        .if_match(draft_version),
        c(
            "report violation",
            "POST",
            format!("/submissions/{draft_id}/violations"),
            &alice,
        )
        .body(serde_json::json!({ "kind": "tab_switch" })),
        c(
            "submit",
            "POST",
            format!("/submissions/{draft_id}/submit"),
            &alice,
        )
        .body(serde_json::json!({})),
        c(
            "run code",
            "POST",
            format!("/assessment-items/{item_id}/runs"),
            &alice,
        )
        .body(serde_json::json!({})),
        c(
            "start file draft",
            "POST",
            format!("/file-submissions/{file_id}/draft"),
            &alice,
        )
        .body(serde_json::json!({})),
        c(
            "save file draft",
            "PATCH",
            format!("/file-submissions/{file_id}/draft"),
            &alice,
        )
        .body(serde_json::json!({ "files": [] })),
        c(
            "submit files",
            "POST",
            format!("/file-submissions/{file_id}/submit"),
            &alice,
        )
        .body(serde_json::json!({})),
        // Grading [P2]
        c(
            "save grade",
            "PATCH",
            format!("/submissions/{bob_sub}/grade"),
            &teacher,
        )
        .body(serde_json::json!({})),
        c(
            "publish grades",
            "POST",
            format!("/assessments/{quiz_id}/publish-grades"),
            &teacher,
        ),
        c(
            "extend deadline",
            "POST",
            format!("/assessments/{quiz_id}/deadline-extensions"),
            &teacher,
        )
        .body(serde_json::json!({ "user_ids": [bob.user_id], "new_due_at_unix": far_future() })),
        // Progress
        c(
            "enrol",
            "POST",
            format!("/trail/courses/{course_id}"),
            &carol,
        )
        .body(serde_json::json!({})),
        c(
            "leave",
            "DELETE",
            format!("/trail/courses/{course_id}"),
            &alice,
        ),
        c(
            "mark activity",
            "POST",
            format!("/trail/activities/{lesson_id}"),
            &alice,
        )
        .body(serde_json::json!({})),
        c(
            "unmark activity",
            "DELETE",
            format!("/trail/activities/{lesson_id}"),
            &alice,
        ),
        // Discussions
        c(
            "post discussion",
            "POST",
            format!("/courses/{course_id}/discussions"),
            &alice,
        )
        .body(serde_json::json!({ "content": "<p>Again?</p>" })),
        c(
            "edit discussion",
            "PATCH",
            format!("/discussions/{post_id}"),
            &alice,
        )
        .body(serde_json::json!({ "content": "<p>Edited</p>" })),
        c(
            "delete discussion",
            "DELETE",
            format!("/discussions/{post_id}"),
            &alice,
        ),
        c(
            "like discussion",
            "PUT",
            format!("/discussions/{post_id}/like"),
            &bob,
        ),
        // Certificates
        c(
            "create certification",
            "POST",
            "/certifications".to_owned(),
            &teacher,
        )
        .body(serde_json::json!({ "course_id": course_id, "config": { "template": "classic" } })),
        c(
            "update certification",
            "PATCH",
            format!("/certifications/{cert_id}"),
            &teacher,
        )
        .body(serde_json::json!({ "config": { "template": "modern" } })),
        c(
            "delete certification",
            "DELETE",
            format!("/certifications/{cert_id}"),
            &teacher,
        ),
        // Roster [P3]
        c(
            "add contributor",
            "POST",
            format!("/courses/{course_id}/contributors"),
            &teacher,
        )
        .body(serde_json::json!({ "user_id": carol.user_id, "role": "contributor" })),
        c(
            "change contributor",
            "PATCH",
            format!("/courses/{course_id}/contributors/{}", maintainer.user_id),
            &teacher,
        )
        .body(serde_json::json!({ "role": "contributor" })),
        c(
            "remove contributor",
            "DELETE",
            format!("/courses/{course_id}/contributors/{}", maintainer.user_id),
            &teacher,
        ),
        c(
            "apply",
            "POST",
            format!("/courses/{course_id}/contributors/apply"),
            &carol,
        ),
        // Cohorts [P3]
        c(
            "link cohort",
            "POST",
            format!("/usergroups/{group_id}/courses"),
            &teacher,
        )
        .body(serde_json::json!({ "course_ids": [course_id] })),
        c(
            "unlink cohort",
            "DELETE",
            format!("/usergroups/{group_id}/courses"),
            &teacher,
        )
        .body(serde_json::json!({ "course_ids": [course_id] })),
        // Collections: attaching anew
        c(
            "create collection with it",
            "POST",
            "/collections".to_owned(),
            &teacher,
        )
        .body(serde_json::json!({ "name": "New", "public": true, "courses": [course_id] })),
        c(
            "attach to collection",
            "PATCH",
            format!("/collections/{without_id}"),
            &teacher,
        )
        .body(serde_json::json!({ "courses": [course_id] })),
        // AI
        c(
            "qa chat",
            "POST",
            format!("/ai/qa/{course_id}/chat"),
            &alice,
        )
        .body(serde_json::json!({})),
        c(
            "study ask",
            "POST",
            format!("/ai/study/{course_id}/ask"),
            &alice,
        )
        .body(serde_json::json!({})),
        c(
            "course analysis",
            "POST",
            format!("/ai/course-analysis/{course_id}/analyze"),
            &teacher,
        )
        .body(serde_json::json!({})),
        c(
            "lecture critique",
            "POST",
            format!("/ai/lecture-authoring/{course_id}/critique"),
            &teacher,
        )
        .body(serde_json::json!({})),
        // Analytics
        c(
            "intervention",
            "POST",
            "/analytics/teacher/interventions".to_owned(),
            &teacher,
        )
        .body(
            serde_json::json!({ "user_id": bob.user_id, "course_id": course_id,
                                      "intervention_type": "message_sent" }),
        ),
    ];
    for call in &refused {
        let res = call.send(&app).await;
        assert_eq!(
            res.status,
            StatusCode::CONFLICT,
            "{}: {} {} -> {}",
            call.label,
            call.method,
            call.path,
            res.text()
        );
        assert_eq!(res.json()["code"], "course-archived", "{}", call.label);
        assert_eq!(
            res.json()["details"]["archived_at_unix"],
            archived_at,
            "{}",
            call.label
        );
    }
    assert_eq!(
        fingerprint(&pool).await,
        before,
        "a refused call wrote something"
    );

    let allowed: Vec<Call> = vec![
        c("course", "GET", format!("/courses/{course_id}"), &alice),
        c(
            "readiness",
            "GET",
            format!("/courses/{course_id}/readiness"),
            &teacher,
        ),
        c(
            "curriculum",
            "GET",
            format!("/courses/{course_id}/curriculum"),
            &teacher,
        ),
        c(
            "activity",
            "GET",
            format!("/activities/{lesson_id}"),
            &alice,
        ),
        c(
            "updates",
            "GET",
            format!("/courses/{course_id}/updates"),
            &alice,
        ),
        c(
            "contributors",
            "GET",
            format!("/courses/{course_id}/contributors"),
            &alice,
        ),
        c(
            "usergroups",
            "GET",
            format!("/courses/{course_id}/usergroups"),
            &teacher,
        ),
        c(
            "certifications",
            "GET",
            format!("/courses/{course_id}/certifications"),
            &teacher,
        ),
        c(
            "my certificate",
            "GET",
            format!("/courses/{course_id}/certificates/me"),
            &alice,
        ),
        c(
            "my certificates",
            "GET",
            "/me/certificates".to_owned(),
            &alice,
        ),
        c(
            "archive preview",
            "GET",
            format!("/courses/{course_id}/archive-preview"),
            &teacher,
        ),
        c(
            "assessments",
            "GET",
            format!("/courses/{course_id}/assessments"),
            &teacher,
        ),
        c(
            "assessment",
            "GET",
            format!("/assessments/{quiz_id}"),
            &teacher,
        ),
        c(
            "assessment readiness",
            "GET",
            format!("/assessments/{quiz_id}/readiness"),
            &teacher,
        ),
        c(
            "audit",
            "GET",
            format!("/assessments/{quiz_id}/audit"),
            &teacher,
        ),
        c(
            "access",
            "GET",
            format!("/assessments/{quiz_id}/access"),
            &teacher,
        ),
        c(
            "overrides",
            "GET",
            format!("/assessments/{quiz_id}/overrides"),
            &teacher,
        ),
        c(
            "review queue",
            "GET",
            format!("/assessments/{quiz_id}/submissions"),
            &teacher,
        ),
        c(
            "stats",
            "GET",
            format!("/assessments/{quiz_id}/submissions/stats"),
            &teacher,
        ),
        c(
            "export csv",
            "GET",
            format!("/assessments/{quiz_id}/submissions/export"),
            &teacher,
        ),
        c(
            "review",
            "GET",
            format!("/submissions/{bob_sub}/review"),
            &teacher,
        ),
        c(
            "grading history",
            "GET",
            format!("/submissions/{bob_sub}/grading-history"),
            &teacher,
        ),
        c(
            "gradebook",
            "GET",
            format!("/courses/{course_id}/gradebook"),
            &teacher,
        ),
        c(
            "gradebook csv",
            "GET",
            format!("/courses/{course_id}/gradebook/export"),
            &teacher,
        ),
        c(
            "file review queue",
            "GET",
            format!("/file-submissions/{file_id}/submissions"),
            &teacher,
        ),
        c(
            "file export",
            "GET",
            format!("/file-submissions/{file_id}/submissions/export"),
            &teacher,
        ),
        c(
            "file submission",
            "GET",
            format!("/file-submissions/{file_id}"),
            &alice,
        ),
        c(
            "my file attempts",
            "GET",
            format!("/file-submissions/{file_id}/me"),
            &alice,
        ),
        c(
            "attempt state",
            "GET",
            format!("/assessments/{quiz_id}/attempt-state"),
            &alice,
        ),
        c(
            "my draft",
            "GET",
            format!("/submissions/{draft_id}"),
            &alice,
        ),
        c(
            "my submissions",
            "GET",
            format!("/assessments/{quiz_id}/submissions/me"),
            &bob,
        ),
        c(
            "feedback",
            "GET",
            format!("/submissions/{bob_sub}/feedback"),
            &bob,
        ),
        c(
            "learner state",
            "GET",
            format!("/courses/{course_id}/learner-state"),
            &alice,
        ),
        c("trail", "GET", "/trail".to_owned(), &alice),
        c(
            "discussions",
            "GET",
            format!("/courses/{course_id}/discussions"),
            &alice,
        ),
        c(
            "collection",
            "GET",
            format!("/collections/{with_id}"),
            &teacher,
        ),
        c(
            "qa threads",
            "GET",
            format!("/ai/qa/{course_id}/threads"),
            &alice,
        ),
        c(
            "latest analysis",
            "GET",
            format!("/ai/course-analysis/{course_id}/latest"),
            &teacher,
        ),
        c(
            "lecture reviews",
            "GET",
            format!("/ai/lecture-authoring/{course_id}/reviews"),
            &teacher,
        ),
        c(
            "analytics course",
            "GET",
            format!("/analytics/teacher/courses/{course_id}"),
            &teacher,
        ),
        c(
            "analytics export",
            "GET",
            format!("/analytics/teacher/exports/course-progress.csv?course_ids={course_id}"),
            &teacher,
        ),
    ];
    for call in &allowed {
        let res = call.send(&app).await;
        assert_eq!(
            res.status,
            StatusCode::OK,
            "{}: {} {} -> {}",
            call.label,
            call.method,
            call.path,
            res.text()
        );
    }
    // The learner UI knows before clicking.
    let state = app
        .get_as(
            &alice,
            &format!("/api/v2/assessments/{quiz_id}/attempt-state"),
        )
        .await;
    assert_eq!(state.json()["can_continue"], false);
    assert_eq!(state.json()["disabled_reasons"][0], "COURSE_ARCHIVED");
    let file_view = app
        .get_as(&alice, &format!("/api/v2/file-submissions/{file_id}"))
        .await;
    assert_eq!(file_view.json()["disabled_reasons"][0], "COURSE_ARCHIVED");
    let learner_state = app
        .get_as(
            &alice,
            &format!("/api/v2/courses/{course_id}/learner-state"),
        )
        .await;
    assert_eq!(learner_state.json()["permissions"]["can_enroll"], false);
    assert_eq!(
        learner_state.json()["permissions"]["denial_reason"],
        "course_archived"
    );
    assert!(learner_state.json()["next_action"].is_null());
    assert_eq!(learner_state.json()["enrolled"], true);
    let carol_state = app
        .get_as(
            &carol,
            &format!("/api/v2/courses/{course_id}/learner-state"),
        )
        .await;
    assert_eq!(carol_state.json()["permissions"]["can_enroll"], false);
    assert_eq!(fingerprint(&pool).await, before, "a read wrote something");

    // Allowed writes on other aggregates: dropping the course from a
    // collection (that is the collection's write), keeping it is fine too.
    let kept = app
        .patch_as(
            &teacher,
            &format!("/api/v2/collections/{with_id}"),
            &serde_json::json!({ "courses": [course_id] }),
        )
        .await;
    assert_eq!(kept.status, StatusCode::OK, "{}", kept.text());
    let dropped = app
        .patch_as(
            &teacher,
            &format!("/api/v2/collections/{with_id}"),
            &serde_json::json!({ "courses": [] }),
        )
        .await;
    assert_eq!(dropped.status, StatusCode::OK, "{}", dropped.text());

    // 8. Delete keeps its own gate: the maintainer cannot, the creator can.
    let path = format!("/api/v2/courses/{course_id}");
    assert_eq!(
        app.delete_as(&maintainer, &path).await.status,
        StatusCode::FORBIDDEN
    );
    assert_eq!(
        app.delete_as(&teacher, &path).await.status,
        StatusCode::NO_CONTENT
    );
    assert_eq!(
        app.get_as(&teacher, &path).await.status,
        StatusCode::NOT_FOUND
    );
}

// ── 5. scheduled → draft ────────────────────────────────────────────────

#[sqlx::test(migrations = "../../migrations")]
async fn archive_unschedules_assessments_and_the_sweep_publishes_nothing(pool: PgPool) {
    let app = TestApp::spawn(pool).await;
    let teacher = staff(&app, "teacher").await;
    let course_id = create_course(&app, &teacher, "Scheduled").await;
    let chapter_id = create_chapter(&app, &teacher, &course_id).await;
    let (quiz_id, _) = quiz(
        &app,
        &teacher,
        &chapter_id,
        serde_json::json!({}),
        serde_json::json!({ "to": "scheduled", "scheduled_at_unix": far_future() }),
    )
    .await;
    // The schedule falls due while nobody looks, then the course is archived.
    sqlx::query("UPDATE assessments SET scheduled_at = now() - interval '1 minute' WHERE id = $1")
        .bind(uuid::Uuid::parse_str(&quiz_id).unwrap())
        .execute(&app.pool)
        .await
        .unwrap();
    let preview = app
        .get_as(
            &teacher,
            &format!("/api/v2/courses/{course_id}/archive-preview"),
        )
        .await;
    assert_eq!(preview.json()["scheduled_assessments"], 1);

    archive(&app, &teacher, &course_id).await;
    let detail = app
        .get_as(&teacher, &format!("/api/v2/assessments/{quiz_id}"))
        .await;
    assert_eq!(detail.json()["lifecycle"], "draft", "{}", detail.text());
    assert!(detail.json()["scheduled_at_unix"].is_null());
    let audit = app
        .get_as(&teacher, &format!("/api/v2/assessments/{quiz_id}/audit"))
        .await;
    assert_eq!(audit.status, StatusCode::OK, "{}", audit.text());
    let events = audit.json();
    let unscheduled = events
        .as_array()
        .unwrap()
        .iter()
        .find(|e| e["payload"]["note"] == "course archived")
        .unwrap_or_else(|| panic!("no archive audit event: {events}"));
    assert_eq!(unscheduled["event"], "lifecycle-transition");
    assert_eq!(unscheduled["payload"]["to"], "draft");

    let published = ab_domain::assessments::AssessmentsService::publish_due(&app.pool)
        .await
        .unwrap();
    assert_eq!(published, 0);
    let detail = app
        .get_as(&teacher, &format!("/api/v2/assessments/{quiz_id}"))
        .await;
    assert_eq!(detail.json()["lifecycle"], "draft");

    // Restored: still a draft - the author reschedules by hand.
    let restored = lifecycle(&app, &teacher, &course_id, "restore").await;
    assert_eq!(restored.status, StatusCode::OK, "{}", restored.text());
    let detail = app
        .get_as(&teacher, &format!("/api/v2/assessments/{quiz_id}"))
        .await;
    assert_eq!(detail.json()["lifecycle"], "draft");
}

// ── 6. auto-submit ──────────────────────────────────────────────────────

#[sqlx::test(migrations = "../../migrations")]
async fn the_timer_sweep_still_finalizes_expired_drafts(pool: PgPool) {
    let app = TestApp::spawn(pool).await;
    let teacher = staff(&app, "teacher").await;
    let alice = learner(&app, "alice").await;
    let course_id = create_course(&app, &teacher, "Timed").await;
    let chapter_id = create_chapter(&app, &teacher, &course_id).await;
    let (quiz_id, item_id) = quiz(
        &app,
        &teacher,
        &chapter_id,
        serde_json::json!({ "time_limit_seconds": 60 }),
        serde_json::json!({ "to": "published" }),
    )
    .await;
    app.publish_course(&course_id).await;
    let (draft_id, version) = start_quiz(&app, &alice, &quiz_id).await;
    let saved = app
        .send(
            Request::builder()
                .method("PATCH")
                .uri(format!("/api/v2/submissions/{draft_id}/draft"))
                .header(header::CONTENT_TYPE, "application/json")
                .header(header::COOKIE, &alice.cookie)
                .header(header::IF_MATCH, version.to_string())
                .body(Body::from(
                    serde_json::json!({ "answers": { &item_id: { "kind": "choice", "selected": ["a"] } } })
                        .to_string(),
                ))
                .unwrap(),
        )
        .await;
    assert_eq!(saved.status, StatusCode::OK, "{}", saved.text());

    archive(&app, &teacher, &course_id).await;
    sqlx::query("UPDATE submissions SET started_at = now() - interval '3 minutes' WHERE id = $1")
        .bind(uuid::Uuid::parse_str(&draft_id).unwrap())
        .execute(&app.pool)
        .await
        .unwrap();
    let swept =
        ab_domain::grading::SubmissionsService::sweep_expired_drafts(&app.code_runner(), None, 10)
            .await
            .unwrap();
    assert_eq!(swept, 1);
    let mine = app
        .get_as(&alice, &format!("/api/v2/submissions/{draft_id}"))
        .await;
    assert_eq!(mine.status, StatusCode::OK, "{}", mine.text());
    assert_ne!(mine.json()["status"], "draft");
    assert_eq!(mine.json()["auto_submit_reason"], "time_expired");
}

// ── 7. nothing is released ──────────────────────────────────────────────

async fn finalized_upload(app: &TestApp, session: &MintedSession) -> String {
    let payload = b"thumb bytes".to_vec();
    let created = app
        .post_as(
            session,
            "/api/v2/uploads",
            &serde_json::json!({ "purpose": "course-thumbnail", "mime": "image/png",
                                  "size_bytes": payload.len() }),
        )
        .await;
    assert_eq!(created.status, StatusCode::OK, "{}", created.text());
    let id = created.json()["id"].as_str().unwrap().to_owned();
    let put_url = created.json()["put_url"].as_str().unwrap().to_owned();
    let put = reqwest::Client::new()
        .put(&put_url)
        .header("content-type", "image/png")
        .header("if-none-match", "*")
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
    assert_eq!(finalized.status, StatusCode::OK, "{}", finalized.text());
    id
}

async fn upload_refs(app: &TestApp, upload_id: &str) -> (i32, bool) {
    sqlx::query_as("SELECT referenced_count, expires_at IS NOT NULL FROM uploads WHERE id = $1")
        .bind(uuid::Uuid::parse_str(upload_id).unwrap())
        .fetch_one(&app.pool)
        .await
        .unwrap()
}

#[sqlx::test(migrations = "../../migrations")]
async fn archive_releases_no_uploads(pool: PgPool) {
    let app = TestApp::spawn(pool).await;
    let teacher = staff(&app, "teacher").await;
    let course_id = create_course(&app, &teacher, "Thumbs").await;
    let upload_id = finalized_upload(&app, &teacher).await;
    let claimed = app
        .patch_as(
            &teacher,
            &format!("/api/v2/courses/{course_id}"),
            &serde_json::json!({ "thumbnail_upload_id": upload_id }),
        )
        .await;
    assert_eq!(claimed.status, StatusCode::OK, "{}", claimed.text());
    assert_eq!(upload_refs(&app, &upload_id).await, (1, false));

    let archived = archive(&app, &teacher, &course_id).await;
    assert!(archived["thumbnail_key"].is_string());
    assert_eq!(upload_refs(&app, &upload_id).await, (1, false));
    // The refused PATCH that would swap it releases nothing either.
    let refused = app
        .patch_as(
            &teacher,
            &format!("/api/v2/courses/{course_id}"),
            &serde_json::json!({ "thumbnail_upload_id": null }),
        )
        .await;
    assert_eq!(refused.status, StatusCode::CONFLICT);
    assert_eq!(upload_refs(&app, &upload_id).await, (1, false));
}
