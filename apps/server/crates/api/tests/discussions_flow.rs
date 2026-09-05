//! Course discussions end to end: posts and replies with embedded listing,
//! like/dislike toggles (mutually exclusive), owner vs. stranger vs.
//! moderator edits, hiding, deletion, content validation, and the course
//! visibility gate.
#![allow(clippy::unwrap_used, clippy::expect_used, clippy::panic)]

use ab_testkit::{MintedSession, TestApp};
use axum::body::Body;
use axum::http::{Request, StatusCode, header};
use sqlx::PgPool;

const LEARNER_GRANTS: &[&str] = &[
    "discussion:create:platform",
    "discussion:read:all",
    "discussion:update:own",
    "discussion:delete:own",
];

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
            "discussion:read:all",
            "discussion:moderate:own",
        ],
    )
    .await
}

async fn learner(app: &TestApp, name: &str) -> MintedSession {
    let user = app
        .create_user(name, &format!("{name}@example.com"), &["user"])
        .await;
    app.mint_session_for(user, LEARNER_GRANTS).await
}

async fn public_course(app: &TestApp, teacher: &MintedSession, name: &str) -> String {
    let course = app
        .post_as(
            teacher,
            "/api/v2/courses",
            &serde_json::json!({ "name": name }),
        )
        .await;
    let course_id = course.json()["id"].as_str().unwrap().to_owned();
    app.post_as(
        teacher,
        &format!("/api/v2/courses/{course_id}/lifecycle"),
        &serde_json::json!({ "action": "publish" }),
    )
    .await;
    course_id
}

fn put(session: &MintedSession, uri: String) -> Request<Body> {
    Request::builder()
        .method("PUT")
        .uri(uri)
        .header(header::COOKIE, &session.cookie)
        .body(Body::empty())
        .unwrap()
}

#[sqlx::test(migrations = "../../migrations")]
async fn posts_replies_reactions_and_moderation(pool: PgPool) {
    let app = TestApp::spawn(pool).await;
    let teacher = instructor(&app, "teacher").await;
    let course_id = public_course(&app, &teacher, "Forum 101").await;
    let alice = learner(&app, "alice").await;
    let bob = learner(&app, "bob").await;

    // Empty-after-tags content is refused.
    let blank = app
        .post_as(
            &alice,
            &format!("/api/v2/courses/{course_id}/discussions"),
            &serde_json::json!({ "content": "<p><br></p>" }),
        )
        .await;
    assert_eq!(
        blank.status,
        StatusCode::UNPROCESSABLE_ENTITY,
        "{}",
        blank.text()
    );
    assert_eq!(blank.json()["field_errors"][0]["field"], "content");

    let post = app
        .post_as(
            &alice,
            &format!("/api/v2/courses/{course_id}/discussions"),
            &serde_json::json!({ "content": "<p>Is recursion covered?</p>" }),
        )
        .await;
    assert_eq!(post.status, StatusCode::CREATED, "{}", post.text());
    let post_id = post.json()["id"].as_str().unwrap().to_owned();
    assert_eq!(post.json()["author"]["username"], "alice");
    assert!(post.json()["author"].get("email").is_none());
    assert_eq!(post.json()["is_owner"], true);
    assert_eq!(post.json()["can_update"], true);
    assert_eq!(post.json()["can_moderate"], false);

    let reply = app
        .post_as(
            &bob,
            &format!("/api/v2/courses/{course_id}/discussions"),
            &serde_json::json!({ "content": "Week 3.", "parent_id": post_id }),
        )
        .await;
    assert_eq!(reply.status, StatusCode::CREATED, "{}", reply.text());
    let reply_id = reply.json()["id"].as_str().unwrap().to_owned();
    assert_eq!(reply.json()["parent_id"], post_id.as_str());
    // No nesting below one level.
    let nested = app
        .post_as(
            &alice,
            &format!("/api/v2/courses/{course_id}/discussions"),
            &serde_json::json!({ "content": "Thanks!", "parent_id": reply_id }),
        )
        .await;
    assert_eq!(nested.status, StatusCode::UNPROCESSABLE_ENTITY);

    // Listing: newest post first, replies embedded on request.
    let listed = app
        .get_as(
            &bob,
            &format!("/api/v2/courses/{course_id}/discussions?include_replies=true"),
        )
        .await;
    assert_eq!(listed.status, StatusCode::OK, "{}", listed.text());
    let items = listed.json()["items"].as_array().unwrap().clone();
    assert_eq!(items.len(), 1);
    assert_eq!(items[0]["id"], post_id.as_str());
    assert_eq!(items[0]["replies_count"], 1);
    assert_eq!(items[0]["replies"][0]["id"], reply_id.as_str());
    assert_eq!(items[0]["is_owner"], false);
    assert_eq!(items[0]["can_update"], false);
    let bare = app
        .get_as(&bob, &format!("/api/v2/courses/{course_id}/discussions"))
        .await;
    assert!(
        bare.json()["items"][0]["replies"]
            .as_array()
            .unwrap()
            .is_empty()
    );
    let replies = app
        .get_as(&alice, &format!("/api/v2/discussions/{post_id}/replies"))
        .await;
    assert_eq!(replies.json()["items"].as_array().unwrap().len(), 1);

    // Reactions: like, like again (off), dislike then like (exclusive).
    let liked = app
        .send(put(&bob, format!("/api/v2/discussions/{post_id}/like")))
        .await;
    assert_eq!(liked.status, StatusCode::OK, "{}", liked.text());
    assert_eq!(liked.json()["is_liked"], true);
    assert_eq!(liked.json()["likes_count"], 1);
    let unliked = app
        .send(put(&bob, format!("/api/v2/discussions/{post_id}/like")))
        .await;
    assert_eq!(unliked.json()["is_liked"], false);
    assert_eq!(unliked.json()["likes_count"], 0);
    let disliked = app
        .send(put(&bob, format!("/api/v2/discussions/{post_id}/dislike")))
        .await;
    assert_eq!(disliked.json()["is_disliked"], true);
    assert_eq!(disliked.json()["dislikes_count"], 1);
    let flipped = app
        .send(put(&bob, format!("/api/v2/discussions/{post_id}/like")))
        .await;
    assert_eq!(flipped.json()["is_liked"], true);
    assert_eq!(flipped.json()["is_disliked"], false);
    assert_eq!(flipped.json()["likes_count"], 1);
    assert_eq!(flipped.json()["dislikes_count"], 0);
    let as_alice = app
        .get_as(&alice, &format!("/api/v2/courses/{course_id}/discussions"))
        .await;
    assert_eq!(as_alice.json()["items"][0]["is_liked"], false);
    assert_eq!(as_alice.json()["items"][0]["likes_count"], 1);

    // Edits: a stranger cannot, the owner can, the course creator moderates.
    let stranger = app
        .patch_as(
            &bob,
            &format!("/api/v2/discussions/{post_id}"),
            &serde_json::json!({ "content": "hijacked" }),
        )
        .await;
    assert_eq!(stranger.status, StatusCode::FORBIDDEN);
    let edited = app
        .patch_as(
            &alice,
            &format!("/api/v2/discussions/{post_id}"),
            &serde_json::json!({ "content": "<p>Is recursion covered? (edited)</p>" }),
        )
        .await;
    assert_eq!(edited.status, StatusCode::OK, "{}", edited.text());
    assert!(
        edited.json()["content"]
            .as_str()
            .unwrap()
            .contains("edited")
    );
    let hidden = app
        .patch_as(
            &teacher,
            &format!("/api/v2/discussions/{reply_id}"),
            &serde_json::json!({ "status": "hidden" }),
        )
        .await;
    assert_eq!(hidden.status, StatusCode::OK, "{}", hidden.text());
    assert_eq!(hidden.json()["status"], "hidden");
    assert_eq!(hidden.json()["can_moderate"], true);
    let after_hide = app
        .get_as(
            &alice,
            &format!("/api/v2/courses/{course_id}/discussions?include_replies=true"),
        )
        .await;
    assert_eq!(after_hide.json()["items"][0]["replies_count"], 0);
    assert!(
        after_hide.json()["items"][0]["replies"]
            .as_array()
            .unwrap()
            .is_empty()
    );
    // A hidden post takes no reactions.
    assert_eq!(
        app.send(put(&bob, format!("/api/v2/discussions/{reply_id}/like")))
            .await
            .status,
        StatusCode::NOT_FOUND
    );

    // Deletion: stranger 403, owner 204; replies go with the post.
    assert_eq!(
        app.delete_as(&bob, &format!("/api/v2/discussions/{post_id}"))
            .await
            .status,
        StatusCode::FORBIDDEN
    );
    assert_eq!(
        app.delete_as(&alice, &format!("/api/v2/discussions/{post_id}"))
            .await
            .status,
        StatusCode::NO_CONTENT
    );
    assert_eq!(
        app.patch_as(
            &teacher,
            &format!("/api/v2/discussions/{reply_id}"),
            &serde_json::json!({ "status": "active" })
        )
        .await
        .status,
        StatusCode::NOT_FOUND
    );
    let empty = app
        .get_as(&alice, &format!("/api/v2/courses/{course_id}/discussions"))
        .await;
    assert!(empty.json()["items"].as_array().unwrap().is_empty());

    // Gates: anonymous 401; a private course is invisible; no read grant → 403.
    assert_eq!(
        app.get(&format!("/api/v2/courses/{course_id}/discussions"))
            .await
            .status,
        StatusCode::UNAUTHORIZED
    );
    let private = app
        .post_as(
            &teacher,
            "/api/v2/courses",
            &serde_json::json!({ "name": "Hidden" }),
        )
        .await;
    let private_id = private.json()["id"].as_str().unwrap().to_owned();
    assert_eq!(
        app.get_as(&alice, &format!("/api/v2/courses/{private_id}/discussions"))
            .await
            .status,
        StatusCode::NOT_FOUND
    );
    let powerless = app.mint_session(&[]).await;
    assert_eq!(
        app.get_as(
            &powerless,
            &format!("/api/v2/courses/{course_id}/discussions")
        )
        .await
        .status,
        StatusCode::FORBIDDEN
    );
}

#[sqlx::test(migrations = "../../migrations")]
async fn listing_pages_by_cursor(pool: PgPool) {
    let app = TestApp::spawn(pool).await;
    let teacher = instructor(&app, "teacher").await;
    let course_id = public_course(&app, &teacher, "Paged").await;
    let alice = learner(&app, "alice").await;
    let mut ids = Vec::new();
    for i in 0..3 {
        let created = app
            .post_as(
                &alice,
                &format!("/api/v2/courses/{course_id}/discussions"),
                &serde_json::json!({ "content": format!("post {i}") }),
            )
            .await;
        ids.push(created.json()["id"].as_str().unwrap().to_owned());
    }
    let first = app
        .get_as(
            &alice,
            &format!("/api/v2/courses/{course_id}/discussions?limit=2"),
        )
        .await;
    let items = first.json()["items"].as_array().unwrap().clone();
    assert_eq!(items.len(), 2);
    assert_eq!(items[0]["id"], ids[2].as_str(), "newest first");
    assert_eq!(items[1]["id"], ids[1].as_str());
    let cursor = first.json()["next_cursor"].as_str().unwrap().to_owned();
    let rest = app
        .get_as(
            &alice,
            &format!("/api/v2/courses/{course_id}/discussions?limit=2&cursor={cursor}"),
        )
        .await;
    assert_eq!(rest.json()["items"].as_array().unwrap().len(), 1);
    assert_eq!(rest.json()["items"][0]["id"], ids[0].as_str());
    assert!(rest.json()["next_cursor"].is_null());
}
