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
    app.publish_course(&course_id).await;
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

/// BUG-153: a post retried with the same `Idempotency-Key` replays the
/// created post instead of posting twice; the key with another body is 422.
#[sqlx::test(migrations = "../../migrations")]
async fn create_replays_under_an_idempotency_key(pool: PgPool) {
    let app = TestApp::spawn(pool).await;
    let teacher = instructor(&app, "teacher").await;
    let course_id = public_course(&app, &teacher, "Forum retry").await;
    let alice = learner(&app, "alice").await;
    let post = |key: &str, body: serde_json::Value| {
        Request::builder()
            .method("POST")
            .uri(format!("/api/v2/courses/{course_id}/discussions"))
            .header(header::CONTENT_TYPE, "application/json")
            .header(header::COOKIE, &alice.cookie)
            .header("idempotency-key", key)
            .body(Body::from(body.to_string()))
            .unwrap()
    };
    let body = serde_json::json!({ "content": "<p>once</p>" });
    let first = app.send(post("k1", body.clone())).await;
    assert_eq!(first.status, StatusCode::CREATED, "{}", first.text());
    let replay = app.send(post("k1", body)).await;
    assert_eq!(replay.status, StatusCode::CREATED, "{}", replay.text());
    assert_eq!(replay.json(), first.json(), "the stored response, verbatim");
    let reused = app
        .send(post("k1", serde_json::json!({ "content": "<p>twice</p>" })))
        .await;
    assert_eq!(reused.status, StatusCode::UNPROCESSABLE_ENTITY);
    assert_eq!(reused.json()["field_errors"][0]["code"], "reused");
    let list = app
        .get_as(&alice, &format!("/api/v2/courses/{course_id}/discussions"))
        .await;
    assert_eq!(
        list.json()["items"].as_array().unwrap().len(),
        1,
        "{}",
        list.text()
    );
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
    // UX-156: an out-of-range page size is a 422, not a silent clamp.
    let refused = app
        .get_as(
            &alice,
            &format!("/api/v2/discussions/{post_id}/replies?limit=0"),
        )
        .await;
    assert_eq!(
        refused.status,
        StatusCode::UNPROCESSABLE_ENTITY,
        "{}",
        refused.text()
    );

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
    // The moderator still lists what they hid, so they can restore it.
    let as_moderator = app
        .get_as(
            &teacher,
            &format!("/api/v2/courses/{course_id}/discussions?include_replies=true"),
        )
        .await;
    assert_eq!(
        as_moderator.json()["items"][0]["replies"][0]["status"],
        "hidden"
    );
    let replies_as_moderator = app
        .get_as(&teacher, &format!("/api/v2/discussions/{post_id}/replies"))
        .await;
    assert_eq!(replies_as_moderator.json()["items"][0]["status"], "hidden");
    // A hidden post takes no reactions.
    assert_eq!(
        app.send(put(&bob, format!("/api/v2/discussions/{reply_id}/like")))
            .await
            .status,
        StatusCode::NOT_FOUND
    );
    // BUG-115: the owner cannot un-hide what a moderator hid (content edits
    // still work); the moderator can.
    let unhide = app
        .patch_as(
            &bob,
            &format!("/api/v2/discussions/{reply_id}"),
            &serde_json::json!({ "status": "active" }),
        )
        .await;
    assert_eq!(unhide.status, StatusCode::FORBIDDEN, "{}", unhide.text());
    let owner_edit = app
        .patch_as(
            &bob,
            &format!("/api/v2/discussions/{reply_id}"),
            &serde_json::json!({ "content": "Week 3, edited." }),
        )
        .await;
    assert_eq!(owner_edit.status, StatusCode::OK, "{}", owner_edit.text());
    assert_eq!(owner_edit.json()["status"], "hidden");
    let restored = app
        .patch_as(
            &teacher,
            &format!("/api/v2/discussions/{reply_id}"),
            &serde_json::json!({ "status": "active" }),
        )
        .await;
    assert_eq!(restored.status, StatusCode::OK, "{}", restored.text());
    assert_eq!(restored.json()["status"], "active");
    let rehidden = app
        .patch_as(
            &teacher,
            &format!("/api/v2/discussions/{reply_id}"),
            &serde_json::json!({ "status": "hidden" }),
        )
        .await;
    assert_eq!(rehidden.status, StatusCode::OK, "{}", rehidden.text());

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

    // Gates: a guest gets an empty page (L-3, no discussion data); a private
    // course is invisible; no read grant → 403.
    let guest = app
        .get(&format!("/api/v2/courses/{course_id}/discussions"))
        .await;
    assert_eq!(guest.status, StatusCode::OK);
    assert_eq!(guest.json()["items"], serde_json::json!([]));
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
    // UX-156: an out-of-range page size is a 422, not a silent clamp.
    let refused = app
        .get_as(
            &alice,
            &format!("/api/v2/courses/{course_id}/discussions?limit=101"),
        )
        .await;
    assert_eq!(
        refused.status,
        StatusCode::UNPROCESSABLE_ENTITY,
        "{}",
        refused.text()
    );
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

/// BUG-298: concurrent likes and replies all count - the triggers move the
/// counters by atomic deltas instead of a racing recount.
#[sqlx::test(migrations = "../../migrations")]
async fn concurrent_likes_and_replies_all_count(pool: PgPool) {
    let app = TestApp::spawn(pool).await;
    let teacher = instructor(&app, "teacher").await;
    let course_id = public_course(&app, &teacher, "Busy forum").await;
    let users = [
        learner(&app, "alice").await,
        learner(&app, "bob").await,
        learner(&app, "carol").await,
    ];
    let posts_path = format!("/api/v2/courses/{course_id}/discussions");
    let mut post_ids = Vec::new();
    for n in 0..20 {
        let post = app
            .post_as(
                &users[0],
                &posts_path,
                &serde_json::json!({ "content": format!("post {n}") }),
            )
            .await;
        assert_eq!(post.status, StatusCode::CREATED, "{}", post.text());
        post_ids.push(post.json()["id"].as_str().unwrap().to_owned());
    }
    for id in &post_ids {
        let likes = futures::future::join_all(
            users
                .iter()
                .map(|u| app.send(put(u, format!("/api/v2/discussions/{id}/like")))),
        )
        .await;
        assert!(likes.iter().all(|r| r.status == StatusCode::OK));
    }
    let reply = serde_json::json!({ "content": "same time", "parent_id": post_ids[0] });
    let replies = futures::future::join_all(
        users
            .iter()
            .cycle()
            .take(15)
            .map(|u| app.post_as(u, &posts_path, &reply)),
    )
    .await;
    assert!(replies.iter().all(|r| r.status == StatusCode::CREATED));
    let counts: Vec<(i32, i32)> = sqlx::query_as(
        "SELECT likes_count, replies_count FROM course_discussions
         WHERE parent_id IS NULL ORDER BY id",
    )
    .fetch_all(&app.pool)
    .await
    .unwrap();
    assert_eq!(counts.len(), 20);
    assert!(counts.iter().all(|&(likes, _)| likes == 3), "{counts:?}");
    assert_eq!(counts[0].1, 15, "{counts:?}");
}

/// BUG-346: an owner edit carrying an unchanged `status` never writes the
/// column - a moderator hide committed while the edit waits on the row lock
/// survives it.
#[sqlx::test(migrations = "../../migrations")]
async fn owner_edit_cannot_undo_a_concurrent_hide(pool: PgPool) {
    let app = TestApp::spawn(pool).await;
    let teacher = instructor(&app, "teacher").await;
    let course_id = public_course(&app, &teacher, "Racing forum").await;
    let owner = learner(&app, "owner").await;
    let post = app
        .post_as(
            &owner,
            &format!("/api/v2/courses/{course_id}/discussions"),
            &serde_json::json!({ "content": "Original" }),
        )
        .await;
    assert_eq!(post.status, StatusCode::CREATED, "{}", post.text());
    let id = post.json()["id"].as_str().unwrap().to_owned();
    let mut moderator = app.pool.begin().await.unwrap();
    sqlx::query("SELECT id FROM course_discussions WHERE id = $1::uuid FOR UPDATE")
        .bind(&id)
        .fetch_one(&mut *moderator)
        .await
        .unwrap();
    let path = format!("/api/v2/discussions/{id}");
    let body = serde_json::json!({ "content": "Edited", "status": "active" });
    let edit = app.patch_as(&owner, &path, &body);
    let hide = async {
        // The owner's UPDATE is parked on the row lock before the hide lands.
        loop {
            let blocked: bool = sqlx::query_scalar(
                "SELECT EXISTS (SELECT 1 FROM pg_stat_activity
                 WHERE datname = current_database() AND wait_event_type = 'Lock'
                   AND query LIKE '%UPDATE course_discussions%')",
            )
            .fetch_one(&app.pool)
            .await
            .unwrap();
            if blocked {
                break;
            }
            tokio::task::yield_now().await;
        }
        sqlx::query("UPDATE course_discussions SET status = 'hidden' WHERE id = $1::uuid")
            .bind(&id)
            .execute(&mut *moderator)
            .await
            .unwrap();
        moderator.commit().await.unwrap();
    };
    let (edited, ()) = tokio::time::timeout(std::time::Duration::from_secs(10), async {
        tokio::join!(edit, hide)
    })
    .await
    .expect("owner UPDATE reached the row lock");
    assert_eq!(edited.status, StatusCode::OK, "{}", edited.text());
    assert_eq!(edited.json()["content"], "Edited");
    assert_eq!(edited.json()["status"], "hidden");
}

/// REVIEW-1 C1: a JSON post's URLs are checked on create and edit - an
/// embed framing the platform's own origin, a traversal out of
/// `/content/` and a script link are 422 with the node's field; HTML posts
/// (the old web) and a clean document pass.
#[sqlx::test(migrations = "../../migrations")]
async fn document_posts_with_unsafe_urls_are_refused(pool: PgPool) {
    let app = TestApp::spawn_with(pool, |config| {
        config.server.web_url = Some("https://ashyq.test".into());
    })
    .await;
    let teacher = instructor(&app, "teacher").await;
    let course_id = public_course(&app, &teacher, "Forum safety").await;
    let alice = learner(&app, "alice").await;
    let doc = |node: serde_json::Value| {
        serde_json::json!({ "type": "doc", "content": [
            { "type": "paragraph", "content": [{ "type": "text", "text": "see" }] }, node] })
        .to_string()
    };
    let posts = format!("/api/v2/courses/{course_id}/discussions");
    for (node, field) in [
        (
            serde_json::json!({ "type": "embedBlock", "attrs": { "type": "url",
                "url": "https://ashyq.test/ab-private/x.html?X-Amz-Signature=s" } }),
            "content.content.1.attrs.url",
        ),
        (
            serde_json::json!({ "type": "image", "attrs": {
                "src": "/content/../ab-private/x.html?X-Amz-Signature=s" } }),
            "content.content.1.attrs.src",
        ),
        (
            serde_json::json!({ "type": "paragraph", "content": [{ "type": "text", "text": "x",
                "marks": [{ "type": "link", "attrs": { "href": "javascript:alert(1)" } }] }] }),
            "content.content.1.content.0.marks.0.attrs.href",
        ),
    ] {
        let refused = app
            .post_as(&alice, &posts, &serde_json::json!({ "content": doc(node) }))
            .await;
        assert_eq!(
            refused.status,
            StatusCode::UNPROCESSABLE_ENTITY,
            "{}",
            refused.text()
        );
        assert_eq!(refused.json()["field_errors"][0]["field"], field);
        assert_eq!(refused.json()["field_errors"][0]["code"], "unsafe-url");
    }
    let clean = doc(
        serde_json::json!({ "type": "embedBlock", "attrs": { "type": "youtube",
        "url": "https://www.youtube.com/watch?v=dQw4w9WgXcQ" } }),
    );
    let created = app
        .post_as(&alice, &posts, &serde_json::json!({ "content": clean }))
        .await;
    assert_eq!(created.status, StatusCode::CREATED, "{}", created.text());
    let id = created.json()["id"].as_str().unwrap().to_owned();
    let html = app
        .post_as(
            &alice,
            &posts,
            &serde_json::json!({ "content": "<p>old web</p>" }),
        )
        .await;
    assert_eq!(html.status, StatusCode::CREATED, "{}", html.text());
    // The edit path checks the same way.
    let edited = app
        .patch_as(
            &alice,
            &format!("/api/v2/discussions/{id}"),
            &serde_json::json!({ "content": doc(serde_json::json!({ "type": "embedBlock",
                "attrs": { "type": "url", "url": "/content/x.html" } })) }),
        )
        .await;
    assert_eq!(
        edited.status,
        StatusCode::UNPROCESSABLE_ENTITY,
        "{}",
        edited.text()
    );
}
