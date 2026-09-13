//! Course collaboration (`resource_authors`): apply → pending → approve →
//! author like the creator → inactive → the draft is invisible again.
//! Roster management by the creator, an active maintainer, or
//! `course:manage:platform`; the creator row is synthesized and immutable.
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
            "course:delete:own",
        ],
    )
    .await
}

async fn open_public_course(app: &TestApp, teacher: &MintedSession) -> String {
    let created = app
        .post_as(
            teacher,
            "/api/v2/courses",
            &serde_json::json!({ "name": "Rust 101" }),
        )
        .await;
    assert_eq!(created.status, StatusCode::CREATED);
    let id = created.json()["id"].as_str().unwrap().to_owned();
    let opened = app
        .patch_as(
            teacher,
            &format!("/api/v2/courses/{id}"),
            &serde_json::json!({ "open_to_contributors": true }),
        )
        .await;
    assert_eq!(opened.status, StatusCode::OK);
    let published = app
        .post_as(
            teacher,
            &format!("/api/v2/courses/{id}/lifecycle"),
            &serde_json::json!({ "action": "publish" }),
        )
        .await;
    assert_eq!(published.status, StatusCode::OK);
    id
}

async fn add_chapter(app: &TestApp, session: &MintedSession, course_id: &str) -> StatusCode {
    app.post_as(
        session,
        &format!("/api/v2/courses/{course_id}/chapters"),
        &serde_json::json!({ "name": "Week 1" }),
    )
    .await
    .status
}

#[sqlx::test(migrations = "../../migrations")]
async fn apply_approve_author_and_deactivate(pool: PgPool) {
    let app = TestApp::spawn(pool).await;
    let teacher = instructor(&app, "teacher").await;
    let helper = instructor(&app, "helper").await;
    let course = open_public_course(&app, &teacher).await;

    // Roster starts with the synthesized creator row.
    let roster = app
        .get_as(&helper, &format!("/api/v2/courses/{course}/contributors"))
        .await;
    assert_eq!(roster.status, StatusCode::OK);
    let rows = roster.json();
    assert_eq!(rows.as_array().unwrap().len(), 1);
    assert_eq!(rows[0]["role"], "creator");
    assert_eq!(rows[0]["status"], "active");
    assert_eq!(rows[0]["username"], "teacher");

    // Apply → contributor/pending; a second application is a conflict.
    let applied = app
        .post_as(
            &helper,
            &format!("/api/v2/courses/{course}/contributors/apply"),
            &serde_json::json!({}),
        )
        .await;
    assert_eq!(applied.status, StatusCode::CREATED, "{}", applied.text());
    assert_eq!(applied.json()["role"], "contributor");
    assert_eq!(applied.json()["status"], "pending");
    let helper_id = applied.json()["user_id"].as_str().unwrap().to_owned();
    let again = app
        .post_as(
            &helper,
            &format!("/api/v2/courses/{course}/contributors/apply"),
            &serde_json::json!({}),
        )
        .await;
    assert_eq!(again.status, StatusCode::CONFLICT);
    assert_eq!(again.json()["code"], "conflict");

    // Pending grants nothing.
    assert_eq!(
        add_chapter(&app, &helper, &course).await,
        StatusCode::FORBIDDEN
    );

    // Only roster managers approve.
    let stranger = instructor(&app, "stranger").await;
    let denied = app
        .patch_as(
            &stranger,
            &format!("/api/v2/courses/{course}/contributors/{helper_id}"),
            &serde_json::json!({ "status": "active" }),
        )
        .await;
    assert_eq!(denied.status, StatusCode::FORBIDDEN);
    let approved = app
        .patch_as(
            &teacher,
            &format!("/api/v2/courses/{course}/contributors/{helper_id}"),
            &serde_json::json!({ "status": "active" }),
        )
        .await;
    assert_eq!(approved.status, StatusCode::OK, "{}", approved.text());
    assert_eq!(approved.json()["status"], "active");

    // Active contributor authors on the course and sees it in `mine`.
    assert_eq!(
        add_chapter(&app, &helper, &course).await,
        StatusCode::CREATED
    );
    let mine = app.get_as(&helper, "/api/v2/courses?mine=true").await;
    assert_eq!(mine.json()["items"].as_array().unwrap().len(), 1);
    assert_eq!(mine.json()["summary"]["total"], 1);

    // Unpublish: the active contributor still sees the draft…
    app.post_as(
        &teacher,
        &format!("/api/v2/courses/{course}/lifecycle"),
        &serde_json::json!({ "action": "unpublish" }),
    )
    .await;
    let draft = app
        .get_as(&helper, &format!("/api/v2/courses/{course}"))
        .await;
    assert_eq!(draft.status, StatusCode::OK);

    // …until set inactive: 404, like any stranger.
    let inactive = app
        .patch_as(
            &teacher,
            &format!("/api/v2/courses/{course}/contributors/{helper_id}"),
            &serde_json::json!({ "status": "inactive" }),
        )
        .await;
    assert_eq!(inactive.status, StatusCode::OK);
    let gone = app
        .get_as(&helper, &format!("/api/v2/courses/{course}"))
        .await;
    assert_eq!(gone.status, StatusCode::NOT_FOUND);
    assert_eq!(
        add_chapter(&app, &helper, &course).await,
        StatusCode::NOT_FOUND
    );
    let none = app.get_as(&helper, "/api/v2/courses?mine=true").await;
    assert!(none.json()["items"].as_array().unwrap().is_empty());
}

#[sqlx::test(migrations = "../../migrations")]
async fn roster_management_rules(pool: PgPool) {
    let app = TestApp::spawn(pool).await;
    let teacher = instructor(&app, "teacher").await;
    let course = open_public_course(&app, &teacher).await;
    let _maint = instructor(&app, "maint").await;
    let _colleague = instructor(&app, "colleague").await;
    let learner = app.mint_session(&[]).await;

    // Add by username (case-insensitive) as maintainer → active at once.
    let added = app
        .post_as(
            &teacher,
            &format!("/api/v2/courses/{course}/contributors"),
            &serde_json::json!({ "username": "Maint", "role": "maintainer" }),
        )
        .await;
    assert_eq!(added.status, StatusCode::CREATED, "{}", added.text());
    assert_eq!(added.json()["role"], "maintainer");
    assert_eq!(added.json()["status"], "active");
    let maint_id = added.json()["user_id"].as_str().unwrap().to_owned();

    // Unknown username → 404; duplicate → 409; both id and username → 422;
    // invalid role → 422.
    let unknown = app
        .post_as(
            &teacher,
            &format!("/api/v2/courses/{course}/contributors"),
            &serde_json::json!({ "username": "nobody" }),
        )
        .await;
    assert_eq!(unknown.status, StatusCode::NOT_FOUND);
    let dup = app
        .post_as(
            &teacher,
            &format!("/api/v2/courses/{course}/contributors"),
            &serde_json::json!({ "user_id": maint_id }),
        )
        .await;
    assert_eq!(dup.status, StatusCode::CONFLICT);
    let both = app
        .post_as(
            &teacher,
            &format!("/api/v2/courses/{course}/contributors"),
            &serde_json::json!({ "user_id": maint_id, "username": "maint" }),
        )
        .await;
    assert_eq!(both.status, StatusCode::UNPROCESSABLE_ENTITY);
    let bad_role = app
        .post_as(
            &teacher,
            &format!("/api/v2/courses/{course}/contributors"),
            &serde_json::json!({ "username": "colleague", "role": "owner" }),
        )
        .await;
    assert_eq!(bad_role.status, StatusCode::UNPROCESSABLE_ENTITY);

    // An active maintainer manages the roster; a learner does not.
    let maint = {
        let id = ab_core::id::UserId(maint_id.parse().unwrap());
        app.mint_session_for(id, &["course:read:all", "course:update:own"])
            .await
    };
    let by_maint = app
        .post_as(
            &maint,
            &format!("/api/v2/courses/{course}/contributors"),
            &serde_json::json!({ "username": "colleague" }),
        )
        .await;
    assert_eq!(by_maint.status, StatusCode::CREATED, "{}", by_maint.text());
    assert_eq!(by_maint.json()["role"], "contributor");
    let colleague_id = by_maint.json()["user_id"].as_str().unwrap().to_owned();
    let by_learner = app
        .delete_as(
            &learner,
            &format!("/api/v2/courses/{course}/contributors/{colleague_id}"),
        )
        .await;
    assert_eq!(by_learner.status, StatusCode::FORBIDDEN);

    // The creator is not a row: cannot be patched or removed.
    let roster = app
        .get_as(&learner, &format!("/api/v2/courses/{course}/contributors"))
        .await;
    let creator_id = roster.json()[0]["user_id"].as_str().unwrap().to_owned();
    assert_eq!(roster.json().as_array().unwrap().len(), 3);
    let demote = app
        .patch_as(
            &maint,
            &format!("/api/v2/courses/{course}/contributors/{creator_id}"),
            &serde_json::json!({ "role": "reporter" }),
        )
        .await;
    assert_eq!(demote.status, StatusCode::CONFLICT);
    let evict = app
        .delete_as(
            &maint,
            &format!("/api/v2/courses/{course}/contributors/{creator_id}"),
        )
        .await;
    assert_eq!(evict.status, StatusCode::CONFLICT);

    // Remove → 204, then 404; a platform manager may do it anywhere.
    let removed = app
        .delete_as(
            &teacher,
            &format!("/api/v2/courses/{course}/contributors/{colleague_id}"),
        )
        .await;
    assert_eq!(removed.status, StatusCode::NO_CONTENT);
    let missing = app
        .delete_as(
            &teacher,
            &format!("/api/v2/courses/{course}/contributors/{colleague_id}"),
        )
        .await;
    assert_eq!(missing.status, StatusCode::NOT_FOUND);
    let admin = app
        .mint_session(&["course:read:all", "course:manage:platform"])
        .await;
    let by_admin = app
        .delete_as(
            &admin,
            &format!("/api/v2/courses/{course}/contributors/{maint_id}"),
        )
        .await;
    assert_eq!(by_admin.status, StatusCode::NO_CONTENT);

    // Applying to a closed course is a conflict.
    app.patch_as(
        &teacher,
        &format!("/api/v2/courses/{course}"),
        &serde_json::json!({ "open_to_contributors": false }),
    )
    .await;
    let closed = app
        .post_as(
            &learner,
            &format!("/api/v2/courses/{course}/contributors/apply"),
            &serde_json::json!({}),
        )
        .await;
    assert_eq!(closed.status, StatusCode::CONFLICT);
}

/// Authorship IS the `:own` scope: a plain `user`-role account (no
/// `course:update:own` / `chapter:*` grants) that is an active maintainer or
/// contributor writes on the course like the creator; a reporter reads the
/// draft and the roster but never writes; a stranger with the `:own` grant
/// still gets 403.
#[sqlx::test(migrations = "../../migrations")]
async fn user_role_authors_write_reporters_read(pool: PgPool) {
    let app = TestApp::spawn(pool).await;
    let teacher = instructor(&app, "teacher").await;
    let course = open_public_course(&app, &teacher).await;
    let learner_grants = ["course:read:all", "assessment:submit:assigned"];
    let user = |name: &'static str| {
        let app = &app;
        async move {
            let id = app
                .create_user(name, &format!("{name}@example.com"), &["user"])
                .await;
            (id, app.mint_session_for(id, &learner_grants).await)
        }
    };
    let (maint_id, maint) = user("maint").await;
    let (contrib_id, contrib) = user("contrib").await;
    let (_, reporter) = user("reporter").await;
    let (_, stranger) = user("stranger").await;
    let own_stranger = app
        .mint_session(&["course:read:all", "course:update:own"])
        .await;

    for (name, role) in [
        ("maint", "maintainer"),
        ("contrib", "contributor"),
        ("reporter", "reporter"),
    ] {
        let added = app
            .post_as(
                &teacher,
                &format!("/api/v2/courses/{course}/contributors"),
                &serde_json::json!({ "username": name, "role": role }),
            )
            .await;
        assert_eq!(added.status, StatusCode::CREATED, "{}", added.text());
    }

    // `contributor_ids` on the wire lists the writers only.
    let got = app
        .get_as(&teacher, &format!("/api/v2/courses/{course}"))
        .await;
    let ids: Vec<String> = got.json()["contributor_ids"]
        .as_array()
        .unwrap()
        .iter()
        .map(|v| v.as_str().unwrap().to_owned())
        .collect();
    assert_eq!(ids.len(), 2);
    assert!(ids.contains(&maint_id.to_string()) && ids.contains(&contrib_id.to_string()));

    // Writers: chapters, course details, assessments, certificates.
    for session in [&maint, &contrib] {
        assert_eq!(
            add_chapter(&app, session, &course).await,
            StatusCode::CREATED
        );
        let details = app
            .patch_as(
                session,
                &format!("/api/v2/courses/{course}"),
                &serde_json::json!({ "description": "by a co-author" }),
            )
            .await;
        assert_eq!(details.status, StatusCode::OK, "{}", details.text());
        let mine = app.get_as(session, "/api/v2/courses?mine=true").await;
        assert_eq!(mine.json()["summary"]["total"], 1);
    }
    let readiness = app
        .get_as(&maint, &format!("/api/v2/courses/{course}/readiness"))
        .await;
    assert_eq!(readiness.status, StatusCode::OK, "{}", readiness.text());

    // Reporter and strangers: read yes, write no.
    app.post_as(
        &teacher,
        &format!("/api/v2/courses/{course}/lifecycle"),
        &serde_json::json!({ "action": "unpublish" }),
    )
    .await;
    let draft = app
        .get_as(&reporter, &format!("/api/v2/courses/{course}"))
        .await;
    assert_eq!(draft.status, StatusCode::OK, "{}", draft.text());
    let roster = app
        .get_as(&reporter, &format!("/api/v2/courses/{course}/contributors"))
        .await;
    assert_eq!(roster.status, StatusCode::OK);
    assert_eq!(roster.json().as_array().unwrap().len(), 4);
    // The landing reads learner-state: an active reporter has course access.
    let state = app
        .get_as(
            &reporter,
            &format!("/api/v2/courses/{course}/learner-state"),
        )
        .await;
    assert_eq!(state.status, StatusCode::OK, "{}", state.text());
    assert_eq!(
        add_chapter(&app, &reporter, &course).await,
        StatusCode::FORBIDDEN
    );
    let by_reporter = app
        .patch_as(
            &reporter,
            &format!("/api/v2/courses/{course}"),
            &serde_json::json!({ "description": "nope" }),
        )
        .await;
    assert_eq!(by_reporter.status, StatusCode::FORBIDDEN);
    assert_eq!(
        add_chapter(&app, &stranger, &course).await,
        StatusCode::NOT_FOUND
    );
    assert_eq!(
        add_chapter(&app, &own_stranger, &course).await,
        StatusCode::NOT_FOUND
    );
    app.post_as(
        &teacher,
        &format!("/api/v2/courses/{course}/lifecycle"),
        &serde_json::json!({ "action": "publish" }),
    )
    .await;
    assert_eq!(
        add_chapter(&app, &own_stranger, &course).await,
        StatusCode::FORBIDDEN
    );
}

/// A pending applicant may withdraw their own application (`DELETE
/// contributors/{self}` → 204, DECISIONS 2026-09-13); once active the row
/// belongs to the roster managers again.
#[sqlx::test(migrations = "../../migrations")]
async fn applicant_withdraws_pending_application(pool: PgPool) {
    let app = TestApp::spawn(pool).await;
    let teacher = instructor(&app, "teacher").await;
    let helper = instructor(&app, "helper").await;
    let course = open_public_course(&app, &teacher).await;
    let apply = format!("/api/v2/courses/{course}/contributors/apply");

    let applied = app.post_as(&helper, &apply, &serde_json::json!({})).await;
    assert_eq!(applied.status, StatusCode::CREATED, "{}", applied.text());
    let helper_id = applied.json()["user_id"].as_str().unwrap().to_owned();
    let me = format!("/api/v2/courses/{course}/contributors/{helper_id}");

    let withdrawn = app.delete_as(&helper, &me).await;
    assert_eq!(
        withdrawn.status,
        StatusCode::NO_CONTENT,
        "{}",
        withdrawn.text()
    );
    // Nothing pending any more: back to the roster-manager gate.
    assert_eq!(
        app.delete_as(&helper, &me).await.status,
        StatusCode::FORBIDDEN
    );
    // Free to apply again.
    assert_eq!(
        app.post_as(&helper, &apply, &serde_json::json!({}))
            .await
            .status,
        StatusCode::CREATED
    );

    // Active rows are not self-service.
    let approved = app
        .patch_as(&teacher, &me, &serde_json::json!({ "status": "active" }))
        .await;
    assert_eq!(approved.status, StatusCode::OK, "{}", approved.text());
    assert_eq!(
        app.delete_as(&helper, &me).await.status,
        StatusCode::FORBIDDEN
    );
}
