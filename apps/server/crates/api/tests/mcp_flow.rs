//! The MCP server at `/api/v2/mcp` (REWRITE 4.7). Behaviors, one per test:
//! - without a bearer token, with a garbage, revoked or expired one, the endpoint is 401 with a
//!   `WWW-Authenticate: Bearer` challenge before rmcp reads the body;
//! - over a real socket a client initializes, lists the tools its scope allows and calls them; the
//!   replies are the REST bodies (courses, outline, activity with its plain text) and each call writes an
//!   `mcp-tool-called` audit row with the tool, token, outcome and target;
//! - a `read` token neither lists nor calls a draft tool (`insufficient-scope`, audited);
//! - a draft save writes the content of an unpublished activity and is refused on a published one and on
//!   a stale version; the token's owner decides access (another teacher's course is refused).
#![allow(clippy::unwrap_used, clippy::expect_used, clippy::panic)]

use ab_testkit::{MintedSession, TestApp};
use axum::body::Body;
use axum::http::{Request, StatusCode, header};
use serde_json::{Value, json};
use sqlx::PgPool;

const PROTOCOL: &str = "2025-06-18";

async fn teacher(app: &TestApp, name: &str) -> MintedSession {
    let user = app
        .create_user(name, &format!("{name}@example.com"), &["instructor"])
        .await;
    app.mint_session_for(
        user,
        &[
            "course:create:platform",
            "course:read:all",
            "course:update:own",
        ],
    )
    .await
}

async fn token(app: &TestApp, who: &MintedSession, scope: &str) -> (String, String) {
    let res = app
        .post_as(
            who,
            "/api/v2/me/access-tokens",
            &json!({ "name": "agent", "scope": scope }),
        )
        .await;
    assert_eq!(res.status, StatusCode::CREATED, "{}", res.text());
    let body = res.json();
    (
        body["token"].as_str().unwrap().to_owned(),
        body["access_token"]["id"].as_str().unwrap().to_owned(),
    )
}

/// A course with one chapter and one unpublished dynamic page; returns (course, activity).
async fn course_with_page(app: &TestApp, who: &MintedSession) -> (String, String) {
    let course = app
        .post_as(who, "/api/v2/courses", &json!({ "name": "Algebra" }))
        .await;
    assert_eq!(course.status, StatusCode::CREATED, "{}", course.text());
    let course_id = course.json()["id"].as_str().unwrap().to_owned();
    let chapter = app
        .post_as(
            who,
            &format!("/api/v2/courses/{course_id}/chapters"),
            &json!({ "name": "Week 1" }),
        )
        .await;
    assert_eq!(chapter.status, StatusCode::CREATED, "{}", chapter.text());
    let chapter_id = chapter.json()["id"].as_str().unwrap().to_owned();
    let activity = app
        .post_as(
            who,
            &format!("/api/v2/chapters/{chapter_id}/activities"),
            &json!({ "name": "Groups", "kind": "dynamic", "sub_kind": "dynamic_page" }),
        )
        .await;
    assert_eq!(activity.status, StatusCode::CREATED, "{}", activity.text());
    (
        course_id,
        activity.json()["id"].as_str().unwrap().to_owned(),
    )
}

fn rpc(id: i64, method: &str, params: Value) -> Value {
    json!({ "jsonrpc": "2.0", "id": id, "method": method, "params": params })
}

/// One in-process JSON-RPC exchange with the bearer token.
async fn mcp(app: &TestApp, bearer: Option<&str>, message: &Value) -> ab_testkit::TestResponse {
    let mut request = Request::builder()
        .method("POST")
        .uri("/api/v2/mcp")
        // rmcp refuses a request without a Host (or HTTP/2 `:authority`); every real client sends one.
        .header(header::HOST, "localhost")
        .header(header::CONTENT_TYPE, "application/json")
        .header(header::ACCEPT, "application/json, text/event-stream")
        .header("mcp-protocol-version", PROTOCOL);
    if let Some(bearer) = bearer {
        request = request.header(header::AUTHORIZATION, format!("Bearer {bearer}"));
    }
    app.send(request.body(Body::from(message.to_string())).unwrap())
        .await
}

/// `tools/call` → (is_error, the reply JSON in its text block).
async fn call(app: &TestApp, bearer: &str, tool: &str, arguments: Value) -> (bool, Value) {
    let res = mcp(
        app,
        Some(bearer),
        &rpc(
            7,
            "tools/call",
            json!({ "name": tool, "arguments": arguments }),
        ),
    )
    .await;
    assert_eq!(res.status, StatusCode::OK, "{}", res.text());
    let result = &res.json()["result"];
    let text = result["content"][0]["text"].as_str().unwrap_or("null");
    (
        result["isError"].as_bool().unwrap_or(false),
        serde_json::from_str(text).unwrap(),
    )
}

async fn audit_rows(app: &TestApp) -> Vec<Value> {
    sqlx::query_scalar(
        "SELECT metadata FROM auth_audit_log WHERE event = 'mcp-tool-called' ORDER BY created_at, id",
    )
    .fetch_all(&app.pool)
    .await
    .unwrap()
}

#[ab_testdb::test]
async fn the_endpoint_needs_a_live_bearer_token(pool: PgPool) {
    let app = TestApp::spawn(pool).await;
    let me = teacher(&app, "teacher").await;
    let (secret, id) = token(&app, &me, "read").await;
    let list = rpc(1, "tools/list", json!({}));

    for bearer in [None, Some("abq_not-a-token"), Some("garbage")] {
        let res = mcp(&app, bearer, &list).await;
        assert_eq!(res.status, StatusCode::UNAUTHORIZED, "{bearer:?}");
        let challenge = res.headers.get(header::WWW_AUTHENTICATE).unwrap();
        assert!(challenge.to_str().unwrap().starts_with("Bearer"));
    }
    assert_eq!(mcp(&app, Some(&secret), &list).await.status, StatusCode::OK);

    // Expired: refused although not revoked.
    sqlx::query("UPDATE personal_access_tokens SET created_at = now() - interval '2 days', expires_at = now() - interval '1 day'")
        .execute(&app.pool)
        .await
        .unwrap();
    assert_eq!(
        mcp(&app, Some(&secret), &list).await.status,
        StatusCode::UNAUTHORIZED
    );
    sqlx::query("UPDATE personal_access_tokens SET expires_at = NULL")
        .execute(&app.pool)
        .await
        .unwrap();

    let revoked = app
        .delete_as(&me, &format!("/api/v2/me/access-tokens/{id}"))
        .await;
    assert_eq!(revoked.status, StatusCode::NO_CONTENT);
    assert_eq!(
        mcp(&app, Some(&secret), &list).await.status,
        StatusCode::UNAUTHORIZED
    );
}

#[ab_testdb::test]
async fn a_client_reads_its_courses_over_http(pool: PgPool) {
    let app = TestApp::spawn(pool).await;
    let me = teacher(&app, "teacher").await;
    let (course_id, activity_id) = course_with_page(&app, &me).await;
    let (secret, token_id) = token(&app, &me, "read").await;
    let base = app.serve().await;
    let client = reqwest::Client::new();
    let post = |message: Value| {
        client
            .post(format!("{base}/api/v2/mcp"))
            .header("content-type", "application/json")
            .header("accept", "application/json, text/event-stream")
            .header("mcp-protocol-version", PROTOCOL)
            .bearer_auth(&secret)
            .body(message.to_string())
            .send()
    };

    let init = post(rpc(
        1,
        "initialize",
        json!({ "protocolVersion": PROTOCOL, "capabilities": {},
                "clientInfo": { "name": "test", "version": "1" } }),
    ))
    .await
    .unwrap();
    assert_eq!(init.status(), 200);
    let init: Value = init.json().await.unwrap();
    assert_eq!(init["result"]["serverInfo"]["name"], "ashyq");

    let tools: Value = post(rpc(2, "tools/list", json!({})))
        .await
        .unwrap()
        .json()
        .await
        .unwrap();
    let names: Vec<&str> = tools["result"]["tools"]
        .as_array()
        .unwrap()
        .iter()
        .map(|t| t["name"].as_str().unwrap())
        .collect();
    assert_eq!(
        names,
        [
            "list_my_courses",
            "get_course_outline",
            "read_activity",
            "search_course",
            "get_submission"
        ]
    );

    let called: Value = post(rpc(
        3,
        "tools/call",
        json!({ "name": "list_my_courses", "arguments": {} }),
    ))
    .await
    .unwrap()
    .json()
    .await
    .unwrap();
    let result = &called["result"];
    assert_ne!(result["isError"], true, "{called}");
    let page: Value = serde_json::from_str(result["content"][0]["text"].as_str().unwrap()).unwrap();
    assert_eq!(page["items"][0]["id"], course_id.as_str());
    assert_eq!(page["items"][0]["name"], "Algebra");

    // The same replies in process: outline and activity.
    let (failed, outline) = call(
        &app,
        &secret,
        "get_course_outline",
        json!({ "course_id": course_id }),
    )
    .await;
    assert!(!failed, "{outline}");
    assert_eq!(outline["course"]["id"], course_id.as_str());
    assert_eq!(
        outline["chapters"][0]["activities"][0]["id"],
        activity_id.as_str()
    );
    let (failed, activity) = call(
        &app,
        &secret,
        "read_activity",
        json!({ "activity_id": activity_id }),
    )
    .await;
    assert!(!failed, "{activity}");
    assert_eq!(activity["published"], false);
    assert!(activity["text"].is_string());

    let rows = audit_rows(&app).await;
    let tools: Vec<&str> = rows.iter().map(|r| r["tool"].as_str().unwrap()).collect();
    assert_eq!(
        tools,
        ["list_my_courses", "get_course_outline", "read_activity"]
    );
    assert!(
        rows.iter()
            .all(|r| r["ok"] == true && r["token_id"] == token_id.as_str())
    );
    assert_eq!(rows[1]["target"]["course_id"], course_id.as_str());
    assert_eq!(rows[2]["target"]["activity_id"], activity_id.as_str());
    let used: Option<i64> = sqlx::query_scalar(
        "SELECT extract(epoch FROM last_used_at)::bigint FROM personal_access_tokens",
    )
    .fetch_one(&app.pool)
    .await
    .unwrap();
    assert!(used.is_some());
}

#[ab_testdb::test]
async fn a_read_token_cannot_reach_a_draft_tool(pool: PgPool) {
    let app = TestApp::spawn(pool).await;
    let me = teacher(&app, "teacher").await;
    let (_, activity_id) = course_with_page(&app, &me).await;
    let (secret, _) = token(&app, &me, "read").await;

    let (failed, reply) = call(
        &app,
        &secret,
        "save_activity_draft",
        json!({ "activity_id": activity_id, "version": 1, "content": { "type": "doc", "content": [] } }),
    )
    .await;
    assert!(failed);
    assert_eq!(reply["code"], "insufficient-scope");
    let (failed, reply) = call(&app, &secret, "publish_everything", json!({})).await;
    assert!(failed);
    assert_eq!(reply["code"], "unknown-tool");

    let rows = audit_rows(&app).await;
    assert_eq!(rows.len(), 2);
    assert_eq!(rows[0]["tool"], "save_activity_draft");
    assert_eq!(rows[0]["ok"], false);
    assert_eq!(rows[0]["error"], "insufficient-scope");
    assert_eq!(rows[1]["error"], "unknown-tool");
}

#[ab_testdb::test]
async fn a_draft_save_writes_only_unpublished_activities(pool: PgPool) {
    let app = TestApp::spawn(pool).await;
    let me = teacher(&app, "teacher").await;
    let (_, activity_id) = course_with_page(&app, &me).await;
    let (secret, _) = token(&app, &me, "draft").await;

    let tools = mcp(&app, Some(&secret), &rpc(1, "tools/list", json!({})))
        .await
        .json();
    assert_eq!(tools["result"]["tools"].as_array().unwrap().len(), 7);

    let (_, current) = call(
        &app,
        &secret,
        "read_activity",
        json!({ "activity_id": activity_id }),
    )
    .await;
    let version = current["version"].as_i64().unwrap();
    let doc = json!({ "type": "doc", "content": [
        { "type": "paragraph", "content": [{ "type": "text", "text": "A group is a set with an operation." }] }
    ] });

    let (failed, reply) = call(
        &app,
        &secret,
        "save_activity_draft",
        json!({ "activity_id": activity_id, "version": version + 5, "content": doc }),
    )
    .await;
    assert!(failed);
    assert_eq!(reply["code"], "precondition-failed");

    let (failed, saved) = call(
        &app,
        &secret,
        "save_activity_draft",
        json!({ "activity_id": activity_id, "version": version, "content": doc }),
    )
    .await;
    assert!(!failed, "{saved}");
    assert_eq!(saved["published"], false);
    assert_eq!(saved["content"], doc);
    let (_, read) = call(
        &app,
        &secret,
        "read_activity",
        json!({ "activity_id": activity_id }),
    )
    .await;
    assert!(read["text"].as_str().unwrap().contains("A group is a set"));

    // Published (by the teacher in Ashyq): the draft tool refuses.
    sqlx::query("UPDATE activities SET published = true WHERE id = $1::uuid")
        .bind(&activity_id)
        .execute(&app.pool)
        .await
        .unwrap();
    let (_, current) = call(
        &app,
        &secret,
        "read_activity",
        json!({ "activity_id": activity_id }),
    )
    .await;
    let (failed, reply) = call(
        &app,
        &secret,
        "save_activity_draft",
        json!({ "activity_id": activity_id, "version": current["version"], "content": doc }),
    )
    .await;
    assert!(failed);
    assert_eq!(reply["code"], "activity-published");

    // Another teacher's token: the owner's rights decide, not the scope.
    let other = teacher(&app, "other").await;
    let (other_secret, _) = token(&app, &other, "draft").await;
    sqlx::query("UPDATE activities SET published = false WHERE id = $1::uuid")
        .bind(&activity_id)
        .execute(&app.pool)
        .await
        .unwrap();
    let (failed, reply) = call(
        &app,
        &other_secret,
        "save_activity_draft",
        json!({ "activity_id": activity_id, "version": 1, "content": doc }),
    )
    .await;
    assert!(failed);
    assert!(
        matches!(reply["code"].as_str(), Some("forbidden" | "not-found")),
        "{reply}"
    );
    let errors: Vec<Value> = audit_rows(&app)
        .await
        .into_iter()
        .filter(|r| r["tool"] == "save_activity_draft")
        .map(|r| r["error"].clone())
        .collect();
    assert_eq!(
        errors[..3],
        [
            json!("precondition-failed"),
            Value::Null,
            json!("activity-published")
        ]
    );
}
